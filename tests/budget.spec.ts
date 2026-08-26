import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import BudgetPage from '@/views/BudgetPage.vue';
import { usePlannerStore } from '@/stores/planner';
import { buildBudgetCsv } from '@/utils/transfer';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
});

async function boot() {
  const store = usePlannerStore();
  await store.init();
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/plan/:planId', component: { template: '<div />' } },
      { path: '/plan/:planId/budget', component: BudgetPage },
    ],
  });
  await router.push(`/plan/${store.currentPlanId}/budget`);
  const wrapper = mount(BudgetPage, { global: { plugins: [router] } });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, store };
}

type Filters = { type: string; expense: string; from: string; to: string; location: string };
async function setFilter(wrapper: VueWrapper, patch: Partial<Filters>): Promise<void> {
  Object.assign((wrapper.vm as unknown as { f: Filters }).f, patch);
  await flushPromises();
}

const rowsOf = (w: VueWrapper, secIdx: number) => w.findAll('.budget-sec')[secIdx]!.findAll('tbody tr');
const headerOf = (w: VueWrapper, secIdx: number) => w.findAll('.budget-sec')[secIdx]!.find('.budget-sec-h')!.text();

describe('BudgetPage 费用预算页面（口径 §15，行程维度）', () => {
  it('两表：已确认 8 项 / 全部 9 项，区间与已付合计正确', async () => {
    const { wrapper } = await boot();
    expect(wrapper.findAll('.budget-sec')).toHaveLength(2);
    expect(rowsOf(wrapper, 0)).toHaveLength(8);
    expect(rowsOf(wrapper, 1)).toHaveLength(9);
    expect(headerOf(wrapper, 0)).toContain('¥7,206~8,295');
    expect(headerOf(wrapper, 0)).toContain('已付 ¥0');
    expect(headerOf(wrapper, 1)).toContain('¥7,206~8,795'); // 全部表含北部交通 [0,500]
  });

  it('筛选：类型=交通 5/6 项；费用类型=可选 → 全部 2 项；日期区间 / 地点', async () => {
    const { wrapper } = await boot();
    await setFilter(wrapper, { type: 'transport' });
    expect(rowsOf(wrapper, 0)).toHaveLength(5);
    expect(rowsOf(wrapper, 1)).toHaveLength(6);
    await setFilter(wrapper, { type: '' });
    await setFilter(wrapper, { expense: 'optional' });
    expect(rowsOf(wrapper, 1)).toHaveLength(2); // 浮潜 + 北部交通
    await setFilter(wrapper, { expense: '' });
    await setFilter(wrapper, { from: '2026-10-01', to: '2026-10-03' });
    expect(rowsOf(wrapper, 1)).toHaveLength(2); // 吃饭 + 浮潜
    await setFilter(wrapper, { from: '', to: '' });
    await setFilter(wrapper, { location: '宫古' });
    expect(rowsOf(wrapper, 1)).toHaveLength(1); // 仅"宫古岛"（机票地点=那霸机场）
    await setFilter(wrapper, { location: '' });
  });

  it('上浮/下浮列独立展示（吃饭 +300 / 宫古机票 -220）', async () => {
    const { wrapper } = await boot();
    const allText = wrapper.findAll('.budget-sec')[1]!.text();
    expect(allText).toContain('+300');
    expect(allText).toContain('-220');
    expect(allText).toContain('¥528~748');
  });

  it('已付金额行内编辑（仅预算表）', async () => {
    const { wrapper, store } = await boot();
    const firstRow = rowsOf(wrapper, 0)[0]!;
    const input = firstRow.find('input[type="number"]');
    const title = firstRow.find('td')!.text();
    await input.setValue('500');
    await input.trigger('change');
    await flushPromises();
    expect(store.schedules.find((x) => x.title === title)!.paidAmount).toBe(500);
    expect(headerOf(wrapper, 0)).toContain('已付 ¥500');
  });

  it('与行程同步：取消勾选后从"已确认"表移除', async () => {
    const { wrapper, store } = await boot();
    store.setConfirmed(store.schedules.find((x) => x.title.includes('吃饭'))!.id, false);
    await flushPromises();
    expect(rowsOf(wrapper, 0)).toHaveLength(7);
    expect(rowsOf(wrapper, 1)).toHaveLength(9);
  });

  it('行程维度隔离：切换到空行程 → 预算表清空；切回恢复（一个行程一张预算表）', async () => {
    const { wrapper, store } = await boot();
    expect(rowsOf(wrapper, 1)).toHaveLength(9);
    store.createPlan('空行程测试');
    await flushPromises();
    expect(rowsOf(wrapper, 0)).toHaveLength(0);
    expect(rowsOf(wrapper, 1)).toHaveLength(0);
    expect(headerOf(wrapper, 1)).toContain('¥0');
    store.switchPlan(store.plans.find((p) => p.name === '冲绳 7 日行')!.id);
    await flushPromises();
    expect(rowsOf(wrapper, 1)).toHaveLength(9);
  });
});

describe('预算表 CSV 导出（buildBudgetCsv）', () => {
  it('含标题行/表头/数据行，上浮下浮与区间正确', async () => {
    const store = usePlannerStore();
    await store.init();
    const csv = buildBudgetCsv('冲绳 7 日行', store.activeSchedules);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('预算表: 冲绳 7 日行');
    expect(lines[2]).toContain('上浮');
    expect(lines[2]).toContain('已付金额');
    const dataLines = lines.slice(3);
    expect(dataLines).toHaveLength(9);
    const gonggu = dataLines.find((l) => l.includes('宫古往返机票'))!;
    expect(gonggu).toContain('220'); // 下浮
    expect(gonggu).toContain('528');
    expect(gonggu).toContain('748');
    const eat = dataLines.find((l) => l.includes('吃饭'))!;
    expect(eat).toContain('300'); // 上浮
    expect(eat).toContain('1200');
  });
});
