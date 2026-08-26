<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal">
        <div class="modal-h">
          <div class="t">回收站（{{ store.trashedSchedules.length }}）</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <div v-if="!store.trashedSchedules.length" class="trash-empty">回收站是空的。删除的日程会在这里等待恢复。</div>
          <div v-for="s in store.trashedSchedules" :key="s.id" class="trash-row">
            <span class="dot" :style="{ '--c': TYPE_MAP[s.type].color }"></span>
            <div class="trash-main">
              <div class="trash-title">{{ s.title }}</div>
              <div class="trash-sub">
                {{ TYPE_MAP[s.type].name }}<template v-if="s.date"> · 原排期 {{ fmtShort(s.date) }} {{ s.startTime }}</template>
                · 删除于 {{ fmtDeletedAt(s.deletedAt!) }}
              </div>
            </div>
            <button class="btn sm" @click="restore(s.id)">恢复</button>
            <button class="btn sm ghost-danger" @click="askPurge(s)">彻底删除</button>
          </div>
        </div>
        <div class="modal-f">
          <button type="button" class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Schedule } from '@/types';
import { usePlannerStore } from '@/stores/planner';
import { TYPE_MAP } from '@/constants';
import { fmtDeletedAt, fmtShort } from '@/utils/format';
import { toast } from '@/composables/useToast';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; purge: [s: Schedule] }>();
const store = usePlannerStore();

function restore(id: string): void {
  const s = store.restoreSchedule(id);
  if (s) toast(`已恢复「${s.title.slice(0, 12)}」`);
}

function askPurge(s: Schedule): void {
  emit('purge', s);
}
</script>

<style scoped>
.trash-empty { font-size: 13px; color: var(--t4); padding: 18px 4px; text-align: center; }
.trash-row {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px;
}
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: none; }
.trash-main { min-width: 0; flex: 1; }
.trash-title { font-size: 13px; font-weight: 600; }
.trash-sub { font-size: 11px; color: var(--t3); margin-top: 1px; }
</style>
