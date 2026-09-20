/* PURE. The memory engine — DESIGN.md §8.

   Never surfaced to the child: no review screen, no "due today", no streak, no
   score. Its whole job is to decide WHICH character 团团 asks for next, and how
   confusable the distractors should be.

   Everything here is decidable from a plain progress record plus `now`, so it
   is testable without a browser or a clock. */

const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

/* A kid-tuned Leitner ladder. Standard SRS intervals assume an adult studying
   deliberately; a 3-8 year old plays in short irregular bursts. */
export const BOX_INTERVAL_MS = Object.freeze([
  3 * MIN,      // 0 — later in the same session
  30 * MIN,     // 1 — next session
  1 * DAY,      // 2
  3 * DAY,      // 3
  7 * DAY,      // 4
  Infinity      // 5 — retired: maintained by stories and scene labels, not drilled
]);

export const MAX_BOX = BOX_INTERVAL_MS.length - 1;

export const DEFAULTS = Object.freeze({
  fastMs: 4000,        // "correct but slow" holds instead of promoting
  latencyWindow: 5     // how many recent answers feed the median
});

export function blankProgress (charId, now = Date.now()) {
  return {
    charId,
    box: 0,
    exposures: 0,
    correct: 0,
    incorrect: 0,
    firstSeen: now,
    lastSeen: now,
    dueAt: now + BOX_INTERVAL_MS[0],
    latencies: []
  };
}

export const getProgress = (map, charId, now = Date.now()) =>
  map?.[charId] || blankProgress(charId, now);

/** Casting a character in free play is an exposure, not a test. */
export function recordExposure (p, now = Date.now()) {
  return { ...p, exposures: (p.exposures || 0) + 1, lastSeen: now };
}

export function median (xs) {
  if (!xs || !xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

/**
 * Apply the result of a retrieval.
 *
 *   correct AND fast  -> promote
 *   correct but slow  -> hold. Recognition SPEED is the real target: fluent
 *                        reading is automatic reading, so a slow hit is not
 *                        yet mastery.
 *   incorrect         -> demote exactly one box. Never a reset, never punished.
 */
export function recordAnswer (p, { correct, latencyMs = 0 }, now = Date.now(), cfg = DEFAULTS) {
  const box = p.box ?? 0;
  let next = box;
  if (correct) {
    if (latencyMs <= cfg.fastMs) next = Math.min(MAX_BOX, box + 1);
  } else {
    next = Math.max(0, box - 1);
  }

  const latencies = correct
    ? [...(p.latencies || []), latencyMs].slice(-cfg.latencyWindow)
    : (p.latencies || []);

  return {
    ...p,
    box: next,
    exposures: (p.exposures || 0) + 1,
    correct: (p.correct || 0) + (correct ? 1 : 0),
    incorrect: (p.incorrect || 0) + (correct ? 0 : 1),
    lastSeen: now,
    dueAt: now + BOX_INTERVAL_MS[next],
    latencies,
    medianLatencyMs: median(latencies)
  };
}

export const isRetired = p => (p?.box ?? 0) >= MAX_BOX;
export const isDue = (p, now = Date.now()) => !isRetired(p) && now >= (p?.dueAt ?? 0);

/** How overdue, as a multiple of the character's own interval. Bigger = more urgent. */
export function urgency (p, now = Date.now()) {
  if (isRetired(p)) return -1;
  const interval = BOX_INTERVAL_MS[p?.box ?? 0];
  if (!isFinite(interval) || interval <= 0) return -1;
  return (now - (p?.dueAt ?? 0)) / interval;
}

/**
 * Everything owned and due, most urgent first.
 *
 * A character the kid owns with NO stored record counts as due. Otherwise it
 * could never come up at all: getProgress would invent a fresh record dated
 * `now` on every call, so its dueAt would keep sliding forward and it would be
 * silently excluded from review forever. That happens for any save written
 * before this engine existed, and for any path that forgets to create a record.
 */
export function dueCharacters (map, owned, now = Date.now()) {
  return owned
    .map(id => ({ id, stored: map?.[id], p: getProgress(map, id, now) }))
    .filter(({ stored, p }) => !stored || isDue(p, now))
    .sort((a, b) => {
      if (!a.stored) return -1;
      if (!b.stored) return 1;
      return urgency(b.p, now) - urgency(a.p, now);
    })
    .map(({ id }) => id);
}

/**
 * Which character should 团团 ask for?
 * The most overdue one, with a little jitter among the top few so the app does
 * not feel like it is working through a list.
 */
export function pickReviewTarget (map, owned, now = Date.now(), rng = Math.random) {
  const due = dueCharacters(map, owned, now);
  if (!due.length) return null;
  const top = due.slice(0, Math.min(3, due.length));
  return top[Math.floor(rng() * top.length)];
}

/** 0 = brand new, 1 = solid. Drives distractor similarity and the parent panel. */
export const mastery = p => Math.min(1, (p?.box ?? 0) / MAX_BOX);

/** What the parent panel shows. Deliberately three plain words, no jargon. */
export function status (p) {
  const box = p?.box ?? 0;
  if (isRetired(p)) return 'solid';
  if (box >= 2) return 'getting-there';
  if ((p?.incorrect || 0) > (p?.correct || 0)) return 'shaky';
  return 'new';
}
