import { reactive } from 'vue';
import type { AppData } from '@/types';
import { normalizeSchedule } from '@/data/normalize';
import { takeSnapshot } from '@/data/snapshots';
import { usePlannerStore } from '@/stores/planner';
import { toast } from '@/composables/useToast';

/**
 * Gist 云同步（口径 §18）：
 * - 数据以 JSON 存于用户私享 Gist（description 约定 'CCTravelCalendar-sync'，文件 tp-sync.json）
 * - 冲突策略：时间戳 last-write-wins（本地最后修改时间 vs 远端 exportedAt）
 * - 触发：启用后打开应用拉取、本地保存防抖 3s 推送、回到前台/网络恢复拉取
 * - Token 仅存本设备 localStorage，不进入同步数据
 */

const API = 'https://api.github.com';
const GIST_DESC = 'CCTravelCalendar-sync';
const FILE_NAME = 'tp-sync.json';
const LS_KEY = 'tp_sync_cfg';
const PUSH_DEBOUNCE = 3000;

export interface SyncConfig {
  token: string;
  gistId: string;
  enabled: boolean;
  lastSyncAt: number | null;
}

export const syncState = reactive({
  status: 'idle' as 'idle' | 'ok' | 'pending' | 'error' | 'busy',
  lastError: '' as string,
  gistId: '' as string,
  enabled: false,
  lastSyncAt: null as number | null,
});

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SyncConfig;
    if (typeof c.token !== 'string' || !c.token) return null;
    return { token: c.token, gistId: c.gistId ?? '', enabled: c.enabled !== false, lastSyncAt: c.lastSyncAt ?? null };
  } catch {
    return null;
  }
}

function saveSyncConfig(c: SyncConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

function applyCfg(c: SyncConfig | null): void {
  syncState.gistId = c?.gistId ?? '';
  syncState.enabled = !!c?.enabled;
  syncState.lastSyncAt = c?.lastSyncAt ?? null;
}

async function gh(path: string, init: RequestInit, token: string): Promise<unknown> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 120) || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** 校验 Token（GET /user） */
export async function verifyToken(token: string): Promise<string> {
  const u = (await gh('/user', { method: 'GET' }, token)) as { login?: string };
  return u.login ?? '未知用户';
}

/** 查找或创建同步 Gist */
async function findOrCreateGist(token: string, initial: string): Promise<string> {
  let page = 1;
  for (;;) {
    const list = (await gh(`/gists?per_page=100&page=${page}`, { method: 'GET' }, token)) as Array<{
      id: string;
      description?: string;
    }>;
    const hit = list.find((g) => g.description === GIST_DESC);
    if (hit) return hit.id;
    if (list.length < 100) break;
    page++;
  }
  const created = (await gh(
    '/gists',
    { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files: { [FILE_NAME]: { content: initial } } }) },
    token,
  )) as { id: string };
  return created.id;
}

interface RemotePayload extends AppData {
  app: 'travel-planner';
  exportedAt: number;
}

async function readGist(token: string, gistId: string): Promise<RemotePayload | null> {
  const g = (await gh(`/gists/${gistId}`, { method: 'GET' }, token)) as {
    files?: Record<string, { content?: string }>;
  };
  const content = g.files?.[FILE_NAME]?.content;
  if (!content) return null;
  const parsed = JSON.parse(content) as RemotePayload;
  if (!Array.isArray(parsed.plans) || !Array.isArray(parsed.schedules)) throw new Error('远端数据结构不符');
  return parsed;
}

/** 本地最后修改时间 */
function localMaxUpdated(data: AppData): number {
  let m = 0;
  for (const p of data.plans) m = Math.max(m, p.updatedAt);
  for (const s of data.schedules) m = Math.max(m, s.updatedAt);
  return m;
}

function toPayload(data: AppData): RemotePayload {
  return { app: 'travel-planner', version: data.version, plans: data.plans, schedules: data.schedules, lastPlanId: data.lastPlanId, exportedAt: Date.now() };
}

