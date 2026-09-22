/* 团团 — the companion.
   DESIGN.md §7: always LESS competent than the child. Never corrects, never
   teaches, only reacts.

   团团 is now a photograph of the child themselves, which is lovely and costs
   one thing: a photo cannot change its face. The emotions matter — §3.3 rests
   on 团团 being confused rather than the child being wrong — so they moved to
   two places a photo can carry: how the body moves, and a small mood badge
   beside it. Those read at a glance, which a drawn eyebrow never really did at
   this size anyway. */

const MOODS = {
  idle:      { badge: '',   tilt: 0,  cls: '' },
  happy:     { badge: '😄', tilt: -5, cls: 'tuan-bounce' },
  surprised: { badge: '❗',  tilt: 0,  cls: 'tuan-jump' },
  scared:    { badge: '😱', tilt: 6,  cls: 'tuan-shiver' },
  confused:  { badge: '❓',  tilt: 8,  cls: 'tuan-tilt' },
  sleepy:    { badge: '💤', tilt: -7, cls: 'tuan-doze' },
  wet:       { badge: '💧', tilt: 3,  cls: 'tuan-shiver' }
};

export const TUAN_HTML =
  `<span class="tuan">` +
  `<img class="tuan-img" src="assets/tuantuan.png" alt="" draggable="false">` +
  `<span class="tuan-mood"></span>` +
  `</span>`;

/** Every feeling 团团 can have. Exported so a test can check they stay
    distinguishable from each other -- a mood that looks like every other mood
    is the same as having no moods at all. */
export const MOOD_NAMES = Object.keys(MOODS);

/** Kept for anything still asking for the old name. */
export const TUAN_SVG = TUAN_HTML;

let resetTimer = null;

function setMood (root, name) {
  const m = MOODS[name] || MOODS.idle;
  const img = root.querySelector('.tuan-img');
  const badge = root.querySelector('.tuan-mood');
  if (!img || !badge) return;
  img.style.transform = `rotate(${m.tilt}deg)`;
  for (const k of Object.values(MOODS)) if (k.cls) img.classList.remove(k.cls);
  if (m.cls) img.classList.add(m.cls);
  badge.textContent = m.badge;
  badge.classList.toggle('on', Boolean(m.badge));
}

/** Show a feeling, then drift back to nothing in particular. */
export function emote (name, dur = 1500) {
  const root = document.getElementById('obj-tuantuan');
  if (!root) return;
  setMood(root, name);
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => setMood(root, 'idle'), dur);
}
