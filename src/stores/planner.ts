import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { GroupBy, Plan, Schedule, ScheduleType } from '@/types';
import { isPlaced } from '@/types';
import { SCHEMA_VERSION, TYPES } from '@/constants';
import { LocalRepository } from '@/data/localRepository';
import { buildSeedData } from '@/data/seed';
import { uid } from '@/data/normalize';
import {
  addDays,
  clampPlacement,
  clampStart,
  floorToStep,
  hhToMin,
  isoOf,
  minToHH,
  minToY,
  mondayOf,
  NIGHT_END,
  NIGHT_START,
  parseISO,
} from '@/utils/datetime';
import { fmtShortWeek } from '@/utils/format';
import { priceRange } from '@/utils/price';
import { timeOverlaps } from '@/utils/layout';

/** 组内排序（口径 §6.1a）：手动序号优先（小→大），未排序项按创建时间排在其后 */
function byLibraryOrder(a: Schedule, b: Schedule): number {
  const ka = a.sortOrder;
  const kb = b.sortOrder;
  if (ka != null && kb != null) return ka - kb;
  if (ka != null) return -1;
  if (kb != null) return 1;
  return a.createdAt - b.createdAt;
}

export interface ScheduleGroup {
  key: string;
  name: string;
  color?: string;
  items: Schedule[];
}

/** E7/E8 表单保存的结果提示 */
export type FormWarn = 'date-time-mismatch' | null;

