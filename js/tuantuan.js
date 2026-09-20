/* 团团 — the companion.
   DESIGN.md §7: always LESS competent than the child. Never corrects, never
   teaches, only reacts. In M1 团团 is a reactive onlooker; the retrieval mode
   ("团团要...") is M2. */

const FACES = {
  idle:      { eye: 5,  mouth: 'M -13 10 Q 0 18 13 10',  tilt: 0 },
  happy:     { eye: 6,  mouth: 'M -15 8 Q 0 26 15 8',    tilt: -4 },
  surprised: { eye: 10, mouth: 'M 0 13 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0', tilt: 0 },
  scared:    { eye: 9,  mouth: 'M -11 16 Q 0 6 11 16',   tilt: 6 },
  confused:  { eye: 6,  mouth: 'M -12 13 Q -2 8 4 14 Q 8 17 12 12', tilt: 8 },
  sleepy:    { eye: 1,  mouth: 'M -7 13 Q 0 19 7 13',    tilt: -6 },
  wet:       { eye: 4,  mouth: 'M -12 17 Q 0 7 12 17',   tilt: 3 }
};

export const TUAN_SVG = `
<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="0" cy="42" rx="30" ry="6" fill="rgba(0,0,0,.16)"/>
  <path class="blob" d="M 0 -38 C 26 -38 40 -18 40 4 C 40 26 22 38 0 38 C -22 38 -40 26 -40 4 C -40 -18 -26 -38 0 -38 Z"
        fill="#ffd166" stroke="#c9852b" stroke-width="4"/>
  <circle class="eye" cx="-13" cy="-6" r="5" fill="#3a2a1c"/>
  <circle class="eye" cx="13"  cy="-6" r="5" fill="#3a2a1c"/>
  <path class="mouth" d="M -13 10 Q 0 18 13 10" stroke="#3a2a1c" stroke-width="3.5"
        fill="none" stroke-linecap="round"/>
  <g class="drops" opacity="0">
    <path d="M -34 -6 q -5 10 0 12 q 5 -2 0 -12" fill="#6fc2ff"/>
    <path d="M 34 -2 q -5 10 0 12 q 5 -2 0 -12" fill="#6fc2ff"/>
  </g>
</svg>`;

let resetTimer = null;

function setFace (root, name) {
  const svg = root.querySelector('svg');
  if (!svg) return;
  const f = FACES[name] || FACES.idle;
  svg.querySelectorAll('.eye').forEach(e => e.setAttribute('r', f.eye));
  svg.querySelector('.mouth').setAttribute('d', f.mouth);
  svg.querySelector('.drops').setAttribute('opacity', name === 'wet' ? '1' : '0');
  svg.querySelector('.blob').setAttribute('fill', name === 'wet' ? '#bfe6ff' : '#ffd166');
  svg.style.transform = `rotate(${f.tilt}deg)`;
  svg.style.transition = 'transform .3s ease';
}

/** Show an emotion, then drift back to idle. */
export function emote (name, dur = 1500) {
  const root = document.getElementById('obj-tuantuan');
  if (!root) return;
  setFace(root, name);
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => setFace(root, 'idle'), dur);
}
