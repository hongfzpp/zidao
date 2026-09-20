/* Stateful wrapper around the pure core (js/core/hand.js).
   This file holds the *current* hand; all the decisions live in core. */

import { get } from './store.js';
import * as core from './core/hand.js';
import { requiredChars } from './scene.js';

export const { isDistractor, distractorGlyph, toDistractorId } = core;
export const DISTRACTOR_PREFIX = core.DISTRACTOR_PREFIX;

const REDRAW_EVERY = 12;

let chars = [];
let hand = [];
let currentDecoys = [];
let currentSelection = null;   // which owned characters are on show
let pinnedId = null;           // the character last shown to the kid, always kept
let castsSinceRedraw = 0;
let promptCards = null;   // while 团团 is asking, the pouch shows only these

export function initHand (characterDefs) {
  chars = characterDefs;
  rebuild({ redraw: true });
}

/* Decoy cadence: the set is held stable and only the ORDER changes between
   attempts. If decoys were redrawn on every shuffle, the cards that persisted
   would be exactly the real ones -- a free answer. Redraw at natural
   boundaries instead. */
export function setPromptCards (ids) { promptCards = ids; hand = [...ids]; return hand; }
export function clearPromptCards () { promptCards = null; return rebuild(); }
export const inPrompt = () => promptCards !== null;

export function rebuild ({ redraw = false } = {}) {
  if (promptCards) return hand;             // a prompt owns the pouch
  const state = get();
  const owned = core.castableOwned(chars, state.owned);

  if (redraw || currentDecoys.length === 0 || !currentSelection) {
    currentDecoys = core.pickDecoys(chars, owned);
    // Cap the pouch: past MAX_POUCH the characters rotate rather than pile up.
    // The SET is chosen here and then held, exactly like the decoys: only the
    // ORDER changes between attempts. Re-rolling which characters are present
    // on every cast means the kid reaches for one and finds it gone.
    currentSelection = core.selectPouch(chars, state.owned, {
      max: core.realSlots(currentDecoys.length),
      progress: state.progress || {},
      // pin the last-shown character AND anything needed to leave this room
      pinned: [pinnedId, ...requiredChars()].filter(Boolean)
    });
    castsSinceRedraw = 0;
  } else {
    currentDecoys = core.pruneDecoys(chars, owned, currentDecoys);
    currentSelection = currentSelection.filter(id => owned.includes(id));
  }

  hand = core.buildHand(currentSelection, currentDecoys);
  return hand;
}

export function afterAttempt () {
  if (promptCards) return hand;             // never reshuffle mid-question
  castsSinceRedraw++;
  return rebuild({ redraw: castsSinceRedraw >= REDRAW_EVERY });
}

/** A character has just been shown to the kid -- newly met, or re-shown for
    review. Either way it must be in the pouch: it is the one they want to try. */
export function onNewCharacter (id = null) {
  if (id) pinnedId = id;
  currentSelection = null;
  return rebuild({ redraw: true });
}

export const getHand = () => hand;
export const glyphFor = id => core.glyphFor(chars, id);
