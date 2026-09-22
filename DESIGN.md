# 字岛 / Hanzi Island — Design Document

**v0.1 — 2026-09-19**
*Working title. Target: iPad. Audience: one 3–8 year old who speaks fluent Mandarin and recognizes zero characters.*

---

## 1. Premise

The child already speaks Chinese. Meaning and pronunciation are already in their head. The entire learning task is a **one-way visual mapping**:

```
known spoken word  ──▶  visual shape
      māo                   猫
```

No phonics. No tones to teach. No vocabulary to acquire. No decoding rules. This is closer to sight-word recognition than to language teaching, and it means we can move far faster and far more visually than any app on the market — all of which hedge for heritage and foreign learners who need meaning and pronunciation taught too.

### Hard constraints (from the product owner)

| # | Constraint | Consequence |
|---|---|---|
| 1 | **No writing.** No tracing, no stroke order, no 笔顺 animation. | Removes a whole motor-skill subsystem. Recognition only. 悟空识字 ships with no writing at all and still works. |
| 2 | **No formal instruction.** No radicals, no components, no "this character is made of X + Y", no etymology lessons, no structure UI. | Characters are learned **whole**, by direct association and repetition. The app must never look like a class. |
| 3 | **Must be genuinely fun**, not a flashcard app in a costume. | See §2. This is the hardest requirement and drives the entire architecture. |
| 4 | **iPad first.** | Touch-first, drag-heavy, landscape, offline-capable. |

### One important clarification on constraint 2

"No formal instruction" governs what the **child sees**. It does not govern what the **engine knows**. The system still uses component and shape similarity internally — to pick confusable distractors (日/目, 大/太, 人/入) and to tune difficulty. Research on orthographic awareness shows contrastive pairs are the most effective training signal, and we get that benefit for free without ever explaining a radical to the kid. **Machinery, never curriculum.**

---

## 2. The design thesis: why most character apps aren't fun

Every major app in this space — 洪恩识字, 悟空识字, 叫叫识字 — has the same architecture:

```
[ do a drill ]  →  [ earn a star ]  →  [ spend stars on a game / costume / unlock ]
```

The learning and the fun live in **separate compartments**. The game is a bribe paid for enduring the drill. Reviewers of 洪恩识字 complain about exactly this — kids over-dwell in the game layer and parents have to supervise to drag them back. Given any freedom, a child will skip to the reward and skip the learning, because the child is not stupid and knows which part is the toy.

**Our thesis:**

> ### The character is the verb, not the quiz.
>
> Recognizing a character must not be a gate placed in front of the fun. Recognizing a character must **be** the fun action — the thing the kid does to make something happen on screen.

Concretely, the difference:

| Conventional | 字岛 |
|---|---|
| "Which one is 大? ⭐ Correct! +1 star" | Kid drags 大 onto the cat. The cat inflates until it fills the screen, knocks the lamp over, and purrs like thunder. Kid drags 小 onto it. It shrinks to mouse-size and squeaks. |

In the second column the child has just read 大 and 小 twice each, laughed, and has no idea they were studying. There is no star. The **effect is the reward**, and the effect is instantaneous, physical, and funny.

This single idea determines everything below.

---

## 3. The fun principles

These are the design rules. Every feature gets checked against them.

### 3.1 The character is a tool the kid wields
Characters are objects in a pouch. You drag them onto the world and the world obeys. Reading = casting. Power, not compliance.

### 3.2 Wrong answers are funny, and they still teach
There is no fail state and no "你错了". If the kid casts 水 on the campfire when they wanted 火, the fire goes out, everyone shivers, and 团团 sneezes. That is a **joke, not a penalty** — and crucially, the kid just saw what 水 does. In a cast-based system **a wrong answer is never a wasted answer**, because the wrong character demonstrates its own meaning. This is the biggest structural advantage of this design over multiple-choice.

### 3.3 The companion is worse at this than the kid
A small round creature — **团团** — lives in the app. 团团 is hungry, confused, scared of the dark, and cannot read. Every retrieval prompt is reframed:

> ~~"Which character means fish?"~~
> 团团 is hungry and staring hopefully at three cards. *Which one is 鱼?*

This converts every single test into an **act of kindness**. Children 3–8 love being the competent one; being asked to help is intrinsically motivating in a way being asked to answer is not. 团团 makes wrong guesses of their own, which the kid gets to correct. This mechanic alone solves "how do you quiz without it feeling like a quiz."

### 3.4 Mischief is allowed
The kid can break the world, safely and reversibly. Make the cat enormous. Set the table on fire. Make it rain indoors. Nothing is ever destroyed, nothing is ever lost, everything is undoable by casting the opposite character — which is itself a reading exercise.

### 3.5 Surprise budget
Kids repeat an action to check whether the same thing happens. So: **3–5 response variants per character-on-target pair**, plus a rare "golden" reaction roughly 1 in 20 that is disproportionately spectacular. Variable reward on *delight*, never on points.

**But the first cast is not a roll.** The first time a character is ever cast is the hook moment, and leaving it to a 1-in-20 chance means 19 kids out of 20 meet 大 as a modest 2× nudge instead of a giant cat. The first cast of every character always fires the spectacular branch; the variance starts from the second cast onward. *(Learned the hard way in M1 — the build shipped with a 2× first cast and it was flat.)*

