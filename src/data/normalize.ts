import type { ExpenseType, Schedule, ScheduleType } from '@/types';
import { TYPE_MAP } from '@/constants';
import { clamp } from '@/utils/datetime';

let seq = 0;
/** 生成唯一 ID：前缀_ + 时间戳36进制 + 随机串 */
export const uid = (prefix = 'sch'): string =>
  `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 上浮/下浮幅度（≥0，两位小数）；缺省时从旧版带符号 priceVariance 迁移（正→上浮，负→下浮） */
function parseMag(v: unknown, legacyVariance: unknown, dir: 'up' | 'down'): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100;
  if (v === 0) return null;
  if (typeof legacyVariance === 'number' && Number.isFinite(legacyVariance)) {
    if (dir === 'up' && legacyVariance > 0) return Math.round(legacyVariance * 100) / 100;
    if (dir === 'down' && legacyVariance < 0) return Math.round(-legacyVariance * 100) / 100;
  }
  return null;
}
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 将任意来源（localStorage / 导入 JSON / 种子）的日程对象规范化为合法 Schedule。
 * 任何字段非法时回退默认值，保证不产生脏数据（口径文档 §9）。
 */
export function normalizeSchedule(raw: Record<string, unknown>, planId: string): Schedule {
  const type: ScheduleType =
    typeof raw.type === 'string' && raw.type in TYPE_MAP ? (raw.type as ScheduleType) : 'sight';
  let date = typeof raw.date === 'string' && ISO_RE.test(raw.date) ? raw.date : null;
  let startTime = typeof raw.startTime === 'string' && HHMM_RE.test(raw.startTime) ? raw.startTime : null;
  // 口径 §3.3：date 与 startTime 必须同时有值或同时为空
  if (!date || !startTime) {
    date = null;
    startTime = null;
  }
  const priceRaw = raw.price;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    planId,
    title:
      typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 30) : '未命名日程',
    type,
    location: typeof raw.location === 'string' ? raw.location.trim().slice(0, 30) : '',
    date,
    startTime,
    durationMin: clamp(Number(raw.durationMin) || 60, 30, 1440),
    expectedDate:
      typeof raw.expectedDate === 'string' && ISO_RE.test(raw.expectedDate) ? raw.expectedDate : null,
    price:
      typeof priceRaw === 'number' && Number.isFinite(priceRaw) && priceRaw >= 0
        ? Math.round(priceRaw * 100) / 100
        : null,
    varianceUp: parseMag(raw.varianceUp, raw.priceVariance, 'up'),
    varianceDown: parseMag(raw.varianceDown, raw.priceVariance, 'down'),
    confirmed: raw.confirmed === true,
    expenseType: raw.expenseType === 'optional' ? 'optional' : ('required' as ExpenseType),
    paidAmount:
      typeof raw.paidAmount === 'number' && Number.isFinite(raw.paidAmount) && raw.paidAmount >= 0
        ? Math.round(raw.paidAmount * 100) / 100
        : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 200) : '',
    deletedAt: typeof raw.deletedAt === 'number' && raw.deletedAt > 0 ? raw.deletedAt : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}
