<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal budget-modal">
        <div class="modal-h">
          <div class="t">费用预算表 · {{ store.currentPlan?.name }}</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <!-- 筛选器（两张表共用） -->
          <div class="budget-filters">
            <select v-model="fType">
              <option value="">全部类型</option>
              <option v-for="t in TYPES" :key="t.k" :value="t.k">{{ t.name }}</option>
            </select>
            <select v-model="fExpense">
              <option value="">全部费用类型</option>
              <option value="required">必须</option>
              <option value="optional">可选</option>
            </select>
            <div class="date-range">
              <input v-model="fFrom" type="date" title="日期从" />
              <span>~</span>
              <input v-model="fTo" type="date" title="日期至" />
            </div>
            <input v-model.trim="fLocation" type="text" placeholder="地点筛选" class="loc-input" />
            <button type="button" class="btn sm" @click="clearFilters">清除筛选</button>
          </div>

          <!-- 两个表：已确认 / 全部 -->
          <section v-for="sec in sections" :key="sec.key" class="budget-sec">
            <div class="budget-sec-h">
              <b>{{ sec.title }}</b>
              <span class="cnt">{{ sec.items.length }} 项</span>
              <span class="total">
                预估 <b>{{ money(sec.min) === money(sec.max) ? `¥${money(sec.min)}` : `¥${money(sec.min)}~${money(sec.max)}` }}</b>
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
                    <th class="ta-r">波动</th>
                    <th class="ta-r">区间</th>
                    <th class="ta-r">已付</th>
                    <th>状态</th>
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
                    <td class="ta-r">{{ s.priceVariance == null ? '—' : (s.priceVariance > 0 ? `+${money2(s.priceVariance)}` : money2(s.priceVariance)) }}</td>
                    <td class="ta-r">{{ fmtPriceRange(s.price, s.priceVariance) || '—' }}</td>
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
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="budget-empty">（无符合筛选条件的日程）</div>
          </section>
          <div class="budget-hint">提示：已付金额仅在此表查看与编辑；预估区间口径 = 金额 ± 波动（负数仅下浮）。点击行程表中的日程同样可以打开详情。</div>
        </div>
        <div class="modal-f">
          <button type="button" class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { Schedule } from '@/types';
import { TYPE_MAP, TYPES } from '@/constants';
import { usePlannerStore } from '@/stores/planner';
import { hhToMin, minToHH } from '@/utils/datetime';
import { fmtShort } from '@/utils/format';
import { fmtPriceRange, priceRange } from '@/utils/price';
import { toast } from '@/composables/useToast';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = usePlannerStore();

/* ---------------- 筛选（口径 §15） ---------------- */
const f = reactive({ type: '', expense: '', from: '', to: '', location: '' });
const fType = computed({
  get: () => f.type,
  set: (v: string) => (f.type = v),
});
const fExpense = computed({
  get: () => f.expense,
  set: (v: string) => (f.expense = v),
});
const fFrom = computed({ get: () => f.from, set: (v: string) => (f.from = v) });
const fTo = computed({ get: () => f.to, set: (v: string) => (f.to = v) });
const fLocation = computed({ get: () => f.location, set: (v: string) => (f.location = v) });

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
    const r = priceRange(s.price, s.priceVariance);
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

/* ---------------- 展示 ---------------- */
defineExpose({ f });

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const endHH = (s: Schedule) => minToHH(hhToMin(s.startTime!) + s.durationMin);
</script>

<style scoped>
.budget-filters {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px;
}
.budget-filters select, .budget-filters .loc-input {
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

.budget-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; }
.budget-table { border-collapse: collapse; width: 100%; font-size: 12px; white-space: nowrap; }
.budget-table th {
  background: #f9fafb; color: var(--t3); font-weight: 600; padding: 7px 8px; text-align: center;
  border-bottom: 1px solid var(--line); position: sticky; top: 0;
}
.budget-table td { padding: 6px 8px; border-bottom: 1px solid var(--line-soft); color: var(--t2); }
.budget-table tr:last-child td { border-bottom: none; }
.ta-l { text-align: left; }
.ta-r { text-align: right; }
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
.budget-hint { font-size: 11px; color: var(--t4); line-height: 1.6; margin-top: 4px; }

@media (max-width: 767px) {
  .budget-modal { max-height: 92dvh; }
}
</style>
