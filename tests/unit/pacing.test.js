import { describe, it, expect } from '../runner.js';
import {
  DEFAULTS, castsUntilArrival, arrivalDecision,
  touchPlay, applyCast, applyArrival
} from '../../js/core/pacing.js';

const S = (o = {}) => ({
  castCount: 0, castsSinceArrival: 0, lastPlayedAt: 0, ...o
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

  it('REGRESSION: no cap -- keep playing and characters keep arriving', () => {
    // There used to be a ceiling of three new characters per half hour. It is
    // gone: the child sets the pace by playing, and nothing else does.
    let st = S();
    let met = 0;
    for (let cast = 1; cast <= 400; cast++) {
      Object.assign(st, applyCast(st, cast));
      if (arrivalDecision(st, { hasUnowned: true }).introduce) {
        Object.assign(st, applyArrival());
        met++;
      }
    }
    expect(met).toBe(50);                     // 400 casts / one per 8
  });

  it('REGRESSION: the clock is gone -- a long sitting is never cut off', () => {
    // Playing for hours used to hit the ceiling and go quiet with no
    // explanation. Time is not consulted at all now.
    const st = S({ castsSinceArrival: DEFAULTS.arrivalEvery, lastPlayedAt: 1 });
    const d = arrivalDecision(st, { hasUnowned: true });
    expect(d.introduce).toBeTruthy();
    expect(d.reason).toBe('due');
  });

  it('stops when every character is known', () => {
    const d = arrivalDecision(S({ castsSinceArrival: 99 }), { hasUnowned: false });
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('all-known');
  });

  it('reports all-known ahead of everything else', () => {
    const st = S({ castsSinceArrival: 99 });
    expect(arrivalDecision(st, { hasUnowned: false }).reason).toBe('all-known');
  });
});

describe('pacing · touchPlay', () => {
  const NOW = 1_000_000_000;

  it('records when play happened, and changes nothing else', () => {
    expect(touchPlay(S(), NOW)).toEqual({ lastPlayedAt: NOW });
    expect(touchPlay(S({ lastPlayedAt: NOW - 10 }), NOW)).toEqual({ lastPlayedAt: NOW });
  });

  it('REGRESSION: reopening the app grants nothing and costs nothing', () => {
    // "session" once meant "page load", so restarting farmed new characters --
    // and later, a long gap was needed to get any. Neither is true now: a
    // reload cannot change how close the next character is.
    const st = S({ castsSinceArrival: 5 });
    const after = { ...st, ...touchPlay(st, NOW) };
    expect(castsUntilArrival(after)).toBe(castsUntilArrival(st));
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

  it('an arrival costs nothing but the interval', () => {
    // There is no budget left to spend. The opening character of a fresh
    // install used to spend one, which walled the first session at two
    // characters, silently and forever.
    expect(applyArrival()).toEqual({ castsSinceArrival: 0 });
  });
});

describe('pacing · full first-session simulation', () => {
  it('delivers 大 free, then one character every 8 casts, without end', () => {
    let st = S();
    const arrivals = [];
    const NOW = 1_000_000;

    Object.assign(st, touchPlay(st, NOW));
    Object.assign(st, applyArrival());          // opening character
    arrivals.push(0);

    for (let cast = 1; cast <= 40; cast++) {
      Object.assign(st, applyCast(st, NOW + cast));
      if (arrivalDecision(st, { hasUnowned: true }).introduce) {
        Object.assign(st, applyArrival());
        arrivals.push(cast);
      }
    }
    // It used to stop at 24, three characters in. It keeps going now.
    expect(arrivals).toEqual([0, 8, 16, 24, 32, 40]);
  });

  it('REGRESSION: a long session does not wall up after two characters', () => {
    // The exact symptom reported: stuck on 小, casting forever, nothing arrives.
    let st = S();
    Object.assign(st, applyArrival());          // 大
    let count = 1;
    for (let cast = 1; cast <= 30; cast++) {
      Object.assign(st, applyCast(st, 1000 + cast));
      if (arrivalDecision(st, { hasUnowned: true }).introduce) {
        Object.assign(st, applyArrival());
        count++;
      }
    }
    expect(count).toBeGreaterThan(2);
  });

  it('REGRESSION: playing straight through a half hour is never interrupted', () => {
    // The old rule reset only after THIRTY IDLE MINUTES, so the one child who
    // played longest was the one most likely to be cut off.
    let st = S();
    let met = 0;
    const HALF_HOUR = 30 * 60 * 1000;
    for (let cast = 1; cast <= 120; cast++) {
      // casts spread across a solid hour of unbroken play
      Object.assign(st, applyCast(st, cast * (HALF_HOUR / 60)));
      if (arrivalDecision(st, { hasUnowned: true }).introduce) {
        Object.assign(st, applyArrival());
        met++;
      }
    }
    expect(met).toBe(15);
  });
});
