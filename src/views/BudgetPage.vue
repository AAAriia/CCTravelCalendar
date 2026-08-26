<template>
  <div class="budget-page">
    <header class="bp-head">
      <button class="btn" @click="goBack">← 返回行程板</button>
      <div class="bp-title">费用预算表<b v-if="store.currentPlan"> · {{ store.currentPlan.name }}</b></div>
      <div class="spacer"></div>
      <button class="btn primary" :disabled="!filtered.length" @click="exportCsv">导出 CSV（当前筛选）</button>
    </header>

    <div class="bp-body">
      <!-- 筛选器（两张表共用，口径 §15） -->
      <div class="budget-filters">
        <select v-model="f.type">
          <option value="">全部类型</option>
          <option v-for="t in TYPES" :key="t.k" :value="t.k">{{ t.name }}</option>
        </select>
        <select v-model="f.expense">
          <option value="">全部费用类型</option>
          <option value="required">必须</option>
          <option value="optional">可选</option>
        </select>
        <div class="date-range">
          <input v-model="f.from" type="date" title="日期从" />
          <span>~</span>
          <input v-model="f.to" type="date" title="日期至" />
        </div>
        <input v-model.trim="f.location" type="text" placeholder="地点筛选" class="loc-input" />
        <button type="button" class="btn sm" @click="clearFilters">清除筛选</button>
      </div>

      <!-- 两个表：已确认 / 全部 -->
      <section v-for="sec in sections" :key="sec.key" class="budget-sec">
        <div class="budget-sec-h">
          <b>{{ sec.title }}</b>
          <span class="cnt">{{ sec.items.length }} 项</span>
          <span class="total">
            预估 <b>{{ sec.min === sec.max ? `¥${money(sec.min)}` : `¥${money(sec.min)}~${money(sec.max)}` }}</b>
            · 已付 <b>¥{{ money(sec.paid) }}</b>
          </span>
        </div>
        <div v-if="sec.items.length" class="budget-table-wrap">
          <table class="budget-table">
            <thead>
              <tr>
                <th class="ta-l">事项</th>
                <th>类型</th>
                <th>费用类型</th>
                <th>日期</th>
                <th>时间</th>
                <th class="ta-l">地点</th>
                <th class="ta-r">预估</th>
                <th class="ta-r">下浮</th>
                <th class="ta-r">上浮</th>
                <th class="ta-r">区间</th>
                <th class="ta-r">已付</th>
                <th>状态</th>
                <th class="ta-c">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sec.items" :key="s.id">
                <td class="ta-l" :title="s.title">{{ s.title }}</td>
                <td><span class="dot" :style="{ '--c': TYPE_MAP[s.type].color }"></span>{{ TYPE_MAP[s.type].name }}</td>
                <td :class="{ opt: s.expenseType === 'optional' }">{{ s.expenseType === 'optional' ? '可选' : '必须' }}</td>
                <td>{{ fmtShort(s.date) || '—' }}</td>
                <td>{{ s.startTime ? `${s.startTime}-${endHH(s)}` : '—' }}</td>
                <td class="ta-l">{{ s.location || '—' }}</td>
                <td class="ta-r">{{ s.price == null ? '—' : `¥${money(s.price)}` }}</td>
                <td class="ta-r">{{ s.varianceDown == null ? '—' : `-${money2(s.varianceDown)}` }}</td>
                <td class="ta-r">{{ s.varianceUp == null ? '—' : `+${money2(s.varianceUp)}` }}</td>
                <td class="ta-r">{{ fmtPriceRange(s.price, s.varianceUp, s.varianceDown) || '—' }}</td>
                <td class="ta-r paid-cell">
                  <input
                    type="number" min="0" step="0.01" placeholder="—"
                    :value="s.paidAmount ?? ''"
                    @change="onPaid(s, $event)"
                    title="已付金额（仅预算表）"
                  />
                </td>
                <td>
                  <span class="tag" :class="s.confirmed ? 'ok' : 'no'">{{ s.confirmed ? '已确认' : s.date ? '待确认' : '未放置' }}</span>
                </td>
                <td class="ta-c"><button class="btn sm" title="查看/编辑详情" @click="openDetail(s.id)">详情</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="budget-empty">（无符合筛选条件的日程）</div>
      </section>

      <div class="budget-hint">
        预算表为当前行程维度，与行程表数据实时同步；区间口径 = [金额 − 下浮, 金额 + 上浮]，下限不低于 0；
        已付金额仅在本页查看与编辑。
      </div>

      <DetailModal
        :visible="detail.visible"
        :schedule="detail.target"
        @close="detail.visible = false"
        @save="onFormSave"
        @delete="askDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import type { Schedule } from '@/types';
