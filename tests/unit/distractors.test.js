import { describe, it, expect } from '../runner.js';
import {
  SIMILARITY, similarityFor, candidatePools, pickPromptDistractors, buildPrompt
} from '../../js/core/distractors.js';
import { isDistractor, distractorGlyph } from '../../js/core/hand.js';
import { mulberry32 } from '../../js/core/rng.js';

const CHARS = [
  { id: 'da',   char: '大', confusables: ['太', '天', '犬', '木'] },
  { id: 'xiao', char: '小', confusables: ['少', '尔', '水', '木'] },
  { id: 'shui', char: '水', confusables: ['木', '永', '小', '求'] },
  { id: 'huo',  char: '火', confusables: ['大', '人', '米', '长'] },
  { id: 'men',  char: '门', confusables: ['问', '们', '间', '闭'] }
];
const OWNED = ['da', 'xiao', 'shui', 'huo', 'men'];
const DA = CHARS[0];

describe('distractors · similarityFor', () => {
  it('ramps with the box', () => {
    expect(similarityFor(0)).toBe(SIMILARITY.easy);
    expect(similarityFor(1)).toBe(SIMILARITY.easy);
    expect(similarityFor(2)).toBe(SIMILARITY.mixed);
    expect(similarityFor(3)).toBe(SIMILARITY.mixed);
    expect(similarityFor(4)).toBe(SIMILARITY.hard);
    expect(similarityFor(5)).toBe(SIMILARITY.hard);
  });
});

describe('distractors · candidatePools', () => {
  it('near holds the target\'s own confusables', () => {
    const { near } = candidatePools(DA, CHARS, OWNED);
    expect(near).toContain('x:太');      // not taught -> an inert decoy glyph
    expect(near).toContain('x:犬');
  });
  it('a confusable we DO teach comes through as that real character', () => {
    const huo = CHARS.find(c => c.id === 'huo');     // 火's confusables include 大
    expect(candidatePools(huo, CHARS, OWNED).near).toContain('da');
  });
  it('the target is never its own distractor', () => {
    const { near, far } = candidatePools(DA, CHARS, OWNED);
    expect(near).notToContain('da');
    expect(far).notToContain('da');
  });
  it('far excludes anything already in near', () => {
    const { near, far } = candidatePools(DA, CHARS, OWNED);
    for (const id of far) expect(near).notToContain(id);
  });
  it('far has no duplicates', () => {
    const { far } = candidatePools(DA, CHARS, OWNED);
    expect(new Set(far).size).toBe(far.length);
  });
});

describe('distractors · pickPromptDistractors', () => {
  it('a brand-new character gets easy, dissimilar wrong answers', () => {
    const { near } = candidatePools(DA, CHARS, OWNED);
    let nearHits = 0, total = 0;
    for (let s = 0; s < 60; s++) {
      for (const id of pickPromptDistractors(DA, CHARS, OWNED, 0, 2, mulberry32(s))) {
        if (near.includes(id)) nearHits++;
        total++;
      }
    }
    expect(nearHits / total).toBeLessThanOrEqual(0.2);
  });

  it('a well-known character gets its nearest confusables — the real test', () => {
    const { near } = candidatePools(DA, CHARS, OWNED);
    for (let s = 0; s < 40; s++) {
      for (const id of pickPromptDistractors(DA, CHARS, OWNED, 5, 2, mulberry32(s))) {
        expect(near).toContain(id);
      }
    }
  });

  it('mixed sits between the two', () => {
    const { near } = candidatePools(DA, CHARS, OWNED);
    let nearHits = 0, total = 0;
    for (let s = 0; s < 60; s++) {
      for (const id of pickPromptDistractors(DA, CHARS, OWNED, 3, 2, mulberry32(s))) {
        if (near.includes(id)) nearHits++;
        total++;
      }
    }
    expect(nearHits / total).toBeGreaterThan(0.2);
    expect(nearHits / total).toBeLessThanOrEqual(0.85);
  });

  it('always returns the requested number', () => {
    for (const box of [0, 2, 5]) {
      for (let s = 0; s < 20; s++) {
        expect(pickPromptDistractors(DA, CHARS, OWNED, box, 3, mulberry32(s))).toHaveLength(3);
      }
    }
  });

  it('never repeats a distractor', () => {
    for (let s = 0; s < 30; s++) {
      const d = pickPromptDistractors(DA, CHARS, OWNED, 3, 3, mulberry32(s));
      expect(new Set(d).size).toBe(d.length);
    }
  });

  it('copes when the kid owns almost nothing', () => {
    const d = pickPromptDistractors(DA, CHARS, ['da'], 0, 2, mulberry32(4));
    expect(d.length).toBeGreaterThan(0);
    expect(d).notToContain('da');
  });
});

describe('distractors · buildPrompt', () => {
  it('the answer is always among the cards', () => {
    for (let s = 0; s < 30; s++) {
      const p = buildPrompt(DA, CHARS, OWNED, 2, 2, mulberry32(s));
      expect(p.cards).toContain('da');
      expect(p.cards).toHaveLength(3);
    }
  });
  it('the answer is not always in the same place', () => {
    const positions = new Set();
    for (let s = 0; s < 40; s++) {
      positions.add(buildPrompt(DA, CHARS, OWNED, 2, 2, mulberry32(s)).cards.indexOf('da'));
    }
    expect(positions.size).toBeGreaterThan(1);
  });
  it('reports the difficulty it used', () => {
    expect(buildPrompt(DA, CHARS, OWNED, 5, 2, mulberry32(1)).similarity).toBe(SIMILARITY.hard);
  });
  it('decoy cards carry a glyph we can render', () => {
    const p = buildPrompt(DA, CHARS, OWNED, 5, 2, mulberry32(2));
    for (const id of p.cards) {
      if (isDistractor(id)) expect(distractorGlyph(id).length).toBeGreaterThan(0);
    }
  });
});
