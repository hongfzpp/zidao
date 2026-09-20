/* Timings the tests need to shorten.

   Deliberately tiny and explicit: exactly two durations plus a switch that
   disables CSS transitions. Everything else in the app runs at real speed even
   under test, so the E2E suite still exercises real behaviour -- it just does
   not spend 3 real seconds proving a 3-second hold works. The production
   defaults are asserted by a unit test so they cannot drift. */

function queryFlag (name) {
  // Defensive: this module is also imported by the headless CLI runner, where
  // there is no location and no URLSearchParams.
  try {
    const search = globalThis.location?.search || '';
    return new URLSearchParams(search).get(name) === '1';
  } catch { return false; }
}

export const FAST = queryFlag('test');

export const REAL_TIMINGS = Object.freeze({
  arrivalDelayMs: 900,    // let the last cast's effect land before 初遇 opens
  parentHoldMs: 1500      // press-and-hold to open the parent gate
});

export const TIMINGS = Object.freeze(
  FAST ? { arrivalDelayMs: 0, parentHoldMs: 60, readBackMs: 0 } : REAL_TIMINGS);

/** Dev mode shortens the parent-gate hold: a tester opens it constantly. */
export const DEV_HOLD_MS = 300;

/** ?dev=1 turns dev mode on, ?dev=0 turns it off, absent leaves it alone. */
export function devFlagFromUrl () {
  try {
    const v = new URLSearchParams(globalThis.location?.search || '').get('dev');
    return v === null ? null : v === '1';
  } catch { return null; }
}

/** Under test, kill transitions/animations so state settles immediately. */
export function applyTestMode () {
  if (!FAST) return;
  const style = document.createElement('style');
  style.textContent =
    '*,*::before,*::after{transition:none!important;animation:none!important}';
  document.head.appendChild(style);
}
