import { describe, it, expect } from '../runner.js';
import {
  BOX_INTERVAL_MS, MAX_BOX, DEFAULTS, blankProgress, getProgress, recordExposure,
  recordAnswer, median, isDue, isRetired, urgency, dueCharacters, pickReviewTarget,
  mastery, status
} from '../../js/core/memory.js';
import { mulberry32 } from '../../js/core/rng.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000, DAY = 24 * 60 * MIN;
const P = (o = {}) => ({ ...blankProgress('da', NOW), ...o });

describe('memory · blankProgress', () => {
  it('starts in box 0, due shortly, with nothing recorded', () => {
    const p = blankProgress('da', NOW);
    expect(p.box).toBe(0);
    expect(p.exposures).toBe(0);
    expect(p.dueAt).toBe(NOW + BOX_INTERVAL_MS[0]);
  });
  it('getProgress invents one for a character never seen', () => {
    expect(getProgress({}, 'xiao', NOW).charId).toBe('xiao');
    expect(getProgress(undefined, 'xiao', NOW).box).toBe(0);
  });
  it('getProgress returns the stored record when there is one', () => {
    const stored = P({ charId: 'xiao', box: 3 });
    expect(getProgress({ xiao: stored }, 'xiao', NOW).box).toBe(3);
  });
});

describe('memory · recordAnswer', () => {
  it('promotes a fast correct answer', () => {
    expect(recordAnswer(P({ box: 1 }), { correct: true, latencyMs: 900 }, NOW).box).toBe(2);
  });

  it('HOLDS a correct but slow answer — speed is the real target', () => {
    const p = recordAnswer(P({ box: 2 }), { correct: true, latencyMs: 9000 }, NOW);
    expect(p.box).toBe(2);
    expect(p.correct).toBe(1);          // still counted as correct
  });

  it('treats exactly the threshold as fast', () => {
    expect(recordAnswer(P({ box: 0 }), { correct: true, latencyMs: DEFAULTS.fastMs }, NOW).box).toBe(1);
  });

  it('demotes exactly one box on a miss, never resets', () => {
    expect(recordAnswer(P({ box: 4 }), { correct: false }, NOW).box).toBe(3);
    expect(recordAnswer(P({ box: 1 }), { correct: false }, NOW).box).toBe(0);
  });

  it('never demotes below zero', () => {
    expect(recordAnswer(P({ box: 0 }), { correct: false }, NOW).box).toBe(0);
  });

  it('never promotes past the retired box', () => {
    expect(recordAnswer(P({ box: MAX_BOX }), { correct: true, latencyMs: 100 }, NOW).box).toBe(MAX_BOX);
  });

  it('reschedules according to the new box', () => {
    const p = recordAnswer(P({ box: 1 }), { correct: true, latencyMs: 500 }, NOW);
    expect(p.dueAt).toBe(NOW + BOX_INTERVAL_MS[2]);
  });

  it('counts exposures, hits and misses', () => {
    let p = P();
    p = recordAnswer(p, { correct: true, latencyMs: 500 }, NOW);
    p = recordAnswer(p, { correct: false }, NOW);
    expect(p.exposures).toBe(2);
    expect(p.correct).toBe(1);
    expect(p.incorrect).toBe(1);
  });

  it('tracks median latency over a rolling window of correct answers', () => {
    let p = P();
    for (const ms of [1000, 3000, 2000]) p = recordAnswer(p, { correct: true, latencyMs: ms }, NOW);
    expect(p.medianLatencyMs).toBe(2000);
  });

  it('a miss does not pollute the latency record', () => {
    let p = recordAnswer(P(), { correct: true, latencyMs: 1000 }, NOW);
    p = recordAnswer(p, { correct: false, latencyMs: 60000 }, NOW);
    expect(p.medianLatencyMs).toBe(1000);
  });

  it('does not mutate the record it is given', () => {
    const p = P({ box: 1 });
    recordAnswer(p, { correct: true, latencyMs: 100 }, NOW);
    expect(p.box).toBe(1);
  });
});

describe('memory · median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);   // rounded mean of the middle pair
  });
  it('is null for nothing', () => {
    expect(median([])).toBe(null);
    expect(median(undefined)).toBe(null);
  });
});

describe('memory · scheduling', () => {
  it('is not due before its time', () => {
    expect(isDue(P({ dueAt: NOW + 1000 }), NOW)).toBeFalsy();
  });
  it('is due at its time', () => {
    expect(isDue(P({ dueAt: NOW }), NOW)).toBeTruthy();
  });
  it('a retired character is never due — it lives in stories, not drills', () => {
    expect(isRetired(P({ box: MAX_BOX }))).toBeTruthy();
    expect(isDue(P({ box: MAX_BOX, dueAt: 0 }), NOW)).toBeFalsy();
  });
  it('urgency grows the longer something is overdue', () => {
    const fresh = P({ box: 2, dueAt: NOW });
    const stale = P({ box: 2, dueAt: NOW - 5 * DAY });
    expect(urgency(stale, NOW)).toBeGreaterThan(urgency(fresh, NOW));
  });
});