import { TYPE_MAP, TYPES } from '@/constants';
import { usePlannerStore } from '@/stores/planner';
import { hhToMin, minToHH } from '@/utils/datetime';
import { fmtShort } from '@/utils/format';
import { fmtPriceRange, priceRange } from '@/utils/price';
import { buildBudgetCsv, downloadFile } from '@/utils/transfer';
import DetailModal from '@/components/DetailModal.vue';
import { toast } from '@/composables/useToast';

const store = usePlannerStore();
const router = useRouter();

/* ---------------- 详情弹窗（页内） ---------------- */
const detail = reactive<{ visible: boolean; target: Schedule | null }>({ visible: false, target: null });
function openDetail(id: string): void {
  const s = store.schedules.find((x) => x.id === id);
  if (!s) return;
  detail.target = s;
  detail.visible = true;
}
function onFormSave(patch: import('@/types/form').FormPatch): void {
  if (!detail.target) return;
  const [, warn] = store.updateSchedule(detail.target.id, patch);
  if (warn === 'date-time-mismatch') toast('日期与时间需同时填写，已按"未放置"保存');
  else toast('已保存');
  detail.visible = false;
}
function askDelete(): void {
  if (!detail.target) return;
  const t = detail.target;
  detail.visible = false;
  store.deleteSchedule(t.id);
  toast('已移入回收站');
}

/* ---------------- 筛选（口径 §15） ---------------- */
const f = reactive({ type: '', expense: '', from: '', to: '', location: '' });
defineExpose({ f });

function clearFilters(): void {
  Object.assign(f, { type: '', expense: '', from: '', to: '', location: '' });
}

const filtered = computed<Schedule[]>(() =>
  store.activeSchedules.filter((s) => {
    if (f.type && s.type !== f.type) return false;
    if (f.expense && s.expenseType !== f.expense) return false;
    if (f.from && (!s.date || s.date < f.from)) return false;
    if (f.to && (!s.date || s.date > f.to)) return false;
    if (f.location && !s.location.toLowerCase().includes(f.location.toLowerCase())) return false;
    return true;
  }),
);

interface Section {
  key: string;
  title: string;
  items: Schedule[];
  min: number;
  max: number;
  paid: number;
}

function summarize(items: Schedule[]): { min: number; max: number; paid: number } {
  let min = 0;
  let max = 0;
  let paid = 0;
  for (const s of items) {
    const r = priceRange(s.price, s.varianceUp, s.varianceDown);
    min += r.min;
    max += r.max;
    paid += s.paidAmount ?? 0;
  }
  return { min, max, paid };
}

const sections = computed<Section[]>(() => {
  const confirmed = filtered.value.filter((s) => s.confirmed);
  return [
    { key: 'confirmed', title: '已确认行程', items: confirmed, ...summarize(confirmed) },
    { key: 'all', title: '全部日程', items: filtered.value, ...summarize(filtered.value) },
  ];
});