### 3.5b The pouch has a ceiling
Every character the kid learns cannot simply accumulate. At the full 60-character curriculum that is a wall of cards, and a 3–8 year old facing a wall of choices picks nothing — the same reason a toy box with everything in it gets ignored while a shelf of six toys gets played with.

So the pouch holds at most **eight** cards and the rest rotate — six real and two decoys. Six is not a guess: it is the largest number of castable characters in any unit, so the pouch can always show everything currently being taught, and the two remaining slots carry the contrast. Twelve was still too many sitting next to a unit of six. The character the kid was **just shown** is always present — newly met or re-shown for review, which are the same thing from the kid's point of view and must be treated as such. Nothing is ever dropped permanently, and which ones step aside is decided by the memory engine rather than at random: shaky characters keep their place, solid ones step aside, retired ones step aside first. The pouch becomes, quietly, a second scheduling surface.

The composition is held stable between redraws. Positions shuffle constantly and deliberately (§3.8); the *set* must not, or the kid reaches for a character and finds it gone.

### 3.6 Characters are physical objects
Endless Alphabet's magic is that its letters are draggable things with weight and personality. Ours must be too: characters squash and stretch, have momentum when flicked, wobble when tapped, snap satisfyingly into slots, and make a small sound on pickup. Never flat text in a box.

### 3.7 Always end on a high
Every session ends either with a story the kid reads themselves, or with a "look what you made" snapshot of the chaos they caused in the scene. Never end on a drill.

### 3.8 The kid must never be able to succeed by guessing
A sandbox where every card in the pouch is a character the kid owns can be cleared by trial and error, without reading anything. And a pouch whose cards never move can be "learned" by position — third from the left — which is not reading either.

So two rules govern every interaction with the world:

**Decoys.** The pouch always holds a few characters we are *not* teaching, mixed in among the real ones and styled identically. They are drawn from the `confusables` of the characters the kid already owns, so the discrimination being trained is exactly the visual contrast that matters — 大 brings 太/天/犬, 门 brings 问/们/间. Casting a decoy **fizzles**: grey smoke, a descending *womp*, 团团 confused, and the world does not move. Never a buzzer, never a failure. The wordless lesson is that the characters we teach have power and random shapes don't — which quietly reinforces that these particular forms are worth knowing.

**Reshuffle after every attempt.** The cards reorder after every single cast, with a FLIP animation so it reads as the cards being alive rather than the interface moving out from under the kid. Position can never substitute for recognition.

One subtlety that matters: the decoy *set* is held stable and only the order changes. If decoys were redrawn on every shuffle, the cards that persisted would be exactly the real ones — a free answer. Decoys are redrawn at natural boundaries instead (launch, a new character arriving, every 12 casts).

This is also the app's only honest measurement. Time-on-task and cast counts measure play; **the share of picks that are real characters rather than decoys measures reading.** It is the number the parent panel shows.

---

## 4. Product overview

```
                       ┌─────────────────────────────────┐
                       │      THE ISLAND (hub scene)     │
                       │  house · kitchen · garden ...   │
                       └────────────────┬────────────────┘
                                        │
      ┌──────────────┬──────────────────┼──────────────────┬──────────────┐
      ▼              ▼                  ▼                  ▼              ▼
 ┌─────────┐   ┌──────────┐      ┌───────────┐      ┌──────────┐   ┌──────────┐
 │  初遇    │   │  施法     │      │ 团团要...  │      │   找一找  │   │   故事    │
 │ First   │   │  Cast    │      │ 团团 Wants│      │   Find    │   │  Story   │
 │ Meeting │   │(sandbox) │      │(retrieval)│      │(in-world) │   │ (payoff) │
 └─────────┘   └──────────┘      └───────────┘      └──────────┘   └──────────┘
      │              │                  │                  │              │
      └──────────────┴──────────────────┴──────────────────┴──────────────┘
                                        │
                          ┌─────────────▼──────────────┐
                          │  INVISIBLE MEMORY ENGINE   │
                          │  scheduling · distractors  │
                          │  difficulty · never shown  │
                          └────────────────────────────┘
```

The child never chooses a "mode." The app moves between them itself, and the transitions are diegetic — 团团 gets hungry, night falls, a story book falls out of a tree.

---

## 5. Core loop

A typical 10-minute session:

```
 1. Open → land directly in the current scene. No menu. No login. (0s)
 2. 初遇: one or two new characters arrive. ~10s each.
 3. 施法: free play in the scene. Kid casts anything on anything. (2–4 min)
 4. 团团要...: 团团 needs help 6–10 times, interleaved with play. (2–3 min)
 5. 找一找: one hidden-object round in the scene. (1 min)
 6. 故事: a 4–6 page micro-story using only owned characters. (2 min)
 7. End. Pouch shows the new characters settling in.
```

Steps 3 and 4 are **interleaved, not sequential** — 团团 interrupts free play with a request, the kid helps, free play resumes. This keeps retrieval practice embedded in play rather than blocked out as a "quiz section."

---

## 6. The modes in detail

### 6.1 初遇 — First Meeting

The only moment that could be called "teaching," and it lasts eight seconds and contains no explanation.

