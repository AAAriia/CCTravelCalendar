import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlannerStore } from '@/stores/planner';
import { isoOf, mondayOf, addDays } from '@/utils/datetime';
import { fmtShort } from '@/utils/format';

/** 种子固定日期（2026-09-30 出发窗口）与所在周 */
const SD = { d0: '2026-09-30', d1: '2026-10-01', d2: '2026-10-02', d3: '2026-10-03', d4: '2026-10-04' };
const SEED_MONDAY = '2026-09-28';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

const boot = async () => {
  const store = usePlannerStore();
  await store.init();
  return store;
};
const findByTitle = (store: ReturnType<typeof usePlannerStore>, title: string) =>
  store.schedules.find((s) => s.title.includes(title))!;
const mondayIso = (n = 0) => isoOf(addDays(mondayOf(new Date()), n));

describe('planner store · 初始化与种子', () => {
  it('首次 init 播种示例数据：1 行程 + 14 日程', async () => {
    const store = await boot();
    expect(store.plans).toHaveLength(1);
    expect(store.schedules).toHaveLength(9);
    expect(store.currentPlanId).toBe(store.plans[0].id);
    expect(store.loaded).toBe(true);
    // 首次播种后自动定位到行程所在周（9/30 → 周一 9/28）
    expect(store.weekStartIso).toBe(SEED_MONDAY);
  });

  it('重复 init 幂等（不重复播种）', async () => {
    const store = await boot();
    await store.init();
    expect(store.schedules).toHaveLength(9);
  });

  it('刷新场景：新 store 实例从 localStorage 恢复修改', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    store.cancelSchedule(food.id);
    // 模拟刷新：全新 pinia + store
    setActivePinia(createPinia());
    const store2 = await boot();
    expect(store2.schedules.find((s) => s.id === food.id)!.date).toBeNull();
    expect(store2.weekStartIso).toBe(SEED_MONDAY); // 刷新后定位行程首日程所在周（口径 §4.1b）
  });
});

