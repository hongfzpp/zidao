# 字岛 / Hanzi Island — M1

Cast mode + the house scene. Full design in [DESIGN.md](DESIGN.md).

**M1 exists to answer one question:** does dragging 大 onto the cat get a laugh?
If it doesn't, the thesis in DESIGN.md §2 is wrong and everything downstream changes.

## Run it on the iPad

```bash
./scripts/serve.sh --https
```

Then on the iPad, in **Safari** (not Chrome — only Safari can install a PWA on
iOS):

1. Open the `https://192.168.x.x:8443` address it prints.
2. Safari warns about the self-signed certificate → **Show Details → Visit This
   Website → Visit**. Once per device.
3. **Share → Add to Home Screen.**

It then launches fullscreen and landscape with its own 字 icon, no browser
chrome, and **works offline** — a service worker caches the whole app (~860KB)
on first run, so it keeps working when the Mac is asleep.

`--https` matters for the microphone: speech recognition needs a secure context,
and a LAN address over plain http is not one. Without it 说说看 is disabled and
says so.

## Deploying to a static host

The app is plain files — no build step, no server code — so any static host
works, and you get a real certificate (no warning) plus no dependency on the Mac
being awake.

```bash
./scripts/build-dist.sh
```

Builds `dist/` (~536KB, 70 files). **Deploy the contents of `dist/`, never the
project folder**: the project contains a TLS private key in `.certs/` for the
`--https` dev server, and that must not reach a public host. The build script
refuses to finish if a key or certificate ends up in `dist/`.

**Easiest, no account or tooling needed** — open <https://app.netlify.com/drop>
and drag the `dist` folder in. You get an HTTPS URL on a random subdomain in
about twenty seconds. Not discoverable, but it is public to anyone with the
link.

**If you want it to redeploy on every change** — push this repo to GitHub and
connect it to Netlify or Cloudflare Pages (publish directory `dist`, build
command `./scripts/build-dist.sh`). Or use GitHub Pages directly, serving the
repo; `.nojekyll` is already in `dist/`.

Verified: the app runs correctly from a **subpath** (`/repo-name/index.html`),
which is how GitHub Pages serves a project site — every path in the app is
relative, so nothing breaks.

### Why the Mac has to be on (LAN route only)

The LAN route means the iPad loads from your Mac. Once installed the service
worker serves it offline, but the *first* load needs the Mac running. If you
want it to work independently, deploy the folder to any static host (it is
plain files — no build step, no server code) and install from that URL instead;
you then also get a real certificate and no warning.

## Run it locally

```bash
./scripts/serve.sh
```

Prints a `localhost` address for the desktop and a LAN address for the iPad.

Everything is served **`no-store`**. `python3 -m http.server` lets Safari cache
ES modules, so you can edit a file, reload, and still be running the old code —
especially on the iPad, where force-reloading is awkward. That makes fixed bugs
look like they survived the fix. Don't swap `scripts/serve.py` back for
`http.server`.
On the iPad open the LAN address in Safari, then **Share → Add to Home Screen**
for fullscreen landscape with no browser chrome.

No build step, no `npm install`, no dependencies. Just static files and `python3`.

## How it plays

1. Tap ▶ (this is also what unlocks audio on iOS — it has to be a real gesture).
2. **初遇**: 大 appears alone and silent. Tap it → it becomes an elephant and
   says 大. Tap as many times as you like. Tap ✓ when done. **One character
   only** — 小 arrives later, through play.