```
   [ black-ish soft background, everything else fades out ]

            猫              ← large, centered, alone, silent

   [ kid taps it ]

            猫  ──▶ ~~~ morphs / bursts into ~~~ ▶  🐱 (animated cat, meows)
                        voice: "猫"
            🐱  ──▶ ~~~ settles back into ~~~ ▶  猫

   [ kid may tap again, unlimited, as many times as they like ]
   [ character then flies into the pouch at the bottom ]
```

Rules:
- **No words of explanation. Ever.** No "this is the character for cat." The animation and the voice are the entire lesson.
- **No claim that the character looks like the thing.** This is the critical difference from Chineasy's method, which forces a picture onto every character and is rightly criticized for it — pictographs are under 10% of characters and the mnemonics stop working almost immediately. Our morph is a **transition effect, not an explanation**: the character *becomes* the thing, it is never claimed to *resemble* it. This keeps the mechanic honest and, importantly, keeps it working for 的, 了 and 不 where no picture exists.
- The kid controls repetition. Tapping it twenty times is fine and is good for us.
- Immediately usable in the world afterward. Learned → used within seconds.

**One character at a time, always** — never two 初遇 screens back to back. Two new characters per session maximum, sometimes zero, and the opening character of a brand-new install counts toward that budget. The app is not in a hurry.

### 6.2 施法 — Cast (the sandbox)

The heart of the app. The scene is a living illustrated environment. The pouch runs along the bottom. The kid drags any character onto anything.

```
 ┌──────────────────────────────────────────────────────────┐
 │                                                          │
 │      🪟              💡                                   │
 │                              🐱                           │
 │                                      🛏                    │
 │    🚪                  团团                                │
 │                                                          │
 ├──────────────────────────────────────────────────────────┤
 │  大  小  开  关  火  水  猫  门  ...        ◀ pouch ▶      │
 └──────────────────────────────────────────────────────────┘
```

Interaction grammar:

| Cast | On | Result |
|---|---|---|
| 大 | anything | it inflates, comically, with physics consequences |
| 小 | anything | it shrinks, voice pitches up |
| 开 | door / window / box | swings open **on its hinge** and reveals what's beyond — sky, grass, daylight. A flat rotation reads as "the door fell over", not "the door opened"; the swing needs real 3D perspective and something visible through the gap, or the kid doesn't believe it. |
| 关 | door / window / lamp | closes, room dims |
| 火 | lamp / stove / anything | lights up; on the wrong thing, comic smoke + 团团 panics + gentle auto-undo |
| 水 | fire / plant / 团团 | douses / grows / soaks a very unhappy 团团 |
| 飞 | any object or creature | it takes off and bobs around the ceiling |
| 睡 | any creature | it flops over snoring, z's float up |
| 猫 | **the cat** | it meows. On anything else: nothing happens. |
| 门 | **the door** | the door-open sound. On anything else: nothing happens. |

