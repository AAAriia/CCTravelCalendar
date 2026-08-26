import type { Schedule, ScheduleType } from '@/types';
import { TYPE_MAP } from '@/constants';
import { clamp } from '@/utils/datetime';

let seq = 0;
/** 生成唯一 ID：前缀_ + 时间戳36进制 + 随机串 */
export const uid = (prefix = 'sch'): string =>
  `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
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
    priceVariance:
      typeof raw.priceVariance === 'number' && Number.isFinite(raw.priceVariance)
        ? Math.round(raw.priceVariance * 100) / 100
        : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 200) : '',
    deletedAt: typeof raw.deletedAt === 'number' && raw.deletedAt > 0 ? raw.deletedAt : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}
