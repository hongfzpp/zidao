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
    plays: 0,          // casts that WORKED -- what the arrival gate counts
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

/**
 * A cast that actually worked: an exposure, AND a correct play.
 * Kept apart from exposures because a kid dropping 猫 on the bed has still SEEN
 * 猫, but has not played it correctly -- and correct plays are what earn the
 * next character (core/pacing.js).
 */
export function recordPlay (p, now = Date.now()) {
  return { ...recordExposure(p, now), plays: (p.plays || 0) + 1 };
}

/** Correct plays of a character. Saves from before plays were counted read 0. */
export const playsOf = p => p?.plays || 0;

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
 * How much the kid has tried a character: every time it was cast (worked or
 * not), answered, or read in a story. Older saves already carry this, so the
 * weighting below is right from the first question rather than after a warm-up.
 */
export const triesOf = p => p?.exposures || 0;

/**
 * How strongly 团团 should want to ask about a character: the less it has been
 * tried, the more. A child left to free play reaches for what they already know
 * and skips what they do not -- so the question is where the unfamiliar ones
 * get made unavoidable.
 *
 * 1 / (1 + tries), not something steeper. A never-tried character is asked
 * about roughly three times as often as one tried twice, and ten times as often
 * as one tried nine times -- a strong pull, but not so strong that the same
 * character comes up every time and the question turns into a drill.
 */
export const reviewWeight = p => 1 / (1 + triesOf(p));

/** Weighted pick. Pure: the randomness is passed in. */
export function weightedPick (items, weights, rng = Math.random) {
  if (!items?.length) return null;
  const ws = items.map((_, i) => Math.max(0, Number(weights?.[i]) || 0));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Which character should 团团 ask for?
 * Only characters that are due -- the spacing still decides WHEN a character
 * may be asked. Among those, the less-tried are weighted heavily, so the
 * characters the kid avoids in free play are the ones the questions find.
 */
export function pickReviewTarget (map, owned, now = Date.now(), rng = Math.random) {
  const due = dueCharacters(map, owned, now);
  if (!due.length) return null;
  return weightedPick(due, due.map(id => reviewWeight(map?.[id])), rng);
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
