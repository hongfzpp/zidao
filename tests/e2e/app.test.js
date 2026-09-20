/* End-to-end: the real app in an iframe, driven by pointer events.
   Each test launches its own instance so nothing leaks between them. */
import { describe, it, expect } from '../runner.js';
import { App, waitFor } from './harness.js';

// derived from the data, so adding a character does not break the suite
const CHAR_DEFS = (await fetch('../data/characters.json').then(r => r.json())).characters;
const ALL = CHAR_DEFS.map(c => c.id);
// glue characters (你 好 我) are owned but never appear in the pouch and are
// never cast -- DESIGN.md §9.1
const CASTABLE = CHAR_DEFS.filter(c => c.castable !== false);
const save = (o = {}) => ({
  owned: [], firstCast: [], castCount: 0, castsSinceArrival: 0,
  arrivalsThisSession: 0, fizzles: 0, seenGolden: 0,
  lastPlayedAt: Date.now(), sceneState: null, firstRun: false, ...o
});

async function withApp (state, fn) {
  const app = await App.launch(state);
  try { await fn(app); expect(app.errors).toEqual([]); }
  finally { app.destroy(); }
}

describe('e2e · first run', () => {
  it('boots and shows exactly ONE 初遇, for 大', async () => {
    await withApp(null, async app => {
      await app.start();
      expect(app.fmOpen()).toBeTruthy();
      expect(app.fmChar()).toBe('大');
      await app.completeFirstMeeting();
      expect(app.fmOpen()).toBeFalsy();       // REGRESSION: no second one behind it
    });
  });

  it('lands in the room with the scene built', async () => {
    await withApp(null, async app => {
      await app.start();
      await app.completeFirstMeeting();
      for (const id of ['door','window','lamp','bed','cat','plant','tuantuan'])
        expect(Boolean(app.obj(id))).toBeTruthy();
    });
  });

  it('puts 大 in the pouch alongside decoys', async () => {
    await withApp(null, async app => {
      await app.start();
      await app.completeFirstMeeting();
      expect(app.realCards().map(c => c.glyph)).toEqual(['大']);
      expect(app.decoyCards().length).toBeGreaterThan(0);
    });
  });
});

describe('e2e · casting', () => {
  it('REGRESSION: the very first 大 makes the cat genuinely big, not a 2x nudge', async () => {
    await withApp(save({ owned: ['da'], firstCast: [] }), async app => {
      await app.start();
      expect(app.objScale('cat')).toBe(1);
      await app.drag('大', 'cat');
      expect(app.objScale('cat')).toBeGreaterThan(3);
    });
  });

  it('小 undoes 大', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ['da','xiao'] }), async app => {
      await app.start();
      await app.drag('大', 'cat');
      const big = app.objScale('cat');
      await app.drag('小', 'cat');
      expect(app.objScale('cat')).toBeLessThanOrEqual(big);
    });
  });

  it('开 opens the door and reveals the opening; 关 shuts it', async () => {
    await withApp(save({ owned: ['kai','guan'], firstCast: ['kai','guan'] }), async app => {
      await app.start();
      await app.drag('开', 'door');
      expect(app.objState('door', 'open')).toBe('true');
      const openingOpacity = app.win.getComputedStyle(
        app.obj('door').querySelector('.opening')).opacity;
      expect(Number(openingOpacity)).toBeGreaterThan(0.5);
      await app.drag('关', 'door');
      expect(app.objState('door', 'open')).toBe('false');
    });
  });

  it('关 on the lamp darkens the room; 开 restores it', async () => {
    await withApp(save({ owned: ['kai','guan'], firstCast: ['kai','guan'] }), async app => {
      await app.start();
      await app.drag('关', 'lamp');
      expect(app.$('#room').classList.contains('dark')).toBeTruthy();
      await app.drag('开', 'lamp');
      expect(app.$('#room').classList.contains('dark')).toBeFalsy();
    });
  });

  it('火 scorches the plant and 水 restores it', async () => {
    await withApp(save({ owned: ['huo','shui'], firstCast: ['huo','shui'] }), async app => {
      await app.start();
      await app.drag('火', 'plant');
      expect(app.objState('plant', 'burnt')).toBe('true');
      await app.drag('水', 'plant');
      expect(app.objState('plant', 'burnt')).toBe('false');
    });
  });

  it('猫 on the cat is acknowledged and changes nothing else', async () => {
    await withApp(save({ owned: ['mao'], firstCast: ['mao'] }), async app => {
      await app.start();
      const objects = app.$$('.obj').length;
      const scale = app.objScale('cat');
      await app.drag('猫', 'cat');
      expect(app.$$('.obj').length).toBe(objects);     // REGRESSION: no spawning
      expect(app.objScale('cat')).toBe(scale);         // a noun does not transform
    });
  });

  it('REGRESSION: 猫 on something that is not a cat does nothing', async () => {
    await withApp(save({ owned: ['mao'], firstCast: ['mao'] }), async app => {
      await app.start();
      const objects = app.$$('.obj').length;
      const bedScale = app.objScale('bed');
      await app.drag('猫', 'bed');
      expect(app.$$('.obj').length).toBe(objects);
      expect(app.objScale('bed')).toBe(bedScale);
      expect(app.objState('bed', 'burnt')).toBe(undefined);
    });
  });

  it('REGRESSION: 门 on something that is not a door does not open it', async () => {
    await withApp(save({ owned: ['men'], firstCast: ['men'] }), async app => {
      await app.start();
      const objects = app.$$('.obj').length;
      await app.drag('门', 'window');
      expect(app.$$('.obj').length).toBe(objects);
      expect(app.objState('window', 'open')).toBe('false');
    });
  });

  it('门 on the door does not change its open state — that is 开 and 关', async () => {
    await withApp(save({ owned: ['men'], firstCast: ['men'] }), async app => {
      await app.start();
      expect(app.objState('door', 'open')).toBe('false');
      await app.drag('门', 'door');
      expect(app.objState('door', 'open')).toBe('false');
    });
  });

  it('REGRESSION: a wrong-target noun saves its first-cast moment for later', async () => {
    await withApp(save({ owned: ['mao'], firstCast: [] }), async app => {
      await app.start();
      await app.drag('猫', 'bed');                     // nothing happens
      expect(app.save().firstCast || []).notToContain('mao');
      await app.drag('猫', 'cat');                     // the real moment
      expect(app.save().firstCast).toContain('mao');
    });
  });

  it('REGRESSION: no dead taps — every owned character on every object responds', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      const before = app.save().castCount;
      let casts = 0;
      for (const t of ['bed','plant','window']) {
        for (let i = 0; i < 3; i++) { await app.castAny(i, t); casts++; }
      }
      expect(app.save().castCount).toBe(before + casts);
    });
  });
});