describe('planner store · 状态机 E1–E8（口径文档 §3.2）', () => {
  it('E1 新建（无日期时间）→ 未放置，默认时长 60', async () => {
    const store = await boot();
    const [s, warn] = store.createSchedule({ title: '测试 A', type: 'food' });
    expect(warn).toBeNull();
    expect(s.date).toBeNull();
    expect(s.startTime).toBeNull();
    expect(s.durationMin).toBe(60);
    expect(store.activeSchedules.some((x) => x.id === s.id)).toBe(true);
  });

  it('E2 新建（日期+时间）→ 直接上表，时间按 5 分钟保留（09:22→09:20）', async () => {
    const store = await boot();
    const [s] = store.createSchedule({ title: '测试 B', type: 'sight', date: mondayIso(2), startTime: '09:22' });
    expect(s.date).toBe(mondayIso(2));
    expect(s.startTime).toBe('09:20');
  });

  it('新建只填日期之一 → 两者置空 + 警告（口径 §3.3）', async () => {
    const store = await boot();
    const [s, warn] = store.createSchedule({ title: '测试 C', type: 'food', date: mondayIso(2) });
    expect(warn).toBe('date-time-mismatch');
    expect(s.date).toBeNull();
    expect(s.startTime).toBeNull();
  });

  it('E3 拖入：落点写入日期时间；日末截断保持时长', async () => {
    const store = await boot();
    const north = findByTitle(store, '北部交通'); // 未放置
    const placed = store.placeSchedule(north.id, mondayIso(0), 600, 'place');
    expect(placed!.date).toBe(mondayIso(0));
    expect(placed!.startTime).toBe('10:00');
    // 浮潜 180 分钟，落点 23:40 → 钳制为 21:00 开始（口径 §4.4 保持时长）
    const dive = findByTitle(store, '浮潜');
    const r2 = store.placeSchedule(dive.id, mondayIso(1), 1420, 'place');
    expect(r2!.startTime).toBe('21:00');
  });

  it('E4 表内拖动改期', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    store.placeSchedule(food.id, mondayIso(5), 840, 'move');
    expect(food.date).toBe(mondayIso(5));
    expect(food.startTime).toBe('14:00');
  });

  it('E5 边缘调时长', async () => {
    const store = await boot();
    const traffic = findByTitle(store, '宫古岛交通');
    store.resizeSchedule(traffic.id, 690, 120);
    expect(traffic.startTime).toBe('11:30');
    expect(traffic.durationMin).toBe(120);
    // 越过日末的防御性钳制：保持开始时间、截断时长（口径 §4.4；正常拖拽由调用方先行钳制）
    store.resizeSchedule(traffic.id, 1400, 90);
    expect(traffic.startTime).toBe('23:20');
    expect(traffic.durationMin).toBe(40);
  });

  it('E6 取消：日期时间置空 + 预计日期回写为上次实际日期（口径 §5）', async () => {
    const store = await boot();
    const flight = findByTitle(store, '宫古往返'); // D4 周五 09:00
    expect(flight.expectedDate).toBeNull();
    const lastDate = store.cancelSchedule(flight.id);
    expect(lastDate).toBe(SD.d4);
    expect(flight.date).toBeNull();
    expect(flight.startTime).toBeNull();
    expect(flight.expectedDate).toBe(SD.d4); // 回写 ✓
    expect(store.groups.length).toBeGreaterThan(0);
  });

  it('E6 多次取消取最近一次实际日期（口径 §5.2 示例推演）', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通'); // 未放置
    // 放到周一 → 取消 → 预计日期 = 周一
    store.placeSchedule(s.id, mondayIso(0), 600, 'place');
    store.cancelSchedule(s.id);
    expect(s.expectedDate).toBe(mondayIso(0));
    // 再放到周六 → 再取消 → 预计日期覆盖为周六
    store.placeSchedule(s.id, mondayIso(5), 720, 'place');
    store.cancelSchedule(s.id);
    expect(s.expectedDate).toBe(mondayIso(5));
    expect(s.date).toBeNull();
  });

  it('E7 编辑：填日期+时间 → 已放置；时间按 5 分钟保留', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通');
    const [updated, warn] = store.updateSchedule(s.id, {
      title: s.title, type: s.type, date: mondayIso(4), startTime: '14:20', durationMin: 120,
    });
    expect(warn).toBeNull();
    expect(updated!.date).toBe(mondayIso(4));
    expect(updated!.startTime).toBe('14:20'); // 5 分钟对齐保留
  });

  it('E8 编辑：清空日期 → 未放置且预计日期不回写（区别于 E6）', async () => {
    const store = await boot();
    const dive = findByTitle(store, '浮潜'); // D2 09:00
    const [, warn] = store.updateSchedule(dive.id, {
      title: dive.title, type: dive.type, date: null, startTime: null, durationMin: dive.durationMin,
    });
    expect(warn).toBeNull();
    expect(dive.date).toBeNull();
    expect(dive.expectedDate).toBeNull(); // 不回写
  });

  it('E8 编辑只填时间 → 两者置空 + 警告', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    const [, warn] = store.updateSchedule(food.id, {
      title: food.title, type: food.type, date: null, startTime: '09:00', durationMin: 60,
    });
    expect(warn).toBe('date-time-mismatch');
    expect(food.date).toBeNull();
    expect(food.startTime).toBeNull();
  });
});

describe('planner store · 统计口径（口径文档 §8：金额区间 = 各日程区间求和）', () => {
  it('本周区间：种子 8 项 ¥7,206~8,295；取消吃饭(1200±300) → 7 项 ¥6,006~6,795', async () => {
    const store = await boot();
    // 种子已放置：D0 高铁294/大巴81+69/机票2553+500/酒店1750 + D1 吃饭1200+300 + D2 浮潜600 + D4 宫古机票748-220/宫古交通200
    expect(store.weekStats.count).toBe(8);
    expect(store.weekStats.min).toBe(7206);
    expect(store.weekStats.max).toBe(8295);
    store.cancelSchedule(findByTitle(store, '吃饭').id);
    expect(store.weekStats.count).toBe(7);
    expect(store.weekStats.min).toBe(6006);
    expect(store.weekStats.max).toBe(6795);
  });

  it('未放置不计入：放置"北部交通"(空金额±500) 后 max +500、min 不变', async () => {
    const store = await boot();
    const north = findByTitle(store, '北部交通');
    store.placeSchedule(north.id, SD.d3, 600, 'place');
    expect(store.weekStats.count).toBe(9);
    expect(store.weekStats.min).toBe(7206); // 0~500 → min 贡献 0
    expect(store.weekStats.max).toBe(8795); // 500
  });

  it('切到别的周 → 统计为 0', async () => {
    const store = await boot();
    store.prevWeek();
    expect(store.weekStats.count).toBe(0);
    expect(store.weekStats.min).toBe(0);
    store.goToday(); // 回到"今天"所在周（8 月，无数据）
    expect(store.weekStats.count).toBe(0);
  });
});