/** 应用远端数据到本地 store（normalize 防脏）；覆盖前自动快照（口径 §19） */
function applyRemote(remote: RemotePayload): void {
  const store = usePlannerStore();
  takeSnapshot('pre-sync-pull', {
    version: 3,
    plans: store.plans,
    schedules: store.schedules,
    lastPlanId: store.currentPlanId,
  });
  applyingRemote = true;
  try {
    const plans = remote.plans.map((p) => ({ ...p }));
    const fallback = plans[0]?.id ?? '';
    store.plans = plans.map((p) => ({
      id: p.id,
      name: typeof p.name === 'string' ? p.name.slice(0, 30) : '未命名行程',
      createdAt: p.createdAt ?? Date.now(),
      updatedAt: p.updatedAt ?? Date.now(),
    }));
    store.schedules = remote.schedules.map((raw) =>
      normalizeSchedule(raw as unknown as Record<string, unknown>, typeof raw.planId === 'string' ? raw.planId : fallback),
    );
    const last = remote.lastPlanId && store.plans.some((p) => p.id === remote.lastPlanId) ? remote.lastPlanId : store.plans[0]?.id ?? null;
    if (last) store.switchPlan(last);
    store.persist();
  } finally {
    applyingRemote = false;
  }
}

/** 完整同步：拉取比对 + 按需推送（last-write-wins）；forcePush 跳过比对直接覆盖云端（版本恢复后使用） */
export async function syncNow(
  reason = 'manual',
  opts: { forcePush?: boolean } = {},
): Promise<'pushed' | 'pulled' | 'skip' | 'disabled'> {
  const cfg = loadSyncConfig();
  applyCfg(cfg);
  if (!cfg || !cfg.enabled) return 'disabled';
  const store = usePlannerStore();
  syncState.status = 'busy';
  syncState.lastError = '';
  try {
    let gistId = cfg.gistId;
    const local: AppData = {
      version: store.plans.length ? 3 : 3,
      plans: store.plans,
      schedules: store.schedules,
      lastPlanId: store.currentPlanId,
    };
    if (!gistId) {
      gistId = await findOrCreateGist(cfg.token, JSON.stringify(toPayload(local), null, 2));
      saveSyncConfig({ ...cfg, gistId });
      syncState.gistId = gistId;
      syncState.status = 'ok';
      markSynced();
      return 'pushed';
    }
    const remote = opts.forcePush ? null : await readGist(cfg.token, gistId); // 强推模式跳过拉取比对
    const localMtime = localMaxUpdated(local);
    const remoteMtime = remote ? Math.max(remote.exportedAt, localMaxUpdated(remote)) : 0;
    if (!opts.forcePush && remote && remoteMtime > localMtime) {
      applyRemote(remote);
      syncState.status = 'ok';
      markSynced();
      if (reason === 'auto') toast('已从云端拉取更新');
      return 'pulled';
    }
    if (!remote || localMtime >= remoteMtime) {
      await gh(`/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(toPayload(local), null, 2) } } }) }, cfg.token);
      syncState.status = 'ok';
      markSynced();
      return 'pushed';
    }
    syncState.status = 'ok';
    return 'skip';
  } catch (e) {
    syncState.status = 'error';
    syncState.lastError = e instanceof Error ? e.message : String(e);
    return 'skip';
  }
}

function markSynced(): void {
  const cfg = loadSyncConfig();
  if (cfg) {
    cfg.lastSyncAt = Date.now();
    saveSyncConfig(cfg);
    syncState.lastSyncAt = cfg.lastSyncAt;
  }
}

/** 本地保存后调度推送（防抖；应用远端数据期间不回推） */
export function schedulePush(): void {
  const cfg = loadSyncConfig();
  if (!cfg || !cfg.enabled || applyingRemote) return;
  syncState.status = 'pending';
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void syncNow('auto');
  }, PUSH_DEBOUNCE);
}

/** 应用启动时挂载：初始拉取 + 前台/联网恢复拉取 */
export function installAutoSync(): void {
  const cfg = loadSyncConfig();
  applyCfg(cfg);
  if (!cfg || !cfg.enabled) return;
  setTimeout(() => void syncNow('auto'), 1200);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - (cfg.lastSyncAt ?? 0) > 60_000) void syncNow('auto');
  });
  window.addEventListener('online', () => void syncNow('auto'));
}

/** 设置/更新同步配置 */
export async function enableSync(token: string): Promise<void> {
  await verifyToken(token); // 校验失败抛错
  saveSyncConfig({ token, gistId: '', enabled: true, lastSyncAt: null });
}

export function setSyncEnabled(v: boolean): void {
  const cfg = loadSyncConfig();
  if (!cfg) return;
  saveSyncConfig({ ...cfg, enabled: v });
  applyCfg(loadSyncConfig());
}

export function disableSyncForever(): void {
  localStorage.removeItem(LS_KEY);
  applyCfg(null);
  syncState.status = 'idle';
}
