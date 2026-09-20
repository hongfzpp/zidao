import { describe, it, expect } from '../runner.js';
import {
  DEFAULTS, castsUntilArrival, sessionBudgetLeft, arrivalDecision,
  rollSession, applyCast, applyArrival
} from '../../js/core/pacing.js';

const S = (o = {}) => ({
  castCount: 0, castsSinceArrival: 0, arrivalsThisSession: 0, lastPlayedAt: 0, ...o
});

describe('pacing · castsUntilArrival', () => {
  it('counts down from arrivalEvery', () => {
    expect(castsUntilArrival(S({ castsSinceArrival: 0 }))).toBe(8);
    expect(castsUntilArrival(S({ castsSinceArrival: 3 }))).toBe(5);
    expect(castsUntilArrival(S({ castsSinceArrival: 8 }))).toBe(0);
  });
  it('never goes negative when overshooting', () => {
    expect(castsUntilArrival(S({ castsSinceArrival: 99 }))).toBe(0);
  });
  it('treats a missing counter as zero casts done', () => {
    expect(castsUntilArrival({})).toBe(8);
  });
});

describe('pacing · arrivalDecision', () => {
  it('does not introduce before the interval elapses', () => {
    const d = arrivalDecision(S({ castsSinceArrival: 7 }), { hasUnowned: true });
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('too-soon');
  });

  it('introduces exactly at the interval', () => {
    const d = arrivalDecision(S({ castsSinceArrival: 8 }), { hasUnowned: true });
    expect(d.introduce).toBeTruthy();
  });

  it('REGRESSION: does not fire on the first cast of a session resuming near a multiple of N', () => {
    // The old code tested `castCount % 8 === 0`. castCount persists across app
    // restarts, so reopening at 15 and casting once made it 16 -> ambush.
    const resumed = S({ castCount: 16, castsSinceArrival: 1 });
    expect(arrivalDecision(resumed, { hasUnowned: true }).introduce).toBeFalsy();
  });

  it('REGRESSION: pacing ignores castCount entirely', () => {
    for (const castCount of [0, 7, 8, 15, 16, 23, 24, 999]) {
      const st = S({ castCount, castsSinceArrival: 8 });
      expect(arrivalDecision(st, { hasUnowned: true }).introduce).toBeTruthy();
    }
  });

  it('stops when the session budget is spent, and says why', () => {
    const st = S({ castsSinceArrival: 50, arrivalsThisSession: DEFAULTS.maxArrivalsPerSession });
    const d = arrivalDecision(st, { hasUnowned: true });
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('session-full');
  });

  it('stops when every character is known', () => {
    const d = arrivalDecision(S({ castsSinceArrival: 99 }), { hasUnowned: false });
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('all-known');
  });

  it('reports all-known ahead of session-full', () => {
    const st = S({ castsSinceArrival: 99, arrivalsThisSession: 99 });
    expect(arrivalDecision(st, { hasUnowned: false }).reason).toBe('all-known');
  });
});

describe('pacing · rollSession', () => {
  const NOW = 1_000_000_000;

  it('starts a fresh session on first ever play', () => {
    const p = rollSession(S({ lastPlayedAt: 0 }), NOW);
    expect(p.arrivalsThisSession).toBe(0);
    expect(p.sessionRolled).toBeTruthy();
  });

  it('resets the budget after a long gap', () => {
    const st = S({ arrivalsThisSession: 3, lastPlayedAt: NOW - DEFAULTS.sessionGapMs - 1 });
    const p = rollSession(st, NOW);
    expect(p.arrivalsThisSession).toBe(0);
    expect(p.sessionRolled).toBeTruthy();
  });

  it('REGRESSION: a reload does NOT grant a fresh budget', () => {
    // "session" used to mean "page load", so restarting farmed new characters.
    const st = S({ arrivalsThisSession: 3, lastPlayedAt: NOW - 1000 });
    const p = rollSession(st, NOW);
    expect(p.sessionRolled).toBeFalsy();
    expect(p.arrivalsThisSession).toBe(undefined);   // untouched
  });

  it('keeps the session alive right up to the gap boundary', () => {
    const st = S({ arrivalsThisSession: 2, lastPlayedAt: NOW - DEFAULTS.sessionGapMs });
    expect(rollSession(st, NOW).sessionRolled).toBeFalsy();
  });

  it('always records lastPlayedAt', () => {
    expect(rollSession(S(), NOW).lastPlayedAt).toBe(NOW);
    expect(rollSession(S({ lastPlayedAt: NOW - 10 }), NOW).lastPlayedAt).toBe(NOW);
  });
});

