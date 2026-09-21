import { describe, it, expect } from '../runner.js';
import {
  isDistractor, distractorGlyph, toDistractorId, decoyCount, decoyPool,
  shuffle, pickDecoys, pruneDecoys, buildHand, glyphFor
} from '../../js/core/hand.js';
import { selectPouch, realSlots, MAX_POUCH, MIN_REAL, castableOwned } from '../../js/core/hand.js';
import { mulberry32 } from '../../js/core/rng.js';

const CHARS = [
  { id: 'da',   char: '大', confusables: ['太', '天', '犬', '木'] },
  { id: 'xiao', char: '小', confusables: ['少', '尔', '水', '木'] },
  { id: 'shui', char: '水', confusables: ['木', '永', '小', '求'] },
  { id: 'men',  char: '门', confusables: ['问', '们', '间', '闭'] }
];

describe('hand · distractor ids', () => {
  it('round-trips a glyph', () => {
    expect(distractorGlyph(toDistractorId('太'))).toBe('太');
  });
  it('tells decoys from real ids', () => {
    expect(isDistractor('x:太')).toBeTruthy();
    expect(isDistractor('da')).toBeFalsy();
  });
  it('does not treat a real id containing x as a decoy', () => {
    expect(isDistractor('xiao')).toBeFalsy();
  });
});

describe('hand · decoyCount', () => {
  it('is whatever the pouch is not owing to real characters', () => {
    expect(decoyCount(0)).toBe(0);
    expect(decoyCount(1)).toBe(MAX_POUCH - MIN_REAL);
    expect(decoyCount(37)).toBe(MAX_POUCH - MIN_REAL);
  });

  it('REGRESSION: decoys never crowd out a whole unit of characters', () => {
    // No unit has more than six castable characters, so six real slots means
    // everything currently being learnt is always reachable.
    for (const owned of [1, 4, 8, 20, 37]) {
      expect(realSlots(decoyCount(owned))).toBeGreaterThanOrEqual(6);
      expect(decoyCount(owned) + realSlots(decoyCount(owned)))
        .toBeLessThanOrEqual(MAX_POUCH);
    }
  });
  it('is zero when nothing is owned', () => {
    expect(decoyCount(0)).toBe(0);
  });
});

describe('hand · decoyPool', () => {
  it('draws only from the confusables of OWNED characters', () => {
    const pool = decoyPool(CHARS, ['da']);
    expect(pool).toContain('太');
    expect(pool).toContain('犬');
    expect(pool).notToContain('问');     // 门 is not owned
  });

  it('never offers a curriculum character as a decoy', () => {
    // 小 is in 水's confusables and 水 is in 小's -- both are taught, so neither
    // may appear as a decoy or the kid would be "wrong" for picking a real one.
    const pool = decoyPool(CHARS, ['xiao', 'shui']);
    expect(pool).notToContain('小');
    expect(pool).notToContain('水');
  });

  it('is empty when nothing is owned', () => {
    expect(decoyPool(CHARS, [])).toHaveLength(0);
  });

  it('deduplicates glyphs shared by several characters', () => {
    const pool = decoyPool(CHARS, ['da', 'xiao']);   // 木 is in both
    expect(pool.filter(g => g === '木')).toHaveLength(1);
  });
});

