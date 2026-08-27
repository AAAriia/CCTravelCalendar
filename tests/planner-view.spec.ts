import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import PlannerView from '@/views/PlannerView.vue';
import WeekCalendar from '@/components/WeekCalendar.vue';
import { usePlannerStore } from '@/stores/planner';
import { useToast } from '@/composables/useToast';

/* ---------- 测试环境基线 ---------- */
// jsdom 无布局，getBoundingClientRect 全为 0；拖拽几何依赖视口坐标。
// 统一 mock：日历网格视口 (60,100) 宽 980 高 800（7 列 × 140px，44px/格）。
const GRID = { x: 60, y: 100, w: 980, h: 800 };
Element.prototype.getBoundingClientRect = function (): DOMRect {
  const base = {
    x: GRID.x, y: GRID.y, left: GRID.x, top: GRID.y,
    right: GRID.x + GRID.w, bottom: GRID.y + GRID.h,
    width: GRID.w, height: GRID.h, toJSON: () => ({}),
  };
  if ((this as Element).classList?.contains('card')) {
    // 卡片统一视作位于 (360,600)，供抓取偏移计算
    Object.assign(base, { x: 360, left: 360, y: 600, top: 600 });
  }
  return base as DOMRect;
};

/** 在 window 上派发带自定义坐标的指针事件（Event 构造器不透传自定义属性，需 assign） */
function firePointer(type: 'pointermove' | 'pointerup', x: number, y: number): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, {
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
  });
  window.dispatchEvent(ev);
}

/** 元素级指针事件 props（vue-test-utils trigger 会合并进事件对象） */
const elPointer = (type: 'pointerdown' | 'pointerup', x: number, y: number) => ({
  button: 0,
  buttons: type === 'pointerup' ? 0 : 1,
  pointerId: 1,
  pointerType: 'mouse',
  clientX: x,
  clientY: y,
});

/** Teleport 到 body 的弹窗内容：从 document 查询并原生点击 */
const bodyText = (): string => document.body.textContent ?? '';
function clickBodyButton(text: string, cls?: string): boolean {
  const btn = [...document.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === text && (!cls || b.classList.contains(cls)),
  );
  if (!btn) return false;
  btn.click();
  return true;
}

const mounted: VueWrapper[] = [];
async function mountApp() {
  const store = usePlannerStore();
  await store.init();
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/plan/:planId', component: PlannerView },
    ],
  });
  await router.push(`/plan/${store.currentPlanId}`);
  const wrapper = mount(PlannerView, { global: { plugins: [router] } });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, store };
}

const findByTitle = (store: ReturnType<typeof usePlannerStore>, t: string) =>
  store.schedules.find((s) => s.title.includes(t))!;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount()); // 清理 Teleport 到 body 的弹窗
});

