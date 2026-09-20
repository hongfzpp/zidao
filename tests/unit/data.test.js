/* Validates the real content files against the rules the engine relies on.
   Mirrors scripts/validate.py, but runs the actual matching code so a rule that
   parses yet never matches still fails. */
import { describe, it, expect } from '../runner.js';
import { findRule, chooseSteps } from '../../js/core/rules.js';
import { decoyPool } from '../../js/core/hand.js';
import { undeclaredGlyphs } from '../../js/core/stories.js';
import { mulberry32 } from '../../js/core/rng.js';

const STORY_INDEX = await fetch('../data/stories/index.json').then(r => r.json());
const STORIES = await Promise.all(STORY_INDEX.stories.map(
  f => fetch('../data/stories/' + f).then(r => r.json())));

const SCENE_IDS = ['house', 'kitchen'];
const [CHAR_DATA, RULE_DATA, ...SCENE_LIST] = await Promise.all([
  fetch('../data/characters.json').then(r => r.json()),
  fetch('../data/cast-rules.json').then(r => r.json()),
  ...SCENE_IDS.map(id => fetch(`../data/scenes/${id}.json`).then(r => r.json()))
]);
const CHARS = CHAR_DATA.characters;
const SCENES = Object.fromEntries(SCENE_LIST.map(s => [s.id, s]));
const HOUSE = SCENES.house;
// every object in every room -- a rule may target something in any scene
const OBJECTS = SCENE_LIST.flatMap(sc =>
  sc.objects.map(o => ({ id: o.id, tags: o.tags || [], scene: sc.id })));
const SPAWNED = Object.entries(RULE_DATA.spawnables || {})
  .map(([k, v]) => ({ id: k + '-x', tags: v.tags || [] }));
const ALL_TARGETS = [...OBJECTS, ...SPAWNED];

