/* PURE. Choosing the wrong answers — DESIGN.md §8.3.

   This is the hidden contrast engine. The child is never told anything about
   components or radicals; difficulty is controlled entirely by HOW SIMILAR the
   wrong answers look:

     box 0–1  maximally dissimilar   an easy, confidence-building win
     box 2–3  mixed
     box 4–5  nearest confusables    the real test

   Research on orthographic awareness says contrastive pairs are the strongest
   training signal available. The kid experiences it as "it got a bit trickier". */

import { shuffle, toDistractorId } from './hand.js';

export const SIMILARITY = Object.freeze({
  easy: 'easy', mixed: 'mixed', hard: 'hard'
});

export function similarityFor (box) {
  if (box >= 4) return SIMILARITY.hard;
  if (box >= 2) return SIMILARITY.mixed;
  return SIMILARITY.easy;
}

/**
 * Candidate wrong answers for a prompt, ranked.
 * `near` are the target's own confusables (visually similar, the hard case).
 * `far` is everything else the kid owns, plus unrelated decoy glyphs.
 */
export function candidatePools (target, chars, owned) {
  const curriculum = new Set(chars.map(c => c.char));
  const near = (target.confusables || []).map(g =>
    curriculum.has(g)
      ? chars.find(c => c.char === g)?.id          // a real character we teach
      : toDistractorId(g)                          // an inert decoy glyph
  ).filter(Boolean).filter(id => id !== target.id);

  const nearSet = new Set(near);
  const far = owned
    .filter(id => id !== target.id && !nearSet.has(id))
    .concat(
      chars.filter(c => c.id !== target.id && !owned.includes(c.id) && !nearSet.has(c.id))
           .flatMap(c => (c.confusables || [])
             .filter(g => !curriculum.has(g))
             .map(toDistractorId)));

  return { near, far: [...new Set(far)] };
}

/**
 * Pick `count` wrong answers for a prompt about `target`, at a difficulty set
 * by the target's box.
 */
export function pickPromptDistractors (target, chars, owned, box, count = 2, rng = Math.random) {
  const { near, far } = candidatePools(target, chars, owned);
  const mode = similarityFor(box);

  let ordered;
  if (mode === SIMILARITY.hard)       ordered = [...near, ...shuffle(far, rng)];
  else if (mode === SIMILARITY.easy)  ordered = [...shuffle(far, rng), ...near];
  else {
    const n = shuffle(near, rng), f = shuffle(far, rng);
    ordered = [];                                  // interleave
    while (n.length || f.length) {
      if (f.length) ordered.push(f.shift());
      if (n.length) ordered.push(n.shift());
    }
  }

  const picked = [...new Set(ordered)].slice(0, count);
  // If the pools were too thin, top up from anything available rather than
  // returning a prompt with only one card.
  if (picked.length < count) {
    const rest = [...new Set([...near, ...far])].filter(id => !picked.includes(id));
    picked.push(...rest.slice(0, count - picked.length));
  }
  return picked;
}

/** The full card set for a prompt: the answer plus its distractors, shuffled. */
export function buildPrompt (target, chars, owned, box, count = 2, rng = Math.random) {
  const distractors = pickPromptDistractors(target, chars, owned, box, count, rng);
  return {
    targetId: target.id,
    distractors,
    cards: shuffle([target.id, ...distractors], rng),
    similarity: similarityFor(box)
  };
}
