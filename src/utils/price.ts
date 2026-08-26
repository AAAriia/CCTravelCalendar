/** 金额波动区间（口径 §8）：[price - 下浮, price + 上浮]，下限不低于 0 */
export function priceRange(
  price: number | null,
  varianceUp: number | null,
  varianceDown: number | null,
): { min: number; max: number } {
  const p = price ?? 0;
  const up = Math.max(0, varianceUp ?? 0);
  const down = Math.max(0, varianceDown ?? 0);
  return { min: Math.max(0, p - down), max: Math.max(0, p + up) };
}

/** 千分位金额 */
const money = (n: number): string => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

/** 单条展示：无波动 "¥2553"；有波动 "¥2553~3053"（min==max 时单值） */
export function fmtPriceRange(
  price: number | null,
  varianceUp: number | null,
  varianceDown: number | null,
): string {
  const { min, max } = priceRange(price, varianceUp, varianceDown);
  if (price == null && varianceUp == null && varianceDown == null) return '';
  return min === max ? `¥${money(min)}` : `¥${money(min)}~${money(max)}`;
}
