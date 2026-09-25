# 字岛 / Hanzi Island — engineering rules

Product design lives in [DESIGN.md](DESIGN.md). How to run things: [README.md](README.md).
**This file is about how code gets written here.** Follow it on every change.

---

## Why these rules exist

M1 shipped a run of bugs that all had the same shape: the logic that broke was
buried inside DOM-coupled modules with module-level mutable state, so none of it
could be tested and the only way to find a bug was to drive the UI by hand and
notice. Several got shipped to the user instead.

Every one of them is now a named regression test.

| Bug | Cause | Now guarded by |
|---|---|---|
| Character arrived after ONE cast | `castCount % 8` on a persisted total | `pacing · arrivalDecision` |
| Stuck forever with no new characters | session budget keyed to page load | `pacing · rollSession`, `pacing · full first-session simulation` |
| First 大 was a limp 2× nudge | hook left to a 5% roll | `rules · chooseSteps` |
| 开/关 could be their own decoys | self-referencing confusables | `data · characters.json` |
| Drag ghost stranded on screen | assumed `pointerup` always arrives | `e2e · drag robustness` |
| Parent gate unopenable by touch | `pointerleave` cancelled the hold | `e2e · parent panel` |
| 12 cards overflowed the pouch | fixed-size cards | `layout · layoutFor` |
| A door character could rotate out of the capped pouch, stranding the kid in a room | the cap had no notion of "this character is required here" | `e2e · 厨房` |
| A flaky test: `多` asserted an exact count, but `多` has a 5% golden that jumps to five | an exact-value assertion on a mechanic with a deliberate random variant | `e2e · 厨房` |
| An open door folded nearly edge-on and could not be closed | a 3D rotation collapsed the hit box to a sliver | `e2e · aiming at things`, `hittest · hitBox` |
| Overlapping emoji: dropping on one hit whichever was smallest | "smallest box containing the point" is not "what the kid aimed at" | `hittest · pickTarget` |
| A re-learned character often did not appear in the pouch | the cap guaranteed a slot to the most recently *acquired* character, and a review does not change acquisition order | `hand · the pouch is capped` |
| Tapping a story character spoke it — an answer key on the reading page | a convenience that let the child skip reading entirely | `e2e · 故事` |
| 读故事 did nothing at all on a fresh save | no story is unlocked yet, but the button never said so | `e2e · 故事` |
| A test file with a syntax error hung the whole suite for 180s with no output | a rejected dynamic import left the page on "running…", and results were never posted | `tests/index.html` publishes on every path |
| An owned character could never come up for review | a missing progress record re-dated itself to `now` on every read, sliding its due date forward forever | `memory · dueCharacters` |
| 初遇 opened on top of a live question; the pouch stayed stuck at 3 cards and the new character never appeared | two modes that each own the pouch were allowed to run at once | `e2e · 团团 asks` |
| Cards overflowed in portrait | min card size with no wrapping | `layout · layoutFor` |
| A check that repaired the thing it checked: `sw-assets.json` staleness regenerated the file **as it failed**, so it failed once and passed ever after | a self-healing check cannot fail twice — a re-run "fixes" it, and a stale offline manifest can ship under a green suite | `scripts/validate.py` diffs against a copy and restores the file |
| Choosing a 关 in the parent panel changed nothing: same room, same emoji, same wall — you could pick 第五关 and be left in the house holding 鱼 with no fish to cast it at | the room was derived from progress alone (`currentUnit`), and scenes had no notion of which unit they served | `e2e · choosing a 关 moves the room`, `units · missingTargets`, and a validator check that proves each unit's room holds what its characters reach for |
| A flaky test, seen once and then lost: `吃 eats one of them` asserted an exact count, but 吃 has a ~5% golden that eats the lot down to one | the same exact-value-on-a-random-variant trap as `多`, in a second place | `e2e · 厨房` asserts direction |
| Pinning a whole unit pushed the just-learnt character out of the pouch | pins were an unordered set scored `Infinity`, so with more pins than slots the tie broke arbitrarily | `hand · pins are ranked, not equal` |
| The child could only hear 团团's question again by answering it wrong | the question is a sound, and nothing replayed it | `e2e · 再听一次` |
| 团团's mood badge sat on the child's own face | the badge is positioned against `.tuan`, which was a full-width block — about twice the photo's width — so "just outside the right edge" landed back on top of him | `e2e · 团团 is a photograph` |

---

## Rule 1 — Logic goes in `js/core/`, pure and unit tested

`js/core/*` is **pure**: no DOM, no globals, no timers, no `Math.random`, no
`Date.now()` reached for internally. Inputs in, value out.

- Randomness is injected (`rng = Math.random`) so tests seed it with
  `mulberry32`.
- Time is a parameter (`now`), never read inside.
- State transitions return a **patch**, they don't mutate.

