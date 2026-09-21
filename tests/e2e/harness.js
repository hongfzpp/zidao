/* Drives the real app inside an iframe. Same origin, so we can reach into its
   document and localStorage. Everything here talks to the app the way a finger
   does -- pointer events on real elements -- so it exercises the wiring the
   unit tests deliberately skip. */

import { arrivalDecision } from '../../js/core/pacing.js';
import * as POUCH from '../../js/core/hand.js';

const APP_URL = '../index.html?test=1';   // see js/timings.js
const SAVE_KEY = 'zidao.v1';

// The character list, fetched once, so the harness can ask the SAME pure pacing
// core the app uses whether an arrival is due. That turns "wait and see" into a
// decision -- no speculative polling after casts that cannot produce one.
let CHAR_IDS = null;
async function charIds () {
  if (!CHAR_IDS) {
    const d = await fetch('../data/characters.json').then(r => r.json());
    CHAR_IDS = d.characters.map(c => c.id);
  }
  return CHAR_IDS;
}

export function sleep (ms) { return new Promise(r => setTimeout(r, ms)); }

export async function waitFor (fn, { timeout = 6000, interval = 10, label = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${label}`);
    await sleep(interval);
  }
}

export class App {
  constructor (frame) { this.frame = frame; }

  get win () { return this.frame.contentWindow; }
  get doc () { return this.frame.contentDocument; }

  /** Boot a fresh app with the given saved state (null = wiped). */
  static async launch (state = null, { width = 1024, height = 768, url = null } = {}) {
    // The test page and the app are same-origin, so their localStorage is the
    // SAME store: seed it here and the iframe loads once instead of twice.
    localStorage.removeItem(SAVE_KEY);
    if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));

    const frame = document.createElement('iframe');
    frame.style.cssText =
      `width:${width}px;height:${height}px;border:0;position:fixed;left:-99999px;top:0`;
    frame.src = url || APP_URL;
    document.body.appendChild(frame);
    await new Promise(res => frame.addEventListener('load', res, { once: true }));

    const app = new App(frame);
    app.errors = [];
    app.win.addEventListener('error', e => app.errors.push('error: ' + e.message));
    app.win.addEventListener('unhandledrejection',
      e => app.errors.push('reject: ' + (e.reason?.message || e.reason)));

    await waitFor(() => app.doc.getElementById('unlock-btn'), { label: 'unlock button' });
    return app;
  }

  destroy () { this.frame.remove(); }

  /* ---------- state ---------- */
  save () { return JSON.parse(this.win.localStorage.getItem(SAVE_KEY) || '{}'); }
  /** Total attempts recorded, real casts + fizzles. Used to wait on a cast. */
  attempts () { const s = this.save(); return (s.castCount || 0) + (s.fizzles || 0); }
  /** Two frames: enough for the DOM to settle once transitions are off. */
  frameTick () {
    return new Promise(r => this.win.requestAnimationFrame(
      () => this.win.requestAnimationFrame(r)));
  }

  /* ---------- queries ---------- */
  $ (sel) { return this.doc.querySelector(sel); }
  $$ (sel) { return [...this.doc.querySelectorAll(sel)]; }

  cards () {
    return this.$$('.card').map(el => ({
      el, id: el.dataset.id, glyph: el.textContent,
      decoy: el.dataset.distractor === 'true'
    }));
  }
  handGlyphs () { return this.cards().map(c => c.glyph + (c.decoy ? '*' : '')); }
  realCards () { return this.cards().filter(c => !c.decoy); }
  /** How many real cards should show, given the cap and the decoys present. */
  expectedRealCards () {
    const owned = (this.save().owned || []).length;
    return Math.min(owned, Math.max(POUCH.MIN_REAL,
                                    POUCH.MAX_POUCH - this.decoyCards().length));
  }
  decoyCards () { return this.cards().filter(c => c.decoy); }

  obj (id) { return this.doc.getElementById('obj-' + id); }
  sceneId () { return this.save().currentScene; }
  roomUnit () { return Number(this.$('#room').dataset.unit || 0); }
  roomFloor () { return this.$('#room').dataset.floor; }
  wallColour () {
    return this.win.getComputedStyle(this.$('#wall')).backgroundImage;
  }
  objCount (id) { return Number(this.obj(id)?.dataset.count || 1); }
  /** Walk through an open door. */
  async goThrough (doorId = 'door') {
    const to = this.obj(doorId).dataset.leadsTo;
    this.obj(doorId).click();
    await waitFor(() => this.sceneId() === to, { timeout: 4000, label: 'the next room' });
    await waitFor(() => this.$$('.obj').length > 0, { label: 'the room to build' });
    await this.frameTick();
  }
  objScale (id) {
    const t = this.obj(id)?.querySelector('.scaler')?.style.transform || 'scale(1)';
    return parseFloat(t.replace(/[^\d.]/g, '')) || 1;
  }
  objState (id, key) { return this.obj(id)?.dataset[key]; }

  fmOpen () { return !this.$('#first-meeting').classList.contains('hidden'); }

  /* ---------- 故事 ---------- */
  storyOpen () { return !this.$('#story').classList.contains('hidden'); }
  storyText () { return this.$$('.story-char').map(e => e.textContent).join(''); }
  storyPage () {
    return this.$$('#story-dots i').findIndex(e => e.classList.contains('on')) + 1;
  }
  storyPageCount () { return this.$$('#story-dots i').length; }
  async storyNext () { this.$('#story-next').click(); await this.frameTick(); }

  /* ---------- the picture hint ---------- */
  artHidden () { return !!this.$('#story-art .art-hint'); }
  artShown () { return !!this.$('#story-art .art-img'); }
  artText () { return this.$('#story-art .art-img')?.textContent || ''; }
  async tapHint () {
    this.$('#art-hint').click();
    await waitFor(() => this.artShown(), { label: 'picture to appear' });
    await this.frameTick();
  }

  /* ---------- 说说看 ---------- */
  micDisabled () { return this.$('#story-mic').disabled; }
  storyHint () { return this.$('#story-hint').textContent; }
  saidGlyphs () {
    return this.$$('.story-char').filter(e => e.dataset.said === 'true')
               .map(e => e.dataset.glyph);
  }

  /** Script what the recogniser will "hear" next. */
  fakeHear (transcripts, { error = null } = {}) {
    const win = this.win;
    win.__setRecognizer(() => ({
      lang: '', continuous: false, interimResults: false, maxAlternatives: 1,
      start () {
        setTimeout(() => {
          if (error) return this.onerror?.({ error });
          this.onresult?.({ results: [transcripts.map(t => ({ transcript: t }))]
            .map(alts => Object.assign(alts, { length: alts.length })) });
        }, 10);
      },
      stop () {}, abort () {}
    }));
  }

  async tapMic () {
    this.$('#story-mic').click();
    await waitFor(() => !this.$('#story-mic').classList.contains('listening'),
      { timeout: 4000, label: 'recogniser to answer' });
    await this.frameTick();
  }
  async readWholeStory () {
    await waitFor(() => this.storyOpen(), { label: 'story to open' });
    const pages = [];
    for (let i = 0; i < 12 && this.storyOpen(); i++) {
      pages.push(this.storyText());
      await this.storyNext();
    }
    await waitFor(() => !this.storyOpen(), { label: 'story to close' });
    return pages;
  }

  /* ---------- 团团's questions ---------- */
  promptOpen () { return !!this.$('#obj-tuantuan .think.on'); }
  promptCards () { return this.cards().map(c => c.glyph); }

  /** Answer the open question. `correct: false` picks a wrong card on purpose. */
  async answerPrompt ({ correct = true } = {}) {
    await waitFor(() => this.promptOpen(), { label: 'question to open' });
    const wantId = this.win.__promptTarget?.();
    const cards = this.cards();
    const pick = correct
      ? cards.find(c => c.id === wantId)
      : cards.find(c => c.id !== wantId);
    if (!pick) throw new Error('no card to answer with');
    const glyph = pick.glyph;
    await this.drag(glyph, 'tuantuan', { expectAttempt: false });
    return glyph;
  }

  /** Free play resumes once any open question is dealt with. */
  async settlePrompt () {
    if (!this.promptOpen()) return false;
    await this.answerPrompt({ correct: true });
    await waitFor(() => !this.promptOpen(), { label: 'question to close' });
    await this.frameTick();
    return true;
  }
  fmChar () { return this.$('#fm-char').textContent; }

  /* ---------- actions ---------- */
  async start () {
    this.$('#unlock-btn').click();
    await waitFor(() => this.$('#unlock').classList.contains('hidden'),
      { timeout: 10000, label: 'app to boot' });
    await waitFor(() => this.fmOpen() || this.$$('.obj').length > 0,
      { label: 'scene or 初遇' });
    await this.frameTick();
  }

  pd (el, extra = {}) {
    el.dispatchEvent(new this.win.PointerEvent('pointerdown',
      { bubbles: true, cancelable: true, pointerId: 3, ...extra }));
  }

  /** Complete one 初遇: tap to reveal, then the tick. */
  async completeFirstMeeting () {
    await waitFor(() => this.fmOpen(), { label: '初遇 to open' });
    const ch = this.fmChar();
    this.pd(this.$('#fm-stage'));
    await waitFor(() => !this.$('#fm-done').classList.contains('hidden'), { label: 'tick' });
    this.pd(this.$('#fm-done'));
    await waitFor(() => !this.fmOpen(), { label: '初遇 to close' });
    await this.frameTick();
    return ch;
  }

  /** Drag a pouch card onto a scene object, the way a finger would. */
  /**
   * `offset` shifts the drop point away from the target's exact centre, as a
   * fraction of its size. Dropping dead-centre hits even a one-pixel sliver,
   * which no real finger does -- so a test that always drops centrally cannot
   * detect a target that has become too small to aim at.
   */
  async drag (glyph, targetId, { expectAttempt = true, offset = null } = {}) {
    // A question takes over the pouch. Deal with it first, the way a kid would,
    // so free-play assertions are not derailed by 团团 interrupting.
    if (expectAttempt && this.promptOpen()) await this.settlePrompt();
    const card = this.cards().find(c => c.glyph === glyph);
    if (!card) throw new Error(`no card "${glyph}" in hand [${this.handGlyphs().join(' ')}]`);
    const target = this.obj(targetId);
    if (!target) throw new Error(`no object "${targetId}"`);

    const cr = card.el.getBoundingClientRect();
    const g = target.querySelector('.glyph').getBoundingClientRect();
    const from = { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 };
    const to = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
    const ev = (type, x, y, el) =>
      (el || this.win).dispatchEvent(new this.win.PointerEvent(type,
        { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y }));

    const before = this.attempts();
    ev('pointerdown', from.x, from.y, card.el);
    // two moves: one past the 12px drag threshold, one onto the target
    ev('pointermove', from.x + (to.x - from.x) * 0.5, from.y + (to.y - from.y) * 0.5);
    ev('pointermove', to.x, to.y);
    ev('pointerup', to.x, to.y);
    if (expectAttempt) {
      // a cast always records an attempt -- wait for THAT, not a fixed delay
      await waitFor(() => this.attempts() > before,
        { timeout: 4000, label: `cast ${glyph} on ${targetId}` });
    }
    await this.frameTick();
  }

  /** Start a drag but never release -- simulates a lost pointerup. */
  async dragAndAbandon (glyph) {
    const card = this.cards().find(c => c.glyph === glyph);
    const cr = card.el.getBoundingClientRect();
    const ev = (type, x, y, el) =>
      (el || this.win).dispatchEvent(new this.win.PointerEvent(type,
        { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y }));
    ev('pointerdown', cr.left + 10, cr.top + 10, card.el);
    ev('pointermove', cr.left + 200, cr.top - 200);
    await waitFor(() => this.$('#drag-layer').children.length > 0,
      { timeout: 2000, label: 'ghost card' });
  }

  async tapCard (glyph) {
    const card = this.cards().find(c => c.glyph === glyph);
    const cr = card.el.getBoundingClientRect();
    const x = cr.left + cr.width / 2, y = cr.top + cr.height / 2;
    const ev = (type, el) => (el || this.win).dispatchEvent(
      new this.win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 2, clientX: x, clientY: y }));
    ev('pointerdown', card.el);
    ev('pointerup');
    await this.frameTick();
  }

  /** Cast whatever real character is in hand, onto a rotating target. */
  /**
   * Cast whatever real card is in the pouch, onto `target` (or a rotating one).
   * Settles any open question FIRST, then reads the pouch -- reading it before
   * that races with the question handing the pouch back.
   */
  async castAny (i = 0, target = null) {
    await this.settlePrompt();
    const targets = ['cat', 'bed', 'plant', 'door', 'window', 'lamp'];
    const real = this.realCards()[i % Math.max(1, this.realCards().length)];
    await this.drag(real.glyph, target || targets[i % targets.length]);
    return real.glyph;
  }

  /** Cast n times, completing any 初遇 that appears. Returns the arrivals. */
  /**
   * Did that cast introduce a character?
   * Asks js/core/pacing.js whether one is due rather than waiting to find out:
   * when none is due this returns immediately, which is what stops a 20-cast
   * test from paying a speculative timeout twenty times over.
   */
  async arrived (timeout = 2000) {
    if (this.fmOpen()) return true;
    const ids = await charIds();
    const owned = this.save().owned || [];
    const due = arrivalDecision(this.save(), { hasUnowned: ids.some(id => !owned.includes(id)) });
    if (!due.introduce) {
      await this.frameTick();          // it may have opened in the last tick
      return this.fmOpen();
    }
    await waitFor(() => this.fmOpen(), { timeout, interval: 5, label: 'arrival' });
    return true;
  }

  async play (n) {
    const arrivals = [];
    for (let i = 1; i <= n; i++) {
      await this.castAny(i);
      if (await this.arrived()) {
        arrivals.push({ atCast: i, char: await this.completeFirstMeeting() });
      }
    }
    return arrivals;
  }

  async openParentPanel () {
    const dot = this.$('#parent-dot');
    const r = dot.getBoundingClientRect();
    this.pd(dot, { clientX: r.left + 32, clientY: r.top + 32, pointerId: 7 });
    await waitFor(() => !this.$('#parent-panel').classList.contains('hidden'),
      { timeout: 5000, label: 'parent panel' });
  }

  parentStats () { return this.$('#parent-stats').innerText; }

  /* ---------- 测试模式 ---------- */
  devOn () { return !this.$('#dev-badge').classList.contains('hidden'); }
  storyRows () {
    return this.$$('.story-row').map(r => ({
      id: r.dataset.story, state: r.dataset.state, disabled: r.disabled, el: r
    }));
  }
}
