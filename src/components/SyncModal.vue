<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @pointerdown.self="emit('close')">
      <div class="modal">
        <div class="modal-h">
          <div class="t">云同步（GitHub Gist）</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <!-- 未配置：Token 输入 -->
          <template v-if="!configured">
            <div class="f-row">
              <label>GitHub Token<span class="hint-inline">仅需要 gist 权限</span></label>
              <input v-model.trim="token" type="password" placeholder="粘贴 ghq_/ghp_ 开头的 Token" />
              <div class="hint">
                生成方式：github.com → Settings → Developer settings → Personal access tokens →
                Generate new token（勾选 <b>gist</b> 一个权限即可）。Token 只保存在本设备，不会上传。
              </div>
            </div>
            <div class="f-row" v-if="err">
              <div class="sync-err">{{ err }}</div>
            </div>
            <div class="f-row" v-if="login">
              <div class="sync-ok">✓ Token 有效：{{ login }}</div>
            </div>
            <div class="f-row" style="display:flex; gap:8px">
              <button type="button" class="btn" @click="verify">验证</button>
              <button type="button" class="btn primary" :disabled="!token" @click="enable">启用同步</button>
            </div>
          </template>

          <!-- 已配置：状态 + 操作 -->
          <template v-else>
            <div class="f-row sync-grid">
              <div><label>状态</label><b :class="'st-' + syncState.status">{{ statusText }}</b></div>
              <div><label>Gist</label><b>{{ syncState.gistId ? syncState.gistId.slice(0, 8) + '…' : '待创建' }}</b></div>
              <div><label>上次同步</label><b>{{ syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString('zh-CN', { hour12: false }) : '—' }}</b></div>
              <div><label>自动同步</label>
                <button type="button" class="btn sm" @click="toggleEnabled">{{ syncState.enabled ? '已开启（点击暂停）' : '已暂停（点击开启）' }}</button>
              </div>
            </div>
            <div class="f-row" v-if="syncState.lastError">
              <div class="sync-err">最近错误：{{ syncState.lastError }}</div>
            </div>
            <div class="f-row hint">
              打开应用自动拉取、保存后约 3 秒自动推送；冲突按"最后修改优先"处理。
              数据可在 GitHub → Your gists（CCTravelCalendar-sync）中查看，为私享仅自己可见。
              其他设备：打开同步设置粘贴同一 Token 即可绑定同一 Gist。
            </div>
            <div class="f-row" style="display:flex; gap:8px; flex-wrap:wrap">
              <button type="button" class="btn primary" :disabled="syncState.status === 'busy'" @click="doSync">
                {{ syncState.status === 'busy' ? '同步中…' : '立即同步' }}
              </button>
              <button type="button" class="btn" @click="unbind">更换 Token / 解绑</button>
            </div>
          </template>
        </div>
        <div class="modal-f">
          <button type="button" class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  disableSyncForever,
  enableSync,
  setSyncEnabled,
  syncNow,
  syncState,
  verifyToken,
} from '@/sync/gistSync';
import { toast } from '@/composables/useToast';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const token = ref('');
const err = ref('');
const login = ref('');

const configured = computed(() => syncState.gistId !== '' || (syncState.enabled && tokenBound()));
function tokenBound(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem('tp_sync_cfg') ?? 'null')?.token;
  } catch {
    return false;
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      err.value = '';
      login.value = '';
    }
  },
);

const statusText = computed(
  () =>
    ({ idle: '未同步', ok: '✓ 已同步', pending: '待推送…', error: '✗ 出错', busy: '同步中…' })[syncState.status] ?? syncState.status,
);

async function verify(): Promise<void> {
  err.value = '';
  login.value = '';
  if (!token.value) return;
  try {
    login.value = await verifyToken(token.value);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  }
}

async function enable(): Promise<void> {
  err.value = '';
  try {
    await enableSync(token.value);
    const r = await syncNow('manual');
    toast(r === 'disabled' ? '启用失败' : '云同步已启用');
    token.value = '';
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  }
}

async function doSync(): Promise<void> {
  const r = await syncNow('manual');
  if (r === 'pulled') toast('已拉取云端更新');
  else if (r === 'pushed') toast('已推送到云端');
  else if (r === 'disabled') toast('同步未启用');
  else if (syncState.status === 'error') toast('同步失败：' + syncState.lastError);
}

function toggleEnabled(): void {
  setSyncEnabled(!syncState.enabled);
  toast(syncState.enabled ? '自动同步已开启' : '自动同步已暂停');
}

function unbind(): void {
  disableSyncForever();
  toast('已解绑本设备同步配置');
}
</script>

<style scoped>
.hint { font-size: 11px; color: var(--t4); line-height: 1.7; }
.sync-err { color: #dc2626; font-size: 12px; line-height: 1.6; }
.sync-ok { color: #059669; font-size: 13px; }
.sync-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.sync-grid label { display: block; font-size: 11px; color: var(--t4); margin-bottom: 2px; }
.st-ok { color: #059669; }
.st-error { color: #dc2626; }
.st-pending, .st-busy { color: #b45309; }
</style>