describe('e2e · the new Scene 1 mechanics', () => {
  it('上 lifts an object and 下 brings it back down', async () => {
    await withApp(save({ owned: ['shang','xia'], firstCast: ALL }), async app => {
      await app.start();
      const y0 = parseFloat(app.obj('cat').style.top);
      await app.drag('上', 'cat');
      const lifted = parseFloat(app.obj('cat').style.top);
      expect(lifted).toBeLessThan(y0);
      await app.drag('下', 'cat');
      expect(parseFloat(app.obj('cat').style.top)).toBeGreaterThan(lifted);
    });
  });

  it('飞 puts something in the air and 下 lands it', async () => {
    await withApp(save({ owned: ['fei','xia'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('飞', 'cat');
      expect(app.objState('cat', 'flying')).toBe('true');
      await app.drag('下', 'cat');
      expect(app.objState('cat', 'flying')).toBe('false');
    });
  });

  it('飞 makes it orbit, not just hover', async () => {
    // ?test=1 disables CSS animations, so assert the orbit is set up rather
    // than that it is currently running: the keyframes exist, and the object
    // carries the geometry that drives them.
    await withApp(save({ owned: ['fei'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('飞', 'cat');
      const el = app.obj('cat');
      expect(Number(el.style.getPropertyValue('--fly-r'))).toBeGreaterThan(0);
      expect(el.style.getPropertyValue('--fly-dur')).toContain('s');

      const hasKeyframes = [...app.doc.styleSheets].some(sheet => {
        try {
          return [...sheet.cssRules].some(
            r => r.type === CSSRule.KEYFRAMES_RULE && r.name === 'flyCircle');
        } catch { return false; }
      });
      expect(hasKeyframes).toBeTruthy();
    });
  });

  it('REGRESSION: two fliers do not move as one', async () => {
    await withApp(save({ owned: ['fei'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('飞', 'cat');
      await app.drag('飞', 'dog');
      const styleOf = id => {
        const el = app.obj(id);
        return ['--fly-r', '--fly-dur', '--fly-delay'].map(k => el.style.getPropertyValue(k));
      };
      expect(styleOf('cat').join()).notToContain('undefined');
      expect(styleOf('cat').join() === styleOf('dog').join()).toBeFalsy();
    });
  });

  it('landing clears the orbit', async () => {
    await withApp(save({ owned: ['fei','xia'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('飞', 'cat');
      await app.drag('下', 'cat');
      expect(app.objState('cat', 'flying')).toBe('false');   // the CSS keys off this
    });
  });

  it('睡 puts a creature to sleep and 开 wakes it', async () => {
    await withApp(save({ owned: ['shui4','kai'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('睡', 'dog');
      expect(app.objState('dog', 'sleeping')).toBe('true');
      await app.drag('开', 'dog');
      expect(app.objState('dog', 'sleeping')).toBe('false');
    });
  });

  it('the dog is in the room and 狗 names it', async () => {
    await withApp(save({ owned: ['gou'], firstCast: ALL }), async app => {
      await app.start();
      expect(Boolean(app.obj('dog'))).toBeTruthy();
      const before = app.$$('.obj').length;
      await app.drag('狗', 'dog');
      expect(app.$$('.obj').length).toBe(before);       // names, never spawns
    });
  });

  it('REGRESSION: every noun does nothing on anything it does not name', async () => {
    await withApp(save({ owned: ['gou','chuang_b','deng','chuang_w'], firstCast: ALL }),
      async app => {
        await app.start();
        for (const [glyph, wrong] of [['狗','bed'],['床','lamp'],['灯','window'],['窗','dog']]) {
          const y = app.obj(wrong).style.top;
          const scale = app.objScale(wrong);
          await app.drag(glyph, wrong);
          expect(app.objScale(wrong)).toBe(scale);
          expect(app.obj(wrong).style.top).toBe(y);
        }
      });
  });

  it('every character in the pouch is castable somewhere', async () => {
    // (that EVERY curriculum character resolves on every target is proved
    // exhaustively in the data tests; here we check the wiring)
    await withApp(save({ owned: CASTABLE.slice(0, 6).map(c => c.id), firstCast: ALL }),
      async app => {
        await app.start();
        const before = app.save().castCount;
        const glyphs = app.realCards().map(c => c.glyph);
        for (const g of glyphs) await app.drag(g, 'bed');
        expect(app.save().castCount).toBe(before + glyphs.length);
      });
  });
});

describe('e2e · decoys and shuffling', () => {
  it('decoys are drawn from the confusables of what is owned', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ['da','xiao'] }), async app => {
      await app.start();
      const allowed = ['太','天','犬','木','少','尔'];
      for (const d of app.decoyCards()) expect(allowed).toContain(d.glyph);
    });
  });

  it('REGRESSION: decoy cards look identical to real ones', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ['da','xiao'] }), async app => {
      await app.start();
      const style = el => {
        const s = app.win.getComputedStyle(el);
        return [s.width, s.height, s.backgroundColor, s.borderColor, s.opacity, s.fontSize].join('|');
      };
      expect(style(app.decoyCards()[0].el)).toBe(style(app.realCards()[0].el));
    });
  });

  it('casting a decoy fizzles: the world does not move', async () => {
    await withApp(save({ owned: ['da'], firstCast: ['da'] }), async app => {
      await app.start();
      const decoy = app.decoyCards()[0].glyph;
      const before = app.objScale('cat');
      const fizzlesBefore = app.save().fizzles || 0;
      await app.drag(decoy, 'cat');
      expect(app.objScale('cat')).toBe(before);
      expect(app.save().fizzles).toBe(fizzlesBefore + 1);
    });
  });

  it('a decoy does not advance arrival pacing', async () => {
    await withApp(save({ owned: ['da'], firstCast: ['da'] }), async app => {
      await app.start();
      const before = app.save().castsSinceArrival;
      await app.drag(app.decoyCards()[0].glyph, 'bed');
      expect(app.save().castsSinceArrival).toBe(before);
    });
  });

  it('REGRESSION: the hand reorders after every attempt', async () => {
    await withApp(save({ owned: ['da','xiao','kai','guan'], firstCast: ALL }), async app => {
      await app.start();
      const orders = [app.handGlyphs().join(' ')];
      for (let i = 0; i < 5; i++) { await app.castAny(i); orders.push(app.handGlyphs().join(' ')); }
      expect(new Set(orders).size).toBeGreaterThan(2);
    });
  });

  it('REGRESSION: the decoy SET stays stable while the order changes', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL }), async app => {
      await app.start();
      const first = app.decoyCards().map(c => c.glyph).sort().join('');
      for (let i = 0; i < 4; i++) await app.castAny(i);
      expect(app.decoyCards().map(c => c.glyph).sort().join('')).toBe(first);
    });
  });

  it('every owned character is reachable while they fit', async () => {
    const few = CASTABLE.slice(0, 6).map(c => c.id);
    await withApp(save({ owned: few, firstCast: ALL }), async app => {
      await app.start();
      const glyphs = app.realCards().map(c => c.glyph).sort().join('');
      expect(glyphs).toBe(CASTABLE.slice(0, 6).map(c => c.char).sort().join(''));
    });
  });

  it('REGRESSION: the pouch stops growing once everything is known', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      expect(app.cards().length).toBeLessThanOrEqual(12);
      expect(app.realCards().length).toBeLessThan(CASTABLE.length);
    });
  });

  it('REGRESSION: the character just learnt is in the pouch', async () => {
    const most = CASTABLE.slice(0, CASTABLE.length - 1).map(c => c.id);
    const newest = CASTABLE.at(-1);
    await withApp(save({ owned: most, firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$(`[data-act="teach"][data-char="${newest.id}"]`).click();
      await app.completeFirstMeeting();
      expect(app.realCards().map(c => c.glyph)).toContain(newest.char);
    });
  });

  it('REGRESSION: re-learning a character puts it back in the pouch', async () => {
    // With more characters than slots, a review used to be a coin flip as to
    // whether the character you just looked at was even reachable.
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      const shown = app.realCards().map(c => c.glyph);
      const hidden = CASTABLE.find(c => !shown.includes(c.char));
      expect(Boolean(hidden)).toBeTruthy();

      await app.openParentPanel();
      app.$(`[data-act="teach"][data-char="${hidden.id}"]`).click();
      await app.completeFirstMeeting();

      expect(app.realCards().map(c => c.glyph)).toContain(hidden.char);
    });
  });

  it('REGRESSION: the pouch contents do not churn on every cast', async () => {
    // Positions rotate on purpose; the SET changing each time means the kid
    // reaches for a character and finds it gone.
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      const before = app.realCards().map(c => c.glyph).sort().join('');
      await app.castAny(0);
      await app.castAny(1);
      expect(app.realCards().map(c => c.glyph).sort().join('')).toBe(before);
    });
  });

  it('REGRESSION: a full hand fits without scrolling', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      const host = app.$('#pouch-cards');
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    });
  });
});

