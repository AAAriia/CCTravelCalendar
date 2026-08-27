<template>
  <div
    class="card"
    ref="el"
    :class="{ confirmed: schedule.confirmed }"
    :style="cardStyle"
    :title="schedule.title"
    @pointerdown="onPointerDown"
    @mousemove="onHover"
    @click="onClick"
  >
    <div class="c-head">
      <button
        class="confirm-check" type="button" :class="{ on: schedule.confirmed }"
        :title="schedule.confirmed ? '已确认（点击取消勾选）' : '标记为已确认'"
        @click.stop="store.setConfirmed(schedule.id, !schedule.confirmed)"
      >✓</button>
      <div class="c-title">{{ schedule.title }}</div>
    </div>
    <div class="c-time">{{ timeRange }}</div>
    <div v-if="priceText" class="c-price">{{ priceText }}</div>
    <div v-if="schedule.location" class="c-loc">{{ schedule.location }}</div>
    <button class="card-x" type="button" title="取消日程（移回日程库）" @click.stop="emit('cancel', schedule.id)">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Schedule } from '@/types';
import { TYPE_MAP } from '@/constants';
import { hhToMin, minToHH, minToY } from '@/utils/datetime';
import { fmtPriceRange } from '@/utils/price';
import { beginCardDrag, suppressClick } from '@/composables/useDragSchedule';
import { usePlannerStore } from '@/stores/planner';

const store = usePlannerStore();
const props = defineProps<{
  schedule: Schedule;
  lane: number;
  lanes: number;
}>();
const emit = defineEmits<{ cancel: [id: string]; open: [id: string] }>();

const el = ref<HTMLElement | null>(null);
const hoverCursor = ref('grab');

// 全部派生值使用 computed：弹窗编辑时间/时长后卡片即时刷新（不再使用 setup 常量）
const color = computed(() => TYPE_MAP[props.schedule.type].color);
const st = computed(() => hhToMin(props.schedule.startTime!));
const timeRange = computed(() => `${minToHH(st.value)} - ${minToHH(st.value + props.schedule.durationMin)}`);
const priceText = computed(() =>
  fmtPriceRange(props.schedule.price, props.schedule.varianceUp, props.schedule.varianceDown),
);

const cardStyle = computed(() => {
  const w = 100 / (props.lanes || 1);
  const eff = store.nightBandCollapsed; // 凌晨折叠映射（口径 §4.1a）
  const top = minToY(st.value, eff);
  const bottom = minToY(st.value + props.schedule.durationMin, eff);
  return {
    '--c': color.value,
    top: `${top + 1}px`,
    height: `${bottom - top - 3}px`,
    left: `calc(${props.lane * w}% + 1px)`,
    width: `calc(${w}% - 3px)`,
    cursor: hoverCursor.value,
  };
});

function onPointerDown(e: PointerEvent): void {
  beginCardDrag(e, props.schedule, el.value!);
}

function onHover(e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  hoverCursor.value = e.clientY - r.top <= 6 || r.bottom - e.clientY <= 6 ? 'ns-resize' : 'grab';
}

/** click 激活回退：键盘 / 辅助技术 / 事件合成场景（真实指针流由 suppressClick 抑制） */
function onClick(): void {
  if (!suppressClick.value) emit('open', props.schedule.id);
}
</script>
