import { describe, expect, it } from 'vitest';
import { layoutOverlap } from '@/utils/layout';
import type { Schedule } from '@/types';

const mk = (id: string, startTime: string, durationMin: number): Schedule => ({
  id,
  planId: 'p1',
  title: id,
  type: 'sight',
  location: '',
  date: '2026-08-26',
  startTime,
  durationMin,
  expectedDate: null,
  price: null,
  varianceUp: null,
  varianceDown: null,
  confirmed: false,
  sortOrder: null,
  expenseType: 'required' as const,
  paidAmount: null,
  note: '',
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
});

describe('layoutOverlap 重叠并排（口径文档 §4.5）', () => {
  it('无重叠：各自成簇，lanes=1', () => {
    const r = layoutOverlap([mk('a', '09:00', 60), mk('b', '11:00', 60)]);
    expect(r.map((x) => [x.schedule.id, x.lane, x.lanes])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('两卡重叠：同簇两道并排', () => {
    const r = layoutOverlap([mk('a', '10:00', 90), mk('b', '10:30', 60)]);
    expect(r.map((x) => [x.schedule.id, x.lane, x.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
  });

  it('三卡链式重叠：贪心分道复用空道', () => {
    // a: 600-690, b: 630-720, c: 700-760 → c 与 a 不重叠，回到道 0
    const r = layoutOverlap([mk('a', '10:00', 90), mk('b', '10:30', 90), mk('c', '11:40', 60)]);
    expect(r.map((x) => [x.schedule.id, x.lane, x.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ]);
  });

  it('按开始时间排序（乱序输入）', () => {
    const r = layoutOverlap([mk('late', '14:00', 30), mk('early', '08:00', 30)]);
    expect(r.map((x) => x.schedule.id)).toEqual(['early', 'late']);
  });

  it('完全同刻三卡：三道', () => {
    const r = layoutOverlap([mk('a', '09:00', 60), mk('b', '09:00', 60), mk('c', '09:00', 60)]);
    expect(r.every((x) => x.lanes === 3)).toBe(true);
    expect(new Set(r.map((x) => x.lane)).size).toBe(3);
  });
});