describe('memory · dueCharacters', () => {
  const map = {
    da:   P({ charId: 'da',   box: 1, dueAt: NOW - 10 * DAY }),   // very overdue
    xiao: P({ charId: 'xiao', box: 1, dueAt: NOW - 1 * MIN }),    // just due
    kai:  P({ charId: 'kai',  box: 1, dueAt: NOW + 1 * DAY }),    // not yet
    guan: P({ charId: 'guan', box: MAX_BOX, dueAt: 0 })           // retired
  };
  const owned = ['da', 'xiao', 'kai', 'guan'];

  it('returns only what is actually due', () => {
    const due = dueCharacters(map, owned, NOW);
    expect(due).toContain('da');
    expect(due).toContain('xiao');
    expect(due).notToContain('kai');
    expect(due).notToContain('guan');
  });
  it('puts the most overdue first', () => {
    expect(dueCharacters(map, owned, NOW)[0]).toBe('da');
  });
  it('is empty when nothing is due', () => {
    expect(dueCharacters({ kai: map.kai }, ['kai'], NOW)).toHaveLength(0);
  });
  it('REGRESSION: an owned character with NO record is due, not invisible', () => {
    // getProgress invents a record dated `now`, so a missing record would keep
    // sliding its dueAt forward and never come up. Any save written before this
    // engine existed hits exactly that.
    expect(dueCharacters({}, ['huo'], NOW)).toContain('huo');
    expect(dueCharacters(map, [...owned, 'huo'], NOW)[0]).toBe('huo');   // first
  });

  it('a record-less character stays due however long you wait', () => {
    expect(dueCharacters({}, ['huo'], NOW + 365 * DAY)).toContain('huo');
  });
});

describe('memory · pickReviewTarget', () => {
  it('returns null when nothing is due', () => {
    expect(pickReviewTarget({}, [], NOW, mulberry32(1))).toBe(null);
  });
  it('always picks something that is genuinely due', () => {
    const map = {
      da:   P({ charId: 'da',   dueAt: NOW - DAY }),
      xiao: P({ charId: 'xiao', dueAt: NOW - DAY }),
      kai:  P({ charId: 'kai',  dueAt: NOW + DAY })
    };
    for (let s = 0; s < 40; s++) {
      const pick = pickReviewTarget(map, ['da', 'xiao', 'kai'], NOW, mulberry32(s));
      expect(['da', 'xiao']).toContain(pick);
    }
  });
  it('varies among the most urgent so it does not feel like a list', () => {
    const map = {};
    for (const id of ['da', 'xiao', 'kai']) map[id] = P({ charId: id, dueAt: NOW - DAY });
    const seen = new Set();
    for (let s = 0; s < 40; s++) seen.add(pickReviewTarget(map, ['da','xiao','kai'], NOW, mulberry32(s)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('memory · mastery and status', () => {
  it('mastery runs 0 to 1', () => {
    expect(mastery(P({ box: 0 }))).toBe(0);
    expect(mastery(P({ box: MAX_BOX }))).toBe(1);
  });
  it('status is three plain words, no jargon', () => {
    expect(status(P({ box: MAX_BOX }))).toBe('solid');
    expect(status(P({ box: 3 }))).toBe('getting-there');
    expect(status(P({ box: 0, correct: 0, incorrect: 3 }))).toBe('shaky');
    expect(status(P({ box: 0 }))).toBe('new');
  });
});

describe('memory · a character learned over several days', () => {
  it('climbs the ladder on fast hits and settles as solid', () => {
    let p = blankProgress('da', NOW);
    let t = NOW;
    for (let i = 0; i < MAX_BOX; i++) {
      t = p.dueAt;                                  // come back exactly when due
      p = recordAnswer(p, { correct: true, latencyMs: 800 }, t);
    }
    expect(p.box).toBe(MAX_BOX);
    expect(isRetired(p)).toBeTruthy();
    expect(status(p)).toBe('solid');
    expect(isDue(p, t + 365 * DAY)).toBeFalsy();    // retired means retired
  });

  it('a character the kid keeps missing stays in circulation and comes back soon', () => {
    let p = P({ box: 3 });
    p = recordAnswer(p, { correct: false }, NOW);
    p = recordAnswer(p, { correct: false }, NOW);
    expect(p.box).toBe(1);
    expect(p.dueAt - NOW).toBeLessThanOrEqual(BOX_INTERVAL_MS[1]);
    expect(isRetired(p)).toBeFalsy();
  });

  it('REGRESSION: slow-but-correct never reaches retirement', () => {
    // Otherwise a kid who always answers correctly-but-slowly would stop being
    // asked, having never become fluent.
    let p = blankProgress('da', NOW);
    for (let i = 0; i < 20; i++) p = recordAnswer(p, { correct: true, latencyMs: 8000 }, p.dueAt);
    expect(p.box).toBe(0);
    expect(isRetired(p)).toBeFalsy();
  });
});