3. **The room**: drag a character from the pouch onto anything.
   - 大 on the cat → the cat inflates. 小 → it shrinks back.
   - **The first ever cast of any character always fires its spectacular
     variant** (`firstCast` in the save). The hook has to land on drag #1, so
     it is never left to the 5% golden roll. Afterwards effects settle into
     their normal range and golden goes back to ~5%.
   - Dropping a card picks the object whose **centre is nearest**, not whichever
     box is smallest — so aiming at a small thing under a giant cat works.
     Hit areas also have a floor, so an object squashed or rotated by an
     animation never becomes too small to aim at (`js/core/hittest.js`).
   - 开 on the door → it swings open on its hinge (a real 3D `rotateY` on a
     `.swing` layer, not a flat tilt) and you see sky and grass through the
     opening. Same for the window. 关 swings it shut.
   - 关 on the lamp → the room goes dark and 团团 gets scared.
   - 火 on the plant → it scorches. 水 → it recovers and grows.
   - 上 / 下 lift things into the air and bring them down; 睡 puts a creature to
     sleep and 开 wakes it.
   - 飞 sends something into a **circling orbit** — a 16-step keyframe circle
     with a bank into the turn and a wing flutter, not a hover. Radius, speed
     and starting phase are randomised per object in `js/scene.js`, so two
     things in the air never move as one. 下 lands it.
   - 猫 on the **cat** → it meows. 门 on the **door** → the door-open sound.
     Same for 狗 / 床 / 灯 / 窗 — each noun has a sound of its own and works only
     on the thing it names.
     These two are nouns: they only work on the thing they name, and do nothing
     anywhere else (they still say themselves, so a miss is still an exposure).
     **The spoken word finishes before the sound effect plays** — overlapping an
     imitative sound with the pronunciation muddies both.
   - Anything on anything else → *always* a response. Never a dead tap.