describe('e2e · pacing', () => {
  it('REGRESSION: does not ambush on the first cast of a resumed session', async () => {
    // reopened at castCount 15 -- the old `castCount % 8` fired immediately
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL, castCount: 15, castsSinceArrival: 0 }),
      async app => {
        await app.start();
        await app.castAny(1);
        expect(await app.arrived(500)).toBeFalsy();
      });
  });

  it('introduces one character after the interval, not before', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL, castsSinceArrival: 6 }),
      async app => {
        await app.start();
        const arrivals = await app.play(4);
        expect(arrivals).toHaveLength(1);
        expect(arrivals[0].atCast).toBe(2);
      });
  });

  it('REGRESSION: a long session does not wall up after two characters', async () => {
    await withApp(null, async app => {
      await app.start();
      await app.completeFirstMeeting();              // 大, free
      const arrivals = await app.play(18);
      expect(arrivals.length).toBeGreaterThan(1);
      expect(app.save().owned.length).toBeGreaterThan(2);
    });
  });

  it('never introduces two characters back to back', async () => {
    await withApp(null, async app => {
      await app.start();
      await app.completeFirstMeeting();
      for (let i = 1; i <= 18; i++) {
        await app.castAny(i);
        if (await app.arrived()) {
          await app.completeFirstMeeting();
          expect(app.fmOpen()).toBeFalsy();          // nothing queued behind it
        }
      }
    });
  });
});

describe('e2e · persistence', () => {
  it('the room survives a reload — the giant cat is still there', async () => {
    const st = save({ owned: ['da','kai','guan'], firstCast: ALL });
    const app = await App.launch(st);
    try {
      await app.start();
      await app.drag('大', 'cat');
      await app.drag('开', 'door');
      const scale = app.objScale('cat');
      expect(scale).toBeGreaterThan(1);

      app.win.location.reload();
      await new Promise(res => app.frame.addEventListener('load', res, { once: true }));
      await waitFor(() => app.doc.getElementById('unlock-btn'), { label: 'reboot' });
      await app.start();

      expect(app.objScale('cat')).toBe(scale);
      expect(app.objState('door', 'open')).toBe('true');
    } finally { app.destroy(); }
  });

  it('tolerates a save written by an older version (missing fields)', async () => {
    await withApp({ owned: ['da'], castCount: 3 }, async app => {
      await app.start();
      await app.drag('大', 'cat');
      expect(app.objScale('cat')).toBeGreaterThan(1);
    });
  });

  it('recovers from a corrupt save instead of dying', async () => {
    localStorage.setItem('zidao.v1', '{not json at all');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1024px;height:768px;border:0;position:fixed;left:-99999px;top:0';
    frame.src = '../index.html?test=1';
    document.body.appendChild(frame);
    await new Promise(res => frame.addEventListener('load', res, { once: true }));
    const app = new App(frame);
    app.errors = [];
    await waitFor(() => app.doc.getElementById('unlock-btn'), { label: 'boot' });
    await app.start();
    expect(app.fmOpen() || app.$$('.obj').length > 0).toBeTruthy();
    app.destroy();
  });
});

describe('e2e · drag robustness', () => {
  it('REGRESSION: an abandoned drag does not strand a ghost card', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL }), async app => {
      await app.start();
      await app.dragAndAbandon('大');
      expect(app.$('#drag-layer').children.length).toBe(1);   // stranded, as expected
      await app.drag('小', 'cat');                             // next drag must self-heal
      expect(app.$('#drag-layer').children.length).toBe(0);
      expect(app.$$('.card.dimmed')).toHaveLength(0);
      expect(app.$$('.obj.drop-target')).toHaveLength(0);
    });
  });

  it('tapping a card says it without casting', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL }), async app => {
      await app.start();
      const before = app.save().castCount;
      await app.tapCard('大');
      expect(app.save().castCount).toBe(before);
    });
  });
});

