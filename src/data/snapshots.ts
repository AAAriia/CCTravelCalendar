import type { AppData } from '@/types';

/**
 * 数据版本快照（口径 §19）：
 * - 存 localStorage 独立键 tp_snapshots，与主数据键互不影响
 * - 自动快照时机：云端覆盖前 / 导入前 / 恢复前 / 重置前；手动保存任意时刻
 * - 保留策略：最多 20 个且总预算 2MB，超出按最旧淘汰
 */

const KEY = 'tp_snapshots';
const CAP = 20;
const TOTAL_BUDGET = 2 * 1024 * 1024;

export type SnapshotSource = 'manual' | 'pre-sync-pull' | 'pre-import' | 'pre-restore' | 'pre-reset';

export interface Snapshot {
  id: string;
  at: number;
  source: SnapshotSource;
  label?: string;
  data: AppData;
}

export const SOURCE_LABEL: Record<SnapshotSource, string> = {
  manual: '手动',
  'pre-sync-pull': '同步前',
  'pre-import': '导入前',
  'pre-restore': '恢复前',
  'pre-reset': '重置前',
};

function readAll(): Snapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Snapshot[];
    return Array.isArray(arr) ? arr.filter((s) => s && s.id && s.data && Array.isArray(s.data.plans)) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Snapshot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 存储不可用则放弃本次快照（不影响主数据） */
  }
}

/** 按时间倒序列出 */
export function listSnapshots(): Snapshot[] {
  return readAll().sort((a, b) => b.at - a.at);
}

export function getSnapshot(id: string): Snapshot | undefined {
  return readAll().find((s) => s.id === id);
}

let seq = 0;
let lastAt = 0;
/** 保存快照（深拷贝入存），返回快照；超出容量按最旧淘汰 */
export function takeSnapshot(source: SnapshotSource, data: AppData, label?: string): Snapshot | null {
  const at = Math.max(Date.now(), lastAt + 1); // 单调递增：同毫秒连续快照也能稳定排序
  lastAt = at;
  const snap: Snapshot = {
    id: `snap_${at.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    at,
    source,
    label: label?.trim().slice(0, 30) || undefined,
    data: JSON.parse(JSON.stringify(data)) as AppData, // 深拷贝，隔离后续变更
  };
  const list = readAll();
  list.push(snap);
  // 容量与体积双重淘汰（按时间最旧优先）
  list.sort((a, b) => b.at - a.at);
  const kept = list.slice(0, CAP);
  while (kept.length > 1 && JSON.stringify(kept).length > TOTAL_BUDGET) kept.pop();
  writeAll(kept);
  return snap;
}

export function clearSnapshots(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}
