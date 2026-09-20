/* 团团要… — retrieval, disguised as helping a friend (DESIGN.md §6.3).

   团团 cannot read. When 团团 wants something, the kid has to find the right
   character. That reframes every single test as an act of kindness: children
   3-8 love being the competent one, and being asked to help is motivating in a
   way being asked to answer is not.

   The difficulty is invisible and comes from js/core/distractors.js -- how
   similar the wrong cards look scales with how well the kid knows the target. */

import { get, update, setProgress } from './store.js';
import { getProgress, recordAnswer, pickReviewTarget } from './core/memory.js';
import { buildPrompt } from './core/distractors.js';
import { say } from './audio.js';
import { sfx } from './sfx.js';
import { emote } from './tuantuan.js';
import * as fx from './fx.js';
import * as scene from './scene.js';
import { TIMINGS } from './timings.js';

const GIVE_UP_MS = 25000;      // 团团 never nags: drop it if the kid is busy

let chars = [];
let active = null;             // { targetId, cards, startedAt, attempts }
let onCards = null;            // hand takes over the pouch while a prompt runs
let onDone = null;
let giveUpTimer = null;

export function initPrompt (characterDefs, { showCards, restoreCards }) {
  chars = characterDefs;
  onCards = showCards;
  onDone = restoreCards;
}

export const isActive = () => !!active;
export const targetId = () => active?.targetId ?? null;

/** Is there anything worth asking about right now? */
export function dueTarget (now = Date.now()) {
  const s = get();
  // only castable characters: a glue character has no card to hand over
  const askable = (s.owned || []).filter(
    id => chars.find(c => c.id === id)?.castable !== false);
  return pickReviewTarget(s.progress || {}, askable, now);
}

function bubble (text) {
  const host = document.getElementById('obj-tuantuan');
  if (!host) return;
  let el = host.querySelector('.think');
  if (!el) {
    el = document.createElement('span');
    el.className = 'think';
    host.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('on');
}

function hideBubble () {
  document.querySelector('#obj-tuantuan .think')?.classList.remove('on');
}

/* The pouch narrowing to three cards reads as "my characters disappeared"
   unless it is obvious a question is being asked. 团团 lights up as the place
   to drop, and the rest of the room steps back. */
function setAsking (on) {
  document.getElementById('obj-tuantuan')?.classList.toggle('asking', on);
  document.getElementById('room')?.classList.toggle('question', on);
}

/** 团团 wants a character. Says it aloud; the kid has to find it. */
export async function startPrompt (now = Date.now()) {
  if (active) return false;
  if (!document.getElementById('first-meeting')?.classList.contains('hidden')) return false;
  const id = dueTarget(now);
  if (!id) return false;
  const def = chars.find(c => c.id === id);
  if (!def) return false;

  const s = get();
  const box = getProgress(s.progress || {}, id, now).box ?? 0;
  const built = buildPrompt(def, chars, s.owned || [], box, 2);

  active = { targetId: id, cards: built.cards, startedAt: 0, attempts: 0 };
  update({ prompts: { ...(s.prompts || { asked: 0, right: 0 }),
                      asked: (s.prompts?.asked || 0) + 1 } });

  onCards?.(built.cards);
  setAsking(true);
  bubble('?');
  emote('surprised', 1200);
  sfx('chime');

  await ask(def);

  clearTimeout(giveUpTimer);
  giveUpTimer = setTimeout(giveUp, GIVE_UP_MS);
  return true;
}

/** Say the word, then start the clock: latency is measured from silence. */
async function ask (def) {
  const ms = say(def.id);
  if (ms > 0) await fx.wait(ms + 60);
  if (active) active.startedAt = performance.now();
}

/**
 * The kid dropped a card on 团团.
 * Only the FIRST attempt scores -- afterwards it is practice, not a test.
 */
export function answer (cardId) {
  if (!active) return false;
  const correct = cardId === active.targetId;
  const first = active.attempts === 0;
  active.attempts++;

  if (first) {
    const now = Date.now();
    const latency = active.startedAt ? performance.now() - active.startedAt : 0;
    const p = getProgress(get().progress || {}, active.targetId, now);
    setProgress(active.targetId, recordAnswer(p, { correct, latencyMs: latency }, now));
    if (correct) {
      const s = get();
      update({ prompts: { ...(s.prompts || {}), right: (s.prompts?.right || 0) + 1 } });
    }
  }

  correct ? succeed() : miss(cardId);
  return true;
}

function succeed () {
  setAsking(false);
  const rec = scene.getObject('tuantuan');
  const c = rec ? scene.centerOf(rec) : { x: innerWidth / 2, y: innerHeight / 2 };
  hideBubble();
  emote('happy', 2000);
  sfx('chime');
  fx.particles('heart', 10, c.x, c.y);
  finish();
}

/** A miss is never a failure. 团团 is simply confused, and asks again. */
function miss (cardId) {
  const rec = scene.getObject('tuantuan');
  const c = rec ? scene.centerOf(rec) : { x: innerWidth / 2, y: innerHeight / 2 };
  emote('confused', 1600);
  sfx('womp');
  fx.particles('smoke', 3, c.x, c.y);
  say(cardId);                                   // the miss is still an exposure
  const def = chars.find(c2 => c2.id === active.targetId);
  setTimeout(() => { if (active && def) ask(def); }, 900);
}

function giveUp () {
  if (!active) return;
  setAsking(false);
  hideBubble();
  emote('sleepy', 1500);
  finish();
}

function finish () {
  clearTimeout(giveUpTimer);
  active = null;
  setAsking(false);
  hideBubble();
  setTimeout(() => onDone?.(), TIMINGS.arrivalDelayMs > 0 ? 700 : 0);
}

export function cancel () {
  if (!active) return;
  clearTimeout(giveUpTimer);
  active = null;
  setAsking(false);
  hideBubble();
  onDone?.();
}
