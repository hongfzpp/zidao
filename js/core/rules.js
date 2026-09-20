/* PURE. Cast-rule matching and variant selection.
   Everything here decides WHICH steps run; executing them (DOM, audio) is the
   caller's job. That split is what makes the interesting part testable. */

import { isDistractor } from './hand.js';

export const GOLDEN_CHANCE = 0.05;

/** id (3) beats tag (2) beats any (1). 0 means no match. */
export function specificity (target, rec) {
  if (!target || !rec) return 0;
  if (target.id)  return target.id === rec.id ? 3 : 0;
  if (target.tag) return (rec.tags || []).includes(target.tag) ? 2 : 0;
  if (target.any) return 1;
  return 0;
}

export function findRule (rules, charId, rec) {
  let best = null, bestSpec = 0;
  for (const r of rules) {
    if (r.char !== charId) continue;
    const s = specificity(r.target, rec);
    if (s > bestSpec) { best = r; bestSpec = s; }
  }
  return best;
}

/**
 * Weighted pick that never repeats the previous index when alternatives exist.
 * Returns { index, variant } so the caller can remember the index.
 */
export function pickVariant (variants, lastIndex = -1, rng = Math.random) {
  if (!variants || !variants.length) return null;
  if (variants.length === 1) return { index: 0, variant: variants[0] };

  const pool = [];
  variants.forEach((v, i) => {
    if (i === lastIndex) return;
    for (let n = 0; n < (v.w || 1); n++) pool.push(i);
  });
  // every alternative excluded (e.g. all weights 0) -> fall back to any
  const from = pool.length ? pool : variants.map((_, i) => i);
  const index = from[Math.floor(rng() * from.length)];
  return { index, variant: variants[index] };
}

/**
 * Decide the steps for a cast. Pure.
 * Returns { steps, kind, variantIndex, consumedFirstCast }.
 *   kind: 'fizzle' | 'golden' | 'normal' | 'fallback'
 *
 * `consumedFirstCast` is false when the cast did not really *do* anything --
 * a decoy, or a noun cast on something it does not name. Those must not spend
 * the character's one spectacular first cast, or a kid who tries 猫 on the bed
 * before the cat would never get the moment at all.
 */
export function chooseSteps (data, ctx) {
  const { rules = [], fallback, fizzle, firstCastFlourish } = data;
  const { charId, rec, isFirstCast = false, lastIndex = -1, rng = Math.random } = ctx;

  if (isDistractor(charId)) {
    const picked = pickVariant(fizzle?.variants, lastIndex, rng);
    return {
      steps: picked?.variant.steps || [], kind: 'fizzle',
      variantIndex: picked?.index ?? -1, consumedFirstCast: false
    };
  }

  const rule = findRule(rules, charId, rec);

  // The first cast of a character is the hook moment and must never be left to
  // a 1-in-20 roll (DESIGN.md §3.5).
  const wantsSpectacular = isFirstCast || rng() < GOLDEN_CHANCE;

  if (rule?.golden && wantsSpectacular) {
    return { steps: rule.golden.steps, kind: 'golden', variantIndex: -1, consumedFirstCast: true };
  }
  if (rule) {
    // A rule flagged `noEffect` acknowledges the cast but changes nothing: no
    // celebratory flourish, and the first-cast moment is saved for later.
    const inert = rule.noEffect === true;
    const picked = pickVariant(rule.variants, lastIndex, rng);
    let steps = picked?.variant.steps || [];
    if (isFirstCast && !inert) steps = [...steps, ...(firstCastFlourish?.steps || [])];
    return {
      steps, kind: 'normal', variantIndex: picked?.index ?? -1,
      consumedFirstCast: !inert
    };
  }

  const picked = pickVariant(fallback?.variants, lastIndex, rng);
  let steps = picked?.variant.steps || [];
  if (isFirstCast) steps = [...steps, ...(firstCastFlourish?.steps || [])];
  return { steps, kind: 'fallback', variantIndex: picked?.index ?? -1, consumedFirstCast: true };
}
