<template>
  <div class="grp" :class="{ closed, 'empty-op': !group.items.length }">
    <div class="grp-h" @click="store.toggleCollapsed(groupKey)">
      <span class="swatch" :style="group.color ? { '--c': group.color } : {}"></span>
      <span class="grp-name">{{ group.name }}</span>
      <span class="grp-cnt">{{ group.items.length }}</span>
      <span class="chev">▼</span>
    </div>
    <div class="grp-items">
      <template v-if="group.items.length">
        <LibraryItem
        v-for="s in group.items" :key="s.id" :schedule="s"
        @open="(id) => emit('open', id)"
        @copied="(id) => emit('copied', id)"
      />
      </template>
      <div v-else class="grp-empty">暂无日程</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ScheduleGroup } from '@/stores/planner';
import { usePlannerStore } from '@/stores/planner';
import LibraryItem from './LibraryItem.vue';

const props = defineProps<{ group: ScheduleGroup; dim: string }>();
const emit = defineEmits<{ open: [id: string]; copied: [id: string] }>();
const store = usePlannerStore();

const groupKey = computed(() => `${props.dim}:${props.group.key}`);
const closed = computed(() => store.collapsed.has(groupKey.value));
</script>