describe('e2e · parent panel', () => {
  it('opens on a 3s hold and shows the next character on the button', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const btn = app.$('[data-act="next-char"]');
      expect(btn.textContent).toContain('开');
      expect(btn.disabled).toBeFalsy();
    });
  });

  it('REGRESSION: the action button is visible without scrolling', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const r = app.$('[data-act="next-char"]').getBoundingClientRect();
      expect(r.top >= 0 && r.bottom <= app.frame.clientHeight).toBeTruthy();
    });
  });

  it('the next-character button introduces exactly one', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="next-char"]').click();
      const ch = await app.completeFirstMeeting();
      expect(ch).toBe('开');
      expect(app.fmOpen()).toBeFalsy();
      expect(app.save().owned).toContain('kai');
    });
  });

  it('REGRESSION: the button still works once the session cap is spent', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL, arrivalsThisSession: 99 }),
      async app => {
        await app.start();
        await app.openParentPanel();
        expect(app.parentStats()).toContain('已达上限');
        app.$('[data-act="next-char"]').click();
        await app.completeFirstMeeting();
        expect(app.save().owned).toContain('kai');
      });
  });

  it('shows discrimination accuracy', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL, castCount: 9, fizzles: 1 }),
      async app => {
        await app.start();
        await app.openParentPanel();
        expect(app.parentStats()).toContain('认对率');
        expect(app.parentStats()).toContain('90%');
      });
  });

  it('a parent can pick ANY character directly, not just the next one', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      // 水 is fifth in the curriculum -- several steps past "next"
      app.$('[data-act="teach"][data-char="shui"]').click();
      const ch = await app.completeFirstMeeting();
      expect(ch).toBe('水');
      expect(app.save().owned).toContain('shui');
      expect(app.realCards().map(c => c.glyph)).toContain('水');
    });
  });

  it('picking a known character re-shows it without disturbing pacing', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL, castsSinceArrival: 5 }),
      async app => {
        await app.start();
        await app.openParentPanel();
        app.$('[data-act="teach"][data-char="da"]').click();
        expect(await app.completeFirstMeeting()).toBe('大');
        // a review is not an arrival: the interval clock must not reset
        expect(app.save().castsSinceArrival).toBe(5);
        expect(app.save().owned).toHaveLength(2);
      });
  });

  it('every character in the panel is pickable', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      expect(app.$$('[data-act="teach"]')).toHaveLength(ALL.length);
    });
  });

  it('unlock-all puts every character in the pouch', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="unlock-all"]').click();
      await waitFor(() => app.save().owned.length === ALL.length, { label: 'unlock all' });
      expect(app.save().owned).toHaveLength(ALL.length);
    });
  });
});

describe('e2e · 团团 asks (retrieval)', () => {
  // a character long overdue, so a question is guaranteed
  const overdue = (ids, box = 1) => {
    const progress = {};
    for (const id of ids) {
      progress[id] = {
        charId: id, box, exposures: 4, correct: 2, incorrect: 0,
        firstSeen: Date.now() - 9e7, lastSeen: Date.now() - 9e7,
        dueAt: Date.now() - 9e7, latencies: []
      };
    }
    return progress;
  };

  it('团团 asks after a few casts, with a thought bubble', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      expect(app.promptOpen()).toBeTruthy();
    });
  });

  it('the question narrows the pouch and always includes the answer', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      const cards = app.cards();
      expect(cards.length).toBeLessThanOrEqual(4);
      expect(cards.map(c => c.id)).toContain(app.win.__promptTarget());
    });
  });

  it('a right answer promotes the character and closes the question', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL, 1) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      const target = app.win.__promptTarget();
      const before = app.save().progress[target].box;
      await app.answerPrompt({ correct: true });
      await waitFor(() => !app.promptOpen(), { label: 'question closes' });
      expect(app.save().progress[target].box).toBe(before + 1);
      expect(app.save().prompts.right).toBeGreaterThan(0);
    });
  });

  it('REGRESSION: a wrong answer demotes ONE box and is never a failure', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL, 3) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      const target = app.win.__promptTarget();
      expect(app.save().progress[target].box).toBe(3);
      await app.answerPrompt({ correct: false });
      expect(app.save().progress[target].box).toBe(2);
      expect(app.promptOpen()).toBeTruthy();       // 团团 just asks again
    });
  });

  it('REGRESSION: only the FIRST attempt scores', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL, 3) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      const target = app.win.__promptTarget();
      await app.answerPrompt({ correct: false });
      const afterMiss = app.save().progress[target].box;
      await app.answerPrompt({ correct: true });   // retry, correctly
      expect(app.save().progress[target].box).toBe(afterMiss);   // not promoted
    });
  });

  it('free play resumes once the question is answered', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      await app.answerPrompt({ correct: true });
      await waitFor(() => !app.promptOpen(), { label: 'question closes' });
      await waitFor(() => app.realCards().length === app.expectedRealCards(),
        { label: 'pouch restored' });
    });
  });

  it('a character that is not due is never asked about', async () => {
    const future = {};
    for (const id of ALL) future[id] = {
      charId: id, box: 2, exposures: 5, correct: 5, incorrect: 0,
      firstSeen: Date.now(), lastSeen: Date.now(),
      dueAt: Date.now() + 9e7, latencies: []
    };
    await withApp(save({ owned: ALL, firstCast: ALL, progress: future }), async app => {
      await app.start();
      for (let i = 0; i < 8; i++) await app.castAny(i);
      expect(app.promptOpen()).toBeFalsy();
    });
  });

  it('casting in free play records an exposure', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('大', 'cat');
      expect(app.save().progress.da.exposures).toBeGreaterThan(0);
    });
  });

  it('REGRESSION: meeting a character creates its memory record', async () => {
    // Without a record it could never come up for review at all.
    await withApp(null, async app => {
      await app.start();
      await app.completeFirstMeeting();
      expect(Boolean(app.save().progress.da)).toBeTruthy();
      expect(app.save().progress.da.box).toBe(0);
    });
  });

  it('REGRESSION: a question and 初遇 are never open at the same time', async () => {
    // They were. The big character appeared over a live thought bubble, and
    // because a question owns the pouch the newly met character could not get
    // in -- it read as "the characters disappeared".
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL, progress: overdue(['da','xiao']) }),
      async app => {
        await app.start();
        for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
        expect(app.promptOpen()).toBeTruthy();

        // a character now arrives on top of the open question
        await app.openParentPanel();
        app.$('[data-act="next-char"]').click();
        await waitFor(() => app.fmOpen(), { label: '初遇' });

        expect(app.promptOpen()).toBeFalsy();          // the question stood down
        await app.completeFirstMeeting();

        // ...and the character the kid just met is actually in the pouch
        await waitFor(() => app.realCards().some(c => c.glyph === '开'),
          { label: 'new character in the pouch' });
        expect(app.cards().length).toBeGreaterThan(3);  // pouch is not stuck narrow
      });
  });

  it('REGRESSION: a question cannot start while 初遇 is open', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL, progress: overdue(['da']) }),
      async app => {
        await app.start();
        await app.openParentPanel();
        app.$('[data-act="next-char"]').click();
        await waitFor(() => app.fmOpen(), { label: '初遇' });
        const started = await app.win.__startPrompt();
        expect(started).toBeFalsy();
        expect(app.promptOpen()).toBeFalsy();
      });
  });

  it('a question makes itself obvious: 团团 lights up and the room steps back', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, progress: overdue(ALL) }), async app => {
      await app.start();
      for (let i = 0; i < 4 && !app.promptOpen(); i++) await app.castAny(i);
      expect(app.obj('tuantuan').classList.contains('asking')).toBeTruthy();
      expect(app.$('#room').classList.contains('question')).toBeTruthy();
      await app.answerPrompt({ correct: true });
      await waitFor(() => !app.$('#room').classList.contains('question'),
        { label: 'room restored' });
      expect(app.obj('tuantuan').classList.contains('asking')).toBeFalsy();
    });
  });

  it('the parent panel shows per-character status', async () => {
    await withApp(save({ owned: ['da','xiao'], firstCast: ALL, progress: overdue(['da'], 5) }),
      async app => {
        await app.start();
        await app.openParentPanel();
        expect(app.$('[data-char="da"]').dataset.status).toBe('solid');
        expect(app.parentStats()).toContain('团团提问');
      });
  });
});

