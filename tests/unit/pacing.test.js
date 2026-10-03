import { describe, it, expect } from '../runner.js';
import {
  DEFAULTS, castsUntilArrival, arrivalDecision, learningId, playsStillNeeded,
  touchPlay, applyCast, applyArrival
} from '../../js/core/pacing.js';

const N = DEFAULTS.playsToPass;

// 你 is glue: it arrives through the same drip but cannot be cast.
const CHARS = [
  { id: 'da' }, { id: 'xiao' }, { id: 'shui' },
  { id: 'ni', castable: false }, { id: 'hao', castable: false },
  { id: 'shang' }
];
const S = (o = {}) => ({
  castCount: 0, castsSinceArrival: 0, lastPlayedAt: 0, owned: [], progress: {}, ...o
});
const played = (id, n) => ({ [id]: { plays: n } });
const decide = (st, hasUnowned = true) => arrivalDecision(st, { hasUnowned, chars: CHARS });

describe('pacing · learningId', () => {
  it('is the newest character the kid owns', () => {
    expect(learningId(CHARS, ['da', 'xiao'])).toBe('xiao');
    expect(learningId(CHARS, ['xiao', 'da'])).toBe('da');       // arrival order, not curriculum
  });
  it('REGRESSION: looks past glue, which can never be played', () => {
    // 你 cannot be cast -- there is nothing to drop it on -- so a gate waiting
    // on it would wait forever and no character would ever arrive again.
    expect(learningId(CHARS, ['da', 'shui', 'ni'])).toBe('shui');
    expect(learningId(CHARS, ['da', 'shui', 'ni', 'hao'])).toBe('shui');
  });
  it('is nothing before anything castable is owned', () => {
    expect(learningId(CHARS, [])).toBe(null);
    expect(learningId(CHARS, ['ni'])).toBe(null);
    expect(learningId(CHARS, undefined)).toBe(null);
    expect(learningId(undefined, ['da'])).toBe(null);
  });
});

describe('pacing · playsStillNeeded', () => {
  it('counts down the correct plays of the newest character', () => {
    expect(playsStillNeeded(S({ owned: ['da'] }), CHARS)).toBe(N);
    expect(playsStillNeeded(S({ owned: ['da'], progress: played('da', 1) }), CHARS)).toBe(N - 1);
    expect(playsStillNeeded(S({ owned: ['da'], progress: played('da', N) }), CHARS)).toBe(0);
    expect(playsStillNeeded(S({ owned: ['da'], progress: played('da', 99) }), CHARS)).toBe(0);
  });
  it('REGRESSION: playing the familiar ones does not count', () => {
    // The reported symptom: the kid skipped every new character and played the
    // ones they already knew. Those plays must not earn the next character.
    const st = S({ owned: ['da', 'xiao'], progress: { ...played('da', 500) } });
    expect(playsStillNeeded(st, CHARS)).toBe(N);
  });
  it('reads a save from before plays were counted as zero plays', () => {
    const st = S({ owned: ['da'], progress: { da: { exposures: 40 } } });
    expect(playsStillNeeded(st, CHARS)).toBe(N);
  });
  it('is nothing when there is nothing to learn yet', () => {
    expect(playsStillNeeded(S(), CHARS)).toBe(0);
  });
});

describe('pacing · castsUntilArrival (the floor)', () => {
  it('counts down from the same number as the plays', () => {
    expect(castsUntilArrival(S({ castsSinceArrival: 0 }))).toBe(N);
    expect(castsUntilArrival(S({ castsSinceArrival: N }))).toBe(0);
  });
  it('never goes negative, and treats a missing counter as zero', () => {
    expect(castsUntilArrival(S({ castsSinceArrival: 99 }))).toBe(0);
    expect(castsUntilArrival({})).toBe(N);
  });
});

