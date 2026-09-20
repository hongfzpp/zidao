/* The room: builds objects, tracks their live state, persists it.
   DESIGN.md §6.2: the scene persists between sessions. */

import { get, update } from './store.js';
import { TUAN_SVG } from './tuantuan.js';
import { clampScale } from './core/scale.js';

let def = null;          // scene definition (data/scenes/house.json)
let spawnables = {};     // from cast-rules.json
const objects = new Map();  // id -> { id, el, tags, scale, state, x, y, size }

const host = () => document.getElementById('objects');

export async function loadScene (sceneId, spawnDefs) {
  def = await (await fetch(`data/scenes/${sceneId}.json`)).json();
  spawnables = spawnDefs || {};
  build();
}

function build () {
  const h = host();
  h.innerHTML = '';
  objects.clear();

  const saved = get().sceneState || {};

  for (const o of def.objects) addObject({ ...o }, saved[o.id]);

  // objects the kid spawned in previous sessions
  for (const [id, s] of Object.entries(saved)) {
    if (objects.has(id) || !s.spawnedAs) continue;
    const proto = spawnables[s.spawnedAs];
    if (!proto) continue;
    addObject({ ...proto, id, x: s.x, y: s.y }, s);
  }

  applyRoomLightFromLamp();
}

function addObject (o, saved) {
  const el = document.createElement('div');
  el.className = 'obj';
  el.id = 'obj-' + o.id;
  el.dataset.id = o.id;

  const x = saved?.x ?? o.x;
  const y = saved?.y ?? o.y;
  const scale = saved?.scale ?? 1;
  const size = o.size * 8;                  // % size -> px-ish, tuned for iPad

  el.style.left = x + '%';
  el.style.top = y + '%';
  el.style.setProperty('--s', size);
  if ((o.tags || []).includes('creature')) el.dataset.kind = 'creature';

  const glyph = o.glyph === '@tuantuan' ? TUAN_SVG : (o.glyph || '❓');
  if (o.opening) el.dataset.opening = o.opening;
  // .swing is its own layer so the hinge rotation never fights the squash,
  // hop or spin animations that live on .glyph and .mover.
  el.innerHTML =
    `<span class="shaker"><span class="scaler"><span class="mover">` +
    (o.opening ? `<span class="opening"></span>` : '') +
    `<span class="swing"><span class="glyph">${glyph}</span></span>` +
    `</span></span></span>`;

  h_setScale(el, scale);

  const rec = {
    id: o.id, el,
    tags: o.tags || [],
    scale,
    state: { ...(o.state || {}), ...(saved?.state || {}) },
    x, y, size,
    wander: !!o.wander,
    spawnedAs: saved?.spawnedAs || o.spawnedAs || null
  };
  objects.set(o.id, rec);
  syncState(rec);
  host().appendChild(el);
  return rec;
}

function h_setScale (el, s) {
  el.querySelector('.scaler').style.transform = `scale(${s})`;
}

function syncState (rec) {
  for (const [k, v] of Object.entries(rec.state)) rec.el.dataset[k] = String(v);
}

/* ---------- public API ---------- */

export const getObject = id => objects.get(id);
export const allObjects = () => [...objects.values()];

export function setScale (id, s) {
  const rec = objects.get(id); if (!rec) return;
  rec.scale = s;
  h_setScale(rec.el, s);
  persist();
}

/** Move an object up or down the room. Persisted, like wander does for x. */
export function lift (id, dy) {
  const rec = objects.get(id); if (!rec) return;
  rec.y = Math.max(8, Math.min(96, rec.y + dy));
  rec.el.style.transition = 'top .7s cubic-bezier(.34,1.3,.64,1)';
  rec.el.style.top = rec.y + '%';
  setTimeout(() => { rec.el.style.transition = ''; }, 800);
  persist();
}

const R = (a, b) => a + Math.random() * (b - a);

export function setState (id, key, value) {
  const rec = objects.get(id); if (!rec) return;
  rec.state[key] = value;
  rec.el.dataset[key] = String(value);

  // Give each flier its own orbit, so two things in the air never move as one.
  if (key === 'flying' && value) {
    rec.el.style.setProperty('--fly-r', R(38, 72).toFixed(0));
    rec.el.style.setProperty('--fly-dur', R(3.2, 5.4).toFixed(2) + 's');
    rec.el.style.setProperty('--fly-delay', (-R(0, 4)).toFixed(2) + 's');
  }
  if (id === 'lamp' && key === 'lit') applyRoomLightFromLamp();
  persist();
}

function applyRoomLightFromLamp () {
  const lamp = objects.get('lamp');
  const room = document.getElementById('room');
  if (!lamp || !room) return;
  room.classList.toggle('dark', lamp.state.lit === false);
}

/** Drop a new object into the world at a page coordinate. */
export function spawn (what, pageX, pageY) {
  const proto = spawnables[what];
  if (!proto) return null;
  const rect = host().getBoundingClientRect();
  const x = ((pageX - rect.left) / rect.width) * 100;
  const y = ((pageY - rect.top) / rect.height) * 100;
  const id = `${what}-${Date.now().toString(36)}`;
  const rec = addObject({ ...proto, id, x, y }, null);
  rec.spawnedAs = what;
  // pop in
  h_setScale(rec.el, 0.01);
  requestAnimationFrame(() => h_setScale(rec.el, rec.scale));
  persist();
  return rec;
}

/** Topmost object whose glyph box contains the point. */
export function hitTest (pageX, pageY) {
  let best = null, bestArea = Infinity;
  for (const rec of objects.values()) {
    const g = rec.el.querySelector('.glyph').getBoundingClientRect();
    const pad = 8;
    if (pageX >= g.left - pad && pageX <= g.right + pad &&
        pageY >= g.top - pad && pageY <= g.bottom + pad) {
      const area = g.width * g.height;
      if (area < bestArea) { best = rec; bestArea = area; }
    }
  }
  return best;
}

export function centerOf (rec) {
  const g = rec.el.querySelector('.glyph').getBoundingClientRect();
  return { x: g.left + g.width / 2, y: g.top + g.height / 2 };
}

export function persist () {
  const out = {};
  for (const rec of objects.values()) {
    out[rec.id] = {
      scale: rec.scale, state: rec.state,
      x: rec.x, y: rec.y, spawnedAs: rec.spawnedAs
    };
  }
  update({ sceneState: out });
}

/* ---------- idle life ----------
   Creatures drift a little so the room never looks like a static diagram. */
let wanderTimer = null;
export function startWander () {
  clearInterval(wanderTimer);
  wanderTimer = setInterval(() => {
    for (const rec of objects.values()) {
      if (!rec.wander || Math.random() > 0.35) continue;
      const dx = (Math.random() - 0.5) * 5;
      rec.x = Math.max(8, Math.min(92, rec.x + dx));
      rec.el.style.transition = 'left 2.2s ease-in-out';
      rec.el.style.left = rec.x + '%';
      setTimeout(() => { rec.el.style.transition = ''; }, 2300);
    }
    persist();
  }, 4200);
}

export function rebuild () { build(); }
