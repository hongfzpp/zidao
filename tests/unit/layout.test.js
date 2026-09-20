import { describe, it, expect } from '../runner.js';
import { layoutFor, rowWidth, CARD } from '../../js/core/layout.js';
import { clampScale } from '../../js/core/scale.js';

describe('layout · layoutFor', () => {
  it('uses full-size cards when there is room', () => {
    expect(layoutFor(4, 1024).size).toBe(CARD.max);
  });

  it('REGRESSION: a full hand still fits without scrolling', () => {
    // 12 cards at a fixed 70px overflowed a 1024px iPad by 20px.
    for (const n of [1, 4, 8, 10, 12, 14, 16]) {
      const l = layoutFor(n, 1024);
      expect(rowWidth(n, l)).toBeLessThanOrEqual(1024);
    }
  });

  it('REGRESSION: fits on the narrower iPad portrait width too', () => {
    // 16 cards at 768px needed 966px before wrapping existed.
    for (const n of [8, 12, 16, 20]) {
      expect(rowWidth(n, layoutFor(n, 768))).toBeLessThanOrEqual(768);
    }
  });

  it('wraps to a second row rather than scrolling when a row cannot stay legible', () => {
    const l = layoutFor(16, 768);
    expect(l.rows).toBeGreaterThan(1);
    expect(l.size).toBeGreaterThanOrEqual(CARD.min);
  });

  it('keeps a single row whenever one fits', () => {
    expect(layoutFor(8, 1024).rows).toBe(1);
    expect(layoutFor(12, 1024).rows).toBe(1);
  });

  it('never exceeds the host at any plausible width or hand size', () => {
    for (const w of [320, 480, 768, 834, 1024, 1180, 1366]) {
      for (let n = 1; n <= 24; n++) {
        expect(rowWidth(n, layoutFor(n, w))).toBeLessThanOrEqual(w);
      }
    }
  });

  it('never shrinks below the legible minimum', () => {
    expect(layoutFor(40, 320).size).toBeGreaterThanOrEqual(CARD.min);
  });

  it('tightens the gap for big hands', () => {
    expect(layoutFor(12, 1024).gap).toBe(10);
    expect(layoutFor(6, 1024).gap).toBe(16);
  });

  it('handles an empty hand without dividing by zero', () => {
    const l = layoutFor(0, 1024);
    expect(l.size).toBe(CARD.max);
    expect(rowWidth(0, l)).toBe(0);
  });
});

describe('scale · clampScale', () => {
  it('multiplies', () => { expect(clampScale(1, 2)).toBe(2); });
  it('clamps at the ceiling', () => { expect(clampScale(4, 3, { max: 5 })).toBe(5); });
  it('clamps at the floor', () => { expect(clampScale(0.2, 0.1, { min: 0.15 })).toBe(0.15); });
  it('is reversible within range', () => {
    const big = clampScale(1, 2.7);
    expect(clampScale(big, 1 / 2.7)).toBe(1);
  });
  it('survives rubbish input', () => {
    expect(clampScale(undefined, 2)).toBe(2);
    expect(clampScale(1, undefined)).toBe(1);
    expect(clampScale(NaN, NaN)).toBe(1);
  });
});

import { REAL_TIMINGS, TIMINGS, FAST, DEV_HOLD_MS, devFlagFromUrl } from '../../js/timings.js';

describe('timings', () => {
  it('production values are the real ones', () => {
    expect(REAL_TIMINGS.arrivalDelayMs).toBe(900);
    expect(REAL_TIMINGS.parentHoldMs).toBe(1500);
  });
  it('dev mode opens the parent gate faster than a parent ever would', () => {
    expect(DEV_HOLD_MS).toBeLessThan(REAL_TIMINGS.parentHoldMs);
  });

  it('the dev flag is only read from an explicit ?dev=, never guessed', () => {
    expect(devFlagFromUrl()).toBe(null);      // this page has no ?dev=
  });

  it('the test suite runs with shortened timings', () => {
    // the suite loads the app with ?test=1; this page itself does not.
    expect(FAST ? TIMINGS.parentHoldMs < 500 : TIMINGS.parentHoldMs === 1500).toBeTruthy();
  });
});
