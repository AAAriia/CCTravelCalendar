<template>
  <div class="topbar">
    <div class="brand">✈ 行程板 <span class="sub">旅行计划</span></div>

    <!-- 行程切换 -->
    <select class="plan-select" :value="store.currentPlanId ?? ''" @change="onPlanChange">
      <option v-for="p in store.plans" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
    <button class="btn sm" title="管理行程" @click="emit('managePlans')">管理</button>

    <div class="weeknav">
      <button class="btn" title="上一周" @click="store.prevWeek()">◀</button>
      <WeekPicker
        :label="weekRangeLabel(store.weekDays[0], store.weekDays[6])"
        :week-start-iso="store.weekStartIso"
        @pick="onPickDate"
      />
      <button class="btn" title="下一周" @click="store.nextWeek()">▶</button>
      <button class="btn" @click="goToday">今天</button>
    </div>

    <div class="stats">
      本周已安排 <b>{{ store.weekStats.count }}</b> 项 · 预估花费
      <b v-if="store.weekStats.min === store.weekStats.max">¥{{ money(store.weekStats.min) }}</b>
      <b v-else>¥{{ money(store.weekStats.min) }}~{{ money(store.weekStats.max) }}</b>
    </div>
    <div class="spacer"></div>

    <button class="btn" title="费用预算表（与行程同步）" @click="emit('budget')">预算表</button>
    <button class="btn" title="地图视图（免费 OSM）" @click="emit('map')">地图</button>
    <button class="btn" title="版本历史（快照/恢复/导出）" @click="emit('versions')">版本</button>
    <button class="btn" title="云端同步（GitHub Gist）" @click="emit('sync')">
      <span class="sync-dot" :class="syncState.status"></span>云同步
    </button>
    <button class="btn" title="备份 / 恢复数据" @click="emit('importExport')">导入导出</button>
    <button class="btn" title="已删除的日程" @click="emit('trash')">回收站</button>
    <button class="btn ghost-danger" title="清空本地修改，恢复示例数据" @click="emit('reset')">重置示例数据</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { usePlannerStore } from '@/stores/planner';
import { weekRangeLabel } from '@/utils/format';
import WeekPicker from '@/components/WeekPicker.vue';
import { syncState } from '@/sync/gistSync';

const emit = defineEmits<{
  managePlans: [];
  budget: [];
  sync: [];
  versions: [];
  map: [];
  importExport: [];
  trash: [];
  reset: [];
  scrollToday: [top: number];
}>();
const store = usePlannerStore();
const router = useRouter();

function onPlanChange(e: Event): void {
  const id = (e.target as HTMLSelectElement).value;
  if (id) void router.push({ name: 'plan', params: { planId: id } });
}

const money = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function goToday(): void {
  store.goToday();
  emit('scrollToday', store.morningAnchorY - 88);
}

function onPickDate(iso: string): void {
  store.setWeekStartByDate(iso);
  emit('scrollToday', store.morningAnchorY - 88);
}
</script>

<style scoped>
.plan-select {
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font-size: 13px;
  font-family: inherit; color: var(--t1); background: #fff; max-width: 150px; cursor: pointer;
}
</style>
