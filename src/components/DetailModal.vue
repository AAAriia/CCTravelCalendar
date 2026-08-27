<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <form class="modal" novalidate @submit.prevent="save">
        <div class="modal-h">
          <div class="t">{{ creating ? '新建日程' : '查看 / 编辑日程' }}</div>
          <button type="button" class="modal-x" title="关闭" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <div class="f-row" :class="{ error: !!errTitle }">
            <label>事项名称<span class="req">*</span></label>
            <input v-model.trim="form.title" type="text" maxlength="30" placeholder="如：西湖游船" />
            <div class="f-err">{{ errTitle }}</div>
          </div>
          <div class="f-row">
            <label>类型<span class="req">*</span></label>
            <div class="chips">
              <button
                v-for="t in TYPES" :key="t.k" type="button" class="chip"
                :class="{ active: form.type === t.k }" :style="{ '--c': t.color }"
                @click="form.type = t.k"
              >
                <span class="cd"></span>{{ t.name }}
              </button>
            </div>
          </div>
          <div class="f-2col">
            <div class="f-row">
              <label>费用类型</label>
              <div class="chips">
                <button type="button" class="chip" :class="{ active: form.expenseType === 'required' }" @click="form.expenseType = 'required'">必须</button>
                <button type="button" class="chip" :class="{ active: form.expenseType === 'optional' }" @click="form.expenseType = 'optional'">可选</button>
              </div>
            </div>
            <div class="f-row">
              <label>确认状态<span class="hint-inline">勾选 = 敲定的行程</span></label>
              <div class="chips">
                <button type="button" class="chip ok-chip" :class="{ active: form.confirmed }" @click="toggleConfirmed">
                  {{ form.confirmed ? '✓ 已确认' : '未确认（点击勾选）' }}
                </button>
              </div>
            </div>
          </div>
          <div class="f-row">
            <label>地点</label>
            <input v-model.trim="form.location" type="text" maxlength="30" placeholder="如：湖滨码头" />
          </div>
          <!-- 行分组（口径 §7.2）：日期+预计日期 / 开始时间+时长 / 价格+上浮+下浮 -->
          <div class="f-2col">
            <div class="f-row">
              <label>日期<span class="hint-inline">清空 = 移回日程库</span></label>
              <input v-model="form.date" type="date" />
            </div>
            <div class="f-row">
              <label>预计日期<span class="hint-inline">仅详情显示</span></label>
              <input v-model="form.expectedDate" type="date" />
            </div>
          </div>
          <div class="f-2col">
            <div class="f-row">
              <label>开始时间<span class="hint-inline">5 分钟间隔</span></label>
              <select v-model="form.startTime">
                <option value="">— 不排期 —</option>
                <option v-for="t in TIME_OPTIONS" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="f-row">
              <label>时长</label>
              <select v-model.number="form.durationMin">
                <option v-for="m in DUR_OPTIONS" :key="m" :value="m">{{ durLabel(m) }}</option>
              </select>
            </div>
          </div>
          <div class="f-3col">
            <div class="f-row">
              <label>预估价格（元）</label>
              <input v-model.number="form.price" type="number" min="0" step="0.01" placeholder="选填" />
            </div>
            <div class="f-row">
              <label>上浮（元）</label>
              <input v-model.number="form.varianceUp" type="number" min="0" step="0.01" placeholder="涨价" />
            </div>
            <div class="f-row">
              <label>下浮（元）</label>
              <input v-model.number="form.varianceDown" type="number" min="0" step="0.01" placeholder="降价" />
            </div>
          </div>
          <div class="f-row">
            <label>备注<span class="hint-inline">仅在详情中显示</span></label>
            <textarea v-model.trim="form.note" maxlength="200" placeholder="选填，如购票提示、注意事项"></textarea>
          </div>
        </div>
        <div class="modal-f">
          <button v-if="!creating" type="button" class="btn ghost-danger left" @click="emit('delete', schedule!.id)">
            删除
          </button>
          <button type="button" class="btn" @click="emit('close')">取消</button>
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { Schedule, ScheduleType } from '@/types';
import type { FormPatch } from '@/types/form';
import { DUR_OPTIONS, TYPES } from '@/constants';
import { minToHH } from '@/utils/datetime';
import { durLabel } from '@/utils/format';
import { usePlannerStore } from '@/stores/planner';
import { toast } from '@/composables/useToast';

const props = defineProps<{
  visible: boolean;
  schedule: Schedule | null; // null = 新建
}>();
const emit = defineEmits<{
  close: [];
  save: [patch: FormPatch];
  delete: [id: string];
}>();

const store = usePlannerStore();
const creating = ref(false);
/** 5 分钟间隔时间选项（00:00–23:55，口径 §4.3） */
const TIME_OPTIONS = Array.from({ length: 288 }, (_, i) => minToHH(i * 5));
const errTitle = ref('');
const form = reactive({
  title: '',
  type: 'sight' as ScheduleType,
  location: '',
  date: '',
  startTime: '',
  durationMin: 60,
  expectedDate: '',
  price: null as number | null,
  varianceUp: null as number | null,
  varianceDown: null as number | null,
  expenseType: 'required' as 'required' | 'optional',
  confirmed: false,
  note: '',
});

watch(
  () => [props.visible, props.schedule] as const,
  () => {
    if (!props.visible) return;
    errTitle.value = '';
    const s = props.schedule;
    creating.value = !s;
    Object.assign(form, {
      title: s?.title ?? '',
      type: s?.type ?? 'sight',
      location: s?.location ?? '',
      date: s?.date ?? '',
      startTime: s?.startTime ?? '',
      durationMin: s?.durationMin ?? 60,
      expectedDate: s?.expectedDate ?? '',
      price: s?.price ?? null,
      varianceUp: s?.varianceUp ?? null,
      varianceDown: s?.varianceDown ?? null,
      expenseType: s?.expenseType ?? 'required',
      confirmed: s?.confirmed ?? false,
      note: s?.note ?? '',
    });
  },
  { immediate: true },
);

function toggleConfirmed(): void {
  if (!props.schedule) return;
  form.confirmed = !form.confirmed;
  store.setConfirmed(props.schedule.id, form.confirmed);
  toast(form.confirmed ? '已标记为已确认' : '已取消确认');
}

function save(): void {
  const title = form.title.trim();
  if (!title) {
    errTitle.value = '请填写事项名称';
    return;
  }
  if (title.length > 30) {
    errTitle.value = '不超过 30 字';
    return;
  }
  emit('save', {
    title,
    type: form.type,
    location: form.location,
    date: form.date || null,
    startTime: form.startTime || null,
    durationMin: form.durationMin,
    expectedDate: form.expectedDate || null,
    price: form.price === null || Number.isNaN(form.price) ? null : Math.max(0, form.price),
    varianceUp: form.varianceUp === null || Number.isNaN(form.varianceUp) ? null : Math.max(0, form.varianceUp),
    varianceDown:
      form.varianceDown === null || Number.isNaN(form.varianceDown) ? null : Math.max(0, form.varianceDown),
    expenseType: form.expenseType,
    note: form.note,
  });
}
</script>
