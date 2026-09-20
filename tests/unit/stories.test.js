import { describe, it, expect } from '../runner.js';
import {
  storyGlyphs, undeclaredGlyphs, isUnlocked, unlockedStories, nextUnread, newGlue,
  missingFor, shelf, closestLocked
} from '../../js/core/stories.js';

const CHARS = [
  { id: 'mao', char: '猫', castable: true },
  { id: 'kai', char: '开', castable: true },
  { id: 'men', char: '门', castable: true },
  { id: 'ni',  char: '你', castable: false },
  { id: 'hao', char: '好', castable: false }
];
const S = (o = {}) => ({ id: 's', requires: [], introduces: [], pages: [], ...o });
const STORY = S({
  id: 'kai-men', requires: ['mao', 'kai', 'men'],
  pages: [{ art: '🚪', text: ['门'] }, { art: '🐱🚪', text: ['猫', '开', '门'] }]
});

describe('stories · storyGlyphs', () => {
  it('collects every character used', () => {
    expect(storyGlyphs(STORY).sort().join('')).toBe('开猫门');
  });
  it('ignores whitespace and empty pages', () => {
    expect(storyGlyphs(S({ pages: [{ text: ['  ', ''] }] }))).toHaveLength(0);
    expect(storyGlyphs(S())).toHaveLength(0);
  });
});

describe('stories · undeclaredGlyphs — the decodable guarantee', () => {
  it('passes a story that declares everything it uses', () => {
    expect(undeclaredGlyphs(STORY, CHARS)).toHaveLength(0);
  });

  it('REGRESSION: catches a character used but not declared', () => {
    // This is exactly the mistake made writing the first story: 小 appeared on
    // a page without being in requires[], which would show the kid a character
    // they had never met.
    const bad = S({ requires: ['mao'], pages: [{ text: ['小', '猫'] }] });
    expect(undeclaredGlyphs(bad, CHARS)).toContain('小');
  });

  it('counts `introduces` as declared — that is where glue is met', () => {
    const glue = S({ requires: [], introduces: ['ni', 'hao'], pages: [{ text: ['你', '好'] }] });
    expect(undeclaredGlyphs(glue, CHARS)).toHaveLength(0);
  });

  it('a story declaring nothing but using something fails', () => {
    expect(undeclaredGlyphs(S({ pages: [{ text: ['猫'] }] }), CHARS)).toContain('猫');
  });
});

describe('stories · unlocking', () => {
  it('locked until every required character is known', () => {
    expect(isUnlocked(STORY, ['mao', 'kai'])).toBeFalsy();
    expect(isUnlocked(STORY, ['mao', 'kai', 'men'])).toBeTruthy();
  });
  it('extra characters do not matter', () => {
    expect(isUnlocked(STORY, ['mao', 'kai', 'men', 'da'])).toBeTruthy();
  });
  it('a story requiring nothing is always unlocked', () => {
    expect(isUnlocked(S(), [])).toBeTruthy();
  });
  it('unlockedStories filters the list', () => {
    const a = S({ id: 'a', requires: ['mao'] });
    const b = S({ id: 'b', requires: ['mao', 'kai', 'men'] });
    expect(unlockedStories([a, b], ['mao']).map(s => s.id)).toEqual(['a']);
  });
});

describe('stories · nextUnread', () => {
  const a = S({ id: 'a', requires: ['mao'] });
  const b = S({ id: 'b', requires: ['mao'] });

  it('offers the first unlocked story not yet read', () => {
    expect(nextUnread([a, b], ['mao'], []).id).toBe('a');
    expect(nextUnread([a, b], ['mao'], ['a']).id).toBe('b');
  });
  it('returns null when everything unlocked has been read', () => {
    expect(nextUnread([a, b], ['mao'], ['a', 'b'])).toBe(null);
  });
  it('never offers a locked story', () => {
    const locked = S({ id: 'c', requires: ['men'] });
    expect(nextUnread([locked], ['mao'], [])).toBe(null);
  });
});

describe('stories · newGlue', () => {
  it('reports glue the kid does not have yet', () => {
    const g = S({ introduces: ['ni', 'hao'] });
    expect(newGlue(g, [])).toEqual(['ni', 'hao']);
    expect(newGlue(g, ['ni'])).toEqual(['hao']);
    expect(newGlue(g, ['ni', 'hao'])).toHaveLength(0);
  });
  it('is empty for a story that introduces nothing', () => {
    expect(newGlue(STORY, [])).toHaveLength(0);
  });
});

describe('stories · why a story is locked', () => {
  const a = S({ id: 'a', requires: ['mao'] });
  const b = S({ id: 'b', requires: ['mao', 'kai', 'men'] });

  it('missingFor names exactly what is still needed', () => {
    expect(missingFor(b, ['mao'])).toEqual(['kai', 'men']);
    expect(missingFor(b, ['mao', 'kai', 'men'])).toHaveLength(0);
  });

  it('shelf labels every story', () => {
    const rows = shelf([a, b], ['mao'], ['a']);
    expect(rows[0].status).toBe('read');
    expect(rows[1].status).toBe('locked');
    expect(rows[1].missing).toEqual(['kai', 'men']);
  });

  it('an unlocked, unread story is ready', () => {
    expect(shelf([a], ['mao'], [])[0].status).toBe('ready');
  });

  it('closestLocked points at the one nearest to unlocking', () => {
    expect(closestLocked([b, a], []).story.id).toBe('a');
  });

  it('closestLocked is null when nothing is locked', () => {
    expect(closestLocked([a], ['mao'])).toBe(null);
  });

  it('REGRESSION: a brand-new kid can be told what a story needs', () => {
    // At the very start nothing is unlocked. The parent panel must be able to
    // say why rather than presenting a button that silently does nothing.
    const near = closestLocked([a, b], ['da']);
    expect(Boolean(near)).toBeTruthy();
    expect(near.missing.length).toBeGreaterThan(0);
  });
});
