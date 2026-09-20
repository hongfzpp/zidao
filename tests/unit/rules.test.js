import { describe, it, expect } from '../runner.js';
import { specificity, findRule, pickVariant, chooseSteps } from '../../js/core/rules.js';
import { mulberry32 } from '../../js/core/rng.js';
import { toDistractorId } from '../../js/core/hand.js';

const CAT  = { id: 'cat',  tags: ['creature', 'animal', 'cat'] };   // matches data/scenes/house.json
const BED  = { id: 'bed',  tags: ['furniture'] };
const LAMP = { id: 'lamp', tags: ['lightable'] };

const NOUN_RULES = [
  { char: 'mao', target: { tag: 'cat' }, variants: [{ w: 1, steps: ['MEW'] }] },
  { char: 'mao', target: { any: true }, noEffect: true, variants: [{ w: 1, steps: ['nothing'] }] }
];
const NOUN_DATA = {
  rules: NOUN_RULES,
  fallback: { variants: [{ w: 1, steps: ['FALLBACK'] }] },
  fizzle: { variants: [{ w: 1, steps: ['FIZZLE'] }] },
  firstCastFlourish: { steps: ['FLOURISH'] }
};

const RULES = [
  { char: 'da', target: { id: 'cat' },          variants: [{ w: 1, steps: ['cat-specific'] }],
    golden: { steps: ['GOLDEN'] } },
  { char: 'da', target: { tag: 'creature' },    variants: [{ w: 1, steps: ['creature'] }] },
  { char: 'da', target: { any: true },          variants: [{ w: 1, steps: ['any'] }] },
  { char: 'kai', target: { id: 'lamp' },        variants: [{ w: 1, steps: ['lamp'] }] }
];
const DATA = {
  rules: RULES,
  fallback: { variants: [{ w: 1, steps: ['FALLBACK'] }] },
  fizzle:   { variants: [{ w: 1, steps: ['FIZZLE'] }] },
  firstCastFlourish: { steps: ['FLOURISH'] }
};

describe('rules · specificity', () => {
  it('ranks id above tag above any', () => {
    expect(specificity({ id: 'cat' }, CAT)).toBe(3);
    expect(specificity({ tag: 'creature' }, CAT)).toBe(2);
    expect(specificity({ any: true }, CAT)).toBe(1);
  });
  it('is zero when it does not match', () => {
    expect(specificity({ id: 'cat' }, BED)).toBe(0);
    expect(specificity({ tag: 'creature' }, BED)).toBe(0);
  });
  it('is zero for a malformed target', () => {
    expect(specificity({}, CAT)).toBe(0);
    expect(specificity(null, CAT)).toBe(0);
  });
  it('tolerates an object with no tags', () => {
    expect(specificity({ tag: 'creature' }, { id: 'x' })).toBe(0);
  });
});

describe('rules · findRule', () => {
  it('prefers the most specific match', () => {
    expect(findRule(RULES, 'da', CAT).target).toEqual({ id: 'cat' });
  });
  it('falls back to a tag rule', () => {
    const r = findRule(RULES, 'da', { id: 'dog', tags: ['creature'] });
    expect(r.target).toEqual({ tag: 'creature' });
  });
  it('falls back to the any rule', () => {
    expect(findRule(RULES, 'da', BED).target).toEqual({ any: true });
  });
  it('returns null when the character has no rules at all', () => {
    expect(findRule(RULES, 'nosuch', CAT)).toBe(null);
  });
  it('does not leak rules across characters', () => {
    expect(findRule(RULES, 'kai', CAT)).toBe(null);   // kai only has a lamp rule
    expect(findRule(RULES, 'kai', LAMP).target).toEqual({ id: 'lamp' });
  });
});

describe('rules · pickVariant', () => {
  const V = [{ w: 1, steps: ['a'] }, { w: 1, steps: ['b'] }, { w: 1, steps: ['c'] }];

  it('returns null for an empty list', () => {
    expect(pickVariant([], -1, mulberry32(1))).toBe(null);
    expect(pickVariant(undefined, -1, mulberry32(1))).toBe(null);
  });
  it('returns the only variant when there is one', () => {
    expect(pickVariant([V[0]], 0, mulberry32(1)).index).toBe(0);
  });
  it('never repeats the previous index', () => {
    for (let s = 0; s < 50; s++) {
      expect(pickVariant(V, 1, mulberry32(s)).index).toBeGreaterThanOrEqual(0);
      expect(pickVariant(V, 1, mulberry32(s)).index === 1).toBeFalsy();
    }
  });
  it('respects weights', () => {
    const weighted = [{ w: 1, steps: ['rare'] }, { w: 99, steps: ['common'] }];
    let common = 0;
    for (let s = 0; s < 200; s++) {
      if (pickVariant(weighted, -1, mulberry32(s)).index === 1) common++;
    }
    expect(common).toBeGreaterThan(180);
  });
  it('still returns something when all alternatives are excluded', () => {
    const one = [{ w: 1, steps: ['only'] }, { w: 0, steps: ['never'] }];
    expect(pickVariant(one, 0, mulberry32(3))).toBeTruthy();
  });
});