export const usePlannerStore = defineStore('planner', () => {
  /* ---------------- 基础状态 ---------------- */
  const plans = ref<Plan[]>([]);
  const schedules = ref<Schedule[]>([]);
  const currentPlanId = ref<string | null>(null);
  const loaded = ref(false);

  /* ---------------- 视图状态 ---------------- */
  const weekStartIso = ref<string>(isoOf(mondayOf(new Date())));
  const groupBy = ref<GroupBy>('type');
  const collapsed = ref(new Set<string>());
  /** 凌晨折叠偏好（口径 §4.1a）：默认折叠，展开后记忆 */
  const nightCollapsedUi = ref(true);

  const repo = new LocalRepository();

  /* ---------------- 初始化与持久化（口径 §9） ---------------- */
  async function init(): Promise<void> {
    if (loaded.value) return;
    const loadedData = await repo.load();
    const freshSeeded = !loadedData || loadedData.plans.length === 0;
    const data = freshSeeded ? buildSeedData() : loadedData;
    if (freshSeeded) await repo.save(data);
    plans.value = data.plans;
    schedules.value = data.schedules;
    currentPlanId.value = data.lastPlanId ?? data.plans[0]!.id;
    nightCollapsedUi.value = data.uiState?.nightCollapsed !== false; // 默认折叠
    jumpToFirstPlacedWeek(); // 打开/刷新：默认定位当前行程首个日程所在周（口径 §4.1b）
    loaded.value = true;
  }

  /** 定位到当前行程最早已放置日程所在周（口径 §4.1b：刷新/切换行程的默认定位；无已放置回退今天所在周） */
  function jumpToFirstPlacedWeek(): void {
    const dates = schedules.value
      .filter((s) => s.deletedAt === null && s.date !== null && s.planId === currentPlanId.value)
      .map((s) => s.date!)
      .sort();
    if (dates.length) weekStartIso.value = isoOf(mondayOf(parseISO(dates[0]!)));
  }

  function persist(): void {
    void repo.save({
      version: SCHEMA_VERSION,
      plans: plans.value,
      schedules: schedules.value,
      lastPlanId: currentPlanId.value,
      uiState: { nightCollapsed: nightCollapsedUi.value },
    });
  }

  const byId = (id: string): Schedule | undefined => schedules.value.find((s) => s.id === id);
  const touch = (s: Schedule): void => {
    s.updatedAt = Date.now();
  };

  /* ---------------- 派生状态 ---------------- */
  const currentPlan = computed(
    () => plans.value.find((p) => p.id === currentPlanId.value) ?? null,
  );

  /** 当前行程、未删除（参与一切常规视图） */
  const activeSchedules = computed(() =>
    schedules.value
      .filter((s) => s.planId === currentPlanId.value && s.deletedAt === null)
      .sort((a, b) => a.createdAt - b.createdAt),
  );

  /** 回收站：当前行程已删除，按删除时间倒序 */
  const trashedSchedules = computed(() =>
    schedules.value
      .filter((s) => s.planId === currentPlanId.value && s.deletedAt !== null)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  );

  const weekDays = computed(() => {
    const m = parseISO(weekStartIso.value);
    return Array.from({ length: 7 }, (_, i) => addDays(m, i));
  });
  const weekIsoList = computed(() => weekDays.value.map(isoOf));

  /** 本周已放置日程（统计口径 §8：金额区间 = 各日程区间求和，未放置不计入） */
  const placedInWeek = computed(() =>
    activeSchedules.value.filter((s) => s.date !== null && weekIsoList.value.includes(s.date)),
  );
  const weekStats = computed(() => {
    let min = 0;
    let max = 0;
    for (const s of placedInWeek.value) {
      const r = priceRange(s.price, s.varianceUp, s.varianceDown);
      min += r.min;
      max += r.max;
    }
    return { count: placedInWeek.value.length, min, max };
  });

  /** 凌晨带（02:00-07:00）有效折叠态：用户偏好折叠 且 本周无日程落入该时段（口径 §4.1a） */
  const hasNightEvents = computed(() =>
    placedInWeek.value.some((s) => {
      const st = hhToMin(s.startTime!);
      return st < NIGHT_END && st + s.durationMin > NIGHT_START;
    }),
  );
  const nightBandCollapsed = computed(() => nightCollapsedUi.value && !hasNightEvents.value);

  /** 日历渲染：iso → 该日已放置日程列表 */
  const schedulesByDate = computed(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of activeSchedules.value) {
      if (isPlaced(s)) {
        const arr = map.get(s.date!);
        if (arr) arr.push(s);
        else map.set(s.date!, [s]);
      }
    }
    return map;
  });

  /** 日程库分组（口径 §6） */
  const groups = computed<ScheduleGroup[]>(() => {
    const list = activeSchedules.value;
    if (groupBy.value === 'type') {
      return TYPES.map((t) => ({
        key: t.k,
        name: t.name,
        color: t.color,
        items: list.filter((s) => s.type === t.k).slice().sort(byLibraryOrder),
      }));
    }
    if (groupBy.value === 'location') {
      const map = new Map<string, Schedule[]>();
      for (const s of list) {
        const k = s.location || '__none__';
        const arr = map.get(k);
        if (arr) arr.push(s);
        else map.set(k, [s]);
      }
      return [...map.entries()]
        .sort((a, b) => {
          if (a[0] === '__none__') return 1;
          if (b[0] === '__none__') return -1;
          return a[0].localeCompare(b[0], 'zh-Hans-CN');
        })
        .map(([k, items]) => ({
          key: k,
          name: k === '__none__' ? '未填写地点' : k,
          items: items.slice().sort(byLibraryOrder),
        }));
    }
    // expectedDate
    const map = new Map<string, Schedule[]>();
    for (const s of list) {
      const k = s.expectedDate || '__none__';
      const arr = map.get(k);
      if (arr) arr.push(s);
      else map.set(k, [s]);
    }
    return [...map.entries()]
      .sort((a, b) => {
        if (a[0] === '__none__') return 1;
        if (b[0] === '__none__') return -1;
        return a[0].localeCompare(b[0]);
      })
      .map(([k, items]) => ({
        key: k,
        name: k === '__none__' ? '未设定' : fmtShortWeek(k),
        items: items.slice().sort(byLibraryOrder),
      }));
  });

  /* ---------------- 状态机事件（口径文档 §3.2，事件编号一一对应） ---------------- */

  /** E1/E2 新建日程（日期时间同填则直接上表）；返回 [新日程, 警告] */
  function createSchedule(patch: {
    title: string;
    type: ScheduleType;
    location?: string;
    date?: string | null;
    startTime?: string | null;
    durationMin?: number;
    expectedDate?: string | null;
    price?: number | null;
    varianceUp?: number | null;
    varianceDown?: number | null;
    expenseType?: 'required' | 'optional';
    note?: string;
  }): [Schedule, FormWarn] {
    let warn: FormWarn = null;
    let date = patch.date ?? null;
    let startTime = patch.startTime ?? null;
    if ((date && !startTime) || (!date && startTime)) {
      date = null;
      startTime = null;
      warn = 'date-time-mismatch';
    }
    let startMin = 480;
    let durationMin = patch.durationMin ?? 60;
    if (date && startTime) {
      const c = clampPlacement(hhToMin(floorToStep(startTime, 5)), durationMin);
      startMin = c.startMin;
      durationMin = c.durMin;
      startTime = minToHH(startMin);
    }
    const now = Date.now();
    const s: Schedule = {
      id: uid(),
      planId: currentPlanId.value!,
      title: patch.title.trim().slice(0, 30) || '未命名日程',
      type: patch.type,
      location: (patch.location ?? '').trim().slice(0, 30),
      date: date && startTime ? date : null,
      startTime: date && startTime ? minToHH(startMin) : null,
      durationMin,
      expectedDate: patch.expectedDate ?? null,
      price: patch.price ?? null,
      varianceUp: patch.varianceUp ?? null,
      varianceDown: patch.varianceDown ?? null,
      expenseType: patch.expenseType ?? 'required',
      paidAmount: null,
      confirmed: false,
      sortOrder: null,
      note: (patch.note ?? '').slice(0, 200),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    schedules.value.push(s);
    autoConfirmIfSolo(s); // E2：直接上表且时段无重叠 → 自动勾选（口径 §14）
    persist();
    return [s, warn];
  }

  /** E3 日程库拖入 / E4 表内拖动：落点写日期+开始时间（吸附后由调用方传入，30 分钟刻度） */
  function placeSchedule(id: string, date: string, startMin: number, _kind: 'place' | 'move'): Schedule | null {
    const s = byId(id);
    if (!s || s.deletedAt !== null) return null;
    const clamped = clampStart(startMin, s.durationMin); // 日末截断：保持时长
    s.date = date;
    s.startTime = minToHH(clamped);
    autoConfirmIfSolo(s); // 放到无重叠时段 → 自动勾选（口径 §14）
    touch(s);
    persist();
    return s;
  }

  /** 自动勾选：目标时段仅此一个日程时置 confirmed=true；有重叠不勾、已勾不重复 */
  function autoConfirmIfSolo(s: Schedule): void {
    if (s.confirmed || !isPlaced(s) || s.deletedAt !== null) return;
    const solo = !activeSchedules.value.some(
      (o) => o.id !== s.id && o.date === s.date && timeOverlaps(s, o),
    );
    if (solo) s.confirmed = true;
  }

  /** E5 边缘拖拽调时长（调用方已按口径钳制）；上边缘=结束不变、下边缘=仅改时长 */
  function resizeSchedule(id: string, startMin: number, durMin: number): Schedule | null {
    const s = byId(id);
    if (!s || s.deletedAt !== null || !isPlaced(s)) return null;
    const c = clampPlacement(startMin, durMin);
    s.startTime = minToHH(c.startMin);
    s.durationMin = c.durMin;
    touch(s);
    persist();
    return s;
  }

  /** E6 点 × 取消：日期时间置空 + 预计日期回写为上次实际日期（口径 §5）；返回取消前日期供提示 */
  function cancelSchedule(id: string): string | null {
    const s = byId(id);
    if (!s || s.deletedAt !== null || !isPlaced(s)) return null;
    const lastDate = s.date;
    s.expectedDate = s.date; // 回写：多次取消取最近一次实际日期
    s.date = null;
    s.startTime = null;
    s.confirmed = false; // 回库待重排，取消勾选（口径 §14）
    touch(s);
    persist();
    return lastDate;
  }

  /** E7/E8 详情编辑保存：字段副作用见口径 §3.2；只填日期或时间之一时两者均置空并返回警告 */
  function updateSchedule(
    id: string,
    patch: {
      title: string;
      type: ScheduleType;
      location?: string;
      date?: string | null;
      startTime?: string | null;
      durationMin?: number;
      expectedDate?: string | null;
      price?: number | null;
      varianceUp?: number | null;
      varianceDown?: number | null;
      expenseType?: 'required' | 'optional';
      note?: string;
    },
  ): [Schedule | null, FormWarn] {
    const s = byId(id);
    if (!s || s.deletedAt !== null) return [null, null];
    let warn: FormWarn = null;
    let date = patch.date ?? null;
    let startTime = patch.startTime ?? null;
    if ((date && !startTime) || (!date && startTime)) {
      date = null;
      startTime = null;
      warn = 'date-time-mismatch';
    }
    s.title = patch.title.trim().slice(0, 30) || '未命名日程';
    s.type = patch.type;
    s.location = (patch.location ?? '').trim().slice(0, 30);
    s.durationMin = patch.durationMin ?? s.durationMin;
    s.expectedDate = patch.expectedDate ?? null;
    s.price = patch.price ?? null;
    s.varianceUp = patch.varianceUp ?? null;
    s.varianceDown = patch.varianceDown ?? null;
    s.expenseType = patch.expenseType ?? 'required';
    s.note = (patch.note ?? '').slice(0, 200);
    if (date && startTime) {
      const c = clampPlacement(hhToMin(floorToStep(startTime, 5)), s.durationMin);
      s.date = date;
      s.startTime = minToHH(c.startMin);
      s.durationMin = c.durMin;
      autoConfirmIfSolo(s); // E7 未放置 → 已放置且无重叠 → 自动勾选
    } else {
      s.date = null;
      s.startTime = null;
      s.confirmed = false; // E8 回库 → 取消勾选
    }
    touch(s);
    persist();
    return [s, warn];
  }

  /* ---------------- 删除 / 回收站（口径补充 §1） ---------------- */

  /** 软删除进回收站；保留 date/startTime，恢复后回到原位 */
  function deleteSchedule(id: string): Schedule | null {
    const s = byId(id);
    if (!s || s.deletedAt !== null) return null;
    s.deletedAt = Date.now();
    touch(s);
    persist();
    return s;
  }

  function restoreSchedule(id: string): Schedule | null {
    const s = byId(id);
    if (!s || s.deletedAt === null) return null;
    s.deletedAt = null;
    touch(s);
    persist();
    return s;
  }

  /** 彻底删除（物理删除，不可恢复） */
  function purgeSchedule(id: string): boolean {
    const i = schedules.value.findIndex((x) => x.id === id);
    if (i < 0) return false;
    schedules.value.splice(i, 1);
    persist();
    return true;
  }

  /* ---------------- 勾选与已付（口径 §14/§15） ---------------- */

  function setConfirmed(id: string, v: boolean): void {
    const s = byId(id);
    if (!s || s.deletedAt !== null) return;
    s.confirmed = v;
    touch(s);
    persist();
  }

  /** 已付金额：仅预算表编辑 */
  function setPaidAmount(id: string, v: number | null): void {
    const s = byId(id);
    if (!s || s.deletedAt !== null) return;
    s.paidAmount = v == null || Number.isNaN(v) ? null : Math.max(0, Math.round(v * 100) / 100);
    touch(s);
    persist();
  }

  /** 组内手动排序（口径 §6.1a）：按传入顺序重编 sortOrder（0..n）并持久化 */
  function reorderGroupItems(orderedIds: string[]): void {
    orderedIds.forEach((id, i) => {
      const s = byId(id);
      if (s && s.deletedAt === null) {
        s.sortOrder = i;
        touch(s);
      }
    });
    persist();
  }

  /** 复制日程（库内）：新条目进库未放置；日期/时间/勾选/已付清空，其余字段保留（口径 §17） */
  function duplicateSchedule(id: string): Schedule | null {
    const src = byId(id);
    if (!src || src.deletedAt !== null) return null;
    const now = Date.now();
    const copy: Schedule = {
      ...src,
      id: uid(),
      title: `${src.title} 副本`.slice(0, 30),
      date: null,
      startTime: null,
      confirmed: false,
      paidAmount: null,
      createdAt: now,
      updatedAt: now,
    };
    schedules.value.push(copy);
    persist();
    return copy;
  }

  /* ---------------- 行程管理 ---------------- */

  /** 复制行程：完整复制日程（新 ID），已付金额不复制（避免已付合计翻倍，口径 §16） */
  function copyPlan(id: string): Plan | null {
    const src = plans.value.find((p) => p.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: Plan = {
      id: uid('plan'),
      name: `${src.name} 副本`.slice(0, 30),
      createdAt: now,
      updatedAt: now,
    };
    plans.value.push(copy);
    for (const s of schedules.value.filter((x) => x.planId === id)) {
      schedules.value.push({ ...s, id: uid(), planId: copy.id, paidAmount: null, createdAt: now, updatedAt: now });
    }
    currentPlanId.value = copy.id;
    jumpToFirstPlacedWeek();
    persist();
    return copy;
  }

  function createPlan(name: string): Plan {
    const now = Date.now();
    const p: Plan = { id: uid('plan'), name: name.trim().slice(0, 30) || '未命名行程', createdAt: now, updatedAt: now };
    plans.value.push(p);
    currentPlanId.value = p.id;
    persist();
    return p;
  }

  function renamePlan(id: string, name: string): void {
    const p = plans.value.find((x) => x.id === id);
    if (!p) return;
    p.name = name.trim().slice(0, 30) || p.name;
    p.updatedAt = Date.now();
    persist();
  }

  /** 物理删除行程及其全部日程（含回收站）；返回被删除的日程数 */
  function removePlan(id: string): number {
    const n = schedules.value.filter((s) => s.planId === id).length;
    plans.value = plans.value.filter((p) => p.id !== id);
    schedules.value = schedules.value.filter((s) => s.planId !== id);
    if (currentPlanId.value === id) {
      currentPlanId.value = plans.value[0]?.id ?? null;
      if (!currentPlanId.value && plans.value.length === 0) createPlan('我的行程');
      jumpToFirstPlacedWeek();
    }
    persist();
    return n;
  }

  function switchPlan(id: string): void {
    if (!plans.value.some((p) => p.id === id)) return;
    currentPlanId.value = id;
    jumpToFirstPlacedWeek(); // 切换行程 → 定位该行程首个日程所在周
    persist();
  }

  /* ---------------- 视图动作 ---------------- */

  /** 日历选日跳周（顶栏 WeekPicker） */
  function setWeekStartByDate(iso: string): void {
    weekStartIso.value = isoOf(mondayOf(parseISO(iso)));
  }

  /** 折叠/展开凌晨带（记忆持久化） */
  function setNightCollapsed(v: boolean): void {
    nightCollapsedUi.value = v;
    persist();
  }

  /** 07:00 定位锚点（考虑凌晨折叠后的实际像素位置） */
  const morningAnchorY = computed(() => minToY(NIGHT_END, nightBandCollapsed.value));

  function prevWeek(): void {
    weekStartIso.value = isoOf(addDays(parseISO(weekStartIso.value), -7));
  }
  function nextWeek(): void {
    weekStartIso.value = isoOf(addDays(parseISO(weekStartIso.value), 7));
  }
  function goToday(): void {
    weekStartIso.value = isoOf(mondayOf(new Date()));
  }
  /** 切换分组后折叠状态重置为全部展开（口径 §6.1） */
  function setGroupBy(g: GroupBy): void {
    groupBy.value = g;
    collapsed.value = new Set();
  }
  function toggleCollapsed(key: string): void {
    const set = new Set(collapsed.value);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    collapsed.value = set;
  }

  /** 重置为示例数据（清空本地全部修改） */
  async function resetToSeed(): Promise<void> {
    const data = buildSeedData();
    plans.value = data.plans;
    schedules.value = data.schedules;
    currentPlanId.value = data.lastPlanId;
    weekStartIso.value = isoOf(mondayOf(new Date()));
    groupBy.value = 'type';
    collapsed.value = new Set();
    await repo.save(data);
    jumpToFirstPlacedWeek();
  }

  return {
    // 状态
    plans,
    schedules,
    currentPlanId,
    loaded,
    weekStartIso,
    groupBy,
    collapsed,
    // 派生
    currentPlan,
    activeSchedules,
    trashedSchedules,
    weekDays,
    weekIsoList,
    placedInWeek,
    weekStats,
    schedulesByDate,
    groups,
    // 初始化
    init,
    persist,
    // 状态机事件
    createSchedule,
    placeSchedule,
    resizeSchedule,
    cancelSchedule,
    updateSchedule,
    // 删除/回收站
    deleteSchedule,
    restoreSchedule,
    purgeSchedule,
    // 勾选与已付
    setConfirmed,
    setPaidAmount,
    duplicateSchedule,
    reorderGroupItems,
    // 行程
    createPlan,
    renamePlan,
    removePlan,
    switchPlan,
    copyPlan,
    // 视图
    nightCollapsedUi,
    nightBandCollapsed,
    morningAnchorY,
    setNightCollapsed,
    setWeekStartByDate,
    prevWeek,
    nextWeek,
    goToday,
    setGroupBy,
    toggleCollapsed,
    resetToSeed,
  };
});
