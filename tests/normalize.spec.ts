import { describe, expect, it } from 'vitest';
import { normalizeSchedule, uid } from '@/data/normalize';

describe('normalizeSchedule 脏数据防御', () => {
  it('空对象 → 全默认值', () => {
    const s = normalizeSchedule({}, 'p1');
    expect(s.title).toBe('未命名日程');
    expect(s.type).toBe('sight');
    expect(s.date).toBeNull();
    expect(s.startTime).toBeNull();
    expect(s.durationMin).toBe(60);
    expect(s.price).toBeNull();
    expect(s.planId).toBe('p1');
    expect(s.id).toMatch(/^sch_/);
  });

  it('口径 §3.3：有日期无时间 / 有时间无日期 → 两者均置空', () => {
    expect(normalizeSchedule({ date: '2026-08-26' }, 'p1').date).toBeNull();
    const s2 = normalizeSchedule({ startTime: '09:00' }, 'p1');
    expect(s2.startTime).toBeNull();
    expect(s2.date).toBeNull();
  });

  it('非法枚举 / 非法时间 / 负价格回退', () => {
    const s = normalizeSchedule(
      { type: 'xxx', startTime: '25:00', price: -5, durationMin: 99999 },
      'p1',
    );
    expect(s.type).toBe('sight');
    expect(s.startTime).toBeNull();
    expect(s.price).toBeNull();
    expect(s.durationMin).toBe(1440);
  });

  it('title 截断 30 字、note 200 字、location 30 字', () => {
    const s = normalizeSchedule(
      { title: 'a'.repeat(50), note: 'b'.repeat(300), location: 'c'.repeat(50) },
      'p1',
    );
    expect(s.title.length).toBe(30);
    expect(s.note.length).toBe(200);
    expect(s.location.length).toBe(30);
  });

  it('合法数据原样保留', () => {
    const s = normalizeSchedule(
      { title: ' 西湖游船 ', type: 'food', date: '2026-08-26', startTime: '09:00', durationMin: 120, price: 120.5, expectedDate: '2026-08-27' },
      'p1',
    );
    expect(s.title).toBe('西湖游船');
    expect(s.type).toBe('food');
    expect(s.date).toBe('2026-08-26');
    expect(s.startTime).toBe('09:00');
    expect(s.durationMin).toBe(120);
    expect(s.price).toBe(120.5);
    expect(s.expectedDate).toBe('2026-08-27');
  });

  it('varianceUp/Down：≥0 两位小数，非法回退 null', () => {
    expect(normalizeSchedule({ varianceUp: 500 }, 'p1').varianceUp).toBe(500);
    expect(normalizeSchedule({ varianceDown: 220.5 }, 'p1').varianceDown).toBe(220.5);
    expect(normalizeSchedule({ varianceUp: 'abc' }, 'p1').varianceUp).toBeNull();
    expect(normalizeSchedule({}, 'p1').varianceUp).toBeNull();
    expect(normalizeSchedule({}, 'p1').varianceDown).toBeNull();
  });

  it('address/lat/lon：地图选点字段默认与校验', () => {
    const s = normalizeSchedule({ address: 'Naha Airport · Okinawa', lat: 26.2085, lon: 127.6845 }, 'p1');
    expect(s.address).toBe('Naha Airport · Okinawa');
    expect(s.lat).toBe(26.2085);
    expect(s.lon).toBe(127.6845);
    const d = normalizeSchedule({}, 'p1');
    expect(d.address).toBe('');
    expect(d.lat).toBeNull();
    expect(d.lon).toBeNull();
    expect(normalizeSchedule({ address: 'x'.repeat(100) }, 'p1').address.length).toBe(80);
    expect(normalizeSchedule({ lat: 'abc' as unknown as number }, 'p1').lat).toBeNull();
  });

  it('uid 唯一性', () => {
    const set = new Set(Array.from({ length: 200 }, () => uid()));
    expect(set.size).toBe(200);
  });
});