**Before writing a branch, ask whether it belongs in core.** If a decision can
be expressed as "given this state, what should happen?", it goes in core and
gets unit tests in the same change. The DOM modules (`js/*.js`) should read as
wiring: fetch state, call core, apply the result to the page.

Every exported core function needs unit tests covering: the normal case, the
boundary, and malformed input. A bug fixed in core gets a test named
`REGRESSION: <the symptom the user saw>` — phrased as the symptom, not the
implementation, so it still makes sense after a refactor.

## Rule 2 — Every user-visible behaviour gets an E2E test

`tests/e2e/` drives the **real app in an iframe** with real pointer events.
Unit tests prove the logic; E2E proves the wiring, and the wiring is where
roughly half the bugs above lived.

Anything the kid or parent can do needs E2E coverage: launching, 初遇, dragging,
decoys, shuffling, pacing, persistence across reload, the parent panel.

Add an E2E test when you touch: an event handler, anything persisted, anything
that depends on element geometry, or anything with a timer.

Every E2E test asserts `app.errors` is empty. A console error is a failure even
if the assertions pass.

## Rule 3 — Run the suite before saying anything works

```bash
./scripts/test.sh --fast   # content + unit + data, headless, <0.5s — use while iterating
./scripts/test.sh          # everything incl. E2E in headless Chrome, ~8s
SLOW=1 ./scripts/test.sh   # also prints the twelve slowest tests
```

Both exit non-zero on failure, so they are usable from a hook or CI.

There is no node on this machine and none is needed. The pure tests run in
`jsc`, the JavaScriptCore shell that ships with macOS (`scripts/jsc-run.js`,
with a `fetch` shim over `readFile`). The E2E tests need a real browser because
they drive the real app, so `scripts/e2e-headless.py` launches headless Chrome
against the test page with `?post=1`; the page posts its results back to our own
dev server, which writes `.test-results.json` for the CLI to read. No driver, no
websocket client, no dependency. It starts a dev server itself if one isn't
already running.

**Never report a fix as working on the strength of reading the code.** Run the
suite, and drive the actual path in the browser. Several "fixes" in M1 were
correct on disk while the browser ran a cached copy — which is why
`scripts/serve.py` sends `no-store`. Do not swap it back for
`python3 -m http.server`.

## Rule 4 — Content is data, and the data is validated

Effects live in `data/cast-rules.json`, not in JavaScript. Adding a new reaction
should need no code.

`scripts/validate.py` and `tests/unit/data.test.js` enforce the invariants: no
dead taps, no dangling `sfx`/`spawn`/`say` references, no self-referencing
confusables, every openable object declares an `opening`, and — once stories
exist — **no story page may contain a character outside its `requires` list**.

## Rule 5 — Defensive at the edges

Browser APIs fail in ways that are easy to miss and hard to reproduce:

- `setPointerCapture` throws on a stale pointer id. Wrap it. It is an
  optimisation, never a precondition — a failed capture must not abort a
  handler. *(This silently broke the parent gate.)*
- Never assume `pointerup` arrives. Handle `pointercancel`,
  `lostpointercapture`, blur and `visibilitychange`, and sweep up strays on the
  next interaction.
- Wrap `localStorage` reads and writes; they throw in private mode. A corrupt
  save must boot to a working app, not a blank screen.
- Never let a sound or animation failure break a cast.

## Rule 6 — Keep the suite fast, and measure before optimising it

The suite must stay quick enough to run on every change. Budget: **under 1s for
`--fast`, under ~25s for the full run.** `--fast` is the inner loop and is what
must stay instant; the full run pays ~180ms per E2E case because each one boots
the real app in its own iframe, so it grows roughly linearly with E2E coverage
and that is an acceptable trade. If either creeps past budget, measure with
`SLOW=1` — do not guess. (Guessing cost a round here: audio looked like the
bottleneck and removing it saved 2s, while the real cost was speculative polling
worth 14s.)

Three rules keep it that way:

- **A test that cannot fail is worse than no test.** After fixing a bug, put
  the bug back and watch the test go red. Three rounds of tests here passed
  vacuously: one compared a value against the very constant it was testing (so
  zeroing the constant still passed); the E2E harness dropped cards on the exact
  geometric centre of a target, which hits even a one-pixel sliver — no finger
  aims like that; and the manifest check **regenerated the file as it failed**,
  so it could never fail twice in a row. Model the imprecision the real input
  has, and never let a check repair what it is checking — report and stop.
- **Never pipe the suite to `head` or `tail`.** The exit code becomes the
  pager's, so a red run reads as green — that is how a failing commit got made
  here. It also throws away the `FAIL <group> › <test>` line, which is the only
  record of *which* test failed; an intermittent seen once and filtered out
  cannot be chased. Read the whole output, or write it to a file first.
