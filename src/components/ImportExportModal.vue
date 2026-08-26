<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal">
        <div class="modal-h">
          <div class="t">导入 / 导出</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <!-- 导出 -->
          <div class="f-row">
            <label>导出</label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button type="button" class="btn" @click="exportJson">导出全部（JSON 备份）</button>
              <button type="button" class="btn" @click="exportCsv">导出当前行程（CSV）</button>
            </div>
            <div class="hint">JSON 含全部行程与回收站，用于备份/恢复；CSV 适合表格查看当前行程。</div>
          </div>
          <!-- 导入 -->
          <div class="f-row">
            <label>导入 JSON</label>
            <input ref="fileEl" type="file" accept="application/json,.json" @change="onFile" />
            <div v-if="fileName" class="hint">已选择：{{ fileName }}（{{ fileSize }}）</div>
          </div>
          <div class="f-row">
            <label>导入方式</label>
            <div class="chips">
              <button type="button" class="chip" :class="{ active: mode === 'merge' }" @click="mode = 'merge'">
                合并（按 id 去重更新）
              </button>
              <button type="button" class="chip danger-chip" :class="{ active: mode === 'overwrite' }" @click="mode = 'overwrite'">
                覆盖（清空现有数据）
              </button>
            </div>
          </div>
          <div v-if="report" class="f-row import-report">
            <label>导入结果</label>
            <div class="hint">
              成功导入 {{ report.plans }} 个行程、{{ report.schedules }} 条日程。
              <template v-if="report.skipped.length"><br />忽略 {{ report.skipped.length }} 条：{{ report.skipped.join('；') }}</template>
            </div>
          </div>
          <div v-if="error" class="f-row import-error">{{ error }}</div>
        </div>
        <div class="modal-f">
          <button type="button" class="btn" :disabled="!pendingText" @click="doImport">执行导入</button>
          <button type="button" class="btn primary" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { usePlannerStore } from '@/stores/planner';
import { SCHEMA_VERSION } from '@/constants';
import { applyImport, buildExportBundle, buildPlanCsv, downloadFile, type ImportReport } from '@/utils/transfer';
import { toast } from '@/composables/useToast';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = usePlannerStore();

const fileEl = ref<HTMLInputElement | null>(null);
const fileName = ref('');
const fileSize = ref('');
const pendingText = ref<string | null>(null);
const mode = ref<'merge' | 'overwrite'>('merge');
const report = ref<ImportReport | null>(null);
const error = ref('');

const dateTag = () => new Date().toISOString().slice(0, 10);

function exportJson(): void {
  const bundle = buildExportBundle({
    version: SCHEMA_VERSION,
    plans: store.plans,
    schedules: store.schedules,
    lastPlanId: store.currentPlanId,
  });
  downloadFile(`行程板-备份-${dateTag()}.json`, JSON.stringify(bundle, null, 2), 'application/json');
  toast('已导出 JSON 备份');
}

function exportCsv(): void {
  const list = store.schedules.filter((s) => s.planId === store.currentPlanId);
  downloadFile(`行程板-${store.currentPlan?.name ?? '行程'}-${dateTag()}.csv`, buildPlanCsv(store.plans, list), 'text/csv');
  toast(`已导出 ${list.length} 条日程（CSV）`);
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  report.value = null;
  error.value = '';
  pendingText.value = null;
  fileName.value = file ? file.name : '';
  fileSize.value = file ? `${(file.size / 1024).toFixed(1)} KB` : '';
  if (!file) return;
  pendingText.value = await file.text();
}

function doImport(): void {
  if (!pendingText.value) return;
  const data = {
    version: SCHEMA_VERSION,
    plans: store.plans,
    schedules: store.schedules,
    lastPlanId: store.currentPlanId,
  };
  const result = applyImport(pendingText.value, data, mode.value);
  if (!result.ok) {
    error.value = result.error ?? '导入失败';
    return;
  }
  error.value = '';
  report.value = result.report!;
  store.plans = data.plans;
  store.schedules = data.schedules;
  if (!store.plans.some((p) => p.id === store.currentPlanId)) store.switchPlan(data.lastPlanId!);
  store.persist();
  toast(`导入完成：${result.report!.schedules} 条日程`);
  pendingText.value = null;
  if (fileEl.value) fileEl.value.value = '';
}
</script>

<style scoped>
.hint { font-size: 11px; color: var(--t4); margin-top: 6px; line-height: 1.6; }
.import-report label { color: #059669; }
.import-error { color: #dc2626; font-size: 12px; }
.chip.danger-chip.active { border-color: #dc2626; background: #fef2f2; color: #b91c1c; }
</style>
