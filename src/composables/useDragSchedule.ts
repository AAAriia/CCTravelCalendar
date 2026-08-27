import { ref } from 'vue';
import type { Schedule } from '@/types';
import { isPlaced } from '@/types';
import { TYPE_MAP } from '@/constants';
import { usePlannerStore } from '@/stores/planner';
import { addDays, hhToMin, isoOf, minToHH, snapY, yOfMin } from '@/utils/datetime';
import { fmtShort } from '@/utils/format';
import { toast } from '@/composables/useToast';
import { useIsMobile } from '@/composables/useMediaQuery';

/** 拖拽提示（由 WeekCalendar 渲染的虚线格） */
export interface DragHint {
  colIdx: number;
  startMin: number;
  durMin: number;
  color: string;
}

/** 响应式拖拽状态（组件读取渲染） */
export const dragHint = ref<DragHint | null>(null);
export const dragging = ref(false);
/** 指针路径处理过后抑制原生 click，避免重复弹窗 */
export const suppressClick = ref(false);
/** 拖拽结束后自增，强制卡片层重建（清除 resize 的内联样式覆写） */
export const renderTick = ref(0);

type Kind = 'move' | 'lib' | 'lib-click' | 'resize-t' | 'resize-b';

interface DragCtx {
  kind: Kind;
  s: Schedule;
  pointerId: number;
  px: number;
  py: number;
  off: { x: number; y: number };
  cardEl?: HTMLElement;
  srcEl?: HTMLElement;
  dayRect?: DOMRect;
  daysRect: DOMRect;
  orig: { st: number; dur: number };
  started: boolean;
  target: { colIdx: number; m: number } | null;
  newSt: number | null;
  newDur: number | null;
  ghost?: HTMLElement;
}

let ctx: DragCtx | null = null;
let calDaysEl: HTMLElement | null = null;

/** UI 钩子：由 PlannerView 注入（指针路径点击卡片/库条目时打开详情） */
let openDetailHook: ((id: string) => void) | null = null;
export function setDragUiHooks(hook: (id: string) => void): void {
  openDetailHook = hook;
}

/** WeekCalendar 挂载后绑定日程表网格容器（落点判定基准） */
export function bindCalendarGrid(el: HTMLElement | null): void {
  calDaysEl = el;
}

let installed = false;
/** 安装全局指针监听（幂等，PlannerView 挂载时调用） */
export function installDragSystem(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctx) {
      cleanup();
      renderTick.value++;
    }
  });
}

/* ---------------- 起点：卡片 pointerdown（移动端不做拖拽，口径补充 §4） ---------------- */
export function beginCardDrag(e: PointerEvent, schedule: Schedule, cardEl: HTMLElement): void {
  if (useIsMobile().value) return;
  if (e.button !== 0) return;
  const t = e.target as HTMLElement;
  if (t.closest('.card-x') || t.closest('.confirm-check')) return; // × 与勾选走原生 click
  e.preventDefault();
  if (!calDaysEl) return;
  const r = cardEl.getBoundingClientRect();
  const zone = e.clientY - r.top <= 6 ? 't' : r.bottom - e.clientY <= 6 ? 'b' : 'm';
  ctx = {
    kind: zone === 'm' ? 'move' : zone === 't' ? 'resize-t' : 'resize-b',
    s: schedule,
    pointerId: e.pointerId,
    px: e.clientX,
    py: e.clientY,
    off: { x: e.clientX - r.left, y: e.clientY - r.top }, // 偏移锁定（口径 §4.2）
    cardEl,
    dayRect: cardEl.parentElement?.getBoundingClientRect(),
    daysRect: calDaysEl.getBoundingClientRect(),
    orig: { st: hhToMin(schedule.startTime!), dur: schedule.durationMin },
    started: false,
    target: null,
    newSt: null,
    newDur: null,
  };
}

/* ---------------- 起点：日程库条目 pointerdown ---------------- */
export function beginLibDrag(e: PointerEvent, schedule: Schedule, srcEl: HTMLElement): void {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest('.lib-copy')) return; // 复制按钮走原生 click（须在 preventDefault 之前，避免吞掉移动端 tap）
  e.preventDefault();
  if (useIsMobile().value || isPlaced(schedule)) {
    // 移动端（点选放置流程）/ 已放置条目：拦截拖拽，点击走 open 回退打开详情（口径 §4.6 / §6.3）
    ctx = {
      kind: 'lib-click',
      s: schedule,
      pointerId: e.pointerId,
      px: e.clientX, py: e.clientY,
      off: { x: 0, y: 0 },
      srcEl,
      daysRect: new DOMRect(),
      orig: { st: 0, dur: schedule.durationMin },
      started: false, target: null, newSt: null, newDur: null,
    };
    return;
  }
  if (!calDaysEl) return;
  ctx = {
    kind: 'lib',
    s: schedule,
    pointerId: e.pointerId,
    px: e.clientX,
    py: e.clientY,
    off: { x: 26, y: 16 }, // 幽灵相对指针的固定偏移
    srcEl,
    daysRect: calDaysEl.getBoundingClientRect(),
    orig: { st: 0, dur: schedule.durationMin },
    started: false,
    target: null,
    newSt: null,
    newDur: null,
  };
}

