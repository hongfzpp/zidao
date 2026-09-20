/* 字岛 M1 — bootstrap and orchestration.

   M1 scope (DESIGN.md §15): Cast mode + house scene + First Meeting + pouch.
   The memory engine, 团团's retrieval mode, Find and Story are M2-M4.

   M1's job is to answer ONE question: does dragging 大 onto the cat get a
   laugh? If it doesn't, the thesis is wrong and everything downstream changes.
*/

import { initAudio, loadVoice, say } from './audio.js';
import { TIMINGS, DEV_HOLD_MS, FAST, applyTestMode, devFlagFromUrl } from './timings.js';
import { initSfx, sfx } from './sfx.js';
import * as scene from './scene.js';
import { initCast } from './cast.js';
import { initPouch, render as renderPouch, onNewCharacter, attachPouchInput } from './pouch.js';
import * as handMod from './hand.js';
import { firstMeeting } from './firstMeeting.js';
import { get, update, own, resetScene, resetAll, setProgress } from './store.js';
import * as prompt from './prompt.js';
import * as story from './story.js';
import * as speechMod from './speech.js';
import { nextUnread, unlockedStories, shelf, closestLocked } from './core/stories.js';
import { blankProgress, getProgress, status as charStatus, mastery } from './core/memory.js';
import { isUnlocked, missingFor } from './core/stories.js';
import {
  DEFAULTS as PACING, arrivalDecision, rollSession, applyArrival,
  castsUntilArrival, sessionBudgetLeft
} from './core/pacing.js';

const ARRIVAL_EVERY = PACING.arrivalEvery;
const MAX_ARRIVALS_PER_SESSION = PACING.maxArrivalsPerSession;
const CASTS_BETWEEN_PROMPTS = 3;   // 团团 asks between bouts of free play, never constantly

// A session is a gap in TIME, not a page load. Keying it to page load meant
// reloading granted a fresh budget while playing for forty minutes straight did
// not -- and once the budget was spent the ONLY way to see another character
// was to restart the app, with no indication that was why nothing was coming.

// Characters arrive ONE AT A TIME, always. Never two 初遇 screens back to back,
// not even for an opposite pair like 大/小 or 开/关 -- a pair introduced
// together is two unfamiliar shapes to hold at once, and they are confusable
// with each other precisely because they are related. The kid meets one, plays
// with it, and only then meets the next.

let CHARS = [];
let RULES = null;
let STORIES = [];

async function boot () {
  applyTestMode();
  // Audio is never allowed to block boot: headless browsers and locked-down
  // devices can leave resume() pending or rejected (rule 5 in CLAUDE.md).
  // Under test it is skipped entirely -- each E2E case boots its own iframe, and
  // an AudioContext plus 12 decoded clips per case dominated the suite's runtime.
  // say()/sfx() no-op without a context, which is exactly what we want here.
  if (!FAST) {
    try { await Promise.race([initAudio(), new Promise(r => setTimeout(r, 2000))]); }
    catch (e) { console.warn('[audio] unavailable', e); }
  }

  const [charData, ruleData, storyIndex] = await Promise.all([
    fetch('data/characters.json').then(r => r.json()),
    fetch('data/cast-rules.json').then(r => r.json()),
    fetch('data/stories/index.json').then(r => r.json())
  ]);
  STORIES = await Promise.all(
    storyIndex.stories.map(f => fetch('data/stories/' + f).then(r => r.json())));
  CHARS = charData.characters.sort((a, b) => a.order - b.order);
  RULES = ruleData;

  if (!FAST) {
    try { await loadVoice(CHARS.map(c => c.id)); } catch (e) { console.warn('[audio] voices', e); }
  }
  initCast(RULES, CHARS);
  await scene.loadScene('house', RULES.spawnables);
  scene.startWander();

  prompt.initPrompt(CHARS, {
    showCards: ids => { handMod.setPromptCards(ids); renderPouch(); },
    restoreCards: () => { handMod.clearPromptCards(); renderPouch(); }
  });
  initPouch(CHARS, {
    onCast: afterCast,
    interceptDrop: (cardId, rec) =>
      prompt.isActive() && rec.id === 'tuantuan' && prompt.answer(cardId)
  });
  attachPouchInput();
  story.initStory(CHARS);
  story.attachStoryInput();
  // read-only hook so the E2E harness can answer 团团 deliberately right or wrong
  window.__promptTarget = () => prompt.targetId();
  window.__startPrompt = () => prompt.startPrompt();
  // test hook: lets the E2E suite feed the recogniser a scripted transcript,
  // since there is no way to speak into a headless browser
  window.__setRecognizer = f => speechMod.setRecognizerFactory(f);
  renderPouch();

  const devFlag = devFlagFromUrl();
  if (devFlag !== null) update({ devMode: devFlag });
  applyDevBadge();
  update(rollSession(get(), Date.now()));

  document.getElementById('unlock').classList.add('hidden');

  // Unlock BEFORE the opening 初遇, not after: the point of arriving with
  // ?dev=1 is to skip straight past the characters. With everything already
  // owned, introduceNext() finds nothing to introduce and the first-run 初遇
  // does not happen at all.
  if (devFlag === true) { update({ firstRun: false }); unlockEverything(); }

  if (get().firstRun || get().owned.length === 0) {
    update({ firstRun: false });
    await introduceNext();        // one character (curriculum order picks 大),
                                  // and it does NOT spend the session budget --
                                  // it is the hook, not one of the day's lessons.
  }

  setupParentGate();
}

