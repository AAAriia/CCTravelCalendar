<template>
  <div class="aside" :class="{ drawer }">
    <div class="aside-h">
      <div class="t">
        日程库
        <span class="sub">{{ subHint }}</span>
      </div>
      <button class="btn primary" @click="emit('create')">＋ 新建</button>
    </div>
    <div class="lib-tabs">
      <button v-for="g in tabs" :key="g.k" :class="{ active: store.groupBy === g.k }" @click="store.setGroupBy(g.k)">
        {{ g.name }}
      </button>
    </div>
    <div class="lib-list">
      <LibraryGroup
        v-for="g in store.groups"
        :key="g.key"
        :group="g"
        :dim="store.groupBy"
        @open="(id) => emit('open', id)"
        @copied="(id) => emit('copied', id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePlannerStore } from '@/stores/planner';
import { useIsMobile } from '@/composables/useMediaQuery';
import LibraryGroup from './LibraryGroup.vue';

const emit = defineEmits<{ create: []; open: [id: string]; copied: [id: string] }>();
const store = usePlannerStore();
const isMobile = useIsMobile();

const tabs = [
  { k: 'type' as const, name: '按类型' },
  { k: 'location' as const, name: '按地点' },
  { k: 'expectedDate' as const, name: '按预计日期' },
];

const drawer = computed(() => isMobile.value);
const subHint = computed(() => (isMobile.value ? '点选日程即可排期' : '拖动日程到左侧日程表即可排期'));
</script>
