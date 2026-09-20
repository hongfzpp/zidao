/* PURE. No DOM, no globals, no I/O.
   Every character-arrival bug in M1 lived in this logic:
     - `castCount % N` fired on the first cast of a session resuming near a
       multiple of N
     - "session" meant "page load", so reloading farmed budget and a long
       sitting got none
     - the opening character spent the budget, walling a fresh install at two
   All of it is now decidable from a plain state object, so it can be tested
   without a browser. */

export const DEFAULTS = Object.freeze({
  arrivalEvery: 8,               // casts between arrivals, FROM THE LAST ARRIVAL
  maxArrivalsPerSession: 3,
  sessionGapMs: 30 * 60 * 1000   // idle gap that starts a new session
});

/** Casts still required before the next arrival. 0 means "due now". */
export function castsUntilArrival (state, cfg = DEFAULTS) {
  return Math.max(0, cfg.arrivalEvery - (state.castsSinceArrival || 0));
}

export function sessionBudgetLeft (state, cfg = DEFAULTS) {
  return Math.max(0, cfg.maxArrivalsPerSession - (state.arrivalsThisSession || 0));
}

/**
 * Should the automatic drip introduce a character right now?
 * Returns a reason string rather than a bare boolean so callers (and the
 * parent panel) can explain *why* nothing is arriving.
 */
export function arrivalDecision (state, { hasUnowned }, cfg = DEFAULTS) {
  if (!hasUnowned)                              return { introduce: false, reason: 'all-known' };
  if (sessionBudgetLeft(state, cfg) <= 0)       return { introduce: false, reason: 'session-full' };
  if (castsUntilArrival(state, cfg) > 0)        return { introduce: false, reason: 'too-soon' };
  return { introduce: true, reason: 'due' };
}

/** A session is a gap in TIME, not a page load. Returns a state patch. */
export function rollSession (state, now, cfg = DEFAULTS) {
  const last = state.lastPlayedAt || 0;
  const isNew = !last || (now - last) > cfg.sessionGapMs;
  return isNew
    ? { arrivalsThisSession: 0, lastPlayedAt: now, sessionRolled: true }
    : { lastPlayedAt: now, sessionRolled: false };
}

/** Patch to apply when a real (non-decoy) character is cast. */
export function applyCast (state, now = Date.now()) {
  return {
    castCount: (state.castCount || 0) + 1,
    castsSinceArrival: (state.castsSinceArrival || 0) + 1,
    lastPlayedAt: now
  };
}

/**
 * Patch to apply when a character is introduced.
 * `countsTowardSession` is false for the opening character of a fresh install
 * (it is the hook, not one of the day's lessons) and for a parent's manual
 * request, which must always work regardless of the cap.
 */
export function applyArrival (state, { countsTowardSession = true } = {}) {
  return {
    castsSinceArrival: 0,
    arrivalsThisSession: (state.arrivalsThisSession || 0) + (countsTowardSession ? 1 : 0)
  };
}