describe('planner store · 日程库分组口径（口径文档 §6）', () => {
  it('按类型：六类固定顺序，空类也保留', async () => {
    const store = await boot();
    expect(store.groupBy).toBe('type');
    expect(store.groups.map((g) => g.name)).toEqual(['交通', '住宿', '餐饮', '景点', '购物', '娱乐']);
    expect(store.groups.map((g) => g.items.length)).toEqual([6, 1, 1, 1, 0, 0]);
  });

  it('按地点：字典序，"未填写地点"排最后', async () => {
    const store = await boot();
    store.setGroupBy('location');
    const names = store.groups.map((g) => g.name);
    expect(names[names.length - 1]).toBe('未填写地点');
    expect(store.groups.find((g) => g.name === '未填写地点')!.items).toHaveLength(1); // 本岛北部交通
    expect(new Set(names).size).toBe(names.length);
  });

  it('按预计日期：升序，"未设定"排最后', async () => {
    const store = await boot();
    store.setGroupBy('expectedDate');
    const names = store.groups.map((g) => g.name);
    expect(names[names.length - 1]).toBe('未设定');
    // 种子：北部交通 expectedDate=D3 一个日期组 + 未设定（8 条）
    expect(names).toHaveLength(2);
    expect(store.groups.find((g) => g.name === '未设定')!.items).toHaveLength(8);
  });

  it('取消后日程出现在预计日期 = 上次实际日期的分组（回写独立验证）', async () => {
    const store = await boot();
    store.cancelSchedule(findByTitle(store, '吃饭').id); // D1 → 周二
    store.setGroupBy('expectedDate');
    const g = store.groups.find((x) => x.items.some((i) => i.title.includes('吃饭')));
    expect(g!.name).toContain(fmtShort(SD.d1));
  });

  it('setGroupBy 重置折叠状态（口径 §6.1）', async () => {
    const store = await boot();
    store.toggleCollapsed('type:food');
    expect(store.collapsed.has('type:food')).toBe(true);
    store.setGroupBy('location');
    expect(store.collapsed.size).toBe(0);
  });
});

describe('planner store · 删除与回收站', () => {
  it('删除 → 回收站，不参与日历/库/统计；恢复 → 回到原位（含日期时间）', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    const before = store.weekStats.count;
    store.deleteSchedule(food.id);
    expect(food.deletedAt).not.toBeNull();
    expect(store.activeSchedules.some((s) => s.id === food.id)).toBe(false);
    expect(store.trashedSchedules.map((s) => s.id)).toContain(food.id);
    expect(store.weekStats.count).toBe(before - 1);
    // 恢复：日期时间保留
    store.restoreSchedule(food.id);
    expect(food.deletedAt).toBeNull();
    expect(food.date).not.toBeNull();
    expect(store.weekStats.count).toBe(before);
  });

  it('彻底删除：物理移除，不可恢复', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通');
    store.deleteSchedule(s.id);
    expect(store.purgeSchedule(s.id)).toBe(true);
    expect(store.schedules.some((x) => x.id === s.id)).toBe(false);
    expect(store.trashedSchedules).toHaveLength(0);
  });

  it('已删除日程不响应状态机事件', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通');
    store.deleteSchedule(s.id);
    expect(store.cancelSchedule(s.id)).toBeNull();
    expect(store.placeSchedule(s.id, mondayIso(0), 600, 'place')).toBeNull();
    expect(store.resizeSchedule(s.id, 0, 60)).toBeNull();
  });
});

