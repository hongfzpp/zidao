/* The pouch: the kid's cards, always on screen.

   Contents come from js/hand.js -- everything they own PLUS inert decoys, in a
   shuffled order that changes after every attempt. Tapping a card (without
   dragging) says its word: a zero-pressure review surface. Tapping a decoy
   does not say anything, because we are not teaching it. */

import * as scene from './scene.js';
import { cast } from './cast.js';
import { say } from './audio.js';
import { sfx } from './sfx.js';
import * as hand from './hand.js';
import { layoutFor } from './core/layout.js';

let chars = [];
let onCast = null;
let interceptDrop = null;

const cardsHost = () => document.getElementById('pouch-cards');
const dragLayer = () => document.getElementById('drag-layer');

export function initPouch (characterDefs, opts = {}) {
  chars = characterDefs;
  onCast = opts.onCast || (() => {});
  interceptDrop = opts.interceptDrop || (() => false);
  hand.initHand(characterDefs);
  render();
}

/* ---------- rendering ----------
   Cards shrink as the hand grows so everything stays visible without
   scrolling: a kid should never have to scroll to find a character. */

/* sizing lives in js/core/layout.js so it can be unit tested */

export function render (arrivingId = null) {
  const host = cardsHost();
  const ids = hand.getHand();
  const { size, gap, rows } = layoutFor(ids.length, host.clientWidth || window.innerWidth);
  host.style.gap = gap + 'px';
  host.dataset.rows = rows;             // >1 wraps instead of scrolling

  host.innerHTML = '';
  for (const id of ids) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = id;
    if (hand.isDistractor(id)) el.dataset.distractor = 'true';
    el.style.setProperty('--card-size', size + 'px');
    el.textContent = hand.glyphFor(id);
    if (id === arrivingId) el.classList.add('arriving');
    host.appendChild(el);
  }
}

/** Re-render in a new order, animating each card from where it used to be
    (FLIP). The shuffle should look like the cards are alive, not like the UI
    moved out from under the kid. */
export function reshuffle () {
  const host = cardsHost();
  const before = new Map();
  for (const el of host.children) before.set(el.dataset.id, el.getBoundingClientRect().left);

  hand.afterAttempt();
  render();

  for (const el of host.children) {
    const prev = before.get(el.dataset.id);
    if (prev == null) continue;                  // newly drawn decoy: just fades in
    const dx = prev - el.getBoundingClientRect().left;
    if (!dx) continue;
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform .45s cubic-bezier(.34,1.3,.64,1)';
      el.style.transform = '';
    });
  }
}

export function onNewCharacter (id) {
  hand.onNewCharacter(id);        // pin it: the kid was just shown this one
  render(id);
  cardsHost().querySelector(`[data-id="${id}"]`)
    ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

/* ---------- drag ---------- */

let drag = null;

/** Belt and braces: a missed pointerup used to strand the ghost card on
    screen, which on an iPad reads as "the app froze". Never trust that the
    matching pointerup will arrive. */
function clearStrays () {
  dragLayer().replaceChildren();
  document.querySelectorAll('.obj.drop-target')
          .forEach(o => o.classList.remove('drop-target'));
  document.querySelectorAll('.card.held, .card.dimmed')
          .forEach(c => c.classList.remove('held', 'dimmed'));
}

function onPointerDown (e) {
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  clearStrays();
  drag = null;

  drag = {
    id: card.dataset.id,
    glyph: card.textContent,
    card,
    startX: e.clientX, startY: e.clientY,
    moved: false, ghost: null, target: null,
    pointerId: e.pointerId
  };
  card.classList.add('held');
  try { card.setPointerCapture?.(e.pointerId); } catch {}
}

function makeGhost () {
  const g = document.createElement('div');
  g.className = 'drag-card';
  g.textContent = drag.glyph;
  dragLayer().appendChild(g);
  drag.ghost = g;
  drag.card.classList.add('dimmed');
  sfx('pop');
}

function onPointerMove (e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;

  if (!drag.moved && Math.hypot(dx, dy) > 12) { drag.moved = true; makeGhost(); }
  if (!drag.moved) return;

  e.preventDefault();
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';

  const hit = scene.hitTest(e.clientX, e.clientY);
  if (hit !== drag.target) {
    drag.target?.el.classList.remove('drop-target');
    hit?.el.classList.add('drop-target');
    drag.target = hit;
  }
}

async function onPointerUp (e) {
  if (!drag || (e.pointerId != null && e.pointerId !== drag.pointerId)) return;
  const d = drag;
  drag = null;

  d.card.classList.remove('held', 'dimmed');
  d.target?.el.classList.remove('drop-target');
  d.ghost?.remove();

  if (!d.moved) {                       // a tap, not a drag
    if (hand.isDistractor(d.id)) sfx('boing');   // decoys stay silent: not taught
    else say(d.id);
    return;
  }

  if (d.target) {
    // 团团's prompt claims drops onto 团团; everything else stays free play
    if (interceptDrop(d.id, d.target)) return;
    await cast(d.id, d.target, { x: e.clientX, y: e.clientY });
    reshuffle();                        // every attempt moves the cards
    onCast(d.id, d.target);
  } else {
    sfx('boing');                       // dropped on the floor: still a response
    reshuffle();
  }
}

export function attachPouchInput () {
  const host = cardsHost();
  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  // pointerup can be lost: capture stolen, finger off the edge of the glass,
  // the tab backgrounded mid-drag. Each of these ends the drag too.
  window.addEventListener('lostpointercapture', onPointerUp);
  window.addEventListener('blur', () => { if (drag) clearStrays(); drag = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearStrays(); drag = null; }
  });
}
