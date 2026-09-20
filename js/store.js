/* Local-first persistence. No account, no server, no network.
   DESIGN.md §6.2: the scene persists between sessions -- if the kid left a
   giant flying cat in the bedroom, it's still there tomorrow. */

const KEY = 'zidao.v1';

const BLANK = {
  owned: [],          // character ids the kid has met
  firstCast: [],      // character ids that have been cast at least once
  castCount: 0,       // total casts ever (display only)
  castsSinceArrival: 0, // drives the next arrival; persisted so app restarts don't skew pacing
  arrivalsThisSession: 0,
  lastPlayedAt: 0,      // a real session boundary is a gap in TIME, not a page load
  fizzles: 0,         // decoy picks -- the only real signal of guessing
  scenes: {},         // sceneId -> per-object scale/state overrides
  currentScene: 'house',
  seenGolden: 0,
  progress: {},       // charId -> memory record (js/core/memory.js)
  prompts: { asked: 0, right: 0 },
  storiesRead: [],
  spoken: {},         // charId -> { tries, right } from 说说看. Never a gate.
  lastHeard: '',
  pagesRead: 0,       // story pages shown
  hintedPages: 0,     // ...of which the picture was revealed on
  devMode: false,     // parent/tester shortcut. Deliberately visible when on.
  firstRun: true
};

let state = load();

function load () {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...BLANK };
    return { ...BLANK, ...JSON.parse(raw) };
  } catch { return { ...BLANK }; }
}

export function save () {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export const get = () => state;

export function update (patch) {
  Object.assign(state, patch);
  save();
}

export function own (charId) {
  if (!state.owned.includes(charId)) {
    state.owned.push(charId);
    save();
  }
}

export function resetScene (sceneId = null) {
  if (sceneId) delete state.scenes[sceneId];
  else state.scenes = {};
  save();
}

export function resetAll () {
  state = { ...BLANK, owned: [], firstCast: [], progress: {},
            prompts: { asked: 0, right: 0 }, storiesRead: [], spoken: {} };
  save();
}

/** Merge a patch into one character's memory record. */
export function setProgress (charId, record) {
  state.progress = { ...(state.progress || {}), [charId]: record };
  save();
}
