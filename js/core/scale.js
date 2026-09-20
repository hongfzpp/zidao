/* PURE. Object scaling, clamped. */

export function clampScale (current, factor, { min = 0.15, max = 5 } = {}) {
  const next = (Number(current) || 1) * (Number(factor) || 1);
  return Math.max(min, Math.min(max, next));
}

/** How many copies of a thing are on screen. Drives 多 / 少 / 一 / 二 / 三. */
export const COUNT = Object.freeze({ min: 1, max: 5 });

export function clampCount (n, { min = COUNT.min, max = COUNT.max } = {}) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function stepCount (current, delta, opts) {
  return clampCount((Number(current) || 1) + delta, opts);
}