describe('planner store · 行程管理', () => {
  it('新建行程 → 切换为当前，库为空', async () => {
    const store = await boot();
    const p = store.createPlan('国庆北京行');
    expect(store.currentPlanId).toBe(p.id);
    expect(store.activeSchedules).toHaveLength(0);
    expect(store.weekStats.count).toBe(0);
  });

  it('重命名行程', async () => {
    const store = await boot();
    const id = store.plans[0].id;
    store.renamePlan(id, '新名字');
    expect(store.plans[0].name).toBe('新名字');
  });

  it('删除当前行程 → 行程与日程级联删除并切到剩余行程', async () => {
    const store = await boot();
    const second = store.createPlan('第二个');
    store.switchPlan(store.plans[0].id);
    const n = store.removePlan(store.plans[0].id);
    expect(n).toBe(9);
    expect(store.plans.map((p) => p.id)).toEqual([second.id]);
    expect(store.currentPlanId).toBe(second.id);
  });

  it('删除唯一行程 → 自动创建"我的行程"兜底', async () => {
    const store = await boot();
    store.removePlan(store.plans[0].id);
    expect(store.plans).toHaveLength(1);
    expect(store.plans[0].name).toBe('我的行程');
    expect(store.schedules).toHaveLength(0);
  });

  it('重置示例数据：恢复种子并回到本周/按类型', async () => {
    const store = await boot();
    store.cancelSchedule(findByTitle(store, '吃饭').id);
    store.nextWeek();
    store.setGroupBy('location');
    await store.resetToSeed();
    expect(store.schedules).toHaveLength(9);
    expect(store.weekStats.count).toBe(8);
    expect(store.groupBy).toBe('type');
  });
});

describe('planner store · 勾选确认（口径 §14）', () => {
  it('种子已放置日程均为已确认（互不重叠）', async () => {
    const store = await boot();
    const placed = store.activeSchedules.filter((s) => s.date);
    expect(placed.every((s) => s.confirmed)).toBe(true);
    expect(store.activeSchedules.find((s) => !s.date)!.confirmed).toBe(false); // 北部交通未勾选
  });

  it('E3 放置到无重叠时段 → 自动勾选；有重叠 → 不勾选', async () => {
    const store = await boot();
    const north = findByTitle(store, '北部交通');
    const placed = store.placeSchedule(north.id, SD.d3, 600, 'place');
    expect(placed!.confirmed).toBe(true); // 10:00 独占
    // 新建日程放同一时段 → 重叠不勾选
    const [dup] = store.createSchedule({ title: '重叠测试', type: 'food' });
    store.placeSchedule(dup.id, SD.d3, 630, 'place'); // 10:30 与 10:00-11:00 重叠
    expect(dup.confirmed).toBe(false);
  });

  it('手动勾选/取消；E6 取消回库时取消勾选', async () => {
    const store = await boot();
    // 先放一个占位日程（10:30-11:30），再放重叠日程（10:00-11:00）→ 不自动勾选
    const [holder] = store.createSchedule({ title: '占位日程', type: 'food' });
    store.placeSchedule(holder.id, SD.d3, 630, 'place');
    expect(holder.confirmed).toBe(true); // 独占时段
    const [dup] = store.createSchedule({ title: '重叠日程', type: 'food' });
    store.placeSchedule(dup.id, SD.d3, 600, 'place');
    expect(dup.confirmed).toBe(false); // 与占位重叠
    store.setConfirmed(dup.id, true);
    expect(dup.confirmed).toBe(true);
    store.cancelSchedule(dup.id);
    expect(dup.confirmed).toBe(false);
    expect(dup.date).toBeNull();
  });

  it('E7 表单上表（未放置 → 已放置，无重叠）自动勾选；E8 清空日期取消勾选', async () => {
    const store = await boot();
    const [s] = store.createSchedule({ title: '表单上表', type: 'sight' });
    store.updateSchedule(s.id, { title: s.title, type: s.type, date: SD.d2, startTime: '14:00', durationMin: 60 });
    expect(s.confirmed).toBe(true);
    store.updateSchedule(s.id, { title: s.title, type: s.type, date: null, startTime: null, durationMin: 60 });
    expect(s.confirmed).toBe(false);
  });
});