/* ---------- character arrival ----------
   New characters drip in through play rather than through a menu. Two per
   session maximum (DESIGN.md §6.1) -- the app is not in a hurry. */


/** Run 初遇 for the next character the kid hasn't met. Returns false if there
    are none left. Used by both the automatic drip and the parent button. */
/** Run 初遇 for a specific character. Re-showing one the kid already knows is a
    review: it must not touch arrival pacing. */
async function introduce (def, { countsTowardSession = false, thenStory = false } = {}) {
  if (!def) return false;
  // A question and 初遇 must never be open together. They were: the big
  // character appeared over a live thought bubble, and because a prompt owns the
  // pouch the newly met character could not get in -- so it looked like the
  // characters had vanished.
  prompt.cancel();
  if (story.isOpen()) return false;
  const isNew = !get().owned.includes(def.id);
  if (isNew) {
    update(applyArrival(get(), { countsTowardSession }));
    setProgress(def.id, blankProgress(def.id, Date.now()));
  }
  sfx('chime');
  await firstMeeting(def);
  onNewCharacter(def.id);
  // Fire and forget: the story is the session's high note, but introduce()
  // must not stay pending until the book is closed -- everything awaiting it
  // would stall behind the overlay.
  if (thenStory) offerStory();
  return true;
}

/** A story is the high note a session ends on (DESIGN.md §3.7). */
async function offerStory () {
  if (story.isOpen() || prompt.isActive()) return false;
  const s = get();
  const next = nextUnread(STORIES, s.owned || [], s.storiesRead || []);
  if (!next) return false;
  await new Promise(r => setTimeout(r, TIMINGS.arrivalDelayMs));
  await story.open(next);
  return true;
}

async function introduceNext (opts) {
  return introduce(CHARS.find(c => !get().owned.includes(c.id)), opts);
}

let castsSincePrompt = 0;

async function afterCast () {
  const hasUnowned = CHARS.some(c => !get().owned.includes(c.id));
  if (arrivalDecision(get(), { hasUnowned }).introduce) {
    await new Promise(r => setTimeout(r, TIMINGS.arrivalDelayMs));  // let the effect land
    await introduceNext({ countsTowardSession: true, thenStory: true });
    castsSincePrompt = 0;
    return;
  }

  // 团团's questions are interleaved with free play, not blocked out as a quiz
  castsSincePrompt++;
  if (story.isOpen() || prompt.isActive() || castsSincePrompt < CASTS_BETWEEN_PROMPTS) return;
  await new Promise(r => setTimeout(r, TIMINGS.arrivalDelayMs));
  if (await prompt.startPrompt()) castsSincePrompt = 0;
}

/* ---------- 测试模式 ----------
   A shortcut for whoever is building this, not a cheat for the child: it grants
   every character (including the glue only met in stories) and lets any story be
   opened directly. It shows a badge at all times, because a dev flag you forget
   is on is a dev flag the child eventually gets. */

const isDev = () => !!get().devMode;

function applyDevBadge () {
  document.getElementById('dev-badge')?.classList.toggle('hidden', !isDev());
}

/** Everything, including 你 好 我, which are otherwise only met by reading. */
function unlockEverything () {
  const now = Date.now();
  for (const c of CHARS) {
    if (!get().owned.includes(c.id)) {
      own(c.id);
      setProgress(c.id, blankProgress(c.id, now));
    }
  }
  onNewCharacter();
}

/** Open any story, granting whatever it needs first so it stays decodable. */
async function devOpenStory (st) {
  const now = Date.now();
  for (const id of missingFor(st, get().owned || [])) {
    own(id);
    setProgress(id, blankProgress(id, now));
  }
  onNewCharacter();
  await story.open(st);
}

/* ---------- parent gate ----------
   Press and hold the bottom-left corner for 3s. Not a math problem: an
   8-year-old solves those (DESIGN.md §13.4). */

