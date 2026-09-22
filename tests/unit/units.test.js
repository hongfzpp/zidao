import { describe, it, expect } from '../runner.js';
import {
  unitScene, unitTargets, missingTargets, unitOf, unitCards
} from '../../js/core/units.js';

const UNITS = [
  { n: 1, scene: 'house',   chars: ['mao', 'men'] },
  { n: 2, scene: 'kitchen', chars: ['yu', 'ge'] },
  { n: 3,                   chars: ['x'] }            // no scene declared
];
const CHARS = [
  { id: 'mao', unit: 1 }, { id: 'men', unit: 1 },
  { id: 'yu',  unit: 2 }, { id: 'ge', unit: 2, castable: false },
  { id: 'ni',  unit: null }
];
const RULES = [
  { char: 'mao', target: { id: 'cat' } },
  { char: 'men', target: { tag: 'door' } },
  { char: 'yu',  target: { tag: 'fish' } },
  { char: 'ge',  target: { any: true } },
  { char: 'da',  target: { id: 'bed' } }             // another unit: ignored
];
const HOUSE = [
  { id: 'cat', tags: ['creature', 'cat'] },
  { id: 'door', tags: ['openable', 'door'] }
];
const KITCHEN = [{ id: 'fish', tags: ['food', 'fish'] }];

describe('units · unitScene', () => {
  it('gives the room a unit is played in', () => {
    expect(unitScene(UNITS, 1)).toBe('house');
    expect(unitScene(UNITS, 2)).toBe('kitchen');
  });
  it('falls back rather than throwing, so a bad value never strands the room', () => {
    expect(unitScene(UNITS, 3, 'house')).toBe('house');     // declares none
    expect(unitScene(UNITS, 99, 'kitchen')).toBe('kitchen'); // no such unit
    expect(unitScene(null, 1, 'house')).toBe('house');
    expect(unitScene(UNITS, 3)).toBe(null);
  });
});

describe('units · unitTargets', () => {
  it('collects what a unit reaches for, by id and by tag', () => {
    expect(unitTargets(RULES, ['mao', 'men'])).toEqual({ ids: ['cat'], tags: ['door'] });
  });
  it('ignores `any`: 大 小 多 少 work on whatever is there', () => {
    expect(unitTargets(RULES, ['ge'])).toEqual({ ids: [], tags: [] });
  });
  it('ignores rules belonging to other units', () => {
    const t = unitTargets(RULES, ['yu']);
    expect(t.ids).toEqual([]);
    expect(t.tags).toEqual(['fish']);
  });
  it('survives nothing at all', () => {
    expect(unitTargets(null, null)).toEqual({ ids: [], tags: [] });
    expect(unitTargets(RULES, [])).toEqual({ ids: [], tags: [] });
  });
});

describe('units · missingTargets', () => {
  it('is empty when the room has everything the unit needs', () => {
    expect(missingTargets(HOUSE, unitTargets(RULES, ['mao', 'men']))).toEqual([]);
  });
  it('REGRESSION: names what a room lacks, so 第五关 cannot strand you fishless', () => {
    // Choosing 第五关 used to leave the kid in the house holding 鱼 with no fish
    // anywhere. This is the check that makes that impossible to ship.
    expect(missingTargets(HOUSE, unitTargets(RULES, ['yu']))).toEqual(['fish']);
    expect(missingTargets(KITCHEN, unitTargets(RULES, ['yu']))).toEqual([]);
  });
  it('matches tags on any object in the room, not just the first', () => {
    expect(missingTargets(HOUSE, { ids: [], tags: ['door'] })).toEqual([]);
    expect(missingTargets(HOUSE, { ids: ['fish'], tags: [] })).toEqual(['fish']);
  });
  it('survives malformed input', () => {
    expect(missingTargets(null, null)).toEqual([]);
    expect(missingTargets([], { ids: ['a'], tags: ['b'] })).toEqual(['a', 'b']);
  });
});

describe('units · unitOf and unitCards', () => {
  it('finds the unit a character belongs to', () => {
    expect(unitOf(CHARS, 'yu')).toBe(2);
    expect(unitOf(CHARS, 'nope')).toBe(null);
    expect(unitOf(CHARS, 'ni')).toBe(null);      // glue belongs to no unit
  });
  it('deals only what the kid owns', () => {
    expect(unitCards(CHARS, UNITS, 1, ['mao'])).toEqual(['mao']);
    expect(unitCards(CHARS, UNITS, 1, [])).toEqual([]);
  });
  it('never deals glue: there is nothing to cast it at', () => {
    expect(unitCards(CHARS, UNITS, 2, ['yu', 'ge'])).toEqual(['yu']);
  });
  it('survives malformed input', () => {
    expect(unitCards(null, null, 1, null)).toEqual([]);
    expect(unitCards(CHARS, UNITS, 99, ['mao'])).toEqual([]);
  });
});
