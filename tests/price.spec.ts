import { describe, expect, it } from 'vitest';
import { fmtPriceRange, priceRange } from '@/utils/price';

describe('金额波动区间（口径 §8：正=上浮 / 负=下浮，下限不低于 0）', () => {
  it('正波动：[金额, 金额+v]（上浮）', () => {
    expect(priceRange(2553, 500)).toEqual({ min: 2553, max: 3053 }); // HK-冲绳机票
    expect(priceRange(81, 69)).toEqual({ min: 81, max: 150 }); // 大巴 40.5×2 ~ 快线 75×2
    expect(priceRange(1200, 300)).toEqual({ min: 1200, max: 1500 }); // 吃饭
  });

  it('负波动：[金额+v, 金额]（下浮）', () => {
    expect(priceRange(748, -220)).toEqual({ min: 528, max: 748 }); // 宫古机票
  });

  it('金额为空 + 波动：[0, v]', () => {
    expect(priceRange(null, 500)).toEqual({ min: 0, max: 500 }); // 本岛北部交通
  });

  it('下限钳制不低于 0', () => {
    expect(priceRange(100, -300)).toEqual({ min: 0, max: 100 });
  });

  it('无波动：min = max', () => {
    expect(priceRange(294, null)).toEqual({ min: 294, max: 294 });
    expect(priceRange(null, null)).toEqual({ min: 0, max: 0 });
  });

  it('展示格式：无波动单值 / 有波动区间', () => {
    expect(fmtPriceRange(294, null)).toBe('¥294');
    expect(fmtPriceRange(2553, 500)).toBe('¥2,553~3,053');
    expect(fmtPriceRange(748, -220)).toBe('¥528~748');
    expect(fmtPriceRange(null, null)).toBe('');
    expect(fmtPriceRange(null, 500)).toBe('¥0~500');
  });
});