/* ---------------- 已付金额（仅预算表编辑） ---------------- */
function onPaid(s: Schedule, e: Event): void {
  const raw = (e.target as HTMLInputElement).value;
  const v = raw === '' ? null : Number(raw);
  store.setPaidAmount(s.id, v);
  if (v != null && !Number.isNaN(v)) toast(`已记录「${s.title.slice(0, 10)}」已付 ¥${v}`);
}

/* ---------------- 导出（当前筛选） ---------------- */
function exportCsv(): void {
  const name = store.currentPlan?.name ?? '行程';
  downloadFile(`预算表-${name}-${new Date().toISOString().slice(0, 10)}.csv`, buildBudgetCsv(name, filtered.value), 'text/csv');
  toast(`已导出 ${filtered.value.length} 条（CSV）`);
}

function goBack(): void {
  void router.push({ name: 'plan', params: { planId: store.currentPlanId! } });
}

/* ---------------- 展示 ---------------- */
const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const endHH = (s: Schedule) => minToHH(hhToMin(s.startTime!) + s.durationMin);
</script>

<style scoped>
.budget-page {
  height: 100vh; height: 100dvh; display: flex; flex-direction: column;
  background: var(--bg);
}
.bp-head {
  flex: none; height: 52px; background: var(--panel); border-bottom: 1px solid var(--line);
  display: flex; align-items: center; gap: 14px; padding: 0 16px;
}
.bp-title { font-size: 16px; font-weight: 600; }
.bp-title b { color: var(--brand); }
.bp-body { flex: 1; overflow-y: auto; padding: 14px 16px 24px; max-width: 1280px; width: 100%; margin: 0 auto; }

.budget-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px; }
.budget-filters select,
.budget-filters .loc-input {
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font-size: 12px;
  font-family: inherit; background: #fff; color: var(--t1);
}
.budget-filters .loc-input { width: 110px; }
.date-range { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--t4); }
.date-range input { border: 1px solid var(--line); border-radius: 8px; padding: 5px 6px; font-size: 12px; font-family: inherit; }

.budget-sec { margin-bottom: 18px; }
.budget-sec-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; font-size: 13px; }
.budget-sec-h .cnt { color: var(--t4); font-size: 12px; }
.budget-sec-h .total { margin-left: auto; color: var(--t3); font-size: 12px; }
.budget-sec-h .total b { color: var(--t1); }

.budget-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.budget-table { border-collapse: collapse; width: 100%; font-size: 12px; white-space: nowrap; }
.budget-table th {
  background: #f9fafb; color: var(--t3); font-weight: 600; padding: 7px 8px; text-align: center;
  border-bottom: 1px solid var(--line);
}
.budget-table td { padding: 6px 8px; border-bottom: 1px solid var(--line-soft); color: var(--t2); }
.budget-table tr:last-child td { border-bottom: none; }
.ta-l { text-align: left; }
.ta-r { text-align: right; }
.ta-c { text-align: center; }
.budget-table .dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--c);
  margin-right: 5px; vertical-align: 0;
}
td.opt { color: #b45309; }
.paid-cell input {
  width: 74px; border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px;
  font-size: 12px; text-align: right; font-family: inherit;
}
.paid-cell input:focus { outline: none; border-color: #93c5fd; }
.tag { font-size: 11px; border-radius: 4px; padding: 1px 6px; background: #f3f4f6; color: var(--t3); }
.tag.ok { background: #d1fae5; color: #047857; }
.tag.no { background: #fef3c7; color: #b45309; }
.budget-empty { font-size: 12px; color: var(--t4); padding: 10px 4px; }
.budget-hint { font-size: 11px; color: var(--t4); line-height: 1.6; margin-top: 8px; }

@media (max-width: 767px) {
  .bp-head { flex-wrap: wrap; height: auto; padding: 8px 12px; gap: 8px; }
  .bp-title { font-size: 14px; flex: 1; min-width: 0; }
  .bp-body { padding: 10px 10px 20px; }
}
</style>