- **Measure geometry after the transition, not during.** A badge read
  mid-transition returns its `scale(.4)` box, which made an overlapping element
  look comfortably clear.
- **Never assert an exact value on something with a random variant.** Golden
  effects fire ~5% of the time; a test that pins the result flakes one run in
  twenty and erodes trust in the whole suite. Assert the *direction* instead.
- **Wait on conditions, never on the clock.** `waitFor(() => ...)`, not
  `sleep(500)`. A fixed sleep is either flaky or slow, usually both.
- **Decide instead of polling.** When the app's own pure core can answer "is
  something about to happen?", ask it. `App.arrived()` consults
  `arrivalDecision()` rather than waiting to see, which is what took the worst
  test from 7.1s to 1.3s.
- **Shorten timings through `js/timings.js`, not by deleting coverage.** Only
  two durations are shortened under `?test=1`, and `REAL_TIMINGS` is asserted by
  a unit test so production values cannot drift.

## Rule 7 — Audio is tuned by measurement, not by intention

Sound cannot be asserted in the test suite (audio is off under test), so it is
the one area where "it looks right in the source" is especially unreliable.
Measure at the destination with an analyser spliced in front of it:

- **Peak** must stay ≤ 1.0. Above that is clipping, which sounds harsh, not
  loud. The bus has a tanh soft-clipper so this holds by construction.
- **RMS** is loudness. Compare a new patch against `whoomph` as a reference.
- **Energy centroid** tells you whether it is boomy or thin — but compute it
  from `getFloatFrequencyData` converted to linear power, gated on frames that
  contain signal. The byte-array version is dB-weighted and gave a reading 17x
  too high, which nearly sent a fix in the wrong direction.

A high-Q bandpass discards most of the source's energy: a patch that looks loud
in the source can measure inaudible (`creak` sat at RMS 0.0036 for weeks).

## Rule 8 — Only one mode may own the pouch

初遇 and 团团's question both take over the screen and the pouch. When both ran
at once the result looked exactly like corruption: a big character over a live
thought bubble, and a pouch frozen at three cards that the newly-learned
character could not get into.

Whenever a new mode claims the pouch or the screen, it must **cancel** whatever
held it before, and refuse to start if another mode is already up. Add an E2E
test that forces the overlap — the 217-test suite passed happily while this bug
was live, because nothing tried the two together.

And when a mode narrows what the kid can reach, **say so visually**. A pouch
that silently drops from twelve cards to three reads as "my characters
disappeared", not as "a question is being asked" (see Rule 6 — a limit that
stops something must say so).

## Rule 9 — A dev shortcut must announce itself

`测试模式` unlocks everything and opens every story. It shows a badge for as long
as it is on, and it is stored in the save, so it survives a reload — which is
exactly why it has to be visible. A hidden flag that persists is a flag someone
forgets, and then the child gets the tester's build.

The same applies to any future shortcut: visible while active, and off by default.

## Rule 10 — A limit that stops something must say so

A cap that silently does nothing is indistinguishable from a bug. This has now
caused **three** separate reports: the arrival budget going quiet ("stuck on
小"), the parent gate with no progress feedback, and 读故事 doing nothing on a
fresh save. Every time, the logic was right and the silence was the bug.

A disabled control must carry its reason **in its own label**, not in a tooltip
and not nowhere. Prefer showing the shape of the whole system — the story shelf
lists every story and what each still needs — so the parent learns the model
instead of guessing at it. If the app declines to do
something, surface it where an adult can see it (the parent panel) and give a
manual override.

---

## Rule 11 — Write it down before the session ends

Conversation context is lost; this repository is not. Anything learned in a
session that would change a future decision belongs in one of four places
**before that session ends**:

| What | Where |
|---|---|
| Intended behaviour | a test — ideally a named `REGRESSION:` one |
| A bug and its root cause | the table at the top of this file |
| Why the product is shaped this way | `DESIGN.md` |
| How to run, test or deploy it | `README.md` |

`DESIGN.md` §17 is the cold-start summary: current state, what is not built, and
where knowledge lives. Keep it current — it is the first thing a fresh session
should read.

The test suite is the most reliable of the four, because it is the only one that
cannot quietly go stale: a doc can drift from the code, a red test cannot be
ignored. Prefer encoding a lesson as a test over describing it in prose.

## Layout

```
js/core/      PURE. pacing · hand · rules · layout · scale · rng.   100% unit tested.
js/*.js       DOM wiring. Thin. Calls core, applies results.
data/         All content. Validated.
tests/unit/   Unit + data-integrity tests.
tests/e2e/    Real app in an iframe, driven by pointer events.
tests/index.html  Runs everything.
```

No build step, no package manager, no node — plain ES modules and `python3`.
Keep it that way unless there is a reason that outweighs being able to edit a
file and reload.
