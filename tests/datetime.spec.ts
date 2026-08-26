import { describe, expect, it } from 'vitest';
import {
  addDays,
  clampPlacement,
  clampStart,
  floorToSlot,
  hhToMin,
  isoOf,
  minToHH,
  mondayOf,
  parseISO,
  snapY,
} from '@/utils/datetime';

describe('datetime 口径（口径文档 §4）', () => {
  it('ISO 与 Date 互转（本地时区，无 UTC 偏移）', () => {
    expect(isoOf(parseISO('2026-08-26'))).toBe('2026-08-26');
    expect(isoOf(new Date(2026, 7, 26))).toBe('2026-08-26');
  });

  it('mondayOf：周一为一周第一天', () => {
    expect(isoOf(mondayOf(parseISO('2026-08-26')))).toBe('2026-08-24'); // 周三 → 周一
    expect(isoOf(mondayOf(parseISO('2026-08-24')))).toBe('2026-08-24'); // 周一 → 自身
    expect(isoOf(mondayOf(parseISO('2026-08-30')))).toBe('2026-08-24'); // 周日 → 本周周一
    expect(isoOf(mondayOf(parseISO('2026-08-31')))).toBe('2026-08-31'); // 下周一
  });

  it('addDays 跨月', () => {
    expect(isoOf(addDays(parseISO('2026-08-31'), 1))).toBe('2026-09-01');
    expect(isoOf(addDays(parseISO('2026-09-01'), -1))).toBe('2026-08-31');
  });

  it('HH:mm ↔ 分钟', () => {
    expect(hhToMin('08:30')).toBe(510);
    expect(hhToMin('23:59')).toBe(1439);
    expect(minToHH(510)).toBe('08:30');
    expect(minToHH(0)).toBe('00:00');
    expect(minToHH(1440)).toBe('24:00');
  });

  it('snapY：像素四舍五入吸附到 30 分钟（09:14→09:00，09:16→09:30）', () => {
    expect(snapY(0)).toBe(0);
    expect(snapY(22)).toBe(30); // 0.5 格 → 进位
    expect(snapY(21)).toBe(0);
    expect(snapY(858)).toBe(600); // 19.5 格 → 进位到 20 格
    expect(snapY(857)).toBe(570); // 19.47 格 → 19 格
    expect(snapY(860)).toBe(600);
  });

  it('floorToSlot：手动输入向下对齐（09:20→09:00）', () => {
    expect(floorToSlot('09:20')).toBe('09:00');
    expect(floorToSlot('09:30')).toBe('09:30');
    expect(floorToSlot('23:59')).toBe('23:30');
    expect(floorToSlot('00:00')).toBe('00:00');
  });

  it('clampStart：拖拽落点日末截断（保持时长）', () => {
    expect(clampStart(600, 90)).toBe(600);
    expect(clampStart(1420, 600)).toBe(840); // 10 小时日程最晚 14:00 开始
    expect(clampStart(-10, 60)).toBe(0);
    expect(clampStart(1420, 30)).toBe(1410); // 30 分钟日程最晚 23:30
  });

  it('clampPlacement：保持开始时间、截断时长至 24:00、最小时长 30（口径 §4.4）', () => {
    expect(clampPlacement(1380, 90)).toEqual({ startMin: 1380, durMin: 60 }); // 23:00 开始 → 时长截为 1h
    expect(clampPlacement(1430, 90)).toEqual({ startMin: 1410, durMin: 30 }); // 开始最晚 23:30
    expect(clampPlacement(600, 10)).toEqual({ startMin: 600, durMin: 30 }); // 最小时长
  });
});