const STORY_INDEX = await fetch('../data/stories/index.json').then(r => r.json());
const STORIES = await Promise.all(STORY_INDEX.stories.map(
  f => fetch('../data/stories/' + f).then(r => r.json())));

describe('e2e · 故事 (the payoff)', () => {
  const first = STORIES[0];

  it('a story opens from the parent panel and turns pages', async () => {
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="read-story"]').click();
      await waitFor(() => app.storyOpen(), { label: 'story' });
      expect(app.storyPage()).toBe(1);
      expect(app.storyPageCount()).toBe(first.pages.length);
      await app.storyNext();
      expect(app.storyPage()).toBe(2);
    });
  });

  it('REGRESSION: every character on every page is one the kid already knows', async () => {
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="read-story"]').click();
      const pages = await app.readWholeStory();
      const known = new Set(CHAR_DEFS.map(c => c.char));
      for (const page of pages) for (const ch of page) expect(known.has(ch)).toBeTruthy();
    });
  });

  it('finishing a story records it', async () => {
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="read-story"]').click();
      await app.readWholeStory();
      expect(app.save().storiesRead).toContain(first.id);
    });
  });

  it('REGRESSION: tapping a character does NOT say it', async () => {
    // Hearing it on demand is an answer key -- a child can tap along the line
    // and never read anything.
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="read-story"]').click();
      await waitFor(() => app.storyOpen(), { label: 'story' });
      let spoke = 0;
      app.win.__countSpeak = () => spoke++;
      const el = app.$$('.story-char')[0];
      app.pd(el);
      await app.frameTick();
      expect(spoke).toBe(0);
      expect(el.classList.contains('nudge')).toBeTruthy();   // but not a dead tap
    });
  });

  it('seeing a page is what records the exposure', async () => {
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="read-story"]').click();
      await waitFor(() => app.storyOpen(), { label: 'story' });
      const glyph = app.$$('.story-char')[0].dataset.glyph;
      const id = CHAR_DEFS.find(c => c.char === glyph).id;
      expect(app.save().progress[id].exposures).toBeGreaterThan(0);
    });
  });

  it('REGRESSION: glue characters are learnt by reading, not by 初遇', async () => {
    const glueStory = STORIES.find(s => (s.introduces || []).length);
    expect(Boolean(glueStory)).toBeTruthy();
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL,
                         storiesRead: STORIES.filter(s => s !== glueStory).map(s => s.id) }),
      async app => {
        await app.start();
        for (const id of glueStory.introduces) expect(app.save().owned).notToContain(id);
        await app.openParentPanel();
        app.$('[data-act="read-story"]').click();
        await app.readWholeStory();
        for (const id of glueStory.introduces) expect(app.save().owned).toContain(id);
      });
  });

  it('REGRESSION: glue characters never appear in the pouch', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      const glue = CHAR_DEFS.filter(c => c.castable === false).map(c => c.char);
      for (const g of glue) expect(app.cards().map(c => c.glyph)).notToContain(g);
      expect(app.realCards().length).toBeGreaterThan(0);
    });
  });

  it('REGRESSION: 团团 never asks for a glue character', async () => {
    // There is no card to hand over, so the question would be unanswerable.
    const progress = {};
    for (const id of ALL) progress[id] = {
      charId: id, box: 1, exposures: 4, correct: 2, incorrect: 0,
      firstSeen: Date.now() - 9e7, lastSeen: Date.now() - 9e7,
      dueAt: Date.now() - 9e7, latencies: [] };
    await withApp(save({ owned: ALL, firstCast: ALL, progress }), async app => {
      await app.start();
      const glueIds = CHAR_DEFS.filter(c => c.castable === false).map(c => c.id);
      for (let i = 0; i < 10; i++) {
        await app.castAny(i);
        if (app.promptOpen()) {
          expect(glueIds).notToContain(app.win.__promptTarget());
          await app.answerPrompt({ correct: true });
        }
      }
    });
  });

  it('a locked story is never offered', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const btn = app.$('[data-act="read-story"]');
      btn.click();
      await app.frameTick();
      expect(app.storyOpen()).toBeFalsy();
    });
  });

  it('REGRESSION: at the very start the panel SAYS why no story can be read', async () => {
    // It used to be a button that did nothing at all when tapped, which reads
    // as broken rather than as "not yet".
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const btn = app.$('[data-act="read-story"]');
      expect(btn.disabled).toBeTruthy();
      expect(btn.textContent).toContain('还差');
    });
  });

  it('the panel lists every story and what each one still needs', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const rows = app.$$('.story-row');
      expect(rows).toHaveLength(STORIES.length);
      for (const r of rows) expect(r.dataset.state).toBe('locked');
      expect(app.$('#parent-chars').innerText).toContain('还差');
    });
  });

  it('once unlocked the button names the story and works', async () => {
    await withApp(save({ owned: CASTABLE.map(c => c.id), firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const btn = app.$('[data-act="read-story"]');
      expect(btn.disabled).toBeFalsy();
      expect(btn.textContent).toContain(STORIES[0].title);
      btn.click();
      await waitFor(() => app.storyOpen(), { label: 'story opens' });
    });
  });

  it('a story shows as ready the moment its last character is learnt', async () => {
    const s1 = STORIES[0];
    const oneShort = s1.requires.slice(0, -1);
    await withApp(save({ owned: oneShort, firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      expect(app.$('[data-act="read-story"]').disabled).toBeTruthy();
      app.$('#parent-panel [data-act="close"]').click();

      // teach the missing one
      await app.openParentPanel();
      app.$(`[data-act="teach"][data-char="${s1.requires.at(-1)}"]`).click();
      await app.completeFirstMeeting();

      await app.openParentPanel();
      expect(app.$('[data-act="read-story"]').disabled).toBeFalsy();
    });
  });
});

