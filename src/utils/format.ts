import { WEEK_CN } from '@/constants';
import { parseISO } from './datetime';

/** YYYY-MM-DD → 'M/D'（如 8/26） */
export const fmtShort = (iso: string | null): string =>
  iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '';

/** YYYY-MM-DD → '8/26 周三'（预计日期分组组头） */
export const fmtShortWeek = (iso: string): string => {
  const d = parseISO(iso);
  return `${fmtShort(iso)} 周${WEEK_CN[d.getDay()]}`;
};

/** 金额：¥1,200；null → 空串 */
export const fmtMoney = (n: number | null): string =>
  n == null ? '' : '¥' + n.toLocaleString('zh-CN');

/** 时长标签：30 分钟 / 1 小时 / 1.5 小时 */
export const durLabel = (m: number): string =>
  m < 60 ? `${m} 分钟` : m % 60 === 0 ? `${m / 60} 小时` : `${(m / 60).toFixed(1)} 小时`;

/** 周范围标题：2026年8月24日 - 8月30日 */
export const weekRangeLabel = (a: Date, b: Date): string =>
  `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 - ${b.getMonth() + 1}月${b.getDate()}日`;

/** 相对删除时间：刚刚 / n 分钟前 / M/D HH:mm */
export const fmtDeletedAt = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};
