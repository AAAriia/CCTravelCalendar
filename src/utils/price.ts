/** 金额波动区间（口径 §8）：v>0 上浮 / v<0 下浮；下限不低于 0 */
export function priceRange(price: number | null, variance: number | null): { min: number; max: number } {
  const p = price ?? 0;
  const v = variance ?? 0;
  return {
    min: Math.max(0, p + Math.min(v, 0)),
    max: Math.max(0, p + Math.max(v, 0)),
  };
}

/** 千分位金额 */
const money = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

/** 单条展示：无波动 "¥2553"；有波动 "¥2553~3053"（min==max 时单值） */
export function fmtPriceRange(price: number | null, variance: number | null): string {
  const { min, max } = priceRange(price, variance);
  if (price == null && variance == null) return '';
  return min === max ? `¥${money(min)}` : `¥${money(min)}~${money(max)}`;
}