describe('hand · shuffle', () => {
  it('preserves every element', () => {
    const src = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffle(src, mulberry32(1));
    expect(out).toHaveLength(5);
    for (const x of src) expect(out).toContain(x);
  });
  it('does not mutate the input', () => {
    const src = ['a', 'b', 'c'];
    shuffle(src, mulberry32(2));
    expect(src).toEqual(['a', 'b', 'c']);
  });
  it('is deterministic for a given seed', () => {
    expect(shuffle(['a','b','c','d'], mulberry32(7)))
      .toEqual(shuffle(['a','b','c','d'], mulberry32(7)));
  });
  it('actually reorders across many draws', () => {
    const src = ['a','b','c','d','e','f'];
    const seen = new Set();
    for (let s = 0; s < 40; s++) seen.add(shuffle(src, mulberry32(s)).join(''));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('hand · pickDecoys', () => {
  it('returns the right number of decoy ids', () => {
    const d = pickDecoys(CHARS, ['da', 'xiao'], mulberry32(3));
    expect(d).toHaveLength(2);
    for (const id of d) expect(isDistractor(id)).toBeTruthy();
  });
  it('never exceeds the available pool', () => {
    const tiny = [{ id: 'a', char: 'A', confusables: ['Z'] }];
    expect(pickDecoys(tiny, ['a'], mulberry32(1))).toHaveLength(1);
  });
  it('returns nothing when nothing is owned', () => {
    expect(pickDecoys(CHARS, [], mulberry32(1))).toHaveLength(0);
  });
  it('never returns duplicates', () => {
    const d = pickDecoys(CHARS, ['da','xiao','shui','men'], mulberry32(11));
    expect(new Set(d).size).toBe(d.length);
  });
});

describe('hand · pruneDecoys', () => {
  it('drops a decoy once the kid is taught that character', () => {
    const decoys = [toDistractorId('水'), toDistractorId('太')];
    const kept = pruneDecoys(CHARS, ['da', 'shui'], decoys);
    expect(kept).toEqual([toDistractorId('太')]);
  });
  it('keeps decoys that are still out of curriculum', () => {
    expect(pruneDecoys(CHARS, ['da'], [toDistractorId('太')])).toHaveLength(1);
  });
});

describe('hand · buildHand', () => {
  it('contains every owned character plus the decoys', () => {
    const owned = ['da', 'xiao'];
    const decoys = [toDistractorId('太'), toDistractorId('少')];
    const hand = buildHand(owned, decoys, mulberry32(5));
    expect(hand).toHaveLength(4);
    for (const id of [...owned, ...decoys]) expect(hand).toContain(id);
  });

  it('REGRESSION: free play is preserved — nothing owned is ever withheld', () => {
    const owned = ['da','xiao','shui','men'];
    const hand = buildHand(owned, [toDistractorId('太')], mulberry32(9));
    for (const id of owned) expect(hand).toContain(id);
  });

  it('order varies between shuffles so position cannot substitute for reading', () => {
    const owned = ['da','xiao','shui','men'];
    const decoys = [toDistractorId('太'), toDistractorId('少')];
    const seen = new Set();
    for (let s = 0; s < 30; s++) seen.add(buildHand(owned, decoys, mulberry32(s)).join(','));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('REGRESSION: the decoy SET is stable across reshuffles', () => {
    // If decoys were redrawn each shuffle, the cards that persisted would be
    // exactly the real ones -- a free answer.
    const owned = ['da','xiao'];
    const decoys = [toDistractorId('太'), toDistractorId('少')];
    const a = new Set(buildHand(owned, decoys, mulberry32(1)).filter(isDistractor));
    const b = new Set(buildHand(owned, decoys, mulberry32(2)).filter(isDistractor));
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe('hand · glyphFor', () => {
  it('resolves real ids and decoys alike', () => {
    expect(glyphFor(CHARS, 'da')).toBe('大');
    expect(glyphFor(CHARS, toDistractorId('太'))).toBe('太');
  });
  it('degrades safely on an unknown id', () => {
    expect(glyphFor(CHARS, 'nope')).toBe('?');
  });
});

describe('hand · the pouch is capped', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: 'c' + i, char: String.fromCharCode(0x4e00 + i), castable: true, confusables: ['々']
  }));
  const owned = many.map(c => c.id);
  const P = (box, dueAt = 0) => ({ box, dueAt });

  it('REGRESSION: it does not grow without limit', () => {
    // Thirty-odd cards is not a pouch, it is a wall, and a small child faced
    // with a wall of choices picks nothing.
    expect(selectPouch(many, owned, { max: 8, rng: mulberry32(1) })).toHaveLength(8);
  });

  it('REGRESSION: the whole pouch stays small enough to take in at a glance', () => {
    // Twelve was still too many next to a unit of six.
    expect(MAX_POUCH).toBeLessThanOrEqual(8);
    expect(decoyCount(37) + realSlots(decoyCount(37))).toBeLessThanOrEqual(MAX_POUCH);
  });

  it('shows everything while everything fits', () => {
    const few = owned.slice(0, 5);
    expect(selectPouch(many, few, { max: 12, rng: mulberry32(1) }).sort())
      .toEqual([...few].sort());
  });

  it('REGRESSION: the character just learnt is ALWAYS there', () => {
    // It is the one they want to try.
    const newest = owned[owned.length - 1];
    for (let s = 0; s < 40; s++) {
      expect(selectPouch(many, owned, { max: 12, rng: mulberry32(s) })).toContain(newest);
    }
  });

  it('keeps a shaky character and drops a solid one', () => {
    const progress = {};
    owned.forEach((id, i) => { progress[id] = P(i < 15 ? 5 : 0); });   // first 15 solid
    let shakyKept = 0, solidKept = 0;
    for (let s = 0; s < 40; s++) {
      const shown = selectPouch(many, owned, { max: 12, progress, rng: mulberry32(s) });
      shakyKept += shown.filter(id => progress[id].box === 0).length;
      solidKept += shown.filter(id => progress[id].box === 5).length;
    }
    expect(shakyKept).toBeGreaterThan(solidKept);
  });

  it('a character that is due outranks one that is not', () => {
    const now = 1000;
    const progress = {};
    owned.forEach((id, i) => { progress[id] = P(2, i < 5 ? now - 1 : now + 1e9); });
    let dueKept = 0;
    for (let s = 0; s < 30; s++) {
      const shown = selectPouch(many, owned, { max: 12, progress, now, rng: mulberry32(s) });
      dueKept += shown.filter(id => progress[id].dueAt <= now).length;
    }
    expect(dueKept).toBeGreaterThan(30 * 3);      // most of the 5 due ones, most rounds
  });

  it('REGRESSION: a pinned character is ALWAYS kept, however long ago it was learnt', () => {
    // Re-showing a character for review does not move it in `owned`, so without
    // an explicit pin whether it then appeared was a coin flip -- measured at
    // 93 out of 200.
    const oldest = owned[0];
    for (let s = 0; s < 100; s++) {
      expect(selectPouch(many, owned, { max: 8, pinned: oldest, rng: mulberry32(s) }))
        .toContain(oldest);
    }
  });

  it('accepts several pins at once', () => {
    const pins = [owned[0], owned[1]];
    const shown = selectPouch(many, owned, { max: 8, pinned: pins, rng: mulberry32(2) });
    for (const id of pins) expect(shown).toContain(id);
  });

  it('ignores a pin for something not owned, rather than breaking', () => {
    const shown = selectPouch(many, owned, { max: 8, pinned: 'nope', rng: mulberry32(2) });
    expect(shown).toHaveLength(8);
    expect(shown).notToContain('nope');
  });

  it('a pin never displaces the newest character', () => {
    const newest = owned[owned.length - 1];
    const shown = selectPouch(many, owned, { max: 8, pinned: owned[0], rng: mulberry32(5) });
    expect(shown).toContain(newest);
    expect(shown).toContain(owned[0]);
  });

  it('the set rotates — nothing is dropped for good', () => {
    const seen = new Set();
    for (let s = 0; s < 60; s++) {
      for (const id of selectPouch(many, owned, { max: 12, rng: mulberry32(s) })) seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(12);
  });

  it('never shows a character twice', () => {
    for (let s = 0; s < 20; s++) {
      const shown = selectPouch(many, owned, { max: 12, rng: mulberry32(s) });
      expect(new Set(shown).size).toBe(shown.length);
    }
  });

  it('never shows a glue character', () => {
    const withGlue = [...many, { id: 'ni', char: '你', castable: false, confusables: ['他'] }];
    const shown = selectPouch(withGlue, [...owned, 'ni'], { max: 12, rng: mulberry32(3) });
    expect(shown).notToContain('ni');
  });

  it('realSlots leaves room for the decoys but never starves the real ones', () => {
    expect(realSlots(2)).toBe(MAX_POUCH - 2);
    expect(realSlots(20)).toBe(MIN_REAL);
  });
});