describe('data · characters.json', () => {
  it('has unique ids and glyphs', () => {
    expect(new Set(CHARS.map(c => c.id)).size).toBe(CHARS.length);
    expect(new Set(CHARS.map(c => c.char)).size).toBe(CHARS.length);
  });
  it('has a strictly increasing curriculum order', () => {
    const orders = CHARS.map(c => c.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
  it('REGRESSION: no character is its own confusable', () => {
    // 开 and 关 both listed themselves, so each could be offered as its own decoy.
    for (const c of CHARS) expect(c.confusables || []).notToContain(c.char);
  });
  it('every character can supply at least one out-of-curriculum decoy', () => {
    for (const c of CHARS) expect(decoyPool(CHARS, [c.id]).length).toBeGreaterThan(0);
  });
  it('every character declares a reveal for 初遇', () => {
    for (const c of CHARS) expect(Boolean(c.reveal && c.reveal.emoji)).toBeTruthy();
  });
  it('opposites are declared symmetrically', () => {
    for (const c of CHARS) {
      if (!c.opposite) continue;
      const other = CHARS.find(x => x.id === c.opposite);
      expect(Boolean(other)).toBeTruthy();
      expect(other.opposite).toBe(c.id);
    }
  });
});

describe('data · cast-rules.json', () => {
  it('every rule names a real character', () => {
    const ids = new Set(CHARS.map(c => c.id));
    for (const r of RULE_DATA.rules) expect(ids.has(r.char)).toBeTruthy();
  });

  it('REGRESSION: NO DEAD TAPS — every castable character resolves on every target', () => {
    for (const c of CHARS.filter(c => c.castable)) {
      for (const rec of ALL_TARGETS) {
        const res = chooseSteps(RULE_DATA, { charId: c.id, rec, rng: mulberry32(1) });
        expect(res.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it('every castable character has an `any` rule', () => {
    for (const c of CHARS.filter(c => c.castable)) {
      expect(Boolean(findRule(RULE_DATA.rules, c.id, { id: '__nothing__', tags: [] }))).toBeTruthy();
    }
  });

  it('a fizzle path exists so a decoy is never a dead tap', () => {
    expect((RULE_DATA.fizzle?.variants || []).length).toBeGreaterThan(0);
  });

  it('every `say` step names a real glyph', () => {
    const glyphs = new Set(CHARS.map(c => c.char));
    const walk = n => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        if (n.type === 'say') expect(glyphs.has(n.char)).toBeTruthy();
        Object.values(n).forEach(walk);
      }
    };
    walk(RULE_DATA);
  });

  it('every `spawn` step names a real spawnable', () => {
    const ok = new Set(Object.keys(RULE_DATA.spawnables || {}));
    const walk = n => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        if (n.type === 'spawn') expect(ok.has(n.what)).toBeTruthy();
        Object.values(n).forEach(walk);
      }
    };
    walk(RULE_DATA);
  });

  it('every tag a rule targets exists on some object', () => {
    const tags = new Set(ALL_TARGETS.flatMap(o => o.tags));
    for (const r of RULE_DATA.rules) {
      if (r.target.tag) expect(tags.has(r.target.tag)).toBeTruthy();
    }
  });

  it('every id a rule targets exists in the scene', () => {
    const ids = new Set([...OBJECTS.map(o => o.id), ...Object.keys(RULE_DATA.spawnables || {})]);
    for (const r of RULE_DATA.rules) {
      if (r.target.id) expect(ids.has(r.target.id)).toBeTruthy();
    }
  });

  it('opposite characters can undo each other on the same target', () => {
    for (const c of CHARS.filter(c => c.opposite)) {
      const other = CHARS.find(x => x.id === c.opposite);
      for (const rec of OBJECTS) {
        expect(chooseSteps(RULE_DATA, { charId: c.id, rec, rng: mulberry32(2) }).steps.length)
          .toBeGreaterThan(0);
        expect(chooseSteps(RULE_DATA, { charId: other.id, rec, rng: mulberry32(2) }).steps.length)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe('data · scenes', () => {
  it('there is more than one room', () => {
    expect(SCENE_LIST.length).toBeGreaterThan(1);
  });
  it('object ids are unique within each room', () => {
    for (const sc of SCENE_LIST) {
      const ids = sc.objects.map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('everything sits inside its room', () => {
    for (const o of SCENE_LIST.flatMap(s2 => s2.objects)) {
      expect(o.x >= 0 && o.x <= 100).toBeTruthy();
      expect(o.y >= 0 && o.y <= 100).toBeTruthy();
    }
  });
  it('openable objects declare what shows through the opening', () => {
    for (const o of SCENE_LIST.flatMap(s2 => s2.objects)) {
      if ((o.tags || []).includes('openable')) expect(Boolean(o.opening)).toBeTruthy();
    }
  });
  it('REGRESSION: every door leads to a room that exists', () => {
    for (const o of SCENE_LIST.flatMap(s2 => s2.objects)) {
      if (o.leadsTo) expect(SCENE_IDS).toContain(o.leadsTo);
    }
  });
  it('REGRESSION: every room has a way out — nobody gets stranded', () => {
    for (const sc of SCENE_LIST) {
      if (sc.id === 'house') continue;
      expect(sc.objects.some(o => o.leadsTo)).toBeTruthy();
    }
  });
  it('a door can only be walked through if it can be opened', () => {
    for (const o of SCENE_LIST.flatMap(s2 => s2.objects)) {
      if (o.leadsTo) expect((o.tags || [])).toContain('openable');
    }
  });
  it('每个 room has 团团 in it', () => {
    for (const sc of SCENE_LIST) {
      expect(sc.objects.some(o => o.id === 'tuantuan')).toBeTruthy();
    }
  });
});

describe('data · nouns name rather than transform', () => {
  // Derived: a noun is any character with a `noEffect` catch-all rule plus one
  // tag-targeted rule. Adding another noun extends this automatically.
  const NOUNS = RULE_DATA.rules
    .filter(r => r.noEffect)
    .map(r => {
      const specific = RULE_DATA.rules.find(x => x.char === r.char && x.target.tag);
      const def = CHARS.find(c => c.id === r.char);
      const sfxStep = specific?.variants?.[0]?.steps?.find(st => st.type === 'sfx');
      return { id: r.char, glyph: def?.char, tag: specific?.target?.tag, sfx: sfxStep?.id };
    })
    .filter(n => n.tag && n.sfx);
  const stepsOf = (charId, rec) =>
    chooseSteps(RULE_DATA, { charId, rec, rng: mulberry32(1) }).steps;
  const hasSfx = (steps, id) => steps.some(s => s.type === 'sfx' && s.id === id);

  it('there are nouns to check', () => {
    expect(NOUNS.length).toBeGreaterThan(3);
  });

  it('every noun has a sound of its own — no two share one', () => {
    const sounds = NOUNS.map(n => n.sfx);
    expect(new Set(sounds).size).toBe(sounds.length);
  });

  it('each noun plays its own sound on the thing it names', () => {
    for (const n of NOUNS) {
      const target = OBJECTS.find(o => o.tags.includes(n.tag));
      expect(Boolean(target)).toBeTruthy();
      expect(hasSfx(stepsOf(n.id, target), n.sfx)).toBeTruthy();
    }
  });

  it('REGRESSION: a noun does nothing on any other object', () => {
    for (const n of NOUNS) {
      for (const rec of OBJECTS) {
        if (rec.tags.includes(n.tag)) continue;
        const steps = stepsOf(n.id, rec);
        expect(hasSfx(steps, n.sfx)).toBeFalsy();
        for (const bad of ['spawn', 'scale', 'setState', 'setScale', 'roomLight', 'rain']) {
          expect(steps.some(s => s.type === bad)).toBeFalsy();
        }
      }
    }
  });

  it('REGRESSION: the pronunciation finishes before the sound effect', () => {
    // Overlapping them muddies both -- the kid hears neither the word nor the
    // meow clearly.
    for (const n of NOUNS) {
      const target = OBJECTS.find(o => o.tags.includes(n.tag));
      for (let i = 0; i < 12; i++) {
        const steps = chooseSteps(RULE_DATA, { charId: n.id, rec: target, rng: mulberry32(i) }).steps;
        const sayAt = steps.findIndex(s => s.type === 'say');
        const sfxAt = steps.findIndex(s => s.type === 'sfx' && s.id === n.sfx);
        expect(sayAt).toBeGreaterThanOrEqual(0);
        expect(sfxAt).toBeGreaterThan(sayAt);          // sound comes after
        expect(steps[sayAt].wait).toBeTruthy();        // and waits for it
      }
    }
  });

  it('a noun still says itself everywhere, so a miss is still an exposure', () => {
    for (const n of NOUNS) {
      for (const rec of OBJECTS) {
        expect(stepsOf(n.id, rec).some(s => s.type === 'say' && s.char === n.glyph)).toBeTruthy();
      }
    }
  });

  it('nothing spawns any more — the world is fixed', () => {
    const walk = (node, hits) => {
      if (Array.isArray(node)) node.forEach(v => walk(v, hits));
      else if (node && typeof node === 'object') {
        if (node.type === 'spawn') hits.push(node);
        Object.values(node).forEach(v => walk(v, hits));
      }
      return hits;
    };
    expect(walk(RULE_DATA, [])).toHaveLength(0);
  });
});

describe('data · stories are genuinely decodable', () => {
  it('there are stories', () => {
    expect(STORIES.length).toBeGreaterThan(2);
  });

  it('REGRESSION: no page contains a character the story does not declare', () => {
    // The whole value of a decodable reader. Broken on the very first story
    // written by hand (小 used but not declared).
    for (const st of STORIES) {
      expect(undeclaredGlyphs(st, CHARS)).toHaveLength(0);
    }
  });

  it('every declared character is real', () => {
    const ids = new Set(CHARS.map(c => c.id));
    for (const st of STORIES) {
      for (const id of [...(st.requires || []), ...(st.introduces || [])]) {
        expect(ids.has(id)).toBeTruthy();
      }
    }
  });

  it('only GLUE characters are introduced inside a story', () => {
    // Anything castable has to be earned in play, not handed over in a book.
    for (const st of STORIES) {
      for (const id of st.introduces || []) {
        expect(CHARS.find(c => c.id === id).castable).toBeFalsy();
      }
    }
  });

  it('every glue character is introduced by some story, or it could never be learnt', () => {
    const met = new Set(STORIES.flatMap(s => s.introduces || []));
    for (const c of CHARS.filter(c => c.castable === false)) {
      expect(met.has(c.id)).toBeTruthy();
    }
  });

  it('pages stay short enough to read', () => {
    for (const st of STORIES) {
      for (const page of st.pages) {
        const n = page.text.join('').length;
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThanOrEqual(7);
      }
    }
  });

  it('every story has art on every page and a sensible length', () => {
    for (const st of STORIES) {
      expect(st.pages.length).toBeGreaterThanOrEqual(3);
      expect(st.pages.length).toBeLessThanOrEqual(6);
      for (const page of st.pages) expect(Boolean(page.art)).toBeTruthy();
    }
  });

  it('the index lists exactly the stories that exist', () => {
    expect(STORY_INDEX.stories.length).toBe(STORIES.length);
  });
});