Design notes:
- **Every cast produces a response.** Never a dead tap, never "that doesn't work here." If a combination has no authored response, fall back to a tier of generic-but-charming reactions (the object wobbles and makes the character's sound; 团团 looks at the kid and shrugs). Dead taps are the fastest way to kill a sandbox.
- **Everything is reversible by casting the opposite character** — 大/小, 开/关, 火/水, 上/下. Undo is itself a reading exercise. This is the highest-value pattern in the whole design.
- **But opposite pairs are still introduced one at a time, never together.** The pairing is what makes them *useful*; it is also what makes them *confusable*. 大 and 小 are two unfamiliar shapes that mean opposite things, and meeting both in the same minute invites the kid to learn "one of those two squiggles" rather than either character. Meet one, play with it until it is solid, then meet its opposite — at which point the pair relationship is a reward rather than a load.
- **Nouns name, verbs act, transforms modify.** Three simple kinds, never explained to the kid, just consistent enough to be learnable by experiment.
- **A noun only works on the thing it names.** 猫 meows on the cat and does nothing on the bed; 门 sounds on the door and does nothing on the window. This is deliberate: it turns a noun into a *find-the-thing* act — the kid has to locate the cat before 猫 is any use — which is recognition in context rather than a free transformation. It also keeps the roles clean: 门 names a door, 开 opens one. If 门 opened the door it would collide with 开/关 and blunt the opposites model.
- **"Nothing happens" is still a response.** A noun on the wrong object says itself, gives a small wobble and a shrug from 团团 — so the kid still hears 猫, and it is still not a dead tap. What it does *not* get is the celebratory flourish, and it does **not** spend the character's one spectacular first cast: a kid who tries 猫 on the bed before finding the cat would otherwise lose that moment forever.
- The scene **persists between sessions.** If the kid left a giant flying cat in the bedroom, it's still there tomorrow. Ownership of the world.

### 6.3 团团要… — Retrieval, disguised

Interrupts free play. 团团 wants something and can't read.

```
      团团: (rubs belly, looks sad)     ← audio: a hungry little noise
             "团团饿了！"                ← spoken, in Chinese, no text

        ┌────┐   ┌────┐   ┌────┐
        │ 鱼 │   │ 花 │   │ 门 │        ← kid drags one to 团团
        └────┘   └────┘   └────┘
```

- Correct → 团团 eats happily, sparkles, thanks the kid.
- "Wrong" → 团团 earnestly tries to eat the door. Comic failure. No sound of a buzzer, no red X. The kid laughs and tries again. **The wrong character still demonstrated itself**, which is why this costs us nothing.
- 团团 sometimes **guesses first and gets it wrong** — grabs the 门 unprompted and struggles with it, and the kid has to intervene. Maximum competence-flattery.
- Request types: 团团 is hungry (nouns), 团团 is scared of the dark (verbs/transforms — kid must cast 火 or 开 on the lamp), 团团 wants to go outside (find and 开 the 门), 团团 lost their toy (find 球 among clutter).

This mode is where the **memory engine does its real work** — every request is an SRS-scheduled retrieval, and the distractors are chosen by the engine. The kid experiences it as helping a friend.

### 6.4 找一找 — Find

A busy, detailed, illustrated scene with character labels scattered on real objects in it — a sign on the door reading 门, a label on the box, a bird in the tree with 鸟 floating beside it.

```
   voice: 「门在哪里？」
   kid scans the picture and taps the right label
   → the object animates in response (the door swings open)
```

Trains **reading in the wild** — finding a known character in visual noise, which is much closer to real reading than picking from three cards on a clean background. Also naturally trains speed. Keep it warm and unhurried; a soft timer that only affects a little sparkle bonus, never a fail.

### 6.5 故事 — Story (the payoff)

A 4–6 page micro-story composed **exclusively of characters the child already owns** — the decodable-reader principle that Khan Academy Kids and Duolingo ABC are built on, and that 洪恩识字 applies every 10 characters. We put it at the center instead of the periphery.

```
 ┌────────────────────────────────────────┐
 │   [ illustration: 团团 at a door ]      │
 │                                        │
 │        团团  开  门                      │   ← large, well-spaced, tappable
 │                                        │
 │   [ tap any character → hear it ]      │
 │   [ tap the picture → it animates ]    │
 └────────────────────────────────────────┘
```

Rules:
- Strictly zero unknown characters. If the story needs a word we haven't taught, it becomes a picture inline instead of text.
- Three to seven characters per page maximum.
- **The illustration is hidden until asked for.** A picture above a sentence is the answer: a child who can see 🐱🚪 does not need to read 猫开门, and will not. It sits behind a hint button, occupying the same space so the layout never jumps, and re-covers itself on every page. Whether the hint was needed is the most honest per-page signal the app has — more honest than time-on-page — so it is recorded for the parent, but it is never a penalty and never blocks a page.
- The child reads aloud if they want; nothing requires it and nothing checks it.
- **Nothing on this page hands over the answer for free.** The illustration is behind a hint, and tapping a character does *not* speak it — a tap-to-hear control turns the whole page into an answer key, and a child will use it rather than read. The correct reading is available, but only *after* an attempt: say the line with 说说看 and the app reads it back. Attempt first, then hear it. Silence earns nothing, or the microphone becomes the new free answer.
- Sentences should be silly and refer back to things the kid did in the sandbox.
- **This is the emotional core of the whole product** — the moment "I read that" happens is the thing that makes a child want to come back. Everything else exists to make this page readable.

---

## 7. 团团 — the companion

| Property | Decision |
|---|---|
| Form | **A photograph of the child themselves**, cut out of a real snapshot. Previously a drawn blob. |
| Competence | **Always less competent than the child at reading.** Never corrects the child, never teaches. |
| Voice | Non-verbal sounds plus a very small set of simple spoken Chinese phrases ("团团饿了", "好吃！", "黑黑的…"). Never explains anything. |
| Role | Generates every retrieval prompt; reacts to every cast; provides the emotional stakes ("团团 is cold") that make reading worth doing. |
| Rule | 团团 never says the child is wrong. 团团 only ever gets confused, and is delighted when helped. |

**A photograph cannot pull a face**, and 团团's expressions are load-bearing — §3.3 rests on 团团 being *confused* rather than the child being *wrong*. So the feeling moved to the two channels a photo can carry: how the body moves (bounce, jump, shiver, doze) and a small emoji badge beside the head. Both read at a glance, which a drawn eyebrow never really did at this size.

The badge sits clear of the face. A mood marker over the child's own face is worse than no marker.

**The source photograph is not in the repository** (`private/`, git-ignored) and not in `dist/`. Only the cut-out asset ships. Publishing a child's photograph to a public URL is a decision for the parent to take deliberately, not a side effect of a UI change.

---

## 8. The invisible memory engine

Never surfaced to the child. No review screen, no "due today," no progress bar, no streak.

### 8.1 Per-character state

```json
{
  "charId": "mao",
  "firstSeen": "2026-09-19T10:04:00Z",
  "exposures": 14,
  "retrievals": { "correct": 9, "incorrect": 2 },
  "box": 3,
  "lastSeen": "2026-09-21T09:11:00Z",
  "dueAt": "2026-09-24T00:00:00Z",
  "medianLatencyMs": 1840
}
```

### 8.2 Scheduling — a kid-tuned Leitner ladder

Standard SRS intervals assume an adult studying deliberately. A 3–8 year old plays in short, irregular bursts. So:

| Box | Next review | Notes |
|---|---|---|
| 0 | later in the **same session** | freshly met |
| 1 | next session | |
| 2 | +1 day | |
| 3 | +3 days | |
| 4 | +7 days | |
| 5 | **retired to stories** | no longer drilled; maintained by appearing in story text and scene labels |

- Correct and fast → promote.
- Correct but slow (>4s) → hold at current box. **Recognition speed is the real target**; fluent reading is automatic reading.
- Incorrect → demote one box only, never to zero. Never punish hard.
- **Box 5 is the goal state and it is not a drill state.** Once a character is solid it only ever appears in stories and world labels — which is both more pleasant and better practice.

### 8.3 Distractor selection — the hidden contrast engine

This is where we quietly exploit orthographic-awareness research without teaching a single radical.

Each character carries a hidden `confusables` list, ranked by visual similarity (shared components, similar silhouette, similar stroke count):

```
日 → [目, 白, 田, 月]
大 → [太, 天, 犬, 木]
人 → [入, 八, 个]
```

Difficulty is controlled entirely by **how similar the distractors are**:

| Character's box | Distractors drawn from |
|---|---|
| 0–1 | maximally dissimilar (easy, confidence-building win) |
| 2–3 | mixed |
| 4–5 | nearest confusables (the real test) |

Research shows contrastive-pair training is the most effective route to orthographic awareness. The child experiences it as "the game got a bit trickier."

### 8.4 Never fail out loud

No score is ever shown. No character is ever marked wrong in the UI. A struggling character simply reappears sooner, with easier distractors, and gets an extra 初遇 replay slipped in as if for the first time.

---

## 9. Curriculum — units of six

Characters are taught in **units of six**, each ending in a story that the unit itself makes readable. This matters for two reasons.

A block of eighteen characters is not a curriculum, it is a list — there is no moment of completion in it, nothing to finish. Six is small enough that a child reaches the end of one, and the story is the reward for having done so (§3.7, always end on a high).

And it makes the decodable guarantee structural rather than incidental: **a story may only use characters from its own unit or an earlier one**, so finishing a unit is by construction enough to read its story. That is checked in the build, not remembered by hand.

Glue characters live in the unit whose story introduces them, since a story is the only place they can be learnt at all (§9.1).

**Each unit also looks different.** The room's palette changes with the unit — 晨, 午, 阴, 绿, 霞, 夜 — so progress is visible in the world itself rather than only in a panel a child never opens. Six looks read as a day passing, which gives the sequence a shape a four-year-old can follow without being told what it means.

The split is: **the scene supplies the materials, the unit supplies the light.** A kitchen floor is tiled and a house floor is boards whichever unit you are in; the walls take their colour from the unit in both rooms. Before this the two rooms were pixel-identical apart from the objects standing in them, which is not a second room, it is the same room redressed.

This is orthogonal to pacing. Grouping is six; arrival is still one character per eight casts, at most three a session — a unit takes two or three sittings.

## 9x. Curriculum — the v1 sixty

Ordering is **not** by raw frequency. It is by, in priority order:

1. **Castability** — does this character *do* something visible in the sandbox? Verbs and transforms are worth double because they generate play.
2. **Opposability** — does it have a partner that undoes it? (大/小, 开/关, 火/水, 上/下, 多/少)
3. **Concreteness** — can a 4-year-old point at it in the room?
4. **Sentence-writability** — can we build a real story sentence out of what's been taught so far?

### Scene 1 — 家 (House) — 20 characters

| Transforms & verbs | Things | Glue |
|---|---|---|
| 大 小 开 关 上 下 | 门 窗 床 灯 猫 狗 | 我 你 好 |
| 火 水 飞 睡 | | |

*Built: 16 of these 19. 我/你/好 are deliberately deferred — see §9.1.*

First session teaches exactly **大**, cast on the cat. One character. That's it — that is the entire hook, and it is enough. 小 arrives later through play, once 大 is its own thing rather than half of a pair.

### Scene 2 — 厨房 (Kitchen) — 18 characters *(built)*

| Transforms & verbs | Things | Glue |
|---|---|---|
| 吃 喝 热 冷 多 少 | 米 蛋 鱼 肉 菜 手 口 | 一 二 三 个 了 |
| | | |

Cooking is an extremely strong mechanic for this age — recipe cards are readable text with an immediate physical payoff.

### Scene 3 — 外面 (Outside) — 20 characters

| Transforms & verbs | Things | Glue |
|---|---|---|
| 跑 跳 高 长 风 雨 | 花 草 树 山 石 云 日 月 鸟 虫 | 不 是 有 在 |

**Total v1: 60 characters**, enough for roughly 12–15 real micro-stories.

### 9.1 The glue-character problem

的, 了, 不, 是, 在, 有 are visually unremarkable, mean nothing concrete, and cannot be cast on anything. They are also unavoidable — you cannot write a single natural sentence without them. This is a real design problem and it needs its own answer:

This is why **我 / 你 / 好 are not in the build yet** even though they are Scene 1 characters. Every other Scene 1 character earns its place in the sandbox by *doing* something; a pronoun does not. Inventing a cast for 我 would teach the wrong mental model — that 我 is something you do to objects — so they wait for story mode, which is the context they actually belong in.

**Glue characters are never taught in 初遇 and never cast.** They are introduced **only inside story mode**, where they appear in position, are always read aloud as part of the sentence, and are learned the way children learn "the" — by sheer positional repetition, never by definition. They are drilled by the memory engine only in the form of **"tap the character you just heard"** within a sentence, never in isolation, never on a card.

Distinct handling, distinct code path, flagged in the data as `kind: "glue"`.

---

## 10. Session and pacing

| | |
|---|---|
| Target session | 8–12 minutes |
| New characters per session | 0–2, never more — and never two in a row. The first character of a new install counts toward the budget. |
| Cold open | Straight into the scene. No splash, no menu, no "choose your level." |
| Arrival spacing | Counted in casts **since the last arrival**, persisted across restarts — never `totalCasts % N`. The total persists while any in-memory session counter resets, so a modulo test fires on the first cast of any session that happens to resume just below a multiple of N, and a character ambushes the kid out of nowhere. *(Shipped that bug in M1.)* |
| What a "session" is | **A gap in time (30 min idle), not a page load**, and it persists. Keyed to page load, reloading farms a fresh budget while a long real sitting gets none — and once spent, the only way to continue is to restart the app. *(Also shipped that in M1: a fresh install spent its whole budget on the first two characters and then went silent forever.)* |
| The opening character | Free. It is the hook, not one of the day's lessons, so it does not spend the session budget. |
| When a limit stops something | **Say so somewhere an adult can see it.** A cap that silently does nothing is indistinguishable from a bug — the parent panel shows `本次新字：n / N` and the reason, and the manual button always overrides. |
| Ending | Always a story page or a chaos snapshot. Never a drill, never a score screen. |
| Time limit | Soft. When the budget is spent, the app steers toward the story and then 团团 gets sleepy and the scene dims. **Never a hard mid-play cutoff** — that produces a tantrum and poisons the whole app. |
| Parent override | Session length configurable behind the parent gate. |

---

## 11. Art and audio direction

**Art.** Flat vector, thick outlines, warm saturated palette, minimal gradients — a style one person can actually produce sixty characters' worth of. Chunky and tactile. Everything squashes and stretches. No realism, no gradients, no fussy detail. For the prototype: colored shapes and emoji as placeholders, so the interaction can be tested before any art exists.

**Characters on screen.** Rendered in a clean, high-legibility typeface — **楷体 (Kai)** is the correct choice for early learners; it is the form children see in Chinese primary-school materials and its strokes are unambiguous. Never a decorative or heavily stylized face. Generous size: a character should never render smaller than ~72pt on iPad.

**Audio levels.** The sound bus runs master gain → compressor → makeup gain → **tanh soft-clipper**. The compressor alone does not catch sawtooth transients; measured at the output, the first loud version of 猫 peaked at 1.47 and hard-clipped, which is what made it sound harsh rather than loud. The tanh curve saturates smoothly and can never exceed 1.0, so a patch can be driven hard and stay clean.

Loudness is **RMS, not peak** — the clipped version was quieter in RMS than the clean one that replaced it. Judge a patch by measuring at the destination, not by the envelope value in the source.

One trap worth recording: a spectral centroid computed from `getByteFrequencyData` is dB-weighted and overstates quiet high-frequency content wildly — it reported the door at 10kHz ("hissy") when the true energy centroid was 584Hz ("boomy"), the opposite problem. Convert `getFloatFrequencyData` to linear power first, and gate on frames that actually contain signal.

**Audio ordering.** When a sound effect *imitates* the thing a character names — a meow for 猫, a door for 门 — it must not overlap the spoken word. Played together the kid hears neither clearly. The word finishes first, then the sound: it also reads as call-and-response, which is better than a blur. This does not apply to effect sounds that accompany a transformation (the *whoomph* of 大), where simultaneity is the point.

**Audio.** Every character has a recorded utterance. For the prototype, generate with macOS TTS:

```bash
say -v Tingting -o audio/mao.aiff "猫"
```

Replace with **real human recordings** before the app is used for long — a warm adult voice, ideally someone the child knows. Kids are unusually sensitive to synthetic prosody and TTS Mandarin tones are subtly off in ways that matter here.

Sound design carries a lot of the "fun" load: pickup sounds, snap sounds, the whoomph of 大, the deflating squeak of 小, 团团's noises. Budget real effort here; it is cheaper than art and does more work.

---

## 12. Anti-patterns — explicit do-not list

These are decisions, not suggestions.

- ✗ **No pinyin.** Anywhere. Ever. The child doesn't need it and it becomes a crutch that competes directly with character recognition.
- ✗ **No writing, tracing, or stroke order.**
- ✗ **No radicals, components, etymology, or structure UI.**
- ✗ **No English.**
- ✗ **No star/coin/gem economy** as the primary motivator. The effect is the reward.
- ✗ **No leaderboards, no social, no comparison to other children.**
- ✗ **No streaks or guilt mechanics.** A 5-year-old should not be managing a streak.
- ✗ **No anxiety timers.** No countdown bars, no "hurry!", no losing.
- ✗ **No ads, no IAP, no upsell.**
- ✗ **No dead taps.** Every interaction produces a response — including casting a decoy, which fizzles rather than doing nothing.
- ✗ **No visual tell on decoy cards.** A tint, a border or a different opacity hands the kid the answer without reading.
- ✗ **No explaining.** If a feature requires a sentence of explanation to a 5-year-old, it is the wrong feature.

---

## 13. Technical design (iPad)

### 13.1 Recommended stack

**Web-first PWA, installed to the iPad home screen.**

| | |
|---|---|
| Runtime | Safari / standalone PWA, offline via service worker |
| Rendering | DOM + CSS transforms for M1 (~8 objects, 60fps on iPad, no build step). Move to **PixiJS** only if object counts or particle density demand it — the cast/effect system is rendering-agnostic. |
| UI chrome | React only for the thin non-game layer (parent dashboard) |
| Animation | GSAP or a small custom tween layer; squash/stretch is central so easing quality matters |
| Audio | Howler.js — sprite-sheeted audio, critical for latency on iOS |
| State | Local-first: IndexedDB. No account, no server, no network required. |
| Language | TypeScript throughout |

**Why web and not native Swift:** iteration speed is the single most valuable resource here, because the only real test is whether one specific child comes back to it tomorrow. A web build reloads in a second and can be tested on the iPad over the local network with no signing, no provisioning, no App Store, no dev account. The gameplay is 2D sprite work with audio — nothing needs native performance. If it sticks and you later want it on the App Store, wrapping it (Capacitor) or porting the interaction design to SwiftUI + SpriteKit is a known, bounded job. **Ship the fun first; port later if ever.**

Two iOS gotchas to handle from day one: audio must be unlocked by a user gesture on first load, and the PWA must lock landscape and suppress rubber-band scroll and the double-tap-to-zoom gesture.

### 13.2 Data model

```typescript
type CharKind = 'thing' | 'action' | 'transform' | 'glue' | 'number';

interface HanziCard {
  id: string;              // 'mao'
  char: string;            // '猫'
  spoken: string;          // '猫'  (what the voice says)
  audio: string;           // 'audio/mao.m4a'
  kind: CharKind;
  scene: SceneId[];        // where it appears
  castable: boolean;       // glue chars are false
  reveal: RevealId;        // First Meeting animation
  confusables: string[];   // HIDDEN. ranked visual-similarity list for distractors
  opposite?: string;       // '小' for '大' — drives the undo mechanic
  order: number;           // curriculum position
}

interface CastRule {
  char: string;            // '大'
  target: TargetSpec;      // { tag: 'creature' } | { id: 'lamp' } | { any: true }
  effects: Effect[];       // 3–5 variants, weighted
  golden?: Effect;         // ~5% spectacular variant
  reversibleBy?: string;   // '小'
}

interface Progress {
  charId: string;
  box: 0|1|2|3|4|5;
  exposures: number;
  correct: number;
  incorrect: number;
  lastSeen: string;
  dueAt: string;
  medianLatencyMs: number;
}

interface Story {
  id: string;
  requires: string[];      // char ids — story unlocks only when ALL are owned
  pages: { art: string; text: string[]; taps: TapAction[] }[];
}
```

### 13.3 Repository layout

```
LearnChinese/
├── DESIGN.md
├── data/
│   ├── characters.json      # the 60 cards
│   ├── cast-rules.json      # character × target → effects
│   ├── scenes/
│   │   ├── house.json
│   │   ├── kitchen.json
│   │   └── outside.json
│   └── stories/
│       └── *.json
├── scripts/
│   ├── gen-audio.sh         # macOS `say` → audio sprites
│   └── validate.ts          # stories contain no unknown chars; every cast rule resolves
├── src/
│   ├── engine/              # memory model, scheduler, distractor picker
│   ├── game/                # Pixi scene graph, cast system, effects
│   ├── modes/               # firstMeeting · cast · tuantuanWants · find · story
│   ├── audio/
│   └── parent/              # React dashboard behind the gate
├── assets/
└── public/
```

`scripts/validate.ts` is worth writing early and is non-negotiable: it must fail the build if any story page contains a character not in its `requires` list. That invariant is the entire value of decodable readers and it is very easy to break by hand.

### 13.4 Parent mode

Behind a gate the child cannot pass: press and hold a dim dot in the top-left corner for 1.5 seconds. Not a math problem — an 8-year-old will solve that.

Three things this gate needs that are easy to get wrong, and were wrong in the first build:

- **It must be findable.** A fully transparent hotspot is not a gate, it is a secret, and the adult who needs it cannot use it. A dot at ~22% opacity is invisible to a child who isn't looking for it and obvious to one who is.
- **It must show progress.** A hold with no feedback is indistinguishable from a broken control. A ring fills while you hold, over exactly the hold duration — the CSS transition is driven from `js/timings.js` so the two cannot drift apart.
- **It must tolerate fingertip drift.** Cancelling on `pointerleave` means a finger resting on glass — which always drifts a pixel or two — resets the timer and the gate can never be opened by touch at all. Capture the pointer and cancel only on real movement (~44px).

- Which characters are solid, which are shaky, which are new — a simple grid, no jargon.
- A printable list of solid characters, so the parent can point them out on signs and menus in real life. **Transfer to the physical world is the actual goal of the product.**
- Session length setting.
- **Teach any character on demand, in any order** — not just "the next one". A parent may want 水 today because it rained. Re-showing a character the kid already knows is a review and must not disturb the arrival clock.
- **Introduce the next character on demand** — so a parent can pace a session ("let's learn a new one now") rather than waiting for the cast-count drip. Shares one code path with the automatic drip.
- Reset a character; skip a character.
- No notifications, no email, no engagement nagging.

---

## 14. Success metrics

Only three matter, in order:

1. **Unprompted return.** Does the child ask for it? This is the only metric that can kill the project.
2. **Retention at 7 days.** Measured invisibly inside 团团 requests — never as a test.
3. **Transfer.** Does the child spontaneously read a character in the wild — on a sign, a menu, a package? Logged manually by the parent in parent mode. This is the real win condition.

Explicitly **not** metrics: session length, characters "covered," daily streak. Optimizing for those produces exactly the app we're trying not to build.

---

## 15. Build milestones

| Milestone | Scope | Proves |
|---|---|---|
| **M0 — Spike** ✅ *built* | First Meeting screen + pouch + audio pipeline. | Does the morph feel magic? Does the audio latency work on iPad? |
| **M1 — The hook** ✅ *built* | Cast mode + house scene. 大/小/开/关/火/水/猫/门 + cat, door, window, lamp, bed, plant, 团团. 27 rules / 34 variants / 3 golden. See README.md. | **The critical test.** Put it in front of the kid. If dragging 大 onto the cat doesn't get a laugh, the thesis is wrong and everything downstream changes. |
| **M2 — 团团** ✅ *built* | Companion + retrieval mode + memory engine + mastery-scaled distractor selection. `js/core/memory.js`, `js/core/distractors.js`, `js/prompt.js`. | Does retrieval-as-helping actually feel different from a quiz? |
| **M3 — The payoff** ✅ *built* | Story mode + 3 stories + validator. `js/core/stories.js`, `js/story.js`, `data/stories/`. | Does "I read it" land? |
| **M4 — Scale** 🔨 *kitchen built* | Kitchen ✅ (18 characters, counting, 3 stories) + outside scene → 60 characters, Find mode, parent dashboard. | Does it hold attention over weeks? |

**M1 is the gate.** Build it small, build it fast, and test it on the actual child before writing a line of M2. Everything in this document is a hypothesis until that moment.

---

## 15b. The M1 gate: passed

**September 2026 — the child played it and came back to it.** Asked, he said it was interesting.

This is the question §15 said everything downstream depended on, so it is recorded here rather than left in a chat log. What it licenses: building more. What it does **not** tell us is which parts he used — whether he answered 团团, whether he read a story or only poked the cat, whether he returned unprompted on a second day. Those are the things worth watching, and they are still unknown.

## 16. Open questions

1. **Does the sandbox hold up without goals?** 3-year-olds love pure sandboxes; 7-year-olds often want objectives. May need a light "团团's wish list" layer for the older end of the range.
2. **How much authored content does the sandbox need** before the fallback reactions start feeling cheap? Guess: ~6 castable characters × ~8 targets × 3 variants ≈ 150 authored effects for the house scene alone. This is the single biggest content risk in the project.
3. **Voice input.** ✅ *Built, in stories only (说说看).* The original verdict — "only ever as a delight, never as a requirement" — is what the implementation actually does: characters the child pronounces light up, nothing is ever required, and every failure path leaves the page readable.

    Two findings worth keeping. **Judge on sound, not on characters:** single-character Mandarin is nearly the worst case for ASR, and 大 returns as 打 constantly, so matching on character identity would fail a child for being right. Each character carries a `homophones` list, excluding other curriculum characters so minimal pairs like 窗/床 are never cross-accepted. **And the microphone needs a secure context**, which the iPad's LAN address is not — hence `./scripts/serve.sh --https`. Without it the feature is silently dead on the actual target device.

    Still open: whether the recogniser is accurate enough on a 4-year-old to be worth the screen space at all. That can only be answered with the actual child.
4. **Two-player / parent-and-child mode?** Deferred.
5. **Traditional vs simplified.** Assumed simplified. Confirm.
6. **Art production.** The real bottleneck. Decide early whether to commission, generate, or lean on a deliberately minimal style that one person can sustain. *(Still emoji placeholders, and they have held up better than expected — a real child found them interesting.)*
7. **The voice is still `say -v Tingting`.** Every character is macOS TTS. Replacing 37 words with a familiar human voice is ~20 minutes of the parent's time and would lift every interaction in the app more than any code change available. It is the highest-value outstanding item and it is not one Claude can do.
8. **Does the capped pouch help or frustrate?** Eight cards holds exactly one unit plus two decoys, and the rest rotate. Rotation is the part that cannot be tested, only observed: does he reach for a character and find it missing?
9. **Is the speech recogniser usable on a four-year-old?** The parent panel's 念对率 is the number that answers this. Until there is data, 说说看 stays optional and ungated.

---

## 17. Where this is now

*A cold start should read this section, then CLAUDE.md, then run the tests.*

**Built:** M0–M3 complete, M4 in progress (kitchen done, outside scene not started).

- 37 characters in six units of six, each ending in its own story
- Two rooms (家, 厨房) joined by a door that must be read open; each unit has its own palette
- Cast sandbox, memory engine with 团团's questions, six decodable stories, speech practice
- PWA: installable, offline, live at the URL in README
- 404 tests (unit + data + end-to-end), all headless

**Not built:** the outside scene and the remaining ~23 characters toward the planned sixty; Find mode (§6.4); a real parent dashboard beyond the current panel.

**Where knowledge lives, in order of reliability:**

1. **The tests.** 404 of them, and every bug that ever reached the child is a named `REGRESSION:` test. They are the only record that cannot quietly go stale.
2. **CLAUDE.md.** How to work here, and a table of every bug shipped with its root cause.
3. **This document.** Why the product is shaped the way it is, including the decisions that were reversed and why.
4. **README.md.** How to run, test, and deploy it.

Conversation history is *not* on that list. Anything learned in a session that matters belongs in one of the four above before the session ends.

---

*Next step: build M1. Everything above is theory until a child laughs at a giant cat.*
