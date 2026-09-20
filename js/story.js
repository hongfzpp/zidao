/* 故事 — the payoff (DESIGN.md §6.5).

   Every character on the page is one the kid already knows, so they read it
   unaided. That moment -- "I read that" -- is the thing that makes a child want
   to come back, and everything else in the app exists to make this page
   readable.

   Nothing here tests the kid. Tapping a character says it; tapping the picture
   makes it jump. They may read aloud or not. There is no score. */

import { get, update, own, setProgress } from './store.js';
import { getProgress, recordExposure, blankProgress } from './core/memory.js';
import { newGlue } from './core/stories.js';
import { matchSpoken, verdict } from './core/speechmatch.js';
import * as speech from './speech.js';
import { TIMINGS } from './timings.js';
import { say } from './audio.js';
import { sfx } from './sfx.js';

let chars = [];
let story = null;
let page = 0;
let resolveRead = null;
let listening = false;
let hintShown = false;
let countedPage = false;

const $ = id => document.getElementById(id);

export function initStory (characterDefs) { chars = characterDefs; }
export const isOpen = () => !!story;

const byGlyph = g => chars.find(c => c.char === g);

export function open (s) {
  story = s;
  page = 0;
  hintShown = false;
  countedPage = false;
  update({ pagesRead: (get().pagesRead || 0) + 1 });
  $('story').classList.remove('hidden');
  render();
  return new Promise(res => { resolveRead = res; });
}

function render () {
  const p = story.pages[page];

  // The picture is the answer. Showing it means the kid can read the PICTURE
  // instead of the characters, which is the one thing this screen exists to
  // prevent. It starts hidden, in a placeholder the same size so nothing jumps,
  // and is there for them when they are stuck.
  const art = $('story-art');
  art.dataset.art = p.art || '';
  art.classList.toggle('revealed', hintShown);
  art.innerHTML = hintShown
    ? `<span class="art-img">${p.art || ''}</span>`
    : `<button class="art-hint" id="art-hint">💡<span>看图</span></button>`;
  const text = $('story-text');
  text.innerHTML = '';
  for (const line of p.text) {
    for (const g of line) {
      if (!g.trim()) continue;
      const el = document.createElement('span');
      el.className = 'story-char';
      el.textContent = g;
      el.dataset.glyph = g;
      text.appendChild(el);
    }
  }
  $('story-dots').innerHTML = story.pages
    .map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('');

  // reading the page is the exposure; tapping a character is not
  for (const g of new Set(p.text.join(''))) {
    if (g.trim()) countExposure(g);
  }

  // a fresh page is a fresh attempt
  $('story-hint').textContent = '';
  const mic = $('story-mic');
  mic.classList.remove('listening');
  mic.querySelector('span').textContent = '说说看';
  mic.disabled = !speech.isSupported();
  if (mic.disabled) $('story-hint').textContent = speech.unsupportedReason() || '';
  $('story-prev').disabled = page === 0;

  const next = $('story-next');
  const last = page === story.pages.length - 1;
  next.classList.toggle('finish', last);
  next.textContent = last ? '看完了' : '›';
}

/** Say a character aloud. Only ever called AFTER the child has had a go. */
function speak (glyph) {
  const def = byGlyph(glyph);
  if (def) say(def.id);
}

function countExposure (glyph) {
  const def = byGlyph(glyph);
  if (!def) return;
  const now = Date.now();
  setProgress(def.id, recordExposure(getProgress(get().progress || {}, def.id, now), now));
}

function turn (delta) {
  if (!story) return;            // the book is already closed
  speech.stop();
  listening = false;
  hintShown = false;             // every page starts covered again
  const next = page + delta;
  if (next < 0) return;
  if (next >= story.pages.length) return finish();
  page = next;
  countedPage = false;
  update({ pagesRead: (get().pagesRead || 0) + 1 });
  sfx('pop');
  render();
}

function finish () {
  speech.stop();
  listening = false;
  const s = get();
  // glue characters are learnt here, by position and repetition -- never in
  // 初遇, never cast (DESIGN.md §9.1)
  for (const id of newGlue(story, s.owned || [])) {
    own(id);
    setProgress(id, blankProgress(id, Date.now()));
  }
  update({ storiesRead: [...new Set([...(s.storiesRead || []), story.id])] });
  sfx('chime');
  $('story').classList.add('hidden');
  const done = story;
  story = null;
  resolveRead?.(done);
  resolveRead = null;
}

