import { describe, it, expect } from '../runner.js';
import {
  expandRect, hitBox, contains, pickTarget, overlapsAt, clearSpot, MIN_HIT_RATIO
} from '../../js/core/hittest.js';

const R = (left, top, width, height) => ({ left, top, width, height });

describe('hittest · expandRect', () => {
  it('leaves a big enough rect alone', () => {
    const r = expandRect(R(0, 0, 100, 100), 50, 50);
    expect(r.width).toBe(100);
  });
  it('grows a small rect about its centre', () => {
    const r = expandRect(R(100, 100, 10, 10), 50, 50);
    expect(r.width).toBe(50);
    expect(r.cx).toBe(105);
    expect(r.left).toBe(80);
  });
  it('copes with a rect of no width at all', () => {
    const r = expandRect(R(50, 50, 0, 40), 30, 30);
    expect(r.width).toBe(30);
    expect(r.cx).toBe(50);
  });
});

describe('hittest · hitBox', () => {
  it('REGRESSION: an open door stays aimable even folded nearly edge-on', () => {
    // A door rotated in 3D collapses to a sliver. You could open one and then
    // be unable to close it.
    // Absolute numbers on purpose: comparing against MIN_HIT_RATIO would still
    // pass if the ratio were set to zero, which is the bug.
    const folded = R(100, 100, 6, 140);          // what a rotated door measures
    expect(hitBox(folded, 140).width).toBeGreaterThan(60);
  });

  it('a hit box is never smaller than a usable target', () => {
    for (const w of [0, 3, 20]) {
      expect(hitBox(R(0, 0, w, 100), 120).width).toBeGreaterThan(50);
    }
  });

  it('the floor is a real fraction of the object, not nothing', () => {
    expect(MIN_HIT_RATIO).toBeGreaterThan(0.3);
  });

  it('stays centred on the thing it belongs to', () => {
    const box = hitBox(R(100, 100, 4, 100), 100);
    expect(box.cx).toBe(102);
  });
});

describe('hittest · pickTarget', () => {
  const cat  = { id: 'cat',  rect: R(0, 0, 400, 400), size: 400 };   // huge
  const plant = { id: 'plant', rect: R(150, 150, 60, 60), size: 60 }; // small, on top

  it('returns null when nothing is under the point', () => {
    expect(pickTarget([cat], 9999, 9999)).toBe(null);
    expect(pickTarget([], 10, 10)).toBe(null);
    expect(pickTarget(undefined, 10, 10)).toBe(null);
  });

  it('REGRESSION: aiming at a small thing over a big one hits the small one', () => {
    // A giant cat can cover half the room.
    expect(pickTarget([cat, plant], 180, 180)).toBe('plant');
  });

  it('aiming away from the small thing hits the big one', () => {
    expect(pickTarget([cat, plant], 380, 380)).toBe('cat');
  });

  it('REGRESSION: between two OVERLAPPING things, the nearer centre wins', () => {
    // Smallest-area used to win, which is not what the kid aimed at. The point
    // below is inside BOTH boxes, and the smaller one's centre is further away
    // -- so the two rules disagree and the test can actually tell them apart.
    const big   = { id: 'big',   rect: R(0, 0, 300, 300), size: 300 };   // centre 150
    const small = { id: 'small', rect: R(100, 100, 60, 60), size: 60 };  // centre 130
    const x = 145, y = 145;
    expect(contains(hitBox(big.rect, big.size), x, y)).toBeTruthy();
    expect(contains(hitBox(small.rect, small.size), x, y)).toBeTruthy();
    expect(pickTarget([big, small], x, y)).toBe('big');     // smallest-area says 'small'
  });

  it('and the smaller one wins when it IS the nearer', () => {
    const big   = { id: 'big',   rect: R(0, 0, 300, 300), size: 300 };
    const small = { id: 'small', rect: R(100, 100, 60, 60), size: 60 };
    expect(pickTarget([big, small], 128, 128)).toBe('small');
  });

  it('order of candidates does not change the answer', () => {
    expect(pickTarget([cat, plant], 180, 180)).toBe(pickTarget([plant, cat], 180, 180));
  });
});

describe('hittest · keeping things apart', () => {
  const others = [{ x: 30, halfWidth: 5 }, { x: 60, halfWidth: 5 }];

  it('spots a crowded position', () => {
    expect(overlapsAt(32, 5, others)).toBeTruthy();
    expect(overlapsAt(45, 5, others)).toBeFalsy();
  });

  it('keeps a clear target as it is', () => {
    expect(clearSpot(45, 5, others)).toBe(45);
  });

  it('REGRESSION: nudges aside rather than drifting into something', () => {
    // Overlapping emoji are hard to aim at, and wandering creatures used to
    // walk straight through each other.
    const spot = clearSpot(31, 5, others);
    expect(overlapsAt(spot, 5, others)).toBeFalsy();
  });

  it('stays inside the room', () => {
    expect(clearSpot(-50, 5, others)).toBeGreaterThanOrEqual(8);
    expect(clearSpot(200, 5, others)).toBeLessThanOrEqual(92);
  });

  it('returns null rather than piling up when there is nowhere to go', () => {
    const packed = [];
    for (let x = 8; x <= 92; x += 3) packed.push({ x, halfWidth: 6 });
    expect(clearSpot(50, 6, packed)).toBe(null);
  });
});