/* ---------------- 落点判定（口径 §4.2/§4.3/§4.4） ---------------- */
function hitTest(gx: number, gy: number, durMin: number): { colIdx: number; m: number } | null {
  const r = ctx!.daysRect;
  if (gx < r.left || gx > r.right || gy < r.top || gy > r.bottom - 2) return null;
  const colIdx = Math.max(0, Math.min(6, Math.floor(((gx - r.left) / r.width) * 7)));
  const m = Math.max(0, Math.min(1440 - durMin, snapY(gy - r.top))); // 日末截断（保持时长）
  return { colIdx, m };
}

function makeGhost(cardEl: HTMLElement): HTMLElement {
  const g = cardEl.cloneNode(true) as HTMLElement;
  g.classList.add('ghost');
  g.classList.remove('drag-src');
  g.style.width = `${cardEl.offsetWidth}px`;
  g.style.left = '-9999px';
  document.body.appendChild(g);
  return g;
}

function makeLibGhost(s: Schedule): HTMLElement {
  const g = document.createElement('div');
  g.className = 'ghost-mini';
  g.style.setProperty('--c', TYPE_MAP[s.type].color);
  g.textContent = s.title;
  document.body.appendChild(g);
  return g;
}

function cleanup(): void {
  const d = ctx;
  ctx = null;
  if (!d) return;
  d.ghost?.remove();
  d.cardEl?.classList.remove('drag-src', 'resizing');
  d.srcEl?.classList.remove('drag-src');
  dragHint.value = null;
  dragging.value = false;
  document.body.classList.remove('noselect', 'resizing');
}

/* ---------------- move / up / cancel ---------------- */
function onMove(e: PointerEvent): void {
  if (!ctx || e.pointerId !== ctx.pointerId) return;
  const d = ctx;
  if (d.kind === 'lib-click') return; // 灰色条目：不响应移动
  if (!d.started) {
    if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < 5) return;
    d.started = true;
    dragging.value = true;
    document.body.classList.add('noselect');
    if (d.kind === 'move' && d.cardEl) {
      d.ghost = makeGhost(d.cardEl);
      d.cardEl.classList.add('drag-src');
    } else if (d.kind === 'lib') {
      d.ghost = makeLibGhost(d.s);
      d.srcEl?.classList.add('drag-src');
    } else {
      d.cardEl?.classList.add('resizing');
      document.body.classList.add('resizing');
    }
  }
  if (d.kind === 'move' || d.kind === 'lib') {
    const gx = e.clientX - d.off.x; // 幽灵顶部边 = 判定基准（口径 §4.2）
    const gy = e.clientY - d.off.y;
    if (d.ghost) {
      d.ghost.style.left = `${gx}px`;
      d.ghost.style.top = `${gy}px`;
    }
    d.target = hitTest(gx, gy, d.s.durationMin);
    dragHint.value = d.target
      ? { colIdx: d.target.colIdx, startMin: d.target.m, durMin: d.s.durationMin, color: TYPE_MAP[d.s.type].color }
      : null;
  } else if (d.kind === 'resize-b') {
    const st = d.orig.st;
    const en = Math.max(st + 30, Math.min(1440, snapY(e.clientY - (d.dayRect?.top ?? 0)))); // 最小 30 / 日末截断
    d.newSt = st;
    d.newDur = en - st;
    applyLiveResize(d);
  } else if (d.kind === 'resize-t') {
    const end = d.orig.st + d.orig.dur; // 上边缘：结束时刻不变（口径 §4.4）
    const st = Math.max(0, Math.min(end - 30, snapY(e.clientY - (d.dayRect?.top ?? 0))));
    d.newSt = st;
    d.newDur = end - st;
    applyLiveResize(d);
  }
}

function applyLiveResize(d: DragCtx): void {
  const el = d.cardEl;
  if (!el || d.newSt == null || d.newDur == null) return;
  el.style.top = `${yOfMin(d.newSt) + 1}px`;
  el.style.height = `${yOfMin(d.newDur) - 3}px`;
  const tEl = el.querySelector('.c-time');
  if (tEl) tEl.textContent = `${minToHH(d.newSt)} - ${minToHH(d.newSt + d.newDur)}`;
}

function onUp(e: PointerEvent): void {
  if (!ctx || e.pointerId !== ctx.pointerId) return;
  const d = ctx;
  cleanup();
  suppressClick.value = true; // 指针路径已处理，吞掉随后的原生 click（键盘/辅助技术不受影响）
  setTimeout(() => (suppressClick.value = false), 0);
  const store = usePlannerStore();
  const s = d.s;

  if (d.kind === 'lib-click' || !d.started) {
    openDetailHook?.(s.id); // 未构成拖拽 → 视为点击，打开详情
    return;
  }
  renderTick.value++;

  if (d.kind === 'move' || d.kind === 'lib') {
    if (d.target) {
      const date = isoOf(addDays(new Date(store.weekStartIso), d.target.colIdx));
      store.placeSchedule(s.id, date, d.target.m, d.kind === 'lib' ? 'place' : 'move');
      toast(`${d.kind === 'lib' ? '已放置到' : '已移动到'} ${fmtShort(date)} ${minToHH(d.target.m)}`);
    }
    return; // 表外松手 → 放弃操作（口径 §4.6）
  }
  if (d.kind === 'resize-b' || d.kind === 'resize-t') {
    if (d.newSt != null && d.newDur != null) {
      store.resizeSchedule(s.id, d.newSt, d.newDur);
      toast(`已调整为 ${minToHH(d.newSt)} - ${minToHH(d.newSt + d.newDur)}`);
    }
  }
}

function onCancel(e: PointerEvent): void {
  if (!ctx || e.pointerId !== ctx.pointerId) return;
  cleanup(); // 系统中断拖拽 → 安全放弃
  renderTick.value++;
}