describe('pacing · arrivalDecision', () => {
  it('waits until the newest character is played correctly, and says which', () => {
    const d = decide(S({ owned: ['da', 'xiao'], castsSinceArrival: 50,
                         progress: played('xiao', N - 1) }));
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('practise');
    expect(d.learning).toBe('xiao');
    expect(d.need).toBe(1);
  });

  it('introduces once it has been', () => {
    const d = decide(S({ owned: ['da', 'xiao'], castsSinceArrival: N,
                         progress: played('xiao', N) }));
    expect(d.introduce).toBeTruthy();
    expect(d.reason).toBe('due');
  });

  it('REGRESSION: endless casts of old characters never bring a new one', () => {
    const d = decide(S({ owned: ['da', 'xiao'], castsSinceArrival: 1000, castCount: 1000,
                         progress: played('da', 1000) }));
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('practise');
  });

  it('REGRESSION: glue arriving never chains straight into the next one', () => {
    // 你 arrives; the gate looks past it to 水, already passed. Without the
    // floor, 好 and then 上 would arrive on the very next casts.
    const justGotNi = S({ owned: ['da', 'shui', 'ni'], castsSinceArrival: 0,
                          progress: played('shui', N) });
    expect(decide(justGotNi).reason).toBe('too-soon');
    expect(decide({ ...justGotNi, castsSinceArrival: N }).introduce).toBeTruthy();
  });

  it('REGRESSION: does not fire on the first cast of a session resuming near a multiple', () => {
    // The old code tested `castCount % 8 === 0` on a persisted total.
    const st = S({ owned: ['da'], castCount: 16, castsSinceArrival: 1, progress: played('da', N) });
    expect(decide(st).introduce).toBeFalsy();
  });

  it('REGRESSION: no cap and no clock -- passing is the only thing that matters', () => {
    const st = S({ owned: ['da'], castsSinceArrival: N, lastPlayedAt: 1, progress: played('da', N) });
    expect(decide(st).introduce).toBeTruthy();
  });

  it('stops when every character is known, ahead of everything else', () => {
    const d = decide(S({ owned: ['da'] }), false);
    expect(d.introduce).toBeFalsy();
    expect(d.reason).toBe('all-known');
  });

  it('skips the practice gate rather than guess, when it cannot tell what is castable', () => {
    // Guessing wrong means waiting on 你 forever. Every real caller passes chars.
    const st = S({ owned: ['da'], castsSinceArrival: N });
    expect(arrivalDecision(st, { hasUnowned: true }).introduce).toBeTruthy();
  });
});

describe('pacing · touchPlay', () => {
  it('records when play happened, and changes nothing else', () => {
    expect(touchPlay(S(), 1000)).toEqual({ lastPlayedAt: 1000 });
  });
  it('REGRESSION: reopening the app grants nothing and costs nothing', () => {
    const st = S({ owned: ['da'], castsSinceArrival: 2, progress: played('da', 1) });
    const after = { ...st, ...touchPlay(st, 9e12) };
    expect(decide(after)).toEqual(decide(st));
  });
});

describe('pacing · applyCast / applyArrival', () => {
  it('a cast advances both counters', () => {
    const p = applyCast(S({ castCount: 4, castsSinceArrival: 2 }), 123);
    expect(p.castCount).toBe(5);
    expect(p.castsSinceArrival).toBe(3);
    expect(p.lastPlayedAt).toBe(123);
  });
  it('an arrival costs nothing but the floor', () => {
    expect(applyArrival()).toEqual({ castsSinceArrival: 0 });
  });
});

describe('pacing · simulated play', () => {
  // A tiny model of the app: each cast either plays the newest character or an
  // old one, and an arrival hands over the next character in curriculum order.
  function run (casts, choose) {
    let st = S({ owned: ['da'], progress: {} });
    const met = ['da'];
    for (let i = 1; i <= casts; i++) {
      const id = choose(st, i);
      Object.assign(st, applyCast(st, i));
      const p = st.progress[id] || {};
      st.progress = { ...st.progress, [id]: { ...p, plays: (p.plays || 0) + 1 } };
      const next = CHARS.find(c => !st.owned.includes(c.id));
      if (decide(st, !!next).introduce) {
        st = { ...st, ...applyArrival(), owned: [...st.owned, next.id] };
        met.push(next.id);
      }
    }
    return met;
  }

  it('REGRESSION: a kid who only plays old characters meets nobody new', () => {
    expect(run(200, () => 'da')).toEqual(['da', 'xiao']);   // xiao arrived; then stuck on it
  });

  it('a kid who plays each new character four times meets one every four casts', () => {
    const met = run(12, st => learningId(CHARS, st.owned));
    expect(met).toEqual(['da', 'xiao', 'shui', 'ni']);
  });

  it('REGRESSION: glue never deadlocks the drip', () => {
    // Playing the newest CASTABLE character carries the kid past 你 and 好.
    const met = run(40, st => learningId(CHARS, st.owned));
    expect(met).toEqual(['da', 'xiao', 'shui', 'ni', 'hao', 'shang']);
  });
});
