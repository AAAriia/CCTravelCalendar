import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BudgetModal from '@/components/BudgetModal.vue';
import { usePlannerStore } from '@/stores/planner';

const mounted: VueWrapper[] = [];
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount()); // 清理 Teleport 内容
});

type Filters = { type: string; expense: string; from: string; to: string; location: string };

async function boot() {
  const store = usePlannerStore();
  await store.init();
  const wrapper = mount(BudgetModal, { props: { visible: true } });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, store };
}

/** 直驱筛选状态（绕开 jsdom 的 date input v-model 差异） */
async function setFilter(wrapper: VueWrapper, patch: Partial<Filters>): Promise<void> {
  Object.assign((wrapper.vm as unknown as { f: Filters }).f, patch);
  await flushPromises();
}

// Teleport 到 body：统一从 document 查询
const rowsOf = (_w: unknown, secIdx: number) =>
  document.querySelectorAll('.budget-sec')[secIdx]!.querySelectorAll('tbody tr');
const headerOf = (_w: unknown, secIdx: number) =>
  document.querySelectorAll('.budget-sec .budget-sec-h')[secIdx]!.textContent ?? '';

describe('BudgetModal 费用预算表（口径 §15）', () => {
  it('两表：已确认 8 项 / 全部 9 项，区间与已付合计正确', async () => {
    const { wrapper } = await boot();
    const secs = document.querySelectorAll('.budget-sec');
    expect(secs).toHaveLength(2);
    expect(rowsOf(wrapper, 0)).toHaveLength(8); // 已确认
    expect(rowsOf(wrapper, 1)).toHaveLength(9); // 全部
    expect(headerOf(wrapper, 0)).toContain('已确认行程');
    expect(headerOf(wrapper, 0)).toContain('8 项');
    expect(headerOf(wrapper, 0)).toContain('¥7,206~8,295');
    expect(headerOf(wrapper, 0)).toContain('已付 ¥0');
  });

  it('筛选：类型=交通 → 已确认 5 项 / 全部 6 项；费用类型=可选 → 全部 2 项', async () => {
    const { wrapper } = await boot();
    const selects = [...document.querySelectorAll('.budget-filters select')] as HTMLSelectElement[];
    void selects;
    selects[0]!.value = 'transport';
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises(); // 类型筛选（select 走 DOM 事件）
    expect(rowsOf(wrapper, 0)).toHaveLength(5); // 已确认交通：高铁/大巴/机票/宫古机票/宫古交通
    expect(rowsOf(wrapper, 1)).toHaveLength(6); // 全部交通：含未放置的北部交通
  });

  it('筛选：日期区间 10/01-10/03 → 2 项；地点包含"宫古" → 1 项', async () => {
    const { wrapper } = await boot();
    await setFilter(wrapper, { from: '2026-10-01', to: '2026-10-03' });
    expect(rowsOf(wrapper, 1)).toHaveLength(2); // 吃饭(10/1) + 浮潜(10/2)
    await setFilter(wrapper, { from: '', to: '' });
    await setFilter(wrapper, { location: '宫古' });
    expect(rowsOf(wrapper, 1)).toHaveLength(1); // 地点含“宫古”的仅宫古岛交通（机票地点=那霸机场）
    await setFilter(wrapper, { location: '' });
  });

  it('筛选：费用类型=可选 → 全部 2 项（浮潜 + 北部交通）', async () => {
    const { wrapper } = await boot();
    await setFilter(wrapper, { expense: 'optional' });
    expect(rowsOf(wrapper, 1)).toHaveLength(2);
    await setFilter(wrapper, { expense: '' });
  });

  it('已付金额行内编辑（仅预算表）', async () => {
    const { wrapper, store } = await boot();
    const firstRow = rowsOf(wrapper, 0)[0]! as HTMLElement;
    const input = firstRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    const title = (firstRow.querySelector('td') as HTMLElement).textContent!;
    input.value = '500';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    const s = store.schedules.find((x) => x.title === title)!;
    expect(s.paidAmount).toBe(500);
    expect(headerOf(wrapper, 0)).toContain('已付 ¥500');
  });

  it('与行程同步：取消勾选后从"已确认"表移除', async () => {
    const { wrapper, store } = await boot();
    const food = store.schedules.find((x) => x.title.includes('吃饭'))!;
    store.setConfirmed(food.id, false);
    await flushPromises();
    expect(rowsOf(wrapper, 0)).toHaveLength(7);
    expect(rowsOf(wrapper, 1)).toHaveLength(9);
  });
});
