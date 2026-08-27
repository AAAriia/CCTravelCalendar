<template>
  <div class="day-col" :class="{ today: isToday }" :style="colStyle">
    <ScheduleCard
      v-for="c in laidOut"
      :key="c.schedule.id"
      :schedule="c.schedule"
      :lane="c.lane"
      :lanes="c.lanes"
      @cancel="(id) => emit('cancel', id)"
      @open="(id) => emit('open', id)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Schedule } from '@/types';
import { layoutOverlap } from '@/utils/layout';
import { hhToMin, NIGHT_END, NIGHT_START } from '@/utils/datetime';
import { usePlannerStore } from '@/stores/planner';
import ScheduleCard from './ScheduleCard.vue';

const props = defineProps<{
  index: number; // 列序（0 起）
  columns: number; // 总列数（桌面 7 / 移动端单日 1）
  isToday: boolean;
  items: Schedule[]; // 该日已放置日程
}>();
const emit = defineEmits<{ cancel: [id: string]; open: [id: string] }>();
const store = usePlannerStore();

const laidOut = computed(() => {
  const eff = store.nightBandCollapsed;
  const visible = eff
    ? props.items.filter((s) => {
        const m = hhToMin(s.startTime!);
        return !(m >= NIGHT_START && m < NIGHT_END); // 折叠时隐藏凌晨开始的卡片（常态下自动展开不会走到）
      })
    : props.items;
  return layoutOverlap(visible);
});
const colStyle = computed(() => ({
  left: `calc(100% * ${props.index} / ${props.columns})`,
  width: `calc(100% / ${props.columns})`,
}));
</script>
