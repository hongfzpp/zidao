/* PURE. No DOM, no globals, no I/O.
   Every character-arrival bug in M1 lived in this logic:
     - `castCount % N` fired on the first cast of a session resuming near a
       multiple of N
     - "session" meant "page load", so reloading farmed budget and a long
       sitting got none
     - the opening character spent the budget, walling a fresh install at two
   All of it is now decidable from a plain state object, so it can be tested
   without a browser.

   There used to be a third guard: at most three new characters per half-hour,
   the clock resetting after thirty idle minutes. It is gone. It was the app
   deciding when a child had had enough, and it produced the one complaint no
   amount of correct logic answers -- a kid who kept playing and kept being told
   nothing, with no way to see why. Pace now comes from ONE thing only: how much
   the child actually plays. Keep casting and characters keep arriving; stop and
   nothing happens. That is a pace the child sets themselves. */

export const DEFAULTS = Object.freeze({
  arrivalEvery: 8                // casts between arrivals, FROM THE LAST ARRIVAL
});

/** Casts still required before the next arrival. 0 means "due now". */
export function castsUntilArrival (state, cfg = DEFAULTS) {
  return Math.max(0, cfg.arrivalEvery - (state.castsSinceArrival || 0));
}

/**
 * Should the automatic drip introduce a character right now?
 * Returns a reason string rather than a bare boolean so callers (and the
 * parent panel) can explain *why* nothing is arriving.
 */
export function arrivalDecision (state, { hasUnowned }, cfg = DEFAULTS) {
  if (!hasUnowned)                       return { introduce: false, reason: 'all-known' };
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