describe('e2e · 说说看 (saying it out loud)', () => {
  const openFirstStory = async app => {
    await app.start();
    await app.openParentPanel();
    app.$('[data-act="read-story"]').click();
    await waitFor(() => app.storyOpen(), { label: 'story' });
  };
  const ALL_OWNED = () => save({ owned: CASTABLE.map(c => c.id), firstCast: ALL });

  it('saying the line lights up the characters', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      const glyphs = app.$$('.story-char').map(e => e.dataset.glyph);
      app.fakeHear([glyphs.join('')]);
      await app.tapMic();
      expect(app.saidGlyphs()).toEqual(glyphs);
      expect(app.storyHint()).toContain('全对');
    });
  });

  it('REGRESSION: a homophone counts — the right sound heard as a wrong character', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      await app.storyNext();                       // page with 小 猫
      const glyphs = app.$$('.story-char').map(e => e.dataset.glyph);
      const def = CHAR_DEFS.find(c => c.char === glyphs[0]);
      expect(def.homophones.length).toBeGreaterThan(0);
      app.fakeHear([def.homophones[0]]);
      await app.tapMic();
      expect(app.saidGlyphs()).toContain(glyphs[0]);
    });
  });

  it('partial credit: some light up, the rest are simply left alone', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      await app.storyNext(); await app.storyNext();   // 猫 开 门
      const glyphs = app.$$('.story-char').map(e => e.dataset.glyph);
      app.fakeHear([glyphs[0]]);
      await app.tapMic();
      expect(app.saidGlyphs()).toEqual([glyphs[0]]);
      expect(app.storyHint()).toContain('几个');
    });
  });

  it('REGRESSION: saying nothing is never a failure and never blocks the page', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      app.fakeHear([]);
      await app.tapMic();
      expect(app.saidGlyphs()).toHaveLength(0);
      expect(app.storyHint()).toContain('再试');
      await app.storyNext();                       // the page still turns
      expect(app.storyPage()).toBe(2);
    });
  });

  it('a recogniser error does not break anything', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      app.fakeHear([], { error: 'network' });
      await app.tapMic();
      expect(app.storyOpen()).toBeTruthy();
      await app.storyNext();
      expect(app.storyPage()).toBe(2);
    });
  });

  it('REGRESSION: a denied microphone disables the button and says why', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      app.fakeHear([], { error: 'not-allowed' });
      await app.tapMic();
      expect(app.micDisabled()).toBeTruthy();
      expect(app.storyHint()).toContain('麦克风');
      await app.storyNext();                       // still readable
      expect(app.storyPage()).toBe(2);
    });
  });

  it('attempts are recorded for the parent, tries and hits', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      const glyph = app.$$('.story-char')[0].dataset.glyph;
      const id = CHAR_DEFS.find(c => c.char === glyph).id;
      app.fakeHear([glyph]);
      await app.tapMic();
      expect(app.save().spoken[id].tries).toBe(1);
      expect(app.save().spoken[id].right).toBe(1);
      app.fakeHear(['今天天气']);
      await app.tapMic();
      expect(app.save().spoken[id].tries).toBe(2);
      expect(app.save().spoken[id].right).toBe(1);
    });
  });

  it('REGRESSION: saying nothing buys no read-back', async () => {
    // Otherwise tapping the microphone and staying silent becomes the new way
    // to hear the answer.
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      app.fakeHear([]);
      await app.tapMic();
      expect(app.$$('.story-char.reading')).toHaveLength(0);
      expect(app.storyHint()).toContain('再试');
    });
  });

  it('turning the page clears the marks', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      const glyphs = app.$$('.story-char').map(e => e.dataset.glyph);
      app.fakeHear([glyphs.join('')]);
      await app.tapMic();
      expect(app.saidGlyphs().length).toBeGreaterThan(0);
      await app.storyNext();
      expect(app.saidGlyphs()).toHaveLength(0);
      expect(app.storyHint()).toBe('');
    });
  });
});

