/* The room: builds objects, tracks their live state, persists it.
   DESIGN.md §6.2: the scene persists between sessions. */

import { get, update } from './store.js';
import { TUAN_HTML } from './tuantuan.js';
import { clampScale, clampCount, stepCount } from './core/scale.js';
import { pickTarget, clearSpot } from './core/hittest.js';

let def = null;          // the scene definition currently loaded
let sceneId = null;
let spawnables = {};     // from cast-rules.json
let onSceneChange = null;
const objects = new Map();  // id -> { id, el, tags, scale, state, x, y, size }

const host = () => document.getElementById('objects');

export const currentSceneId = () => sceneId;
export function onChangeScene (fn) { onSceneChange = fn; }

export async function loadScene (id, spawnDefs) {
  def = await (await fetch(`data/scenes/${id}.json`)).json();
  sceneId = id;
  if (spawnDefs) spawnables = spawnDefs;
  update({ currentScene: id });
  build();
  onSceneChange?.(id, def);
  return def;
}

/** Walk through a door into another room. */
export async function goToScene (id) {
  const room = document.getElementById('room');
  room?.classList.add('leaving');
  await new Promise(r => setTimeout(r, 260));
  await loadScene(id);
  room?.classList.remove('leaving');
  room?.classList.add('arriving');
  setTimeout(() => room?.classList.remove('arriving'), 400);
}

function build () {
  const h = host();
  h.innerHTML = '';
  objects.clear();

  const saved = (get().scenes || {})[sceneId] || {};

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

  const glyph = o.glyph === '@tuantuan' ? TUAN_HTML : (o.glyph || '❓');
  if (o.opening) el.dataset.opening = o.opening;
  // .swing is its own layer so the hinge rotation never fights the squash,
  // hop or spin animations that live on .glyph and .mover.
  el.innerHTML =
    `<span class="shaker"><span class="scaler"><span class="mover">` +
    (o.opening ? `<span class="opening"></span>` : '') +
    `<span class="swing"><span class="glyph">${glyph}</span></span>` +
    `</span></span></span>`;
  el.dataset.glyph = glyph;
  if (o.glyph === '@tuantuan') el.dataset.single = 'true';

  h_setScale(el, scale);

  if (o.leadsTo) el.dataset.leadsTo = o.leadsTo;

  const rec = {
    id: o.id, el,
    tags: o.tags || [],
    scale,
    state: { ...(o.state || {}), ...(saved?.state || {}) },
    x, y, size,
    count: saved?.count ?? 1,
    wander: !!o.wander,
    leadsTo: o.leadsTo || null,
    opensWith: o.opensWith || null,
    spawnedAs: saved?.spawnedAs || o.spawnedAs || null
  };
  objects.set(o.id, rec);
  syncState(rec);
  if (rec.count > 1) setCount(o.id, rec.count);
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

/**
 * Characters the kid MUST be able to reach in this room, because without them
 * they cannot leave it. The pouch is capped and rotates, so without this a door
 * character could rotate out and strand them (it did).
 */
export function requiredChars () {
  return [...new Set(
    [...objects.values()].filter(r => r.leadsTo && r.opensWith).map(r => r.opensWith))];
}

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

/** Show `n` copies of a thing. 一/二/三 set it outright, 多/少 step it. */
export function setCount (id, n) {
  const rec = objects.get(id); if (!rec) return;
  const count = clampCount(n);
  rec.count = count;
  const swing = rec.el.querySelector('.swing');
  const glyph = rec.el.dataset.glyph || '';
  if (rec.el.dataset.single === 'true') return;      // 团团 does not multiply
  swing.innerHTML = count === 1
    ? `<span class="glyph">${glyph}</span>`
    : `<span class="glyph multi" data-n="${count}">` +
      Array.from({ length: count }, () => `<i>${glyph}</i>`).join('') +
      `</span>`;
  rec.el.dataset.count = String(count);
  persist();
}

export function bumpCount (id, delta) {
  const rec = objects.get(id); if (!rec) return;
  setCount(id, stepCount(rec.count ?? 1, delta));
}

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

/** Which object the kid aimed at. See js/core/hittest.js for why it works this way. */
export function hitTest (pageX, pageY) {
  const candidates = [...objects.values()].map(rec => ({
    id: rec.id,
    rect: rec.el.querySelector('.glyph').getBoundingClientRect(),
    // the object's own on-screen size, independent of whatever animation is
    // squashing or rotating it at this instant
    size: rec.size * rec.scale
  }));
  const id = pickTarget(candidates, pageX, pageY);
  return id ? objects.get(id) : null;
}

export function centerOf (rec) {
  const g = rec.el.querySelector('.glyph').getBoundingClientRect();
  return { x: g.left + g.width / 2, y: g.top + g.height / 2 };
}

export function persist () {
  const out = {};
  for (const rec of objects.values()) {
    out[rec.id] = {
      scale: rec.scale, state: rec.state, count: rec.count,
      x: rec.x, y: rec.y, spawnedAs: rec.spawnedAs
    };
  }
  update({ scenes: { ...(get().scenes || {}), [sceneId]: out } });
}

/* ---------- idle life ----------
   Creatures drift a little so the room never looks like a static diagram. */
let wanderTimer = null;
/** Half the object's width, as a percentage of the room. */
function halfWidthPct (rec) {
  const room = host()?.getBoundingClientRect();
  if (!room?.width) return 5;
  return ((rec.size * rec.scale * 8) / 2 / room.width) * 100;
}

export function startWander () {
  clearInterval(wanderTimer);
  wanderTimer = setInterval(() => {
    for (const rec of objects.values()) {
      if (!rec.wander || Math.random() > 0.35) continue;
      // Do not drift into something else: overlapping emoji are hard to aim at.
      const others = [...objects.values()]
        .filter(o => o !== rec)
        .map(o => ({ x: o.x, halfWidth: halfWidthPct(o) }));
      const want = rec.x + (Math.random() - 0.5) * 5;
      const spot = clearSpot(want, halfWidthPct(rec), others);
      if (spot === null) continue;
      rec.x = spot;
      rec.el.style.transition = 'left 2.2s ease-in-out';
      rec.el.style.left = rec.x + '%';
      setTimeout(() => { rec.el.style.transition = ''; }, 2300);
    }
    persist();
  }, 4200);
}

export function rebuild () { build(); }
