/* Visual effects: particles, shake, glow, rain, room tint.
   Cheap DOM + CSS. Every one of these is a "response" -- DESIGN.md §6.2 says
   never a dead tap, so these are what a fallback still gives the kid. */

const layer = () => document.getElementById('particles');
const R = (a, b) => a + Math.random() * (b - a);

const KINDS = {
  fire:    { glyphs: ['🔥', '🔥', '✨'], up: true,  spread: 90,  life: 900 },
  water:   { glyphs: ['💧', '💦'],       up: false, spread: 130, life: 850 },
  drip:    { glyphs: ['💧'],             up: false, spread: 50,  life: 1000 },
  sparkle: { glyphs: ['✨', '⭐', '💫'],  up: true,  spread: 120, life: 1000 },
  star:    { glyphs: ['⭐', '🌟'],       up: true,  spread: 150, life: 950 },
  smoke:   { glyphs: ['💨'],             up: true,  spread: 70,  life: 1300 },
  zzz:     { glyphs: ['💤'],             up: true,  spread: 40,  life: 1800 },
  note:    { glyphs: ['🎵', '🎶'],       up: true,  spread: 90,  life: 1300 },
  heart:   { glyphs: ['💖', '💛'],       up: true,  spread: 80,  life: 1200 },
  leaf:    { glyphs: ['🍃', '🍂'],       up: false, spread: 240, life: 1600 }
};

/** Burst particles from a point (page coords relative to #room). */
export function particles (kind, count, x, y) {
  const k = KINDS[kind] || KINDS.sparkle;
  const host = layer();
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const px = x - rect.left, py = y - rect.top;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'p';
    el.textContent = k.glyphs[(Math.random() * k.glyphs.length) | 0];
    el.style.left = px + 'px';
    el.style.top = py + 'px';
    el.style.fontSize = R(18, 38) + 'px';
    el.style.setProperty('--dx', R(-k.spread, k.spread) + 'px');
    el.style.setProperty('--dy', (k.up ? R(-180, -70) : R(40, 190)) + 'px');
    el.style.setProperty('--sc', R(0.7, 1.5));
    el.style.setProperty('--rot', R(-220, 220) + 'deg');
    const life = k.life * R(0.75, 1.25);
    el.style.animation = `pUp ${life}ms cubic-bezier(.2,.7,.4,1) forwards`;
    el.style.animationDelay = R(0, 160) + 'ms';
    host.appendChild(el);
    setTimeout(() => el.remove(), life + 300);
  }
}

export function shake (el, intensity = 6, dur = 500) {
  if (!el) return;
  el.style.setProperty('--i', intensity);
  el.style.setProperty('--d', dur + 'ms');
  el.classList.remove('shaking');
  void el.offsetWidth;                  // restart the animation
  el.classList.add('shaking');
  setTimeout(() => el.classList.remove('shaking'), dur + 60);
}

export function glow (el, color = '#ffe27a', dur = 1200) {
  if (!el) return;
  el.style.setProperty('--glow', color);
  el.classList.add('glowing');
  setTimeout(() => el.classList.remove('glowing'), dur);
}

export function squash (el) {
  if (!el) return;
  el.classList.remove('squashing');
  void el.offsetWidth;
  el.classList.add('squashing');
  setTimeout(() => el.classList.remove('squashing'), 620);
}

export function rain (dur = 3000) {
  const el = document.getElementById('rain');
  if (!el) return;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), dur);
}

export function roomTint (color, dur = 1500) {
  const room = document.getElementById('room');
  if (!room) return;
  room.style.setProperty('--tint', color);
  room.classList.add('tinted');
  setTimeout(() => room.classList.remove('tinted'), dur);
}

export function roomLight (on) {
  const room = document.getElementById('room');
  if (!room) return;
  room.classList.toggle('dark', !on);
}

export const wait = ms => new Promise(r => setTimeout(r, ms));