describe('pacing · applyCast / applyArrival', () => {
  it('a cast advances both counters', () => {
    const p = applyCast(S({ castCount: 4, castsSinceArrival: 2 }), 123);
    expect(p.castCount).toBe(5);
    expect(p.castsSinceArrival).toBe(3);
    expect(p.lastPlayedAt).toBe(123);
  });

  it('an arrival resets the interval clock', () => {
    expect(applyArrival(S({ castsSinceArrival: 8 })).castsSinceArrival).toBe(0);
  });

  it('an arrival spends session budget by default', () => {
    expect(applyArrival(S({ arrivalsThisSession: 1 })).arrivalsThisSession).toBe(2);
  });

  it('REGRESSION: a free arrival does not spend budget', () => {
    // The opening character of a fresh install used to spend budget, which
    // walled the first session at two characters, silently and forever.
    const p = applyArrival(S({ arrivalsThisSession: 0 }), { countsTowardSession: false });
    expect(p.arrivalsThisSession).toBe(0);
    expect(p.castsSinceArrival).toBe(0);
  });
});

describe('pacing · full first-session simulation', () => {
  it('delivers 大 free, then one character every 8 casts, up to the cap', () => {
    let st = S();
    const arrivals = [];
    const NOW = 1_000_000;

    Object.assign(st, rollSession(st, NOW));
    // opening character: free
    Object.assign(st, applyArrival(st, { countsTowardSession: false }));
    arrivals.push({ atCast: 0, free: true });

    for (let cast = 1; cast <= 40; cast++) {
      Object.assign(st, applyCast(st, NOW + cast));
      const d = arrivalDecision(st, { hasUnowned: true });
      if (d.introduce) {
        Object.assign(st, applyArrival(st, { countsTowardSession: true }));
        arrivals.push({ atCast: cast, free: false });
      }
    }

    expect(arrivals.map(a => a.atCast)).toEqual([0, 8, 16, 24]);
    expect(st.arrivalsThisSession).toBe(DEFAULTS.maxArrivalsPerSession);
  });

  it('REGRESSION: a long session does not wall up after two characters', () => {
    // The exact symptom reported: stuck on 小, casting forever, nothing arrives.
    let st = S();
    Object.assign(st, rollSession(st, 1000));
    Object.assign(st, applyArrival(st, { countsTowardSession: false }));  // 大
    let count = 1;
    for (let cast = 1; cast <= 30; cast++) {
      Object.assign(st, applyCast(st, 1000 + cast));
      if (arrivalDecision(st, { hasUnowned: true }).introduce) {
        Object.assign(st, applyArrival(st, { countsTowardSession: true }));
        count++;
      }
    }
    expect(count).toBeGreaterThan(2);
  });

  it('a new session after a break grants a fresh budget', () => {
    let st = S({ arrivalsThisSession: 3, castsSinceArrival: 20, lastPlayedAt: 1000 });
    expect(arrivalDecision(st, { hasUnowned: true }).reason).toBe('session-full');
    Object.assign(st, rollSession(st, 1000 + DEFAULTS.sessionGapMs + 1));
    expect(arrivalDecision(st, { hasUnowned: true }).introduce).toBeTruthy();
  });
});