4. **Tap a card without dragging** → it just says its word. Zero-pressure review,
   always available. (Decoys stay silent — we aren't teaching them.)
5. A new character arrives every 8 casts **counted from the previous arrival**
   (`castsSinceArrival`, persisted), **one at a time**. Casting a decoy does not
   advance the count — only real characters do.

### Pacing knobs (`js/main.js`)

| Constant | Default | What it does |
|---|---|---|
| `ARRIVAL_EVERY` | 8 | Casts between arrivals, counted from the last arrival |
| `MAX_ARRIVALS_PER_SESSION` | 3 | New characters per session |
| `SESSION_GAP_MS` | 30 min | Idle time that starts a new session |

**A session is a gap in time, not a page load.** Reloading does *not* grant a
fresh budget (otherwise you could farm characters by restarting), and 30 minutes
away resets it automatically.

The opening character of a brand-new install is **free** — it's the hook, not
one of the day's lessons — so a first sitting delivers 大 immediately and then
three more at casts 8, 16 and 24.

When the session budget is spent, the drip stops. That is deliberate, but it
used to be **silent**, which reads exactly like a broken app. The parent panel
now shows `本次新字：3 / 3` with the reason, and **认识下一个字** always overrides
the cap. If you're testing and want the wall out of the way, raise
`MAX_ARRIVALS_PER_SESSION`.
   Opposite pairs like 大/小 and 开/关 are deliberately *not* introduced
   together: the pairing makes them useful but also makes them confusable, so
   each gets its own moment.

Nothing can be lost or broken. Everything reverses by casting its opposite —
which is itself a reading exercise.

### Decoys and shuffling

The pouch is **not** just the characters the kid owns. It also holds a few
characters we are **not** teaching, drawn from the `confusables` of what they
do own — so 大 brings 太/天/犬 along, 门 brings 问/们/间. The kid has to tell
the real ones from the decoys, which is the whole point: a pouch of only-real
characters can be cleared by trial and error without reading anything.

Casting a decoy **fizzles** — a puff of grey smoke, a descending *womp*, 团团
looks confused, and the world does not move. It is never a buzzer and never a
failure. The wordless lesson is that the characters we teach have power and
random shapes don't.

**The pouch reshuffles after every single attempt**, with a FLIP animation so
it reads as the cards being alive rather than the UI moving. This kills
position-memory: "third from the left" can never stand in for recognising the
character.

The decoy *set* stays stable between reshuffles — only the order changes. If
decoys were redrawn every time, the cards that persisted would be exactly the
real ones, which hands the kid the answer. Decoys are redrawn at natural
boundaries instead: launch, a new character arriving, and every 12 casts
(`REDRAW_EVERY` in `js/hand.js`).

Decoy count is scaled to the pouch rather than to how much the kid owns: two,
always, which is whatever the eight cards do not owe to real characters. At
eight cards nothing has to shrink — they stay at full size in one row.

### The pouch is capped

**`MAX_POUCH` is 8 cards, decoys included** (`js/core/hand.js`). Left to grow it
would reach sixty-odd at full curriculum, which is not a pouch, it is a wall —
and a small child faced with a wall of choices picks nothing.

The split is **6 real + 2 decoys**, and that is not arbitrary: no unit holds more
than six castable characters, so the pouch can always show a complete unit with
room for the contrast. A third decoy would mean the kid could not reach
everything they are currently being taught. A data test asserts every unit still
fits.

Past the cap, characters rotate rather than pile up. Two guarantees:

- **The character just shown is always there** — newly met *or* re-shown for
  review from the parent panel. It is the one they want to try. This is an
  explicit pin, not "most recently acquired": re-learning a character does not
  move it in the owned list, so without the pin a review was a coin flip as to
  whether the character was even reachable afterwards.
- **Nothing is dropped for good** — everything rotates back.

Which ones step aside is not random: it is weighted by how much each still needs
the practice. A shaky character keeps its place, a solid one steps aside, and a
*retired* one steps aside first — those are maintained by stories, not the pouch.
Being due for review pushes a character back in.

**The set is held stable between redraws, exactly like the decoys** — only the
order changes between attempts. Re-rolling which characters are present on every
cast means the kid reaches for one and finds it gone.

**Decoy cards are styled identically to real ones.** Any visual tell — a tint,
a border, a different opacity — would hand over the answer without reading.

In the parent panel, **认对率** (discrimination accuracy) is the share of picks
that were real characters rather than decoys. It is the only number in the app
that reflects reading rather than play.

**The room persists.** Leave a giant cat in the bedroom and it's still there tomorrow.

## The curriculum: six units of six

The 37 characters are taught in **six small units**, each ending in its own
story:

| | | |
|---|---|---|
| 第一关 | 大 小 开 门 猫 狗 | 《猫开门》 |
| 第二关 | 关 灯 火 水 **你 好** | 《你好》 |
| 第三关 | 上 下 飞 睡 床 **了** | 《睡了》 |
| 第四关 | 窗 手 口 吃 喝 **我** | 《我吃》 |
| 第五关 | 鱼 蛋 米 肉 菜 热 | 《热了》 |
| 第六关 | 冷 多 少 一 二 三 **个** | 《几个蛋》 |

Glue characters (**bold**) sit in the unit whose story introduces them, which is
the only place they can be learnt.

**Each unit has its own room.** The walls change colour as he progresses —
晨 · 午 · 阴 · 绿 · 霞 · 夜, reading as a day going by — so finishing a unit is
visible immediately, without anyone opening the parent panel. The palettes live
on `units[].theme` in `data/characters.json`.

**The scene supplies the materials, the unit supplies the light.** The house has
board floors and the kitchen has tiles with its own cooler floor colour, so the
two rooms never look alike; the wall colour still follows whichever unit he is
in, in both rooms.

**Finishing a unit is exactly enough to read its story.** A story may never need
a character from a later unit — enforced by `scripts/validate.py` and by a data
test, the same guarantee as the page-level one but at curriculum level.

This is about how the material is *grouped*, not how fast it arrives. The drip
is unchanged: one character per 8 casts, at most 3 per session, so a unit takes
two or three sittings. To change the pace, the knobs are `ARRIVAL_EVERY` and
`MAX_ARRIVALS_PER_SESSION` in `js/main.js`.

The parent panel shows each unit with its progress and its story
(`第二关 2/6 《你好》`).

## Two rooms

**家** (the house) and **厨房** (the kitchen). The door is the way between them —
and only when it is **open**, so getting to the next room means reading 开. That
is the "read to act" idea (DESIGN.md §6.2) rather than a menu.

Each room remembers what you did to it independently: a giant cat in the house
stays a giant cat while you are in the kitchen.

A door declares `opensWith` in its scene file, and that character is **always
pinned into the pouch**. Without it the pouch cap could rotate 开 away and
strand the kid in a room with no way out — which it did, until the suite caught
it. `scripts/validate.py` fails if a door forgets to declare it, and if any room
has no way back.

### Counting — 一 二 三 多 少

Things in the kitchen come in numbers. Cast **三** on the eggs and there are
three eggs; **一** puts it back to one; **多** adds one and **少** takes one
away; **吃** eats one. One to five, clamped.

This is why 一/二/三 are castable here, though DESIGN.md §9 lists them as glue: a
number is the one piece of "glue" with an effect a four-year-old can *see*. 个
and 了 remain glue — those really do mean nothing on their own, and are met in
the stories 几个蛋 and 热了.

## 团团's questions (the memory engine)

Every few casts, if a character is due, 团团 gets a thought bubble, **says a word
aloud**, and the pouch narrows to that character plus two wrong ones. The kid
drags the right card to 团团. That is a retrieval test reframed as helping a
friend — see DESIGN.md §6.3.

- **A miss is never a failure.** 团团 looks confused, says the card the kid
  chose (so a miss is still an exposure), and asks again. Only the **first**
  attempt scores.
- **Correct but slow holds instead of promoting.** Recognition *speed* is the
  target: fluent reading is automatic reading, so a 6-second hit is not mastery
  yet (`fastMs`, 4s, in `js/core/memory.js`).
- **Difficulty is invisible and comes from the distractors.** Box 0–1 gets
  maximally dissimilar wrong answers, box 4–5 gets the target's nearest
  confusables — 大 against 太/天/犬. The kid just experiences "it got trickier".
- 团团 never nags: an ignored question is dropped after 25s with no score change.
- **A question is visually obvious**: 团团 lights up as the place to drop, the
  rest of the room dims, and the bubble pulses. Without that, the pouch dropping
  from twelve cards to three just reads as characters disappearing.
- A question and 初遇 are **mutually exclusive** — a character arriving stands
  the question down first.

Scheduling is a kid-tuned Leitner ladder (`BOX_INTERVAL_MS`): 3 min → 30 min →
1 day → 3 days → 7 days → retired. **Retired means retired** — a solid character
is maintained by stories and scene labels, never drilled again.

## 故事 — stories

The payoff (DESIGN.md §6.5). A story unlocks when the kid knows **every**
character in it, so they read the whole page unaided — that moment is the point
of the entire app.

- **The picture starts hidden.** With 🐱🚪 sitting above 猫开门 the kid can read
  the picture instead of the characters, which is the one thing this screen
  exists to prevent. It waits behind a 💡 看图 button, the same size as the art
  so nothing jumps, and every new page covers it again.
- **Tapping a character does not say it.** Hearing it on demand is an answer
  key: a child can tap along the line and never read anything. Tapping wiggles
  the character so the tap is not dead, and that is all.
- **The line is read back only after a real attempt.** Press 说说看, say
  something, and the app reads the whole line correctly, character by character
  — that is feedback on an attempt, not a free answer. Saying *nothing* buys
  nothing, or tapping the microphone in silence would just become the new way to
  hear it.
- Nothing is scored and nothing is required. Using the picture hint is recorded
  for the parent (`N 页，其中 M 页看了图`) but is never a penalty.
- **你 好 我 are learned here and only here.** They mean nothing alone and can't
  be cast at anything, so they never appear in the pouch and 团团 never asks for
  them — they're learned by position and repetition, the way a child learns
  "the" (DESIGN.md §9.1).
- A story is offered as a session's high note after a character arrives through
  normal play, and any unlocked story can be opened from the parent panel.
- **At the very start nothing is unlocked**, which is correct — the kid knows one
  character. The parent panel says so rather than offering a button that does
  nothing: 读故事 is disabled and reads `故事还差 N 个字`, and the shelf lists every
  story with exactly which characters it still needs. To jump straight to a
  story while testing, press **解锁全部字** first.

### 说说看 — reading it out loud

Each story page has a **🎤 说说看** button. The kid says the line; the characters
they pronounced correctly light up green with a star and are spoken back.

Three things shape this feature, and they are not incidental:

**It is never a gate.** No pronunciation is ever required to turn a page. The
worst outcome is `再试试看`, which is an invitation. A denied microphone, a
network error, an unsupported browser and total silence all leave the story
fully readable.

**It matches on sound, not on characters.** Single-character Mandarin is close to
the worst case for speech recognition — no context, and the language is
homophone-dense — so 大 comes back as 打 or 答 constantly. Judging on character
identity would mark a child wrong for saying exactly the right thing. Each
character therefore carries a `homophones` list, and any of them counts as
evidence. Those lists deliberately **exclude other curriculum characters**: 窗
(chuāng) and 床 (chuáng) differ only in tone, and accepting one for the other
would teach nothing.

**It needs HTTPS on the iPad.** Speech recognition requires a secure context.
`localhost` is one; the LAN address the iPad uses is not, so the button would be
silently dead on the device. Run:

```bash
./scripts/serve.sh --https
```

That generates a self-signed certificate into `.certs/` on first use. Safari
warns about it once — **Details → Visit This Website**. Without `--https` the
button is disabled on the iPad and says why.

> **Where the audio goes:** the Web Speech API is not on-device. Safari and
> Chrome send the recorded audio to Apple's or Google's servers to transcribe it.
> That is your child's voice leaving the iPad. Nothing is stored by this app
> beyond a per-character tries/hits count, but the recording itself is handled
> by the browser vendor, and that is worth deciding about deliberately.

### The decodable guarantee

**No page may contain a character the story does not declare** — in `requires`
(which the kid must already know) or `introduces` (glue met here). This is
enforced three ways: `scripts/validate.py`, a data test against the real story
files, and `undeclaredGlyphs()` in the pure core.

It is not theoretical. The very first story written by hand used 小 without
declaring it, and the check caught it immediately.

Adding a story: drop a JSON file in `data/stories/` and add it to
`data/stories/index.json` — the validator fails if the two disagree.

## 测试模式 — dev mode

For building and testing, not for the child.

```
http://localhost:8181/index.html?dev=1     turn it on
http://localhost:8181/index.html?dev=0     turn it off
```

Or toggle **测试模式** in the parent panel. It persists.

With it on:

- **Every character is unlocked, including 你 好 我** — the glue that is
  otherwise reachable only by finishing a story.
- **A fresh install skips the opening 初遇 entirely.** Arriving with `?dev=1`
  means not going over the characters at all, so the unlock happens *before* the
  first-run introduction rather than after it.
- **Any story opens directly by name** from the shelf in the parent panel — a
  locked one silently grants what it needs first, so what you see on the page is
  still decodable.
- **The parent gate opens in 300ms** instead of 1.5s, because a tester opens it
  constantly.

A purple **测试模式** badge sits in the corner the whole time it is on. That is
deliberate: a dev flag you forget about is a dev flag your child eventually gets.

**The story shelf is tappable in normal mode too** — any *unlocked* story can be
opened by name. Only opening *locked* ones needs dev mode.

## Parent panel

**Press and hold the faint dot in the TOP-LEFT corner for 1.5 seconds.** An orange
ring fills around it while you hold, so you can see it working. Let go early,
or drag more than ~44px away, and it cancels. A quick tap does nothing.

It sits at 22% opacity — findable if you're looking for it, uninteresting if
you're four. It's in the top-left rather than the bottom-left because the
bottom-left overlaps the pouch and would steal the leftmost card's drag once
the hand is full.

- **Tap any character in the list** to teach it right now, in any order —
  `现在学` for one they haven't met, `再看一次` to re-show one they have.
  Re-showing a known character is a review and deliberately does **not** reset
  the arrival clock.
- **认识下一个字：X** — introduces the next character on demand, naming it on the
  button so you know what's coming. Runs the same 初遇 the automatic drip uses,
  so there is one code path (`introduceNext()` in `js/main.js`). Use this to
  pace a session yourself instead of waiting 8 casts, or to move fast while
  testing. Disabled once all characters are known.
- 解锁全部字 — skip the drip entirely.
- 重置房间 — put the room back, keep the characters.
- 全部重来 — wipe everything.

Each character shows its own status — 刚认识 / 还不稳 / 快记住了 / 记住了 — with a
mastery bar, so you can see which ones are actually solid.

Above the buttons: characters known, cast count, rare reactions, **认对率**
(discrimination accuracy) and 团团's question count and hit rate. Only the character list scrolls — the buttons stay
put, so the one you came to press is never below the fold.

## After changing any file

```bash
python3 scripts/gen-sw-manifest.py
```

Regenerates `sw-assets.json`, the list the service worker precaches for offline
use, with a content hash that busts the cache. `scripts/validate.py` fails if it
is stale, so the test suite catches a forgotten regeneration.

Icons are in `assets/icons/` (regenerate by rerunning the snippet in git history
if the design changes). iOS ignores the manifest's icons and uses the
`apple-touch-icon` links in `index.html`.

## Regenerating audio

The voice is macOS `say` (Tingting) — a placeholder.

```bash
./scripts/gen-audio.sh
```

**Replace these with real human recordings before the app gets real use.** Kids
are very sensitive to synthetic Mandarin prosody (DESIGN.md §11).

## Tests

Engineering rules are in [CLAUDE.md](CLAUDE.md). **Run these before calling
anything fixed.**

```bash
./scripts/test.sh --fast   # content + unit + data, headless, <0.5s
./scripts/test.sh          # everything incl. E2E, headless Chrome, ~8s
SLOW=1 ./scripts/test.sh   # also lists the slowest tests
```

**137 tests, fully headless, no node and no install.** Both commands exit
non-zero on failure. `./scripts/test.sh` starts a dev server itself if one isn't
running, and never opens a visible browser window.

You can also open the suite in a browser to watch it:
**http://localhost:8181/tests/index.html**

| Suite | What it covers |
|---|---|
| `tests/unit/pacing.test.js` | When a character arrives, session rollover, budgets |
| `tests/unit/hand.test.js` | Decoy selection, shuffling, hand composition |
| `tests/unit/rules.test.js` | Rule matching, variant weighting, golden/fizzle/fallback |
| `tests/unit/layout.test.js` | Card sizing and wrapping at every plausible width |
| `tests/unit/data.test.js` | The real content files — no dead taps, no dangling refs |
| `tests/e2e/app.test.js` | The real app in an iframe, driven by pointer events |

**How it runs headless.** The pure tests run in `jsc`, the JavaScriptCore shell
that ships with macOS — 104 tests in ~30ms. The E2E tests need a real browser, so
`scripts/e2e-headless.py` launches headless Chrome against the test page with
`?post=1`; the page posts its results back to the dev server, which writes
`.test-results.json`. No webdriver, no websocket client, no dependency.

The E2E suite covers first run, casting, opposites, decoys and shuffling,
pacing, persistence across reload, corrupt saves, abandoned drags and the parent
panel. Every E2E test also asserts the app logged no console errors.

Bugs that reached the user are named `REGRESSION: <symptom>` so they can't come
back quietly.

### Static checks only

```bash
python3 scripts/validate.py
```

Checks that every castable character has an `any` rule (no dead taps), every
`say` step maps to a real character, every `sfx` id exists, every audio file is
present, and — once stories exist — that **no story page contains a character
outside its `requires` list**. That last invariant is the entire value of
decodable readers and is very easy to break by hand.

## Layout

```
data/characters.json     the 8 M1 characters (+ hidden `confusables` for M2)
data/cast-rules.json     char x target -> effect variants. THE CONTENT FILE.
data/scenes/house.json   object positions; `y` is the object's baseline
js/cast.js               rule matching + effect execution — the heart
js/scene.js              room state, persistence, spawning, hit-testing
js/pouch.js              drag-and-drop
js/sfx.js                all sound synthesized in Web Audio — no audio assets
js/firstMeeting.js       初遇
js/tuantuan.js           the companion's face
```

## Adding an effect

Everything interesting lives in `data/cast-rules.json`. To make 火 do something
new to the bed, add a rule — no JS required:

```json
{ "char": "huo", "target": { "id": "bed" }, "variants": [
  { "w": 1, "steps": [
    { "type": "say", "char": "火" },
    { "type": "sfx", "id": "fire" },
    { "type": "particles", "kind": "fire", "count": 20 },
    { "type": "shake", "target": "room", "intensity": 8, "dur": 600 },
    { "type": "tuan", "emotion": "scared", "dur": 2000 }
  ] } ] }
```

Step types: `say` `saySelf` `sfx` `wait` `scale` `setScale` `setState`
`particles` `shake` `hop` `spin` `squash` `glow` `roomLight` `roomTint` `rain`
`tuan` `spawn`.

A rule may set `"noEffect": true` to mean *acknowledged, but nothing happens*
(used by 猫/门 on the wrong target). Such a cast skips the first-cast flourish
and does not spend the character's first-cast moment.

A `say` (or `saySelf`) step may set `"wait": true` to hold the rest of the
sequence until the spoken word has finished, plus a small `gap` (default 90ms).
Use it whenever the next sound imitates the thing the character names. It
degrades to no delay when audio is unavailable, so it costs the test suite
nothing.

Particle kinds: `fire` `water` `drip` `sparkle` `star` `smoke` `zzz` `note`
`heart` `leaf`. Sounds: `whoomph` `squeak` `pop` `boing` `creak` `thud`
`splash` `drip` `fire` `thunder` `purr` `sneeze` `yawn` `zap` `wind` `chime`
`sparkle` `womp` `mew` `dooropen`.

## Not in M1

The memory engine (SRS), 团团's retrieval mode, Find, and Story are M2–M4.
`confusables` are already in the data, unused, waiting for M2's distractor picker.
