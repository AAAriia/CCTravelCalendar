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
    <div v-if="showMeta" class="c-meta">{{ meta }}</div>
    <button class="card-x" type="button" title="取消日程（移回日程库）" @click.stop="emit('cancel', schedule.id)">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Schedule } from '@/types';
import { TYPE_MAP } from '@/constants';
import { hhToMin, minToHH, yOfMin } from '@/utils/datetime';
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

const t = TYPE_MAP[props.schedule.type];
const st = hhToMin(props.schedule.startTime!);
const en = st + props.schedule.durationMin;
const timeRange = `${minToHH(st)} - ${minToHH(en)}`;

const cardStyle = computed(() => {
  const w = 100 / (props.lanes || 1);
  return {
    '--c': t.color,
    top: `${yOfMin(st) + 1}px`,
    height: `${yOfMin(props.schedule.durationMin) - 3}px`,
    left: `calc(${props.lane * w}% + 1px)`,
    width: `calc(${w}% - 3px)`,
    cursor: hoverCursor.value,
  };
});

const meta = computed(() =>
  [props.schedule.location, fmtPriceRange(props.schedule.price, props.schedule.varianceUp, props.schedule.varianceDown)]
    .filter(Boolean)
    .join(' · '),
);
const showMeta = computed(() => props.schedule.durationMin >= 90 && meta.value);

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
