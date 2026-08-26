<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal">
        <div class="modal-h">
          <div class="t">放置日程</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <div class="f-row">
            <label>事项</label>
            <div class="item-title" :style="{ '--c': color }">{{ schedule?.title ?? '' }}</div>
          </div>
          <div class="f-2col">
            <div class="f-row">
              <label>日期<span class="req">*</span></label>
              <input v-model="date" type="date" />
            </div>
            <div class="f-row">
              <label>开始时间<span class="req">*</span>（30 分钟步进）</label>
              <select v-model.number="startMin">
                <option v-for="m in 48" :key="m" :value="(m - 1) * 30">{{ slotLabel((m - 1) * 30) }}</option>
              </select>
            </div>
          </div>
          <div class="f-row">
            <label>时长</label>
            <select v-model.number="durationMin">
              <option v-for="m in DUR_OPTIONS" :key="m" :value="m">{{ durLabel(m) }}</option>
            </select>
          </div>
        </div>
        <div class="modal-f">
          <button type="button" class="btn" @click="emit('close')">取消</button>
          <button type="button" class="btn primary" :disabled="!date" @click="confirm">放置</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Schedule } from '@/types';
import { TYPE_MAP, DUR_OPTIONS } from '@/constants';
import { minToHH } from '@/utils/datetime';
import { durLabel } from '@/utils/format';

const props = defineProps<{
  visible: boolean;
  schedule: Schedule | null;
  defaultDate: string; // 当前选中日期
}>();
const emit = defineEmits<{ close: []; place: [date: string, startMin: number, durationMin: number] }>();

const date = ref('');
const startMin = ref(600);
const durationMin = ref(60);
const color = computed(() => (props.schedule ? TYPE_MAP[props.schedule.type].color : '#ccc'));

watch(
  () => props.visible,
  (v) => {
    if (!v || !props.schedule) return;
    date.value = props.defaultDate;
    startMin.value = 600; // 默认 10:00
    durationMin.value = props.schedule.durationMin;
  },
);

const slotLabel = (m: number) => minToHH(m);
function confirm(): void {
  if (!date.value) return;
  emit('place', date.value, startMin.value, durationMin.value);
}
</script>

<style scoped>
.item-title {
  font-size: 14px; font-weight: 600; padding: 8px 10px; border-radius: 8px;
  background: color-mix(in srgb, var(--c) 10%, #fff); border-left: 3px solid var(--c);
}
</style>
