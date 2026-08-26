import { describe, expect, it } from 'vitest';
import { fmtPriceRange, priceRange } from '@/utils/price';
import { normalizeSchedule } from '@/data/normalize';

describe('金额波动区间（口径 §8：区间 = [金额 − 下浮, 金额 + 上浮]，下限不低于 0）', () => {
  it('仅上浮：[金额, 金额+up]', () => {
    expect(priceRange(2553, 500, null)).toEqual({ min: 2553, max: 3053 }); // HK-冲绳机票
    expect(priceRange(81, 69, null)).toEqual({ min: 81, max: 150 }); // 大巴 81 ~ 快线 150
    expect(priceRange(1200, 300, null)).toEqual({ min: 1200, max: 1500 }); // 吃饭
  });

  it('仅下浮：[金额-down, 金额]', () => {
    expect(priceRange(748, null, 220)).toEqual({ min: 528, max: 748 }); // 宫古机票
  });

  it('同时上浮 + 下浮', () => {
    expect(priceRange(1000, 300, 200)).toEqual({ min: 800, max: 1300 });
    expect(priceRange(500, 500, 500)).toEqual({ min: 0, max: 1000 });
  });

  it('金额为空 + 波动：[0, up]', () => {
    expect(priceRange(null, 500, null)).toEqual({ min: 0, max: 500 }); // 本岛北部交通
    expect(priceRange(null, null, 300)).toEqual({ min: 0, max: 0 }); // 空金额下浮无意义 → 0
  });

  it('下限钳制不低于 0；负输入按 0 处理', () => {
    expect(priceRange(100, null, 300)).toEqual({ min: 0, max: 100 });
    expect(priceRange(100, -50, -20)).toEqual({ min: 100, max: 100 });
  });

  it('无波动：min = max', () => {
    expect(priceRange(294, null, null)).toEqual({ min: 294, max: 294 });
    expect(priceRange(null, null, null)).toEqual({ min: 0, max: 0 });
  });

  it('展示格式', () => {
    expect(fmtPriceRange(294, null, null)).toBe('¥294');
    expect(fmtPriceRange(2553, 500, null)).toBe('¥2,553~3,053');
    expect(fmtPriceRange(748, null, 220)).toBe('¥528~748');
    expect(fmtPriceRange(1000, 300, 200)).toBe('¥800~1,300');
    expect(fmtPriceRange(null, null, null)).toBe('');
    expect(fmtPriceRange(null, 500, null)).toBe('¥0~500');
  });
});

describe('旧版带符号 priceVariance 自动迁移（v1.2 → v1.3）', () => {
  it('正数迁移为上浮，负数迁移为下浮', () => {
    expect(normalizeSchedule({ price: 2553, priceVariance: 500 }, 'p1')).toMatchObject({
      price: 2553,
      varianceUp: 500,
      varianceDown: null,
    });
    expect(normalizeSchedule({ price: 748, priceVariance: -220 }, 'p1')).toMatchObject({
      varianceUp: null,
      varianceDown: 220,
    });
    expect(normalizeSchedule({ price: 294, priceVariance: 0 }, 'p1')).toMatchObject({
      varianceUp: null,
      varianceDown: null,
    });
  });

  it('新字段直接生效；非法回退 null', () => {
    expect(normalizeSchedule({ varianceUp: 300.5, varianceDown: 100 }, 'p1')).toMatchObject({
      varianceUp: 300.5,
      varianceDown: 100,
    });
    expect(normalizeSchedule({ varianceUp: 'x' }, 'p1').varianceUp).toBeNull();
    expect(normalizeSchedule({ varianceUp: -5 }, 'p1').varianceUp).toBeNull();
  });
});