/** The glyphs on the current page, in order. */
function pageGlyphs () {
  return [...document.querySelectorAll('.story-char')].map(e => e.dataset.glyph);
}

/**
 * The child says the line. There is no pass or fail: characters they got light
 * up, the rest simply stay as they are, and the page turns whenever they like.
 */
async function sayIt () {
  if (listening || !story) return;
  const mic = $('story-mic');
  listening = true;
  mic.classList.add('listening');
  mic.querySelector('span').textContent = '在听…';
  $('story-hint').textContent = '';

  const { transcripts, error } = await speech.listen({ timeoutMs: 7000 });

  listening = false;
  mic.classList.remove('listening');
  mic.querySelector('span').textContent = '再说一次';

  if (error === 'not-allowed' || error === 'service-not-allowed') {
    mic.disabled = true;
    $('story-hint').textContent = '没有麦克风权限';
    return;
  }

  const targets = pageGlyphs();
  const { said, heard } = matchSpoken(targets, transcripts, chars);
  const els = [...document.querySelectorAll('.story-char')];
  const remaining = [...said];
  for (const el of els) {
    const i = remaining.indexOf(el.dataset.glyph);
    if (i === -1) continue;
    remaining.splice(i, 1);
    el.dataset.said = 'true';
  }

  recordSpoken(targets, said, heard);

  const v = verdict(targets, said);
  if (v === 'all')       { sfx('chime');   $('story-hint').textContent = '全对了！'; }
  else if (v === 'some') { sfx('sparkle'); $('story-hint').textContent = '对了几个！'; }
  else                   { $('story-hint').textContent = '再试试看'; }

  // Hearing the line read back is feedback on an attempt, not a free answer, so
  // it happens only when the child actually said something. Silence buys
  // nothing -- otherwise tapping the microphone and saying nothing would be the
  // new way to get the answer.
  if (transcripts && transcripts.length) await readBackLine(targets);
}

/** Read the line back, in order, once the child has had a go at it. */
async function readBackLine (targets) {
  const els = [...document.querySelectorAll('.story-char')];
  for (let i = 0; i < els.length; i++) {
    if (!story) return;                       // the book closed mid-readback
    els[i].classList.add('reading');
    speak(els[i].dataset.glyph);
    await sleep(TIMINGS.readBackMs);
    els[i].classList.remove('reading');
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Kept for the parent panel only. Never shown to the child, never a gate. */
function recordSpoken (targets, said, heard) {
  const s = get();
  const spoken = { ...(s.spoken || {}) };
  for (const glyph of new Set(targets)) {
    const def = byGlyph(glyph);
    if (!def) continue;
    const cur = spoken[def.id] || { tries: 0, right: 0 };
    spoken[def.id] = {
      tries: cur.tries + 1,
      right: cur.right + (said.includes(glyph) ? 1 : 0)
    };
  }
  update({ spoken, lastHeard: heard || '' });
}

/** Reveal the picture. Never a penalty -- just recorded, for the parent. */
function showHint () {
  if (hintShown || !story) return;
  hintShown = true;
  sfx('sparkle');
  if (!countedPage) {
    const s = get();
    update({ hintedPages: (s.hintedPages || 0) + 1 });
    countedPage = true;
  }
  render();
}

export function attachStoryInput () {
  $('story-mic').addEventListener('click', sayIt);
  $('story-art').addEventListener('click', e => {
    if (e.target.closest('.art-hint')) return showHint();
    const el = $('story-art');
    el.classList.remove('tapped'); void el.offsetWidth; el.classList.add('tapped');
    sfx('sparkle');
  });
  // Tapping a character does NOT say it. Hearing it on demand is an answer
  // key: a child can tap along the line and never read anything. It wiggles, so
  // the tap is not dead, and that is all.
  $('story-text').addEventListener('pointerdown', e => {
    const el = e.target.closest('.story-char');
    if (!el) return;
    el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge');
    setTimeout(() => el.classList.remove('nudge'), 420);
  });
  $('story-next').addEventListener('click', () => turn(1));
  $('story-prev').addEventListener('click', () => turn(-1));
}
