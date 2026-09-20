import { describe, it, expect } from '../runner.js';
import { normalise, acceptedFor, matchSpoken, score, verdict } from '../../js/core/speechmatch.js';

const CHARS = [
  { id: 'da',   char: '大', homophones: ['打', '答', '搭'] },
  { id: 'kai',  char: '开', homophones: ['揩'] },
  { id: 'men',  char: '门', homophones: ['们', '闷'] },
  { id: 'mao',  char: '猫', homophones: ['毛', '帽'] },
  { id: 'chuang_w', char: '窗', homophones: ['创'] },
  { id: 'chuang_b', char: '床', homophones: ['闯'] }
];

describe('speech · normalise', () => {
  it('strips punctuation and spaces the recogniser adds', () => {
    expect(normalise(['猫， 开 门。'])).toEqual(['猫开门']);
    expect(normalise(['猫, 开\u3000门!'])).toEqual(['猫开门']);
    expect(normalise(['ok 大 123'])).toEqual(['大']);
  });
  it('keeps every alternative and adds a joined one', () => {
    expect(normalise(['猫', '开'])).toEqual(['猫', '开', '猫开']);
  });
  it('survives nothing at all', () => {
    expect(normalise([])).toHaveLength(0);
    expect(normalise(undefined)).toHaveLength(0);
    expect(normalise([''])).toHaveLength(0);
  });
});

describe('speech · matchSpoken', () => {
  it('accepts the exact character', () => {
    expect(matchSpoken(['大'], ['大'], CHARS).said).toEqual(['大']);
  });

  it('REGRESSION: accepts a homophone — a right sound heard as a wrong character', () => {
    // 大 comes back as 打 constantly. Marking that wrong would fail a child for
    // saying exactly the right thing.
    expect(matchSpoken(['大'], ['打'], CHARS).said).toEqual(['大']);
    expect(matchSpoken(['猫'], ['毛'], CHARS).said).toEqual(['猫']);
  });

  it('matches a whole line at once', () => {
    expect(matchSpoken(['猫','开','门'], ['猫开门'], CHARS).said).toEqual(['猫','开','门']);
  });

  it('reports partial success rather than all-or-nothing', () => {
    expect(matchSpoken(['猫','开','门'], ['猫门'], CHARS).said).toEqual(['猫','门']);
  });

  it('searches every alternative the recogniser offers', () => {
    expect(matchSpoken(['开'], ['凯', '开'], CHARS).said).toEqual(['开']);
  });

  it('REGRESSION: never accepts one curriculum character for another', () => {
    // 窗 chuāng and 床 chuáng differ only in tone. Accepting one for the other
    // would teach nothing, and these are exactly the pair worth getting right.
    expect(matchSpoken(['窗'], ['床'], CHARS).said).toHaveLength(0);
    expect(matchSpoken(['床'], ['窗'], CHARS).said).toHaveLength(0);
  });

  it('says nothing was said when nothing was heard', () => {
    expect(matchSpoken(['大'], [], CHARS).said).toHaveLength(0);
    expect(matchSpoken(['大'], [''], CHARS).said).toHaveLength(0);
  });

  it('ignores unrelated speech', () => {
    expect(matchSpoken(['大'], ['今天天气很好'], CHARS).said).toHaveLength(0);
  });

  it('ignores a glyph we do not teach', () => {
    expect(matchSpoken(['龍'], ['龍'], CHARS).said).toHaveLength(0);
  });

  it('keeps the best transcript for the parent, and only the parent', () => {
    expect(matchSpoken(['大'], ['打', '大'], CHARS).heard).toBe('打');
  });

  it('never returns duplicates for a repeated character', () => {
    const r = matchSpoken(['好','好'], ['好'], [{ id:'hao', char:'好', homophones:[] }]);
    expect(r.said).toHaveLength(2);        // both positions count as said
  });
});

describe('speech · verdict — there is no "wrong"', () => {
  it('all, some, or an invitation to try again', () => {
    expect(verdict(['猫','开'], ['猫','开'])).toBe('all');
    expect(verdict(['猫','开'], ['猫'])).toBe('some');
    expect(verdict(['猫','开'], [])).toBe('again');
  });
  it('score is a fraction', () => {
    expect(score(['a','b','c','d'], ['a','b'])).toBe(0.5);
    expect(score([], [])).toBe(0);
  });
});

describe('speech · acceptedFor', () => {
  it('always includes the character itself', () => {
    expect(acceptedFor(CHARS[0])).toContain('大');
  });
  it('tolerates a character with no homophones listed', () => {
    expect(acceptedFor({ char: '国' })).toEqual(['国']);
  });
});
