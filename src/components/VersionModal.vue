<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal ver-modal">
        <div class="modal-h">
          <div class="t">版本历史</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <!-- 保存当前版本 -->
          <div class="f-row ver-save">
            <input v-model.trim="label" type="text" maxlength="30" placeholder="版本备注（可选，如：确定行程后）" />
            <button type="button" class="btn primary" @click="save">保存当前版本</button>
          </div>

          <!-- 版本列表 -->
          <div v-if="snaps.length" class="ver-list">
            <div v-for="s in snaps" :key="s.id" class="ver-item">
              <div class="ver-main">
                <div class="ver-line1">
                  <b>{{ fmtTime(s.at) }}</b>
                  <span class="ver-src" :class="s.source">{{ sourceLabel(s.source) }}</span>
                  <span v-if="s.label" class="ver-label">「{{ s.label }}」</span>
                </div>
                <div class="ver-line2">
                  {{ s.data.plans.length }} 行程 · {{ s.data.schedules.length }} 日程
                  <template v-if="curPlanName(s)">· {{ curPlanName(s) }}</template>
                </div>
              </div>
              <div class="ver-ops">
                <button v-if="confirmId !== s.id" class="btn sm" @click="confirmId = s.id">恢复</button>
                <template v-else>
                  <button class="btn sm danger" @click="doRestore(s.id)">确认恢复</button>
                  <button class="btn sm" @click="confirmId = ''">取消</button>
                </template>
                <button class="btn sm" title="导出该版本为文件" @click="exportOne(s)">导出</button>
              </div>
            </div>
          </div>
          <div v-else class="ver-empty">暂无版本。保存当前版本，或等待自动快照（云同步覆盖 / 导入 / 重置 / 恢复 前）。</div>

          <div class="ver-hint">
            恢复会用所选版本整体替换当前数据（替换前自动快照，可再反悔）；若云同步已启用，恢复后将强制推送覆盖云端。
          </div>

          <!-- 从文件恢复 -->
          <div class="f-row ver-file">
            <label>从版本文件恢复</label>
            <input ref="fileEl" type="file" accept="application/json,.json" @change="onFile" />
            <div v-if="filePreview" class="ver-preview">
              {{ filePreview }}
              <button class="btn sm danger" @click="doRestoreFile">确认恢复此文件</button>
            </div>
          </div>
        </div>
        <div class="modal-f">
          <button class="btn ghost-danger left" title="清空全部本地版本快照" @click="clearAll">清空历史</button>
          <button type="button" class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePlannerStore } from '@/stores/planner';
import { clearSnapshots, listSnapshots, SOURCE_LABEL, type Snapshot } from '@/data/snapshots';
import { downloadFile } from '@/utils/transfer';
import { toast } from '@/composables/useToast';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = usePlannerStore();

const label = ref('');
const confirmId = ref('');
const fileEl = ref<HTMLInputElement | null>(null);
const pendingFileData = ref<{ plans: unknown; schedules: unknown; lastPlanId?: unknown } | null>(null);
const filePreview = ref('');

const snaps = computed(() => listSnapshots());

watch(
  () => snaps.value.length,
  () => void 0,
);

const fmtTime = (at: number) =>
  new Date(at).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const sourceLabel = (s: keyof typeof SOURCE_LABEL) => SOURCE_LABEL[s];
const curPlanName = (s: Snapshot) => {
  const pid = s.data.lastPlanId ?? s.data.plans[0]?.id;
  return s.data.plans.find((p) => p.id === pid)?.name;
};

function save(): void {
  const snap = store.saveSnapshot(label.value || undefined);
  if (snap) {
    toast(label.value ? `已保存版本「${label.value}」` : '已保存当前版本');
    label.value = '';
  }
}

function doRestore(id: string): void {
  confirmId.value = '';
  if (store.restoreSnapshotById(id)) {
    toast('已恢复到所选版本（恢复前状态已自动快照）');
  } else {
    toast('恢复失败：版本不存在');
  }
}

function exportOne(s: Snapshot): void {
  const tag = `${new Date(s.at).toISOString().slice(0, 10).replace(/-/g, '')}-${String(new Date(s.at).getHours()).padStart(2, '0')}${String(new Date(s.at).getMinutes()).padStart(2, '0')}`;
  const payload = {
    app: 'travel-planner',
    versionFile: true,
    snapshotId: s.id,
    snapshotAt: s.at,
    snapshotSource: s.source,
    snapshotLabel: s.label ?? null,
    ...s.data,
  };
  downloadFile(`行程板-版本-${tag}-${SOURCE_LABEL[s.source]}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('已导出版本文件');
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  filePreview.value = '';
  pendingFileData.value = null;
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
    if (!Array.isArray(parsed.plans) || !Array.isArray(parsed.schedules) || !parsed.plans.length) {
      filePreview.value = '✗ 文件结构不符（需要包含 plans 与 schedules）';
      return;
    }
    pendingFileData.value = parsed as { plans: unknown; schedules: unknown; lastPlanId?: unknown };
    const planNames = (parsed.plans as Array<{ name?: string }>).slice(0, 2).map((p) => p.name).join('、');
    filePreview.value = `✓ ${parsed.plans.length} 行程 · ${parsed.schedules.length} 日程（${planNames}…）`;
  } catch {
    filePreview.value = '✗ 不是合法的 JSON 文件';
  }
}

function doRestoreFile(): void {
  if (!pendingFileData.value) return;
  if (store.restoreData(pendingFileData.value)) {
    toast('已从文件恢复（恢复前状态已自动快照）');
    filePreview.value = '';
    pendingFileData.value = null;
    if (fileEl.value) fileEl.value.value = '';
  } else {
    toast('恢复失败');
  }
}

function clearAll(): void {
  if (window.confirm('确定清空全部本地版本快照？（不影响当前数据与已导出的文件）')) {
    clearSnapshots();
    toast('版本历史已清空');
  }
}
</script>

<style scoped>
.ver-save { display: flex; gap: 8px; }
.ver-save input { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; font-size: 13px; font-family: inherit; }
.ver-list { max-height: 46vh; overflow-y: auto; margin-top: 4px; }
.ver-item {
  display: flex; gap: 8px; align-items: center; border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; margin-bottom: 6px;
}
.ver-item:hover { border-color: #d1d5db; }
.ver-main { flex: 1; min-width: 0; }
.ver-line1 { font-size: 13px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ver-src { font-size: 10px; border-radius: 4px; padding: 1px 6px; background: #f3f4f6; color: var(--t3); }
.ver-src.manual { background: #dbeafe; color: #1d4ed8; }
.ver-src.pre-restore { background: #fef3c7; color: #b45309; }
.ver-label { font-size: 12px; color: var(--t3); }
.ver-line2 { font-size: 11px; color: var(--t4); margin-top: 2px; }
.ver-ops { display: flex; gap: 6px; flex: none; }
.ver-empty { font-size: 12px; color: var(--t4); padding: 14px 4px; text-align: center; }
.ver-hint { font-size: 11px; color: var(--t4); line-height: 1.7; margin: 8px 0 12px; }
.ver-file input[type='file'] { font-size: 12px; width: 100%; }
.ver-preview { font-size: 12px; color: #059669; margin-top: 6px; display: flex; gap: 8px; align-items: center; }
</style>