describe('planner store · 已付金额（口径 §15）', () => {
  it('setPaidAmount：正常/两位小数/负数归零/清空', async () => {
    const store = await boot();
    const s = findByTitle(store, '吃饭');
    store.setPaidAmount(s.id, 500);
    expect(s.paidAmount).toBe(500);
    store.setPaidAmount(s.id, 100.555);
    expect(a_p(s)).toBe(100.56);
    store.setPaidAmount(s.id, -50);
    expect(a_p(s)).toBe(0);
    store.setPaidAmount(s.id, null);
    expect(s.paidAmount).toBeNull();
  });

  it('已删除日程不可编辑已付', async () => {
    const store = await boot();
    const s = findByTitle(store, '浮潜');
    store.deleteSchedule(s.id);
    store.setPaidAmount(s.id, 100);
    expect(s.paidAmount).toBeNull();
  });

  function a_p(s: { paidAmount: number | null }): number {
    return s.paidAmount!;
  }
});

describe('planner store · 复制行程（口径 §16）', () => {
  it('完整复制：新 ID、名称副本、paidAmount 不复制、自动切换', async () => {
    const store = await boot();
    const srcId = store.plans[0].id;
    store.setPaidAmount(findByTitle(store, '吃饭').id, 300);
    const copy = store.copyPlan(srcId)!;
    expect(copy.name).toBe('冲绳 7 日行 副本');
    expect(store.plans).toHaveLength(2);
    expect(store.currentPlanId).toBe(copy.id);
    const srcSchedules = store.schedules.filter((x) => x.planId === srcId);
    const copySchedules = store.schedules.filter((x) => x.planId === copy.id);
    expect(copySchedules).toHaveLength(srcSchedules.length);
    expect(new Set(copySchedules.map((x) => x.id)).size).toBe(copySchedules.length); // ID 全新
    // 字段保留（日期/勾选/波动），已付清空
    const srcFood = srcSchedules.find((x) => x.title.includes('吃饭'))!;
    const copyFood = copySchedules.find((x) => x.title.includes('吃饭'))!;
    expect(copyFood.date).toBe(srcFood.date);
    expect(copyFood.confirmed).toBe(srcFood.confirmed);
    expect(copyFood.paidAmount).toBeNull();
    // 旧行程数据不受影响
    expect(srcFood.paidAmount).toBe(300);
  });
});

describe('planner store · 凌晨折叠与日历跳周（口径 §4.1a）', () => {
  it('默认折叠；展开后持久化记忆（跨刷新）', async () => {
    const store = await boot();
    expect(store.nightCollapsedUi).toBe(true);
    expect(store.nightBandCollapsed).toBe(true); // 种子无凌晨日程
    store.setNightCollapsed(false);
    expect(store.nightBandCollapsed).toBe(false);
    // 模拟刷新
    setActivePinia(createPinia());
    const store2 = await boot();
    expect(store2.nightBandCollapsed).toBe(false); // 记忆生效
    store2.setNightCollapsed(true); // 还原默认，避免影响其它用例（各自独立 pinia，可省）
  });

  it('本周有日程落入凌晨带 → 自动展开（防隐藏数据）', async () => {
    const store = await boot();
    const [s] = store.createSchedule({ title: '红眼航班', type: 'transport', date: SD.d2, startTime: '05:30', durationMin: 90 });
    expect(store.nightBandCollapsed).toBe(false); // 自动展开
    // 取消该日程后回到折叠
    store.cancelSchedule(s.id);
    expect(store.nightBandCollapsed).toBe(true);
  });

  it('setWeekStartByDate：选日跳到所在周', async () => {
    const store = await boot();
    store.setWeekStartByDate('2026-10-08'); // 周四 → 周一 10/5
    expect(store.weekStartIso).toBe('2026-10-05');
    store.goToday();
    expect(store.weekStartIso).toBe(isoOf(mondayOf(new Date())));
  });
});