describe('PlannerView 集成交互（jsdom 指针事件模拟）', () => {
  it('挂载：周表头 7 天 + 9 张卡片 + 日程库六类分组 + 统计', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.findAll('.h-day')).toHaveLength(7);
    expect(wrapper.findAll('.day-col')).toHaveLength(7);
    expect(wrapper.findAll('.card')).toHaveLength(8);
    expect(wrapper.findAll('.grp')).toHaveLength(6);
    expect(wrapper.text()).toContain('本周已安排 8 项');
    expect(wrapper.text()).toContain('2026年9月28日 - 10月4日'); // 首开定位行程周
  });

  it('点击卡片（完整指针序列）→ 打开详情，含仅详情字段', async () => {
    const { wrapper } = await mountApp();
    const card = wrapper.findAll('.card')[0]; // 高铁
    await card.trigger('pointerdown', elPointer('pointerdown', 400, 620));
    firePointer('pointerup', 400, 620);
    await flushPromises();
    const modal = wrapper.findComponent({ name: 'DetailModal' });
    expect(modal.props('visible')).toBe(true);
    expect(modal.props('schedule')!.title).toContain('高铁');
    expect(bodyText()).toContain('预计日期'); // 仅详情字段
    expect(bodyText()).toContain('备注');
    expect(bodyText()).toContain('查看 / 编辑日程');
  });

  it('点 × 取消（E6）→ 确认 → 回库 + 预计日期回写', async () => {
    const { wrapper, store } = await mountApp();
    const food = findByTitle(store, '吃饭'); // D1 周二 18:30
    const card = wrapper.findAll('.card').find((c) => c.text()!.includes('吃饭'))!;
    await card.find('.card-x').trigger('click');
    await flushPromises();
    expect(bodyText()).toContain('取消该日程？');
    expect(bodyText()).toContain('预计日期将更新为');
    expect(clickBodyButton('确认取消')).toBe(true);
    await flushPromises();
    expect(food.date).toBeNull();
    expect(food.startTime).toBeNull();
    expect(food.expectedDate).toBe(store.weekIsoList[3]); // 回写为上次实际日期（2026-10-01 周四）
    const item = wrapper.findAll('.lib-item').find((c) => c.text()!.includes('吃饭'))!;
    expect(item.classes()).not.toContain('placed');
  });

  it('拖拽卡片（pointermove 超阈值）→ 按落点移动（周一 00:55，5 分钟吸附）', async () => {
    const { wrapper, store } = await mountApp();
    const food = findByTitle(store, '吃饭'); // D1 周二 18:30
    const card = wrapper.findAll('.card').find((c) => c.text()!.includes('吃饭'))!;
    // 卡片 rect mock (360,600)；抓取点 (400,620) → 偏移 (40,20)
    await card.trigger('pointerdown', elPointer('pointerdown', 400, 620));
    firePointer('pointermove', 100, 160); // 越过 5px 阈值，启动拖拽
    firePointer('pointermove', 130, 200); // 幽灵顶 (90,180)：列0 / snapY(80px)=60min
    firePointer('pointerup', 130, 200);
    await flushPromises();
    expect(food.date).toBe(store.weekIsoList[0]); // 移到周一
    expect(food.startTime).toBe('00:55'); // 5 分钟吸附：54.5min → 55
    expect(useToast().msg.value).toContain('已移动到');
  });

  it('日程库切换三种分组', async () => {
    const { wrapper, store } = await mountApp();
    const tabs = wrapper.findAll('.lib-tabs button');
    await tabs[1].trigger('click'); // 按地点
    expect(store.groupBy).toBe('location');
    expect(wrapper.text()).toContain('未填写地点');
    await tabs[2].trigger('click'); // 按预计日期
    expect(store.groupBy).toBe('expectedDate');
    expect(wrapper.text()).toContain('未设定');
    await tabs[0].trigger('click');
    expect(store.groupBy).toBe('type');
  });

  it('新建日程（表单提交 E1）→ 进入库未放置', async () => {
    const { wrapper, store } = await mountApp();
    const before = store.schedules.length;
    const newBtn = wrapper.findAll('button').find((b) => b.text()!.includes('新建'))!;
    await newBtn.trigger('click');
    await flushPromises();
    expect(bodyText()).toContain('新建日程');
    const titleInput = [...document.querySelectorAll('input[type="text"]')].find((i) =>
      (i as HTMLInputElement).placeholder.includes('西湖游船'),
    ) as HTMLInputElement;
    titleInput.value = '测试新日程';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(clickBodyButton('保存')).toBe(true);
    await flushPromises();
    expect(store.schedules).toHaveLength(before + 1);
    const created = store.schedules[store.schedules.length - 1]!;
    expect(created.title).toBe('测试新日程');
    expect(created.date).toBeNull();
  });

  it('回收站：详情删除 → 统计减一 → 恢复回原位', async () => {
    const { wrapper, store } = await mountApp();
    const food = findByTitle(store, '吃饭');
    const card = wrapper.findAll('.card').find((c) => c.text()!.includes('吃饭'))!;
    await card.trigger('pointerdown', elPointer('pointerdown', 400, 620));
    firePointer('pointerup', 400, 620);
    await flushPromises();
    expect(bodyText()).toContain('查看 / 编辑日程');
    expect(clickBodyButton('删除', 'ghost-danger')).toBe(true);
    await flushPromises();
    expect(bodyText()).toContain('删除该日程？');
    expect(clickBodyButton('删除', 'danger')).toBe(true);
    await flushPromises();
    expect(food.deletedAt).not.toBeNull();
    expect(store.weekStats.count).toBe(7);
    // 打开回收站 → 恢复
    const trashBtn = wrapper.findAll('button').find((b) => b.text() === '回收站')!;
    await trashBtn.trigger('click');
    await flushPromises();
    expect(bodyText()).toContain('回收站');
    expect(clickBodyButton('恢复')).toBe(true);
    await flushPromises();
    expect(food.deletedAt).toBeNull();
    expect(store.weekStats.count).toBe(8);
  });
});