describe('e2e · the picture is a hint, not a giveaway', () => {
  const openFirstStory = async app => {
    await app.start();
    await app.openParentPanel();
    app.$('[data-act="read-story"]').click();
    await waitFor(() => app.storyOpen(), { label: 'story' });
  };
  const ALL_OWNED = () => save({ owned: CASTABLE.map(c => c.id), firstCast: ALL });

  it('REGRESSION: the picture is hidden when a page opens', async () => {
    // Shown, the kid reads the PICTURE instead of the characters -- the one
    // thing this screen exists to prevent.
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      expect(app.artHidden()).toBeTruthy();
      expect(app.artShown()).toBeFalsy();
      expect(app.$$('.story-char').length).toBeGreaterThan(0);   // text still there
    });
  });

  it('tapping the hint reveals it', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      await app.tapHint();
      expect(app.artShown()).toBeTruthy();
      expect(app.artText()).toBe(STORIES[0].pages[0].art);
    });
  });

  it('REGRESSION: every new page starts covered again', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      await app.tapHint();
      expect(app.artShown()).toBeTruthy();
      await app.storyNext();
      expect(app.artHidden()).toBeTruthy();
      await app.storyNext();
      expect(app.artHidden()).toBeTruthy();
    });
  });

  it('going back also re-covers the picture', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      await app.storyNext();
      await app.tapHint();
      app.$('#story-prev').click();
      await app.frameTick();
      expect(app.artHidden()).toBeTruthy();
    });
  });

  it('records pages read and how many needed the picture', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      expect(app.save().pagesRead).toBe(1);
      expect(app.save().hintedPages || 0).toBe(0);
      await app.tapHint();
      expect(app.save().hintedPages).toBe(1);
      await app.storyNext();
      expect(app.save().pagesRead).toBe(2);
      expect(app.save().hintedPages).toBe(1);      // this page needed no hint
    });
  });

  it('a hint is counted once however many times it is tapped', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      await app.tapHint();
      app.$('#story-art').click();
      app.$('#story-art').click();
      await app.frameTick();
      expect(app.save().hintedPages).toBe(1);
    });
  });

  it('说说看 still works with the picture covered', async () => {
    await withApp(ALL_OWNED(), async app => {
      await openFirstStory(app);
      expect(app.artHidden()).toBeTruthy();
      const glyphs = app.$$('.story-char').map(e => e.dataset.glyph);
      app.fakeHear([glyphs.join('')]);
      await app.tapMic();
      expect(app.saidGlyphs()).toEqual(glyphs);
      expect(app.artHidden()).toBeTruthy();       // saying it does not reveal it
    });
  });
});

describe('e2e · 测试模式 (dev mode)', () => {
  const GLUE = CHAR_DEFS.filter(c => c.castable === false).map(c => c.id);

  it('is off by default and shows no badge', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      expect(app.devOn()).toBeFalsy();
    });
  });

  it('the toggle unlocks every character, including the glue', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="dev-toggle"]').click();
      await waitFor(() => app.save().owned.length === ALL.length, { label: 'unlock' });
      // 你 好 我 are otherwise reachable ONLY by reading a story
      for (const id of GLUE) expect(app.save().owned).toContain(id);
      expect(app.devOn()).toBeTruthy();
    });
  });

  it('REGRESSION: dev mode is visible, never silent', async () => {
    // A dev flag you forget is on is a dev flag the child eventually gets.
    await withApp(save({ owned: ['da'], firstCast: ALL, devMode: true }), async app => {
      await app.start();
      expect(app.devOn()).toBeTruthy();
    });
  });

  it('turns off again, and the badge goes', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, devMode: true }), async app => {
      await app.start();
      await app.openParentPanel();
      app.$('[data-act="dev-toggle"]').click();
      await waitFor(() => !app.devOn(), { label: 'badge to go' });
      expect(app.save().devMode).toBeFalsy();
    });
  });

  it('REGRESSION: ?dev=1 on a FRESH install skips straight past 初遇', async () => {
    // The point of arriving with ?dev=1 is not to go over the characters at all.
    const app = await App.launch(null, { url: '../index.html?test=1&dev=1' });
    try {
      app.errors = [];
      await app.start();
      expect(app.fmOpen()).toBeFalsy();                  // no opening 初遇
      expect(app.save().owned).toHaveLength(ALL.length);
      expect(app.realCards()).toHaveLength(app.expectedRealCards());   // capped
      await app.openParentPanel();
      for (const r of app.storyRows()) expect(r.disabled).toBeFalsy();
    } finally { app.destroy(); }
  });

  it('?dev=1 turns it on, ?dev=0 turns it off', async () => {
    const app = await App.launch(save({ owned: ['da'], firstCast: ALL }),
                                { url: '../index.html?test=1&dev=1' });
    try {
      app.errors = [];
      await app.start();
      expect(app.devOn()).toBeTruthy();
      expect(app.save().devMode).toBeTruthy();
      // turning dev mode on by ANY route unlocks everything -- one mental model
      await waitFor(() => app.save().owned.length === ALL.length,
        { label: 'everything unlocked' });
    } finally { app.destroy(); }

    const app2 = await App.launch(save({ owned: ['da'], firstCast: ALL, devMode: true }),
                                  { url: '../index.html?test=1&dev=0' });
    try {
      app2.errors = [];
      await app2.start();
      expect(app2.devOn()).toBeFalsy();
    } finally { app2.destroy(); }
  });

  it('every story can be picked directly, by name', async () => {
    // ALL, not just castable: later stories require glue characters that are
    // themselves only met by reading an earlier story.
    await withApp(save({ owned: ALL, firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      const rows = app.storyRows();
      expect(rows).toHaveLength(STORIES.length);
      const last = rows.at(-1);
      last.el.click();
      await waitFor(() => app.storyOpen(), { label: 'that story opens' });
      expect(app.storyPageCount()).toBe(
        STORIES.find(s => s.id === last.id).pages.length);
    });
  });

  it('REGRESSION: a locked story is NOT openable without dev mode', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL }), async app => {
      await app.start();
      await app.openParentPanel();
      for (const r of app.storyRows()) {
        expect(r.state).toBe('locked');
        expect(r.disabled).toBeTruthy();
      }
    });
  });

  it('in dev mode a locked story opens, and stays decodable', async () => {
    await withApp(save({ owned: ['da'], firstCast: ALL, devMode: true }), async app => {
      await app.start();
      await app.openParentPanel();
      const row = app.storyRows().find(r => r.id === STORIES[1].id);
      expect(row.disabled).toBeFalsy();
      row.el.click();
      await waitFor(() => app.storyOpen(), { label: 'story opens' });
      // opening it granted what it needs, so every character on the page is known
      const owned = app.save().owned;
      for (const id of STORIES[1].requires) expect(owned).toContain(id);
      const pages = await app.readWholeStory();
      // "decodable" means: already known, OR one of the glue characters this
      // story exists to introduce (those are granted on finishing, by design)
      const allowed = new Set(
        CHAR_DEFS.filter(c => owned.includes(c.id) ||
                              (STORIES[1].introduces || []).includes(c.id))
                 .map(c => c.char));
      for (const p of pages) for (const ch of p) expect(allowed.has(ch)).toBeTruthy();
    });
  });

  it('the parent gate opens faster while testing', async () => {
    await withApp(save({ owned: ALL, firstCast: ALL, devMode: true }), async app => {
      await app.start();
      const t0 = Date.now();
      await app.openParentPanel();
      expect(Date.now() - t0).toBeLessThan(1200);    // real hold is 1500ms
    });
  });
});

