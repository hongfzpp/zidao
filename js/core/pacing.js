/* PURE. No DOM, no globals, no I/O.
   Every character-arrival bug in M1 lived in this logic:
     - `castCount % N` fired on the first cast of a session resuming near a
       multiple of N
     - "session" meant "page load", so reloading farmed budget and a long
       sitting got none
     - the opening character spent the budget, walling a fresh install at two
   All of it is now decidable from a plain state object, so it can be tested
   without a browser.

   There used to be a cap of three new characters per half hour. It is gone
   (DESIGN.md §6.1a): it was the app deciding when a child had had enough.

   What earns the next character now is PLAYING THE NEWEST ONE. It used to be
   any eight casts -- and a kid left to choose plays what they already know, so
   they skipped every new character and farmed arrivals off the old ones,
   meeting a stream of characters they never touched. Now the newest character
   has to be played correctly four times before another arrives. */

import { playsOf } from './memory.js';

export const DEFAULTS = Object.freeze({
  // Correct plays of the newest character before the next may arrive. Also
  // the minimum number of casts between any two arrivals -- see below.
  playsToPass: 4
});

/**
 * The character the kid is learning: the newest one they own that can be cast.
 *
 * Castable matters. 你 好 了 我 个 arrive through the same drip but cannot be
 * cast at all -- there is nothing to drop them on -- so a gate waiting on them
 * would wait forever. They are practised by reading, and the gate looks past
 * them to the newest character that can actually be played.
 */
export function learningId (chars, owned) {
  const castable = new Set(
    (chars || []).filter(c => c.castable !== false).map(c => c.id));
  const list = owned || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (castable.has(list[i])) return list[i];
  }
  return null;
}

/** Correct plays the newest character still needs. 0 means it has passed. */
export function playsStillNeeded (state, chars, cfg = DEFAULTS) {
  const id = learningId(chars, state.owned);
  if (!id) return 0;
  return Math.max(0, cfg.playsToPass - playsOf(state.progress?.[id]));
}

/**
 * Casts still required since the last arrival: the floor.
 *
 * On the usual path it is invisible -- four correct plays of a character that
 * only just arrived are four casts since it did. It exists for the glue: when
 * 你 arrives the gate looks past it to 水, which is already passed, and without
 * a floor 你 then 好 then 上 would arrive on three consecutive casts.
 */
export function castsUntilArrival (state, cfg = DEFAULTS) {
  return Math.max(0, cfg.playsToPass - (state.castsSinceArrival || 0));
}

/**
 * Should the automatic drip introduce a character right now?
 * Returns a reason rather than a bare boolean so the parent panel can explain
 * *why* nothing is arriving -- and for 'practise', which character and how many
 * more, because "play 鱼 three more times" is something a parent can act on.
 *
 * `chars` is needed to know which characters can be cast. Without it the
 * practice gate cannot be judged, and is skipped rather than guessed at: a
 * gate that guesses wrong waits on 你 forever.
 */
export function arrivalDecision (state, { hasUnowned, chars } = {}, cfg = DEFAULTS) {
  if (!hasUnowned) return { introduce: false, reason: 'all-known' };
  if (Array.isArray(chars)) {
    const need = playsStillNeeded(state, chars, cfg);
    if (need > 0) {
      return { introduce: false, reason: 'practise',
               learning: learningId(chars, state.owned), need };
    }
  }
  if (castsUntilArrival(state, cfg) > 0) return { introduce: false, reason: 'too-soon' };
  return { introduce: true, reason: 'due' };
}

/** Record that play happened. Nothing gates on it; the parent panel shows it. */
export function touchPlay (state, now) {
  return { lastPlayedAt: now };
}

/** Patch to apply when a real (non-decoy) character is cast. */
export function applyCast (state, now = Date.now()) {
  return {
    castCount: (state.castCount || 0) + 1,
    castsSinceArrival: (state.castsSinceArrival || 0) + 1,
    lastPlayedAt: now
  };
}

/** Patch to apply when a character is introduced: the count to the next one
    restarts, and nothing else is spent. */
export function applyArrival () {
  return { castsSinceArrival: 0 };
}