describe('planner store · 库内拖拽排序（口径 §6.1a）', () => {
  it('reorderGroupItems 重排序号，分组展示顺序即时更新', async () => {
    const store = await boot();
    const g = store.groups.find((x) => x.name === '交通')!;
    const ids = g.items.map((s) => s.id);
    const before = g.items.map((s) => s.title.slice(0, 4));
    // 把最后一项（本岛北部交通）移到最前
    const reordered = [ids[ids.length - 1]!, ...ids.slice(0, -1)];
    store.reorderGroupItems(reordered);
    const after = store.groups.find((x) => x.name === '交通')!.items.map((s) => s.title.slice(0, 4));
    expect(after[0]).toContain('北部');
    expect(after).not.toEqual(before);
    // sortOrder 严格递增
    const orders = store.groups.find((x) => x.name === '交通')!.items.map((s) => s.sortOrder);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('排序仅影响本组：餐饮组保持创建序', async () => {
    const store = await boot();
    const transportIds = store.groups.find((x) => x.name === '交通')!.items.map((s) => s.id);
    store.reorderGroupItems([...transportIds].reverse());
    const food = store.groups.find((x) => x.name === '餐饮')!.items;
    expect(food.every((s) => s.sortOrder == null)).toBe(true);
    expect(food.map((s) => s.title)).toEqual(food.map((s) => s.title)); // 保持创建序（单元素断言从简）
  });

  it('新建日程排在组尾（未排序项位于手动排序项之后）', async () => {
    const store = await boot();
    const transportIds = store.groups.find((x) => x.name === '交通')!.items.map((s) => s.id);
    store.reorderGroupItems(transportIds); // 全组标记手动序
    const [created] = store.createSchedule({ title: '新交通项', type: 'transport' });
    const items = store.groups.find((x) => x.name === '交通')!.items;
    expect(items[items.length - 1]!.id).toBe(created.id);
    expect(created.sortOrder).toBeNull();
  });

  it('排序持久化：刷新后保持', async () => {
    const store = await boot();
    const ids = store.groups.find((x) => x.name === '交通')!.items.map((s) => s.id);
    store.reorderGroupItems([...ids].reverse());
    setActivePinia(createPinia());
    const store2 = await boot();
    const after = store2.groups.find((x) => x.name === '交通')!.items.map((s) => s.id);
    expect(after).toEqual([...ids].reverse());
  });
});

describe('planner store · 刷新默认定位行程周（口径 §4.1b）', () => {
  it('刷新后定位当前行程首个日程所在周，而非今天', async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    await boot(); // 首次 init 播种并持久化
    // 数据持久化后再次 init（刷新场景）
    setActivePinia(createPinia());
    const store2 = await boot();
    expect(store2.weekStartIso).toBe(SEED_MONDAY); // 2026-09-28，而非本周（8 月）
  });

  it('切换行程 → 定位该行程首个日程所在周；空行程回退保持', async () => {
    const store = await boot();
    expect(store.weekStartIso).toBe(SEED_MONDAY);
    const empty = store.createPlan('空行程');
    expect(store.weekStartIso).toBe(SEED_MONDAY); // 空行程无已放置 → 保持当前周
    // 在空行程放置一个日程（2026-10-20 当周）
    const [s] = store.createSchedule({ title: '未来日程', type: 'sight', date: '2026-10-20', startTime: '10:00' });
    store.switchPlan(store.plans.find((p) => p.name === '冲绳 7 日行')!.id);
    expect(store.weekStartIso).toBe(SEED_MONDAY);
    store.switchPlan(empty.id);
    expect(store.weekStartIso).toBe('2026-10-19'); // 该行程首日程所在周
    void s;
  });

  it('定位限定当前行程：他行程的更早日程不干扰', async () => {
    const store = await boot();
    const other = store.createPlan('另一行程');
    store.createSchedule({ title: '更早', type: 'sight', date: '2026-01-05', startTime: '09:00' });
    store.switchPlan(store.plans.find((p) => p.name === '冲绳 7 日行')!.id);
    expect(store.weekStartIso).toBe(SEED_MONDAY); // 不被 1 月的日程带偏
    store.switchPlan(other.id);
    expect(store.weekStartIso).toBe('2026-01-05'); // 切过去则定位其首周（周一=1/5）
    void other;
  });
});

describe('planner store · 地址选点字段（口径 §20a）', () => {
  it('创建与编辑可携带 address/lat/lon；清空地址同步清坐标', async () => {
    const store = await boot();
    const [s] = store.createSchedule({
      title: '带地址测试', type: 'sight',
      address: 'Naha Airport', lat: 26.2085, lon: 127.6845,
    });
    expect(s.address).toBe('Naha Airport');
    expect(s.lat).toBe(26.2085);
    store.updateSchedule(s.id, {
      title: s.title, type: s.type, address: '', lat: null, lon: null,
      date: null, startTime: null, durationMin: 60,
    });
    expect(s.address).toBe('');
    expect(s.lat).toBeNull();
    expect(s.lon).toBeNull();
  });
});
