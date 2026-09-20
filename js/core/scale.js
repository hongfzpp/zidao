/* PURE. Object scaling, clamped. */

export function clampScale (current, factor, { min = 0.15, max = 5 } = {}) {
  const next = (Number(current) || 1) * (Number(factor) || 1);
  return Math.max(min, Math.min(max, next));
}
