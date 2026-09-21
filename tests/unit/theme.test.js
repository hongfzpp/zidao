import { describe, it, expect } from '../runner.js';
import { currentUnit, themeFor, cssVars, DEFAULT_UNIT } from '../../js/core/theme.js';

const CHARS = [
  { id: 'a', unit: 1 }, { id: 'b', unit: 1 },
  { id: 'c', unit: 2 }, { id: 'd', unit: 3 }
];
const UNITS = [
  { n: 1, theme: { name: '晨', wall: '#111', wall2: '#112', floor: '#113', floor2: '#114' } },
  { n: 2, theme: { name: '午', wall: '#221', wall2: '#222', floor: '#223', floor2: '#224' } },
  { n: 3, theme: { name: '夜', wall: '#331', wall2: '#332', floor: '#333', floor2: '#334' } }
];

describe('theme · currentUnit', () => {
  it('starts at the first unit', () => {
    expect(currentUnit(CHARS, [])).toBe(DEFAULT_UNIT);
    expect(currentUnit(CHARS, undefined)).toBe(DEFAULT_UNIT);
  });
  it('is the furthest unit reached, not the last one added', () => {
    expect(currentUnit(CHARS, ['a', 'b'])).toBe(1);
    expect(currentUnit(CHARS, ['d', 'a'])).toBe(3);   // order of `owned` is irrelevant
  });
  it('REGRESSION: reaching a new unit changes the room', () => {
    // Finishing a unit has to be visible without opening the parent panel.
    expect(currentUnit(CHARS, ['a', 'b'])).toBe(1);
    expect(currentUnit(CHARS, ['a', 'b', 'c'])).toBe(2);
  });
  it('ignores an id it does not know', () => {
    expect(currentUnit(CHARS, ['nope'])).toBe(DEFAULT_UNIT);
  });
});

describe('theme · themeFor', () => {
  it('finds the theme for a unit', () => {
    expect(themeFor(UNITS, 2).name).toBe('午');
  });
  it('returns null when there are no units at all', () => {
    expect(themeFor([], 1)).toBe(null);
    expect(themeFor(undefined, 1)).toBe(null);
  });
  it('falls back rather than returning nothing for an unknown unit', () => {
    expect(Boolean(themeFor(UNITS, 99))).toBeTruthy();
  });
});

describe('theme · cssVars', () => {
  it('maps a theme to custom properties', () => {
    const v = cssVars(UNITS[0].theme);
    expect(v['--wall']).toBe('#111');
    expect(v['--floor']).toBe('#113');
  });
  it('a scene overrides the floor — its materials, the unit’s light', () => {
    const v = cssVars(UNITS[0].theme, { floor: '#abc', floor2: '#def' });
    expect(v['--floor']).toBe('#abc');
    expect(v['--floor2'] || v['--floor-2']).toBe('#def');
    expect(v['--wall']).toBe('#111');          // the wall still comes from the unit
  });
  it('is empty for no theme, rather than writing undefined into the page', () => {
    expect(cssVars(null)).toEqual({});
  });
  it('never emits an undefined value', () => {
    const v = cssVars({ wall: '#abc' });
    for (const val of Object.values(v)) expect(val === undefined).toBeFalsy();
  });
});

describe('theme · every unit looks different', () => {
  it('REGRESSION: no two units share a wall colour', () => {
    const walls = UNITS.map(u => u.theme.wall);
    expect(new Set(walls).size).toBe(walls.length);
  });
});
