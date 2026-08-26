import type { AppData, Plan, Schedule } from '@/types';
import { SCHEMA_VERSION, STORAGE_KEY } from '@/constants';
import type { DataRepository } from './repository';
import { normalizeSchedule } from './normalize';

/**
 * localStorage 实现（口径文档 §9 持久化口径）。
 * - 单键存储全量 JSON，带 version 字段
 * - 读取时逐条 normalize，坏数据回退默认值，不抛异常
 * - 存储不可用（隐私模式 / 配额满）时静默降级为内存模式
 */
export class LocalRepository implements DataRepository {
  /** 内存模式：仅当 localStorage 不可用（隐私模式/配额满）时启用 */
  private memory: AppData | null = null;
  private useMemory: boolean | null = null;

  private storageUnavailable(): boolean {
    if (this.useMemory === null) {
      try {
        const probe = '__tp_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        this.useMemory = false;
      } catch {
        this.useMemory = true;
      }
    }
    return this.useMemory;
  }

  async load(): Promise<AppData | null> {
    const data = this.readRaw();
    if (!data) return null;
    return this.migrate(data);
  }

  async save(data: AppData): Promise<void> {
    this.memory = data;
    if (this.storageUnavailable()) return; // 内存模式，刷新后回到种子数据
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      this.useMemory = true;
    }
  }

  async clear(): Promise<void> {
    this.memory = null;
    if (this.storageUnavailable()) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 同上 */
    }
  }

  private readRaw(): Omit<AppData, 'schedules'> & { schedules?: unknown } | null {
    try {
      if (this.storageUnavailable()) {
        return this.memory ? (JSON.parse(JSON.stringify(this.memory)) as AppData) : null;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed !== 'object' || parsed === null) return null;
      return parsed as Omit<AppData, 'schedules'> & { schedules?: unknown };
    } catch {
      return null; // 解析失败视同无数据（口径 §9）
    }
  }

  /** 版本迁移链：当前仅 v1；未来 v1→v2→… 逐级迁移 */
  private migrate(raw: Omit<AppData, 'schedules'> & { schedules?: unknown }): AppData {
    const plans: Plan[] = Array.isArray(raw.plans)
      ? raw.plans
          .filter((p): p is Plan => typeof p === 'object' && p !== null && typeof p.id === 'string')
          .map((p) => ({
            id: p.id,
            name: typeof p.name === 'string' ? p.name.slice(0, 30) : '未命名行程',
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
            updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
          }))
      : [];

    // 日程归属校验：planId 必须指向已知行程，否则挂到第一个行程
    const fallbackPlan = plans[0]?.id ?? '';
    const schedules: Schedule[] = Array.isArray(raw.schedules)
      ? raw.schedules
          .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
          .map((s) => {
            const pid = typeof s.planId === 'string' && plans.some((p) => p.id === s.planId)
              ? s.planId
              : fallbackPlan;
            return normalizeSchedule(s, pid);
          })
      : [];

    return {
      version: SCHEMA_VERSION,
      plans,
      schedules,
      lastPlanId:
        typeof raw.lastPlanId === 'string' && plans.some((p) => p.id === raw.lastPlanId)
          ? raw.lastPlanId
          : (plans[0]?.id ?? null),
    };
  }
}
