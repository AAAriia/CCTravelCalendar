import { DAY_MIN, SLOT } from '@/constants';

export const pad = (n: number): string => String(n).padStart(2, '0');

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Date → 本地时区 ISO 日期串 YYYY-MM-DD */
export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM-DD → Date（本地时区，避免 UTC 偏移问题） */
export const parseISO = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** 所在周的周一 00:00（口径 §4.1：周一为一周第一天） */
export const mondayOf = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** 'HH:mm' → 分钟数 */
export const hhToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** 分钟数 → 'HH:mm' */
export const minToHH = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** 分钟 → 像素（30 分钟一格 × 44px） */
export const yOfMin = (m: number): number => (m / SLOT) * 44;

/** 像素 → 四舍五入吸附到 30 分钟刻度（口径 §4.3：09:14→09:00，09:16→09:30） */
export const snapY = (y: number): number => Math.round(y / 44) * SLOT;

/** 'HH:mm' → 向下对齐 30 分钟（口径 §4.3：手动输入 09:20 → 09:00） */
export const floorToSlot = (t: string): string => minToHH(Math.floor(hhToMin(t) / SLOT) * SLOT);

/** 拖拽落点的日末钳制：保持时长不变，开始时间最晚 1440-时长（口径 §4.4） */
export const clampStart = (startMin: number, durMin: number): number =>
  clamp(startMin, 0, DAY_MIN - durMin);

/** 手动编辑后的钳制（口径 §4.4 日末截断）：保持用户所选开始时间，截断时长至 24:00；最小时长 30 */
export function clampPlacement(startMin: number, durMin: number): { startMin: number; durMin: number } {
  let start = clamp(startMin, 0, DAY_MIN - SLOT); // 开始时间最晚 23:30
  let dur = clamp(durMin, 30, DAY_MIN - start); // 结束不越过 24:00 → 截断时长
  if (dur < SLOT) {
    dur = SLOT;
    start = clamp(start, 0, DAY_MIN - dur);
  }
  return { startMin: start, durMin: dur };
}

/** 校验 ISO 日期串 */
export const isValidIso = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());

/** 校验 HH:mm */
export const isValidHHmm = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/* ===== 凌晨折叠带（口径 §4.1a）：02:00-07:00 默认折叠，展开记忆 ===== */
export const NIGHT_START = 120; // 02:00
export const NIGHT_END = 420; // 07:00
export const NIGHT_COLLAPSED_H = 28; // 折叠条像素高度

/** 分钟 → 像素（含折叠映射）；折叠带内部线性映射到折叠条（供落点判定） */
export function minToY(m: number, nightCollapsed: boolean): number {
  if (!nightCollapsed) return yOfMin(m);
  if (m <= NIGHT_START) return yOfMin(m);
  if (m >= NIGHT_END) return yOfMin(NIGHT_START) + NIGHT_COLLAPSED_H + yOfMin(m - NIGHT_END);
  const ratio = (m - NIGHT_START) / (NIGHT_END - NIGHT_START);
  return yOfMin(NIGHT_START) + ratio * NIGHT_COLLAPSED_H;
}

/** 像素 → 分钟（minToY 的逆映射；折叠条区域映射回 02:00-07:00） */
export function yToMin(y: number, nightCollapsed: boolean): number {
  if (!nightCollapsed) return (y / 44) * 30;
  const yA = yOfMin(NIGHT_START);
  const yB = yA + NIGHT_COLLAPSED_H;
  if (y <= yA) return (y / 44) * 30;
  if (y >= yB) return NIGHT_END + ((y - yB) / 44) * 30;
  const ratio = (y - yA) / NIGHT_COLLAPSED_H;
  return NIGHT_START + ratio * (NIGHT_END - NIGHT_START);
}

/** 网格总高（折叠时 = 176 + 28 + 1496 = 1700px） */
export const gridTotalH = (nightCollapsed: boolean): number =>
  nightCollapsed
    ? yOfMin(NIGHT_START) + NIGHT_COLLAPSED_H + yOfMin(DAY_MIN - NIGHT_END)
    : yOfMin(DAY_MIN);

/** 手动输入向下对齐（口径 §4.3：5 分钟步进；拖拽吸附仍为 30 分钟） */
export const floorToStep = (t: string, step = 5): string =>
  minToHH(Math.floor(hhToMin(t) / step) * step);
