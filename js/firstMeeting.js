/* 初遇 — First Meeting.
   DESIGN.md §6.1: the only moment that could be called "teaching". Eight
   seconds, zero explanation, zero words. The character BECOMES the thing --
   it is never claimed to LOOK LIKE it (that's the Chineasy mistake). The kid
   controls repetition and may tap twenty times; that is good for us. */

import { say } from './audio.js';
import { sfx } from './sfx.js';
import { own } from './store.js';

const FLOURISH = {
  grow:   { sfx: 'whoomph', thingScale: 1.35 },
  shrink: { sfx: 'squeak',  thingScale: 0.7 },
  open:   { sfx: 'creak',   thingScale: 1.0 },
  close:  { sfx: 'thud',    thingScale: 1.0 },
  burn:   { sfx: 'fire',    thingScale: 1.15 },
  splash: { sfx: 'splash',  thingScale: 1.1 },
  pop:    { sfx: 'pop',     thingScale: 1.0 }
};

export function firstMeeting (def) {
  return new Promise(resolve => {
    const overlay = document.getElementById('first-meeting');
    const stage   = document.getElementById('fm-stage');
    const charEl  = document.getElementById('fm-char');
    const thingEl = document.getElementById('fm-thing');
    const doneEl  = document.getElementById('fm-done');

    const f = FLOURISH[def.reveal?.type] || FLOURISH.pop;
    charEl.textContent = def.char;
    thingEl.textContent = def.reveal?.emoji || '✨';
    thingEl.style.setProperty('--ts', f.thingScale);
    stage.classList.remove('revealed');
    doneEl.classList.add('hidden');
    overlay.classList.remove('hidden');

    let revealed = false;
    let timer = null;

    function reveal () {
      clearTimeout(timer);
      stage.classList.add('revealed');
      sfx(f.sfx);
      say(def.id);
      revealed = true;
      doneEl.classList.remove('hidden');
      timer = setTimeout(() => stage.classList.remove('revealed'), 1900);
    }

    function finish () {
      clearTimeout(timer);
      stage.removeEventListener('pointerdown', reveal);
      doneEl.removeEventListener('pointerdown', finish);
      overlay.classList.add('hidden');
      own(def.id);
      sfx('chime');
      resolve();
    }

    stage.addEventListener('pointerdown', reveal);
    doneEl.addEventListener('pointerdown', finish);
  });
}
