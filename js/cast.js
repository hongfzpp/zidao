/* The cast engine — the heart of the app.
   DESIGN.md §2: "The character is the verb, not the quiz." Recognizing a
   character IS the fun action, and the effect is the reward. There is no
   score, no star, and no wrong answer -- a mis-cast still demonstrates the
   character it cast, so it is never a wasted answer (§3.2). */

import * as scene from './scene.js';
import * as fx from './fx.js';
import { say } from './audio.js';
import { sfx } from './sfx.js';
import { emote } from './tuantuan.js';
import { get, update } from './store.js';
import { isDistractor } from './core/hand.js';
import { applyCast } from './core/pacing.js';
import { getProgress, recordExposure } from './core/memory.js';
import { chooseSteps } from './core/rules.js';

let ruleData = null;
let byGlyph = new Map();     // '大' -> 'da'
let lastVariant = new Map(); // dedupe key -> last variant index

export function initCast (data, characters) {
  ruleData = data;
  byGlyph = new Map(characters.map(c => [c.char, c.id]));
  lastVariant.clear();
}

export const spawnables = data => data.spawnables || {};

/* rule matching + variant selection live in js/core/rules.js (pure, unit tested) */

/* ---------- step execution ---------- */

async function runSteps (steps, ctx) {
  for (const step of steps) {
    try { await runStep(step, ctx); }
    catch (e) { console.warn('[cast] step failed', step.type, e); }
  }
}

async function runStep (step, ctx) {
  const { rec, charId, point } = ctx;
  const el = rec?.el;

  switch (step.type) {
    // `wait: true` holds the rest of the sequence until the spoken word has
    // finished. A sound effect that imitates the thing -- a meow, a door --
    // competes with the pronunciation if they overlap, and the kid hears
    // neither clearly. say() returns 0 when there is no audio (test mode, a
    // failed load), so this degrades to no delay.
    case 'say':
    case 'saySelf': {
      const id = step.type === 'saySelf' ? charId : (byGlyph.get(step.char) || step.char);
      const ms = say(id);
      if (step.wait && ms > 0) await fx.wait(ms + (step.gap ?? 90));
      break;
    }
    case 'sfx':      sfx(step.id); break;
    case 'wait':     await fx.wait(step.dur ?? 300); break;

    case 'scale': {
      const min = step.min ?? 0.15, max = step.max ?? 5;
      const next = Math.max(min, Math.min(max, rec.scale * (step.factor ?? 1.5)));
      scene.setScale(rec.id, next);
      break;
    }
    case 'setScale': scene.setScale(rec.id, step.value ?? 1); break;
    case 'lift':     scene.lift(rec.id, step.dy ?? -20); break;

    case 'setState': scene.setState(rec.id, step.key, step.value); break;

    case 'particles': {
      const c = point || scene.centerOf(rec);
      fx.particles(step.kind, step.count ?? 10, c.x, c.y);
      break;
    }

    case 'shake': {
      const t = step.target === 'room' ? document.getElementById('room') : el;
      fx.shake(t, step.intensity ?? 6, step.dur ?? 500);
      break;
    }

    case 'hop':
      el.style.setProperty('--h', step.height ?? 24);
      el.style.setProperty('--ht', step.times ?? 1);
      el.style.setProperty('--hd', (step.dur ?? 450) + 'ms');
      el.classList.remove('hopping'); void el.offsetWidth;
      el.classList.add('hopping');
      setTimeout(() => el.classList.remove('hopping'),
                 (step.dur ?? 450) * (step.times ?? 1) + 80);
      break;

    case 'spin':
      el.style.setProperty('--t', step.turns ?? 1);
      el.style.setProperty('--sd', (step.dur ?? 600) + 'ms');
      el.classList.remove('spinning'); void el.offsetWidth;
      el.classList.add('spinning');
      setTimeout(() => el.classList.remove('spinning'), (step.dur ?? 600) + 80);
      break;

    case 'squash':    fx.squash(el); break;
    case 'glow':      fx.glow(el, step.color, step.dur); break;
    case 'roomLight': fx.roomLight(step.value === 'on'); break;
    case 'roomTint':  fx.roomTint(step.color, step.dur); break;
    case 'rain':      fx.rain(step.dur ?? 3000); break;
    case 'tuan':      emote(step.emotion, step.dur ?? 1500); break;

    case 'spawn': {
      const c = point || scene.centerOf(rec);
      scene.spawn(step.what, c.x, c.y);
      break;
    }

    default: console.warn('[cast] unknown step', step.type);
  }
}

/* ---------- entry point ---------- */

/**
 * Cast `charId` onto scene object `rec` at page point `point`.
 * Always produces a response -- never a dead tap (DESIGN.md §6.2).
 */
export async function cast (charId, rec, point) {
  const key = `${charId}:${rec.id}`;
  const firstCast = get().firstCast || [];
  const isFirstCast = !isDistractor(charId) && !firstCast.includes(charId);

  const { steps, kind, variantIndex, consumedFirstCast } = chooseSteps(ruleData, {
    charId, rec, isFirstCast, lastIndex: lastVariant.get(key) ?? -1
  });
  if (variantIndex >= 0) lastVariant.set(key, variantIndex);

  if (kind === 'fizzle') {
    update({ fizzles: (get().fizzles || 0) + 1 });
  } else {
    const patch = applyCast(get());
    if (isFirstCast && consumedFirstCast) patch.firstCast = [...firstCast, charId];
    // free play counts as seeing the character, but it is not a test
    const now = Date.now();
    patch.progress = {
      ...(get().progress || {}),
      [charId]: recordExposure(getProgress(get().progress || {}, charId, now), now)
    };
    if (kind === 'golden' && !isFirstCast) patch.seenGolden = (get().seenGolden || 0) + 1;
    update(patch);
  }

  await runSteps(steps, { rec, charId, point });
}