describe('移动端单日视图（mobileSel 驱动，回归：日期与卡片对齐）', () => {
  it('mobileSel=2 只渲染周三列，卡片为周三日程', async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const store = usePlannerStore();
    await store.init();
    const wrapper = mount(WeekCalendar, { props: { mobileSel: 2 } });
    await flushPromises();
    expect(wrapper.findAll('.day-col')).toHaveLength(1);
    const titles = wrapper.findAll('.card').map((c) => c.text() ?? '');
    // 种子固定日期：周三 = 9/30 出发日
    expect(titles.some((t) => t.includes('高铁'))).toBe(true);
    expect(titles.some((t) => t.includes('往返机票'))).toBe(true);
    expect(titles.some((t) => t.includes('酒店'))).toBe(true);
    expect(titles.some((t) => t.includes('吃饭'))).toBe(false); // 10/1 周四
    expect(titles.some((t) => t.includes('浮潜'))).toBe(false); // 10/2 周五
    expect(titles.some((t) => t.includes('宫古'))).toBe(false); // 10/4 周日
    // 表头仅显示选中日（其余由 CSS 隐藏，DOM 仍渲染 7 个）
    expect(wrapper.findAll('.h-day')).toHaveLength(7);
    wrapper.unmount();
  });
});

describe('v1.4 修复回归：库内复制交互与卡片展示', () => {
  it('点击 ⧉ 复制：不打开源日程详情，直接打开新副本详情', async () => {
    const { wrapper, store } = await mountApp();
    const before = store.schedules.length;
    const item = wrapper.findAll('.lib-item').find((c) => c.text()!.includes('浮潜'))!;
    const copyBtn = item.find('.lib-copy');
    expect(copyBtn.exists()).toBe(true);
    // 1) pointerdown 在复制按钮上不进入拖拽/点击路径（此前会误开源日程详情）
    await copyBtn.trigger('pointerdown', elPointer('pointerdown', 1200, 300));
    firePointer('pointerup', 1200, 300);
    await flushPromises();
    const modal = wrapper.findComponent({ name: 'DetailModal' });
    expect(modal.props('visible')).toBe(false); // 源详情未被打开
    // 2) click → 复制 + 打开新副本详情
    await copyBtn.trigger('click');
    await flushPromises();
    expect(store.schedules).toHaveLength(before + 1);
    expect(modal.props('visible')).toBe(true);
    expect(modal.props('schedule')!.title).toContain('浮潜 副本');
    expect(modal.props('schedule')!.price).toBe(600); // 字段保留
    expect(modal.props('schedule')!.date).toBeNull(); // 进库未放置
  });

  it('60 分钟日程的卡片也显示价格（独立一行）', async () => {
    const { wrapper } = await mountApp();
    const card = wrapper.findAll('.card').find((c) => c.text()!.includes('吃饭'))!; // 60 分钟
    expect(card.text()).toContain('¥1,200~1,500');
    expect(card.find('.c-price').exists()).toBe(true);
  });

  it('弹窗改时间后卡片即时刷新（派生值响应式）', async () => {
    const { wrapper, store } = await mountApp();
    const card = wrapper.findAll('.card').find((c) => c.text()!.includes('吃饭'))!;
    expect(card.text()).toContain('18:30');
    const s = store.schedules.find((x) => x.title.includes('吃饭'))!;
    store.updateSchedule(s.id, {
      title: s.title, type: s.type, date: s.date, startTime: '20:00', durationMin: 90,
    });
    await flushPromises();
    const card2 = wrapper.findAll('.card').find((c) => c.text()!.includes('吃饭'))!;
    expect(card2.text()).toContain('20:00');
    expect(card2.text()).toContain('20:00 - 21:30');
  });
});

describe('库内排序 UI（口径 §6.1a）', () => {
  it('条目含拖拽手柄 ⠿', async () => {
    const { wrapper } = await mountApp();
    const grips = wrapper.findAll('.lib-grip');
    expect(grips.length).toBe(9);
    // 手柄 pointerdown 不进入拖拽系统（stop 修饰符阻断条目根的 pointerdown）
    const firstGrip = grips[0]!;
    const before = usePlannerStore().schedules.length;
    await firstGrip.trigger('pointerdown', elPointer('pointerdown', 1200, 300));
    firePointer('pointerup', 1200, 300);
    await flushPromises();
    expect(usePlannerStore().schedules.length).toBe(before); // 无放置/弹窗副作用
  });
});
