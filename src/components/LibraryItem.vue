<template>
  <div
    class="lib-item"
    :class="{ placed }"
    role="button"
    tabindex="0"
    :data-id="schedule.id"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <span class="dot" :style="{ '--c': color }"></span>
    <div class="lib-main">
      <div class="lib-head">
        <button
          class="confirm-check" type="button" :class="{ on: schedule.confirmed }"
          :title="schedule.confirmed ? '已确认（点击取消勾选）' : '标记为已确认'"
          @click.stop="store.setConfirmed(schedule.id, !schedule.confirmed)"
        >✓</button>
        <div class="lib-title">{{ schedule.title }}</div>
      </div>
      <div class="lib-sub">
        <template v-if="schedule.location">{{ schedule.location }}</template>
        <span v-else class="none">未填写地点</span>
        <template v-if="priceRangeText"> · {{ priceRangeText }}</template>
      </div>
      <span v-if="placed" class="lib-tag">已放置 {{ fmtShort(schedule.date) }} {{ schedule.startTime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Schedule } from '@/types';
import { isPlaced } from '@/types';
import { TYPE_MAP } from '@/constants';
import { fmtShort } from '@/utils/format';
import { fmtPriceRange } from '@/utils/price';
import { beginLibDrag, suppressClick } from '@/composables/useDragSchedule';
import { usePlannerStore } from '@/stores/planner';

const store = usePlannerStore();
const props = defineProps<{ schedule: Schedule }>();
const emit = defineEmits<{ open: [id: string] }>();

const placed = computed(() => isPlaced(props.schedule));
const color = TYPE_MAP[props.schedule.type].color;
const priceRangeText = computed(() =>
  props.schedule.price == null && props.schedule.priceVariance == null
    ? ''
    : fmtPriceRange(props.schedule.price, props.schedule.priceVariance),
);

function onPointerDown(e: PointerEvent): void {
  beginLibDrag(e, props.schedule, (e.currentTarget as HTMLElement));
}

/** click 激活回退：键盘 / 辅助技术 / 已放置条目查看详情 */
function onClick(): void {
  if (!suppressClick.value) emit('open', props.schedule.id);
}
</script>