describe('e2e · 厨房 (the second room)', () => {
  const KITCHEN = ['chi','he','re','leng','duo','shao','yi','er','san',
                   'mi','dan','yu','rou','cai','shou','kou'];

  it('the house starts as the room you are in', async () => {
    await withApp(save({ owned: ['kai'], firstCast: ALL }), async app => {
      await app.start();
      expect(app.sceneId()).toBe('house');
      expect(Boolean(app.obj('cat'))).toBeTruthy();
    });
  });

  it('REGRESSION: a shut door does not let you through — you must read 开 first', async () => {
    // The door IS the gate. Getting to the next room means reading a character,
    // which is the whole "read to act" idea (DESIGN.md §6.2).
    await withApp(save({ owned: ['kai'], firstCast: ALL }), async app => {
      await app.start();
      expect(app.objState('door', 'open')).toBe('false');
      app.obj('door').click();
      await app.frameTick();
      expect(app.sceneId()).toBe('house');            // still here
    });
  });

  it('开 the door, walk through, and you are in the kitchen', async () => {
    await withApp(save({ owned: ['kai'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door');
      await app.goThrough();
      expect(app.sceneId()).toBe('kitchen');
      for (const id of ['pot','fish','egg','rice','meat','veg','cup'])
        expect(Boolean(app.obj(id))).toBeTruthy();
    });
  });

  it('REGRESSION: you can always get back — no room is a dead end', async () => {
    await withApp(save({ owned: ['kai'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door');
      await app.goThrough();
      expect(app.sceneId()).toBe('kitchen');
      await app.drag('开', 'door');
      await app.goThrough();
      expect(app.sceneId()).toBe('house');
    });
  });

  it('each room remembers what you did to it', async () => {
    await withApp(save({ owned: ['kai','da'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('大', 'cat');
      const catScale = app.objScale('cat');
      await app.drag('开', 'door');
      await app.goThrough();
      await app.drag('大', 'fish');
      const fishScale = app.objScale('fish');
      await app.drag('开', 'door');
      await app.goThrough();
      expect(app.objScale('cat')).toBe(catScale);     // the house is as we left it
      await app.drag('开', 'door');
      await app.goThrough();
      expect(app.objScale('fish')).toBe(fishScale);   // and so is the kitchen
    });
  });

  it('三 puts three of something there; 一 puts it back to one', async () => {
    await withApp(save({ owned: ['kai','san','yi'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door'); await app.goThrough();
      await app.drag('三', 'egg');
      expect(app.objCount('egg')).toBe(3);
      await app.drag('一', 'egg');
      expect(app.objCount('egg')).toBe(1);
    });
  });

  it('多 adds and 少 takes away', async () => {
    // Direction, not an exact number: 多 has a golden variant that jumps
    // straight to five, so asserting `toBe(2)` here failed about one run in
    // six. A mechanic with a deliberate random variant must not be pinned to
    // an exact value.
    await withApp(save({ owned: ['kai','duo','shao'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door'); await app.goThrough();

      const start = app.objCount('fish');
      await app.drag('多', 'fish');
      const afterMore = app.objCount('fish');
      expect(afterMore).toBeGreaterThan(start);

      await app.drag('少', 'fish');
      expect(app.objCount('fish')).toBeLessThan(afterMore);
    });
  });

  it('REGRESSION: the count never goes below one or runs away', async () => {
    await withApp(save({ owned: ['kai','duo','shao'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door'); await app.goThrough();
      for (let i = 0; i < 6; i++) await app.drag('少', 'egg');
      expect(app.objCount('egg')).toBe(1);
      for (let i = 0; i < 9; i++) await app.drag('多', 'egg');
      expect(app.objCount('egg')).toBeLessThanOrEqual(5);
    });
  });

  it('吃 eats one of them', async () => {
    await withApp(save({ owned: ['kai','san','chi'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door'); await app.goThrough();
      await app.drag('三', 'meat');
      expect(app.objCount('meat')).toBe(3);
      await app.drag('吃', 'meat');
      expect(app.objCount('meat')).toBe(2);
    });
  });

  it('热 and 冷 are opposites, not both at once', async () => {
    await withApp(save({ owned: ['kai','re','leng'], firstCast: ALL }), async app => {
      await app.start();
      await app.drag('开', 'door'); await app.goThrough();
      await app.drag('热', 'pot');
      expect(app.objState('pot', 'hot')).toBe('true');
      expect(app.objState('pot', 'cold')).toBe('false');
      await app.drag('冷', 'pot');
      expect(app.objState('pot', 'cold')).toBe('true');
      expect(app.objState('pot', 'hot')).toBe('false');
    });
  });

  it('every kitchen character is castable and responds', async () => {
    await withApp(save({ owned: ['kai', ...KITCHEN], firstCast: ALL, devMode: true }),
      async app => {
        await app.start();
        await app.drag('开', 'door'); await app.goThrough();
        const before = app.save().castCount;
        let n = 0;
        for (let i = 0; i < 8; i++) { await app.castAny(i, 'pot'); n++; }
        expect(app.save().castCount).toBe(before + n);
      });
  });

  it('REGRESSION: the character that opens the door is always reachable', async () => {
    // The pouch is capped and rotates. Without pinning, 开 rotated out and the
    // kid was stranded in the room with no way to open the door.
    await withApp(save({ owned: ['kai', ...KITCHEN], firstCast: ALL }), async app => {
      await app.start();
      expect(app.realCards().map(c => c.glyph)).toContain('开');
      await app.drag('开', 'door');
      await app.goThrough();
      expect(app.realCards().map(c => c.glyph)).toContain('开');   // and in there too
    });
  });

  it('REGRESSION: 团团 comes along to every room', async () => {
    await withApp(save({ owned: ['kai'], firstCast: ALL }), async app => {
      await app.start();
      expect(Boolean(app.obj('tuantuan'))).toBeTruthy();
      await app.drag('开', 'door'); await app.goThrough();
      expect(Boolean(app.obj('tuantuan'))).toBeTruthy();
    });
  });
});
