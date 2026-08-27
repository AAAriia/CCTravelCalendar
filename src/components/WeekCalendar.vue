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
      <div class="cal-inner" :style="innerStyle">
        <div class="cal-gutter">
          <div v-for="h in 24" :key="h" class="hr" :style="{ top: `${minToY((h - 1) * 60, effCollapsed)}px` }">
            {{ String(h - 1).padStart(2, '0') }}:00
          </div>
        </div>
        <!-- 凌晨折叠条（口径 §4.1a）：点击展开；展开态提供折叠入口 -->
        <div
          v-if="effCollapsed"
          class="night-divider"
          :style="{ top: `${yOfMin(NIGHT_START)}px` }"
          title="点击展开凌晨时段"
          @click="store.setNightCollapsed(false)"
        >
          02:00 – 07:00 凌晨时段已折叠（本周无日程）· 点击展开
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
          <!-- 展开态的折叠入口（不占布局空间） -->
          <button
            v-if="!effCollapsed"
            class="night-fold-btn"
            :style="{ top: `${yOfMin(NIGHT_START) - 9}px` }"
            title="折叠凌晨时段（02:00-07:00）"
            @click="store.setNightCollapsed(true)"
          >▾ 折叠凌晨</button>
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
import { gridTotalH, isoOf, minToY, NIGHT_START, yOfMin } from '@/utils/datetime';
import { bindCalendarGrid, dragHint, renderTick } from '@/composables/useDragSchedule';
import DayColumn from './DayColumn.vue';

const emit = defineEmits<{ cancel: [id: string]; open: [id: string] }>();
const store = usePlannerStore();

const scrollEl = ref<HTMLElement | null>(null);
const gridEl = ref<HTMLElement | null>(null);
const effCollapsed = computed(() => store.nightBandCollapsed);

/** 网格总高 + 背景刻度线（折叠时分三段绘制） */
const innerStyle = computed(() => {
  const HOUR = 'repeating-linear-gradient(to bottom, transparent 0 87px, #e2e5ea 87px 88px)';
  const HALF = 'repeating-linear-gradient(to bottom, transparent 0 43px, #f1f2f5 43px 44px)';
  if (!effCollapsed.value) {
    return {
      height: `${gridTotalH(false)}px`,
      backgroundImage: `${HOUR}, ${HALF}`,
      backgroundSize: '100% 100%, 100% 100%',
      backgroundPosition: '0 0, 0 0',
      backgroundRepeat: 'no-repeat, no-repeat',
    };
  }
  const hA = yOfMin(NIGHT_START); // 176
  const hB = gridTotalH(true) - hA; // 07:00-24:00 段高
  return {
    height: `${gridTotalH(true)}px`,
    backgroundImage: `${HOUR}, ${HALF}, ${HOUR}, ${HALF}`,
    backgroundSize: `100% ${hA}px, 100% ${hA}px, 100% ${hB}px, 100% ${hB}px`,
    backgroundPosition: `0 0, 0 0, 0 ${hA + 28}px, 0 ${hA + 28}px`,
    backgroundRepeat: 'no-repeat, no-repeat, no-repeat, no-repeat',
  };
});

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
  // 投影与卡片/落点同用凌晨折叠映射（口径 §4.1a）：否则折叠态下 07:00 后投影整体下偏 ~412px
  const top = minToY(h.startMin, effCollapsed.value);
  const bottom = minToY(h.startMin + h.durMin, effCollapsed.value);
  return {
    '--c': h.color,
    left: `calc(100% * ${idx} / ${cols} + 2px)`,
    width: `calc(100% / ${cols} - 6px)`,
    top: `${top + 1}px`,
    height: `${bottom - top - 3}px`,
  };
});

onMounted(() => {
  bindCalendarGrid(gridEl.value);
  if (scrollEl.value) scrollEl.value.scrollTop = store.morningAnchorY - 88; // 初始定位 07:00 附近（口径 §4.1，含折叠映射）
});
onBeforeUnmount(() => bindCalendarGrid(null));

/** 供顶栏"今天"定位滚动 */
function scrollTo(top: number): void {
  if (scrollEl.value) scrollEl.value.scrollTop = top;
}
defineExpose({ scrollTo });
</script>
