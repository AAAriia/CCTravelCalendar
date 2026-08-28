import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlannerStore } from '@/stores/planner';
import { listSnapshots, takeSnapshot } from '@/data/snapshots';
import type { AppData } from '@/types';

const mkData = (n: number): AppData => ({
  version: 3,
  plans: [{ id: `p${n}`, name: `行程${n}`, createdAt: n, updatedAt: n }],
  schedules: [],
  lastPlanId: `p${n}`,
});

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('版本快照存储（口径 §19）', () => {
  it('保存/列表（按时间倒序）/备注', () => {
    takeSnapshot('manual', mkData(1), '确定行程后');
    takeSnapshot('pre-import', mkData(2));
    const list = listSnapshots();
    expect(list).toHaveLength(2);
    expect(list[0]!.source).toBe('pre-import'); // 新的在前
    expect(list[1]!.label).toBe('确定行程后');
  });

  it('容量淘汰：最多 20 个，最旧先删', () => {
    for (let i = 0; i < 25; i++) takeSnapshot('manual', mkData(i));
    const list = listSnapshots();
    expect(list).toHaveLength(20);
    expect(list[list.length - 1]!.data.plans[0]!.name).toBe('行程5'); // 0-4 被淘汰
  });

  it('快照深拷贝：后续修改不影响已存快照', () => {
    const d = mkData(1);
    takeSnapshot('manual', d);
    d.plans[0]!.name = '改名后';
    expect(listSnapshots()[0]!.data.plans[0]!.name).toBe('行程1');
  });
});

describe('store · 版本恢复（口径 §19）', () => {
  it('restoreData：整体替换 + 恢复前自动快照（可反悔）', async () => {
    const store = await boot();
    expect(store.schedules).toHaveLength(9);
    const ok = store.restoreData({
      plans: [{ id: 'pB', name: '恢复的行程', createdAt: 1, updatedAt: 1 }],
      schedules: [],
      lastPlanId: 'pB',
    });
    expect(ok).toBe(true);
    expect(store.plans).toHaveLength(1);
    expect(store.plans[0]!.name).toBe('恢复的行程');
    expect(store.schedules).toHaveLength(0);
    // 恢复前快照保留原数据
    const pre = listSnapshots().find((s) => s.source === 'pre-restore')!;
    expect(pre).toBeTruthy();
    expect(pre.data.schedules).toHaveLength(9);
  });

  it('restoreSnapshotById：恢复到快照内容', async () => {
    const store = await boot();
    store.saveSnapshot('恢复点');
    store.cancelSchedule(store.schedules.find((s) => s.title.includes('吃饭'))!.id);
    expect(store.schedules.find((s) => s.title.includes('吃饭'))!.date).toBeNull();
    const snap = listSnapshots().find((s) => s.label === '恢复点')!;
    expect(store.restoreSnapshotById(snap.id)).toBe(true);
    expect(store.schedules.find((s) => s.title.includes('吃饭'))!.date).not.toBeNull(); // 回到恢复点
  });

  it('restoreData 非法数据返回 false 不产生副作用', async () => {
    const store = await boot();
    expect(store.restoreData({ plans: [], schedules: [] })).toBe(false);
    expect(store.restoreData({ plans: 'x', schedules: [] } as unknown as never)).toBe(false);
    expect(store.schedules).toHaveLength(9);
  });

  it('resetToSeed 前自动快照', async () => {
    const store = await boot();
    await store.resetToSeed();
    const pre = listSnapshots().find((s) => s.source === 'pre-reset');
    expect(pre).toBeTruthy();
    expect(pre!.data.schedules).toHaveLength(9);
  });
});

describe('gistSync · 恢复后强制推送', () => {
  it('forcePush 跳过拉取比对，远端较新也执行 PATCH', async () => {
    const store = await boot();
    const future = Date.now() + 99999;
    const remote = {
      app: 'travel-planner',
      exportedAt: future,
      plans: [{ id: 'pR', name: '远端', createdAt: 1, updatedAt: future }],
      schedules: [],
      lastPlanId: 'pR',
    };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init: RequestInit = {}) => {
        const u = String(url);
        calls.push(`${init.method ?? 'GET'} ${u.includes('/gists/G1') ? 'gist' : 'other'}`);
        return { ok: true, status: 200, json: async () => (u.includes('/gists/G1') ? { files: { 'tp-sync.json': { content: JSON.stringify(remote) } } } : []), text: async () => '' } as unknown as Response;
      }),
    );
    localStorage.setItem('tp_sync_cfg', JSON.stringify({ token: 'T', gistId: 'G1', enabled: true, lastSyncAt: null }));
    const { syncNow } = await import('@/sync/gistSync');
    // 普通模式：远端较新 → 拉取覆盖
    const r1 = await syncNow('manual');
    expect(r1).toBe('pulled');
    expect(store.plans[0]!.name).toBe('远端');
    // forcePush：跳过比对直接推本地
    const r2 = await syncNow('manual', { forcePush: true });
    expect(r2).toBe('pushed');
    expect(calls.filter((c) => c.startsWith('PATCH')).length).toBe(1);
    vi.unstubAllGlobals();
  });
});

async function boot() {
  const store = usePlannerStore();
  await store.init();
  return store;
}