function setupParentGate () {
  const dot = document.getElementById('parent-dot');
  const panel = document.getElementById('parent-panel');
  let timer = null;

  // Hold for 3s. The pointer is captured and only real movement cancels:
  // `pointerleave` used to cancel here, which meant a fingertip drifting a
  // pixel on glass reset the timer and the gate could never be opened by touch.
  const SLOP = 44;
  // min(): under ?test=1 the hold is already tiny, and dev mode must never
  // make it slower than it would otherwise be
  const holdMs = () =>
    (isDev() ? Math.min(DEV_HOLD_MS, TIMINGS.parentHoldMs) : TIMINGS.parentHoldMs);
  let origin = null;

  function endHold () {
    clearTimeout(timer);
    timer = null; origin = null;
    dot.classList.remove('holding');
  }

  dot.addEventListener('pointerdown', e => {
    e.preventDefault();
    origin = { x: e.clientX, y: e.clientY };
    dot.style.setProperty('--hold-dur', holdMs() + 'ms');
    dot.classList.add('holding');
    timer = setTimeout(() => { endHold(); sfx('chime'); openPanel(); }, holdMs());
    // Capture is an optimisation, not a requirement: it can throw (stale or
    // synthetic pointer id) and must never stop the hold from running.
    try { dot.setPointerCapture?.(e.pointerId); } catch {}
  });

  dot.addEventListener('pointermove', e => {
    if (!origin) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > SLOP) endHold();
  });

  ['pointerup', 'pointercancel'].forEach(ev => dot.addEventListener(ev, endHold));

  panel.addEventListener('click', async e => {
    const hit = e.target.closest?.('[data-act]');
    const act = hit?.dataset?.act;
    if (!act) return;

    // pick any character directly, rather than only ever "the next one"
    if (act === 'teach') {
      panel.classList.add('hidden');
      await introduce(CHARS.find(c => c.id === hit.dataset.char));
      return;
    }
    if (act === 'close') panel.classList.add('hidden');
    if (act === 'dev-toggle') {
      update({ devMode: !isDev() });
      applyDevBadge();
      if (isDev()) unlockEverything();
      openPanel();
      return;
    }
    if (act === 'open-story') {
      const st = STORIES.find(x => x.id === hit.dataset.story);
      if (!st) return;
      panel.classList.add('hidden');
      if (isUnlocked(st, get().owned || [])) await story.open(st);
      else if (isDev()) await devOpenStory(st);
      return;
    }
    if (act === 'read-story') {
      panel.classList.add('hidden');
      const s2 = get();
      const pick = nextUnread(STORIES, s2.owned || [], s2.storiesRead || [])
                || unlockedStories(STORIES, s2.owned || []).slice(-1)[0];
      if (pick) await story.open(pick);
      return;
    }
    if (act === 'next-char') {
      panel.classList.add('hidden');
      await introduceNext();
    }
    if (act === 'unlock-all') { CHARS.forEach(c => own(c.id)); onNewCharacter(); openPanel(); }
    if (act === 'reset-scene') { resetScene(); scene.rebuild(); panel.classList.add('hidden'); }
    if (act === 'reset-all') {
      if (confirm('清空所有进度？')) { resetAll(); location.reload(); }
    }
  });

  function openPanel () {
    const s = get();
    const LABEL = { new: '刚认识', shaky: '还不稳', 'getting-there': '快记住了', solid: '记住了' };
    const rows = CHARS.map(c => {
      const has = s.owned.includes(c.id);
      const p = s.progress?.[c.id];
      const st = has ? charStatus(p) : null;
      const bar = has
        ? `<span class="bar"><i style="width:${Math.round(mastery(p) * 100)}%"></i></span>`
        : '';
      return `<button class="row char-row${has ? ' known' : ''}" ` +
             `data-act="teach" data-char="${c.id}" data-status="${st || 'none'}">` +
             `<span class="g">${c.char}</span>` +
             `<span class="status">${has ? LABEL[st] : '还没遇到'}</span>` +
             bar +
             `<span class="cta">${has ? '再看一次' : '现在学'}</span>` +
             `</button>`;
    }).join('');
    // Discrimination accuracy: of all the cards picked, how many were real
    // characters rather than decoys? This is the ONLY number here that reflects
    // reading rather than play, so it is the one worth reading.
    const remaining = CHARS.filter(c => !s.owned.includes(c.id));
    const attempts = s.castCount + (s.fizzles || 0);
    const acc = attempts ? Math.round((s.castCount / attempts) * 100) : null;
    document.getElementById('parent-stats').innerHTML =
      `<div><b>认识的字：${s.owned.length} / ${CHARS.length}</b></div>` +
      `<div>施法次数：${s.castCount}　　稀有反应：${s.seenGolden}</div>` +
      `<div>认对率：${acc === null ? '—' : acc + '%'}` +
      `　<span style="opacity:.6">(选错干扰字 ${s.fizzles || 0} 次)</span></div>` +
      `<div>读过的故事：${(s.storiesRead || []).length} / ` +
      `${unlockedStories(STORIES, s.owned || []).length} 本可读` +
      (s.pagesRead
        ? `　<span style="opacity:.6">${s.pagesRead} 页，其中 ${s.hintedPages || 0} 页看了图</span>`
        : '') + `</div>` +
      (() => {
        const sp = Object.values(s.spoken || {});
        const tries = sp.reduce((n, x) => n + x.tries, 0);
        const right = sp.reduce((n, x) => n + x.right, 0);
        if (!tries) return '';
        return `<div>念出来：${tries} 次　念对 ${Math.round(100 * right / tries)}%` +
               `　<span style="opacity:.6">（语音识别对小孩不太准，仅供参考）</span></div>`;
      })() +
      `<div>团团提问：${s.prompts?.asked || 0} 次` +
      (s.prompts?.asked
        ? `　答对 ${Math.round(100 * (s.prompts.right || 0) / s.prompts.asked)}%`
        : '') + `</div>` +
      `<div>本次新字：${Math.min(s.arrivalsThisSession || 0, MAX_ARRIVALS_PER_SESSION)}` +
      ` / ${MAX_ARRIVALS_PER_SESSION}` +
      (remaining.length === 0 ? ''
        : sessionBudgetLeft(s) <= 0
          ? `　<span style="opacity:.6">已达上限，休息 30 分钟后自动重置（或用下面的按钮）</span>`
          : `　<span style="opacity:.6">还差 ${castsUntilArrival(s)} 次施法</span>`) +
      `</div>`;
    const STATUS = { read: '已读', ready: '可以读了', locked: '还差' };
    const dev = isDev();
    const shelfRows = shelf(STORIES, s.owned || [], s.storiesRead || []).map(e => {
      const missing = e.missing
        .map(id => CHARS.find(c => c.id === id)?.char || '')
        .join(' ');
      const openable = e.status !== 'locked' || dev;
      return `<button class="row story-row" data-state="${e.status}" ` +
             `data-act="open-story" data-story="${e.story.id}"` +
             (openable ? '' : ' disabled') + `>` +
             `<span class="story-name">${e.story.title}</span>` +
             `<span class="status">${STATUS[e.status]}` +
             (e.status === 'locked' ? ` <b>${missing}</b>` : '') + `</span>` +
             (openable ? `<span class="go">读 ›</span>` : '') +
             `</button>`;
    }).join('');

    document.getElementById('parent-chars').innerHTML =
      `<div class="sec">故事</div>` + shelfRows +
      `<div class="sec">字</div>` + rows;
    // A story locks until the kid knows every character in it. That is the
    // point -- but a button that silently does nothing reads as broken, so say
    // what is missing (CLAUDE.md rule 9).
    const storyBtn = panel.querySelector('[data-act="read-story"]');
    const ready = nextUnread(STORIES, s.owned || [], s.storiesRead || [])
               || unlockedStories(STORIES, s.owned || []).slice(-1)[0];
    if (ready) {
      storyBtn.disabled = false;
      storyBtn.textContent = `读故事：${ready.title}`;
    } else {
      storyBtn.disabled = true;
      const near = closestLocked(STORIES, s.owned || []);
      storyBtn.textContent = near
        ? `故事还差 ${near.missing.length} 个字`
        : '还没有故事';
    }

    const devBtn = panel.querySelector('[data-act="dev-toggle"]');
    devBtn.dataset.on = String(isDev());
    devBtn.textContent = isDev() ? '测试模式：开' : '测试模式';

    const nextBtn = panel.querySelector('[data-act="next-char"]');
    nextBtn.disabled = remaining.length === 0;
    nextBtn.textContent = remaining.length
      ? `认识下一个字：${remaining[0].char}`
      : '全部字都认识了';
    panel.classList.remove('hidden');
  }
}

/* ---------- iOS housekeeping ---------- */

document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

/* Offline support, on real deployments only. Never on localhost and never with
   ?dev=1 / ?test=1: a service worker during development is how you end up
   debugging code that is not running. */
(function registerServiceWorker () {
  if (!('serviceWorker' in navigator)) return;
  const p = new URLSearchParams(location.search);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local || p.get('dev') === '1' || p.get('test') === '1') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('[sw]', e));
  });
})();

document.getElementById('unlock-btn').addEventListener('click', () => {
  initSfx();
  boot().catch(err => {
    console.error(err);
    alert('出错了：' + err.message);
  });
}, { once: true });
