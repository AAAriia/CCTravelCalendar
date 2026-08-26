<template>
  <div class="cal-panel">
    <div class="cal-head">
      <div class="h-gutter"></div>
      <div v-for="(d, i) in store.weekDays" :key="isoList[i]" class="h-day" :class="{ today: isoList[i] === todayIso, sel: mobileSel === i }">
        <div class="dow">周{{ WEEK_CN[d.getDay()] }}</div>
        <div class="dnum">
          {{ d.getMonth() + 1 }}/{{ d.getDate() }}<span v-if="isoList[i] === todayIso" class="today-pill">今天</span>
        </div>
      </div>
    </div>
    <div ref="scrollEl" class="cal-scroll">
      <div class="cal-inner">
        <div class="cal-gutter">
          <div v-for="h in 24" :key="h" class="hr" :style="{ top: `${(h - 1) * 2 * 44}px` }">
            {{ String(h - 1).padStart(2, '0') }}:00
          </div>
        </div>
        <div ref="gridEl" class="cal-days">
          <DayColumn
            v-for="(d, ci) in visibleDays"
            :key="`${renderTick}-${isoOf(d)}`"
            :index="ci"
            :columns="mobileSel === null ? 7 : 1"
            :is-today="isoOf(d) === todayIso"
            :items="store.schedulesByDate.get(isoOf(d)) ?? []"
            @cancel="(id) => emit('cancel', id)"
            @open="(id) => emit('open', id)"
          />
          <!-- 拖拽落点提示 -->
          <div
            v-if="dragHint"
            class="drop-hint"
            :style="hintStyle"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { usePlannerStore } from '@/stores/planner';
import { COLS, WEEK_CN } from '@/constants';
import { isoOf, yOfMin } from '@/utils/datetime';
import { bindCalendarGrid, dragHint, renderTick } from '@/composables/useDragSchedule';
import DayColumn from './DayColumn.vue';

const emit = defineEmits<{ cancel: [id: string]; open: [id: string] }>();
const store = usePlannerStore();

const scrollEl = ref<HTMLElement | null>(null);
const gridEl = ref<HTMLElement | null>(null);

const todayIso = isoOf(new Date());
const isoList = computed(() => store.weekIsoList);

/** 移动端：仅显示选中单日（mobileSel = 选中列，null = 桌面全周） */
const props = defineProps<{ mobileSel?: number | null }>();
const mobileSel = computed(() => props.mobileSel ?? null);
// 注意：经 pinia reactive 访问的 computed 属性自动解包，无需 .value（保持响应式依赖收集）
const visibleDays = computed(() => (mobileSel.value === null ? store.weekDays : [store.weekDays[mobileSel.value]]));

const hintStyle = computed(() => {
  const h = dragHint.value!;
  const cols = mobileSel.value === null ? COLS : 1;
  const idx = mobileSel.value === null ? h.colIdx : 0;
  return {
    '--c': h.color,
    left: `calc(100% * ${idx} / ${cols} + 2px)`,
    width: `calc(100% / ${cols} - 6px)`,
    top: `${yOfMin(h.startMin) + 1}px`,
    height: `${yOfMin(h.durMin) - 3}px`,
  };
});

onMounted(() => {
  bindCalendarGrid(gridEl.value);
  if (scrollEl.value) scrollEl.value.scrollTop = yOfMin(7 * 60) - 88; // 初始定位 07:00 附近（口径 §4.1）
});
onBeforeUnmount(() => bindCalendarGrid(null));

/** 供顶栏"今天"定位滚动 */
function scrollTo(top: number): void {
  if (scrollEl.value) scrollEl.value.scrollTop = top;
}
defineExpose({ scrollTo });
</script>