describe('rules · chooseSteps', () => {
  const always = () => 0.99;   // never rolls golden by chance

  it('routes a decoy to fizzle and never to a cast rule', () => {
    const r = chooseSteps(DATA, { charId: toDistractorId('太'), rec: CAT, rng: always });
    expect(r.kind).toBe('fizzle');
    expect(r.steps).toEqual(['FIZZLE']);
  });

  it('REGRESSION: a decoy fizzles even on a target with a matching rule', () => {
    const r = chooseSteps(DATA, { charId: toDistractorId('大'), rec: CAT, rng: always });
    expect(r.kind).toBe('fizzle');
  });

  it('picks the specific rule for a normal cast', () => {
    const r = chooseSteps(DATA, { charId: 'da', rec: CAT, rng: always });
    expect(r.steps).toEqual(['cat-specific']);
    expect(r.kind).toBe('normal');
  });

  it('REGRESSION: the FIRST cast is always spectacular, never a 5% roll', () => {
    for (let s = 0; s < 40; s++) {
      const r = chooseSteps(DATA, { charId: 'da', rec: CAT, isFirstCast: true, rng: mulberry32(s) });
      expect(r.kind).toBe('golden');
    }
  });

  it('a first cast with no golden still gets the flourish appended', () => {
    const r = chooseSteps(DATA, { charId: 'da', rec: BED, isFirstCast: true, rng: always });
    expect(r.steps).toContain('FLOURISH');
    expect(r.steps).toContain('any');
  });

  it('later casts are ordinary', () => {
    const r = chooseSteps(DATA, { charId: 'da', rec: CAT, isFirstCast: false, rng: always });
    expect(r.kind).toBe('normal');
    expect(r.steps).notToContain('FLOURISH');
  });

  it('rolls golden occasionally after the first cast', () => {
    let golden = 0;
    for (let s = 0; s < 400; s++) {
      if (chooseSteps(DATA, { charId: 'da', rec: CAT, rng: mulberry32(s) }).kind === 'golden') golden++;
    }
    expect(golden).toBeGreaterThan(0);
    expect(golden).toBeLessThanOrEqual(80);      // ~5%, generous bound
  });

  it('REGRESSION: an unmatched character falls back — never a dead tap', () => {
    const r = chooseSteps(DATA, { charId: 'nosuch', rec: BED, rng: always });
    expect(r.kind).toBe('fallback');
    expect(r.steps).toHaveLength(1);
  });

  it('ALWAYS returns steps for every character × every target', () => {
    const chars = ['da', 'kai', 'nosuch', toDistractorId('太')];
    const recs = [CAT, BED, LAMP, { id: 'weird', tags: [] }];
    for (const c of chars) for (const rec of recs) for (const first of [true, false]) {
      const r = chooseSteps(DATA, { charId: c, rec, isFirstCast: first, rng: mulberry32(1) });
      expect(r.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('rules · nouns act only on what they name', () => {
  const always = () => 0.99;

  it('猫 on the cat gets its sound', () => {
    const r = chooseSteps(NOUN_DATA, { charId: 'mao', rec: CAT, rng: always });
    expect(r.steps).toEqual(['MEW']);
  });

  it('猫 on anything else does nothing — no transformation, no spawn', () => {
    const r = chooseSteps(NOUN_DATA, { charId: 'mao', rec: BED, rng: always });
    expect(r.steps).toEqual(['nothing']);
  });

  it('a noEffect cast is still a response, never a dead tap', () => {
    const r = chooseSteps(NOUN_DATA, { charId: 'mao', rec: LAMP, rng: always });
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('REGRESSION: a noEffect cast does not get the celebratory flourish', () => {
    // sparkle + chime on "nothing happened" reads as success and teaches the
    // wrong thing.
    const r = chooseSteps(NOUN_DATA, { charId: 'mao', rec: BED, isFirstCast: true, rng: always });
    expect(r.steps).notToContain('FLOURISH');
  });

  it('REGRESSION: a noEffect cast does not spend the first-cast moment', () => {
    // Otherwise a kid who tries 猫 on the bed first never gets the special
    // moment when they finally find the cat.
    const wrong = chooseSteps(NOUN_DATA, { charId: 'mao', rec: BED, isFirstCast: true, rng: always });
    expect(wrong.consumedFirstCast).toBeFalsy();

    const right = chooseSteps(NOUN_DATA, { charId: 'mao', rec: CAT, isFirstCast: true, rng: always });
    expect(right.consumedFirstCast).toBeTruthy();
    expect(right.steps).toContain('FLOURISH');
  });

  it('a decoy never spends the first-cast moment either', () => {
    const r = chooseSteps(NOUN_DATA, { charId: 'x:太', rec: CAT, isFirstCast: true, rng: always });
    expect(r.consumedFirstCast).toBeFalsy();
  });
});
