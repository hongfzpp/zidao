/* PURE. Hand composition: which cards are in the pouch and in what order.
   See DESIGN.md §3.8 -- decoys stop trial-and-error, shuffling stops
   position-memory, and the decoy SET must stay stable between shuffles or the
   cards that persist are exactly the real ones. */

export const DISTRACTOR_PREFIX = 'x:';
export const isDistractor = id => String(id).startsWith(DISTRACTOR_PREFIX);
export const distractorGlyph = id => String(id).slice(DISTRACTOR_PREFIX.length);
export const toDistractorId = glyph => DISTRACTOR_PREFIX + glyph;

/** Heavier proportion of decoys early, when guessing would otherwise be trivial. */
export function decoyCount (ownedCount) {
  if (ownedCount <= 0) return 0;
  if (ownedCount <= 3) return 2;
  if (ownedCount <= 6) return 3;
  return 4;
}

/** Decoys come from the confusables of what the kid owns, minus the curriculum. */
export function decoyPool (chars, owned) {
  const curriculum = new Set(chars.map(c => c.char));
  const ownedSet = new Set(owned);
  const pool = new Set();
  for (const def of chars) {
    if (!ownedSet.has(def.id)) continue;
    for (const g of def.confusables || []) {
      if (!curriculum.has(g)) pool.add(g);
    }
  }
  return [...pool];
}

export function shuffle (arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDecoys (chars, owned, rng = Math.random) {
  const pool = decoyPool(chars, owned);
  const n = Math.min(decoyCount(owned.length), pool.length);
  return shuffle(pool, rng).slice(0, n).map(toDistractorId);
}

/** Drop any decoy whose glyph the kid has since been taught. */
export function pruneDecoys (chars, owned, decoys) {
  const ownedGlyphs = new Set(
    chars.filter(c => owned.includes(c.id)).map(c => c.char));
  return decoys.filter(id => !ownedGlyphs.has(distractorGlyph(id)));
}

/* The pouch is capped. Left to grow it would reach sixty-odd cards, which is
   not a pouch, it is a wall -- and a 3-8 year old faced with a wall of choices
   picks nothing. Past the cap, characters rotate. */
export const MAX_POUCH = 12;      // total cards, decoys included
export const MIN_REAL = 4;        // never squeeze real characters below this

/** Characters the kid owns that can actually be cast (glue cannot). */
export function castableOwned (chars, owned) {
  return owned.filter(id => chars.find(c => c.id === id)?.castable !== false);
}

/** owned + decoys, shuffled. Glue characters never appear: they mean nothing on
    their own and there is nothing to cast them at (DESIGN.md §9.1). */
export function buildHand (owned, decoys, rng = Math.random) {
  return shuffle([...owned, ...decoys], rng);
}

export function glyphFor (chars, id) {
  if (isDistractor(id)) return distractorGlyph(id);
  return chars.find(c => c.id === id)?.char ?? '?';
}

/**
 * Which owned characters to show when there are more than fit.
 *
 * Two things are guaranteed: the character just learnt is ALWAYS there (it is
 * the one they want to try), and nothing is dropped for good -- everything
 * rotates back. Beyond that the choice is not random. It is weighted by how
 * much each character still needs the practice, so a shaky one keeps its place
 * and a solid one steps aside. Retired characters step aside first: they are
 * maintained by stories, not by the pouch.
 */
export function selectPouch (chars, owned, {
  max = MAX_POUCH, progress = {}, rng = Math.random, now = Date.now(), pinned = []
} = {}) {
  const castable = castableOwned(chars, owned);
  if (castable.length <= max) return castable;

  // `pinned` is a character the kid has just been shown -- newly met OR
  // re-shown for review. Position in `owned` cannot express that: re-learning a
  // character does not move it, so without an explicit pin a review was a coin
  // flip as to whether the character then appeared in the pouch at all.
  const keep = new Set(
    [...(Array.isArray(pinned) ? pinned : [pinned]),
     castable[castable.length - 1]]
    .filter(id => id && castable.includes(id)));

  const scored = castable.map(id => {
    if (keep.has(id)) return { id, score: Infinity };
    const p = progress[id];
    const box = p?.box ?? 0;
    const retired = box >= 5;
    const due = p?.dueAt != null && now >= p.dueAt;
    let score = 1 - box / 5;              // less mastered -> wanted more
    if (due) score += 0.6;
    if (retired) score -= 1;              // maintained by stories now
    score += rng() * 0.5;                 // jitter, so the set keeps rotating
    return { id, score };
  });

  return scored.sort((a, b) => b.score - a.score)
               .slice(0, max)
               .map(e => e.id);
}

/** How many real characters fit once the decoys have taken their slots. */
export function realSlots (decoyCount, max = MAX_POUCH) {
  return Math.max(MIN_REAL, max - decoyCount);
}
