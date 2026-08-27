import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlannerStore } from '@/stores/planner';
import {
  disableSyncForever,
  loadSyncConfig,
  schedulePush,
  syncNow,
  syncState,
} from '@/sync/gistSync';

const T = 'ghq_test_token';

function okJson(body: unknown, status = 200): Response {
  return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** 构造远端 Gist 响应 */
const gistWith = (payload: unknown): unknown => ({ id: 'G1', files: { 'tp-sync.json': { content: JSON.stringify(payload) } } });

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
});
afterEach(() => {
  disableSyncForever();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Gist 云同步（口径 §18：last-write-wins）', () => {
  it('未配置 → disabled', async () => {
    expect(loadSyncConfig()).toBeNull();
    expect(await syncNow()).toBe('disabled');
  });

  it('无远端数据（本地较新）→ 推送 PATCH', async () => {
    const store = usePlannerStore();
    await store.init();
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const u = String(url);
      calls.push({ method: init.method ?? 'GET', url: u, body: init.body ? JSON.parse(init.body as string) : undefined });
      if (u.endsWith('/user')) return okJson({ login: 'aaariia' });
      if (u.includes('/gists/G1')) return okJson({ id: 'G1', files: { 'tp-sync.json': { content: '' } } }); // 空远端
      return okJson([]);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    localStorage.setItem('tp_sync_cfg', JSON.stringify({ token: T, gistId: 'G1', enabled: true, lastSyncAt: null }));
    const r = await syncNow('manual');
    expect(r).toBe('pushed');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(patch!.url).toContain('/gists/G1');
    const content = JSON.parse(
      (patch!.body as { files: Record<string, { content: string }> }).files['tp-sync.json']!.content,
    );
    expect(content.app).toBe('travel-planner');
    expect(content.schedules.length).toBe(9);
  });

  it('远端较新 → 拉取并应用（覆盖本地）', async () => {
    const store = usePlannerStore();
    await store.init();
    const remote = {
      app: 'travel-planner',
      version: 3,
      exportedAt: Date.now() + 5000, // 比"未来"还新，必胜
      lastPlanId: 'pA',
      plans: [{ id: 'pA', name: '云端行程', createdAt: 1, updatedAt: Date.now() + 9000 }],
      schedules: [
        {
          id: 'sX', planId: 'pA', title: '云端日程', type: 'food', location: '', date: '2026-12-25',
          startTime: '12:00', durationMin: 60, expectedDate: null, price: 100, varianceUp: null,
          varianceDown: null, confirmed: true, expenseType: 'required', paidAmount: null, sortOrder: null,
          note: '', deletedAt: null, createdAt: 1, updatedAt: Date.now() + 9000,
        },
      ],
    };
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/user')) return okJson({ login: 'aaariia' });
      if (u.includes('/gists/G1')) return okJson(gistWith(remote));
      return okJson([]);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    localStorage.setItem('tp_sync_cfg', JSON.stringify({ token: T, gistId: 'G1', enabled: true, lastSyncAt: null }));
    const r = await syncNow('manual');
    expect(r).toBe('pulled');
    expect(store.plans).toHaveLength(1);
    expect(store.plans[0]!.name).toBe('云端行程');
    expect(store.schedules).toHaveLength(1);
    expect(store.schedules[0]!.title).toBe('云端日程');
    expect(syncState.status).toBe('ok');
  });

  it('Token 无效 → 错误状态，不崩溃', async () => {
    localStorage.setItem('tp_sync_cfg', JSON.stringify({ token: T, gistId: 'G1', enabled: true, lastSyncAt: null }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ message: 'Bad credentials' }, 401)),
    );
    const r = await syncNow('manual');
    expect(r).toBe('skip');
    expect(syncState.status).toBe('error');
    expect(syncState.lastError).toContain('401');
  });

  it('schedulePush 防抖 3 秒后触发同步', async () => {
    localStorage.setItem('tp_sync_cfg', JSON.stringify({ token: T, gistId: 'G1', enabled: true, lastSyncAt: null }));
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/gists/G1')) return okJson({ id: 'G1', files: { 'tp-sync.json': { content: '' } } });
      return okJson([]);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    schedulePush();
    expect(syncState.status).toBe('pending');
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3100);
    expect(fetchMock).toHaveBeenCalled();
  });
});
