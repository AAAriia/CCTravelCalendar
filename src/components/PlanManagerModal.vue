<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal">
        <div class="modal-h">
          <div class="t">行程管理</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <div class="f-row" :class="{ error: !!errName }">
            <label>新建行程</label>
            <div style="display: flex; gap: 8px">
              <input v-model.trim="newName" type="text" maxlength="30" placeholder="如：国庆北京行" style="flex: 1" @keyup.enter="create" />
              <button type="button" class="btn primary" @click="create">创建</button>
            </div>
            <div class="f-err">{{ errName }}</div>
          </div>
          <div class="f-row">
            <label>全部行程（{{ store.plans.length }}）</label>
          </div>
          <div v-for="p in store.plans" :key="p.id" class="plan-row" :class="{ cur: p.id === store.currentPlanId }">
            <template v-if="editingId === p.id">
              <input v-model.trim="editName" type="text" maxlength="30" class="plan-edit" @keyup.enter="saveRename(p.id)" />
              <button class="btn sm" @click="saveRename(p.id)">保存</button>
            </template>
            <template v-else>
              <span class="plan-name">{{ p.name }}</span>
              <span v-if="p.id === store.currentPlanId" class="plan-cur">当前</span>
              <span class="spacer"></span>
              <button class="btn sm" @click="open(p.id)">打开</button>
              <button class="btn sm" @click="startRename(p)">重命名</button>
              <button class="btn sm ghost-danger" @click="askRemove(p)">删除</button>
            </template>
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
import { ref } from 'vue';
import type { Plan } from '@/types';
import { usePlannerStore } from '@/stores/planner';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: []; removePlan: [plan: Plan] }>();
const store = usePlannerStore();

const newName = ref('');
const errName = ref('');
const editingId = ref<string | null>(null);
const editName = ref('');

function create(): void {
  if (!newName.value) {
    errName.value = '请填写行程名称';
    return;
  }
  errName.value = '';
  store.createPlan(newName.value);
  newName.value = '';
}

function startRename(p: Plan): void {
  editingId.value = p.id;
  editName.value = p.name;
}
function saveRename(id: string): void {
  if (editName.value.trim()) store.renamePlan(id, editName.value);
  editingId.value = null;
}

function open(id: string): void {
  store.switchPlan(id);
  emit('close');
}

function askRemove(p: Plan): void {
  emit('removePlan', p);
}
</script>

<style scoped>
.plan-row {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px;
}
.plan-row.cur { border-color: #93c5fd; background: #f8FAff; }
.plan-name { font-size: 13px; font-weight: 600; }
.plan-cur {
  font-size: 10px; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 999px; padding: 1px 8px;
}
.plan-edit {
  flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 13px; font-family: inherit;
}
</style>
