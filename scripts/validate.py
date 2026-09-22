#!/usr/bin/env python3
"""Build-time invariants. DESIGN.md §13.3: this must fail loudly, because the
whole value of decodable readers is the guarantee that a story contains no
character the kid hasn't met -- and that is very easy to break by hand."""
import json, sys, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
err = []
warn = []

chars = json.loads((root / 'data/characters.json').read_text())['characters']
rules = json.loads((root / 'data/cast-rules.json').read_text())
by_id = {c['id']: c for c in chars}
by_glyph = {c['char']: c['id'] for c in chars}

SCENES = {f.stem: json.loads(f.read_text())
          for f in sorted((root / 'data/scenes').glob('*.json'))}
scene = SCENES['house']
scene_tags = {t for sc in SCENES.values() for o in sc['objects'] for t in o.get('tags', [])}

# 1. every castable character has at least one rule, and an `any` rule (no dead taps)
have_rule = {r['char'] for r in rules['rules']}
have_any = {r['char'] for r in rules['rules'] if r['target'].get('any')}
for c in chars:
    if not c.get('castable'):
        continue
    if c['id'] not in have_rule:
        err.append(f"character {c['char']} ({c['id']}) is castable but has no cast rule")
    elif c['id'] not in have_any:
        err.append(f"character {c['char']} ({c['id']}) has no `any` rule -> dead tap possible")

# 2. every rule references a real character
for r in rules['rules']:
    if r['char'] not in by_id:
        err.append(f"cast rule for unknown character id '{r['char']}'")

# 3. every `say` step references a character we have audio for
def walk(node, fn):
    if isinstance(node, dict):
        fn(node)
        for v in node.values(): walk(v, fn)
    elif isinstance(node, list):
        for v in node: walk(v, fn)

def check_step(n):
    if n.get('type') == 'say':
        g = n.get('char')
        if g not in by_glyph:
            err.append(f"say step references glyph '{g}' which is not in characters.json")
    if n.get('type') == 'spawn':
        if n.get('what') not in rules.get('spawnables', {}):
            err.append(f"spawn step references unknown spawnable '{n.get('what')}'")
walk(rules, check_step)

# 4. audio file exists for every character
for c in chars:
    f = root / 'audio' / f"{c['id']}.m4a"
    if not f.exists():
        err.append(f"missing audio/{c['id']}.m4a for {c['char']} -- run scripts/gen-audio.sh")

# 5. sfx ids used by rules must exist in js/sfx.js
sfx_src = (root / 'js/sfx.js').read_text()
defined = set(re.findall(r'^  (\w+) \(\)', sfx_src, re.M))
used = set()
walk(rules, lambda n: used.add(n['id']) if n.get('type') == 'sfx' else None)
for s in sorted(used - defined):
    err.append(f"cast rules use sfx '{s}' which is not defined in js/sfx.js")

# 6a. every scene: ids unique, positions sane, doors lead somewhere real
for sid, sc in SCENES.items():
    ids = [o['id'] for o in sc['objects']]
    if len(set(ids)) != len(ids):
        err.append(f"scene {sid}: duplicate object ids")
    for o in sc['objects']:
        if not (0 <= o['x'] <= 100 and 0 <= o['y'] <= 100):
            err.append(f"scene {sid}: {o['id']} is outside the room")
        if 'openable' in o.get('tags', []) and not o.get('opening'):
            err.append(f"scene {sid}: {o['id']} is openable but declares no opening")
        if o.get('leadsTo') and o['leadsTo'] not in SCENES:
            err.append(f"scene {sid}: {o['id']} leads to unknown scene '{o['leadsTo']}'")
        if o.get('leadsTo') and 'openable' not in o.get('tags', []):
            err.append(f"scene {sid}: {o['id']} leads somewhere but cannot be opened")
        if o.get('leadsTo') and not o.get('opensWith'):
            err.append(f"scene {sid}: {o['id']} leads somewhere but does not say which "
                       f"character opens it -- the pouch cap could rotate it away and "
                       f"strand the kid")
        if o.get('opensWith') and o['opensWith'] not in by_id:
            err.append(f"scene {sid}: {o['id']} opensWith unknown character "
                       f"'{o['opensWith']}'")

# every scene needs a way back, or the kid is stranded
for sid, sc in SCENES.items():
    if sid == 'house':
        continue
    if not any(o.get('leadsTo') for o in sc['objects']):
        err.append(f"scene {sid} has no way out")

# 6. scene objects: tags referenced by tag-rules should exist somewhere
scene_tags |= {t for sp in rules.get('spawnables', {}).values() for t in sp.get('tags', [])}
scene_ids = {o['id'] for sc in SCENES.values() for o in sc['objects']} | set(rules.get('spawnables', {}))
for r in rules['rules']:
    t = r['target']
    if t.get('tag') and t['tag'] not in scene_tags:
        warn.append(f"rule {r['char']} targets tag '{t['tag']}' which no scene object has")
    if t.get('id') and t['id'] not in scene_ids:
        warn.append(f"rule {r['char']} targets id '{t['id']}' which is not in the house scene")

# 7. stories: the decodable-reader guarantee.
#    A page may ONLY contain characters the story declares -- `requires` (which
#    the kid must already know for it to unlock) or `introduces` (glue
#    characters met here for the first time). This is the whole value of a
#    decodable reader and is very easy to break by hand.
STORY_FILES = sorted(f for f in (root / 'data/stories').glob('*.json')
                     if f.name != 'index.json')

for sf in STORY_FILES:
    st = json.loads(sf.read_text())
    req = st.get('requires', [])
    intro = st.get('introduces', [])

    for i in req + intro:
        if i not in by_id:
            err.append(f"{sf.name}: declares unknown character '{i}'")
    for i in set(req) & set(intro):
        err.append(f"{sf.name}: '{i}' is in both requires[] and introduces[]")

    # `introduces` is for glue only: anything castable has to be earned in play
    for i in intro:
        if i in by_id and by_id[i].get('castable', True):
            err.append(f"{sf.name}: introduces castable character '{by_id[i]['char']}' "
                       f"-- only glue characters may be met inside a story")

    allowed = {by_id[i]['char'] for i in req + intro if i in by_id}
    for pi, page in enumerate(st.get('pages', [])):
        for line in page.get('text', []):
            for ch in line:
                if ch.strip() and ch not in allowed:
                    err.append(f"{sf.name} page {pi+1}: '{ch}' is not declared "
                               f"(add it to requires[] or introduces[])")
        n = sum(len(l) for l in page.get('text', []))
        if n > 7:
            warn.append(f"{sf.name} page {pi+1}: {n} characters; 3-7 is the target")

    # every glue character should be met by some story, or it can never be learnt
    if sf == STORY_FILES[-1]:
        met = set()
        for f2 in STORY_FILES:
            met |= set(json.loads(f2.read_text()).get('introduces', []))
        for c in chars:
            if not c.get('castable', True) and c['id'] not in met:
                err.append(f"glue character {c['char']} is never introduced by any "
                           f"story -- it could never be learnt")

# 7b. units: the curriculum is taught in small blocks, each ending in a story.
UNITS = json.loads((root / 'data/characters.json').read_text()).get('units', [])
unit_of = {c['id']: c.get('unit') for c in chars}

if not UNITS:
    err.append("characters.json has no units[]")
for c in chars:
    if not c.get('unit'):
        err.append(f"{c['char']} is in no unit")

seen_u = set()
for u in UNITS:
    if u['n'] in seen_u:
        err.append(f"duplicate unit {u['n']}")
    seen_u.add(u['n'])
    listed = [c['id'] for c in chars if c.get('unit') == u['n']]
    if sorted(listed) != sorted(u['chars']):
        err.append(f"unit {u['n']}: chars[] does not match the characters "
                   f"that claim unit {u['n']}")
    if len(u['chars']) > 7:
        warn.append(f"unit {u['n']} has {len(u['chars'])} characters; 6 is the target")

# a character must never be taught before an earlier-unit character
for c in chars:
    for other in chars:
        if (c.get('unit') or 0) < (other.get('unit') or 0) and c['order'] > other['order']:
            err.append(f"{c['char']} (unit {c['unit']}) is taught after "
                       f"{other['char']} (unit {other['unit']})")
            break

# every unit ends in exactly one story, and that story may only use characters
# from its own unit or an earlier one -- the decodable guarantee, at curriculum level
stories_by_unit = {}
for sf in STORY_FILES:
    st = json.loads(sf.read_text())
    if not st.get('unit'):
        err.append(f"{sf.name}: declares no unit")
        continue
    stories_by_unit.setdefault(st['unit'], []).append(st)
    for i in st.get('requires', []) + st.get('introduces', []):
        if unit_of.get(i) and unit_of[i] > st['unit']:
            err.append(f"{sf.name} (unit {st['unit']}) needs {i}, which is not "
                       f"taught until unit {unit_of[i]}")

for u in UNITS:
    got = stories_by_unit.get(u['n'], [])
    if len(got) != 1:
        err.append(f"unit {u['n']} has {len(got)} stories; it needs exactly one")
    elif got[0]['title'] != u['story']:
        err.append(f"unit {u['n']}: characters.json says the story is "
                   f"'{u['story']}' but {got[0]['id']} is titled '{got[0]['title']}'")

# 8. distractors: every character needs decoys, and none may be its own
curriculum = {c['char'] for c in chars}
for c in chars:
    conf = c.get('confusables', [])
    if c['char'] in conf:
        err.append(f"{c['char']} lists itself as a confusable")
    if len(set(conf) - curriculum) == 0:
        err.append(f"{c['char']} has no out-of-curriculum confusables -> no decoys to draw")
    if len(conf) < 3:
        warn.append(f"{c['char']} has only {len(conf)} confusables; 4+ gives the decoy pool room")

# 9. the fizzle path must exist -- a decoy cast must never be a dead tap
if not rules.get('fizzle', {}).get('variants'):
    err.append("cast-rules.json has no `fizzle` variants: casting a decoy would do nothing")

# 10. the story index must match what is on disk, or a story silently vanishes
idx_path = root / 'data/stories/index.json'
if not idx_path.exists():
    err.append("data/stories/index.json is missing: no story would load")
else:
    listed = set(json.loads(idx_path.read_text()).get('stories', []))
    on_disk = {f.name for f in STORY_FILES}
    for miss in sorted(on_disk - listed):
        err.append(f"{miss} exists but is not listed in data/stories/index.json")
    for ghost in sorted(listed - on_disk):
        err.append(f"index.json lists {ghost}, which does not exist")

# 10b. a unit must be playable in the room it declares
# Picking 第五关 used to leave you in the house holding 鱼 with no fish in it.
# A character the kid cannot use is worse than one they have not met, so the
# declaration is proved rather than trusted: every object a unit's characters
# reach for has to be standing in that unit's room. Rules targeting `any` are
# skipped -- 大 小 多 少 work on whatever is there and constrain nothing.
for u in UNITS:
    sc_id = u.get('scene')
    if not sc_id:
        err.append(f"unit {u.get('n')} declares no scene")
        continue
    if sc_id not in SCENES:
        err.append(f"unit {u.get('n')} declares scene '{sc_id}', which does not exist")
        continue
    objs = SCENES[sc_id]['objects']
    have_ids = {o['id'] for o in objs}
    have_tags = {t for o in objs for t in o.get('tags', [])}
    in_unit = set(u['chars'])
    for r in rules['rules']:
        if r['char'] not in in_unit:
            continue
        t = r.get('target', {})
        if t.get('id') and t['id'] not in have_ids:
            err.append(f"unit {u['n']} ({u['name']}) is played in {sc_id}, but "
                       f"{r['char']} targets object '{t['id']}', which is not there")
        if t.get('tag') and t['tag'] not in have_tags:
            err.append(f"unit {u['n']} ({u['name']}) is played in {sc_id}, but "
                       f"{r['char']} targets tag '{t['tag']}', which nothing there has")

# 11. the offline manifest must match what is on disk, or the app breaks offline
sw_path = root / 'sw-assets.json'
if not sw_path.exists():
    err.append("sw-assets.json is missing: run scripts/gen-sw-manifest.py")
else:
    # Check WITHOUT writing. Regenerating in place made this fail exactly once
    # and pass ever after -- so a re-run "fixed" it, and a manifest could be
    # left out of a commit with a green suite. A check that repairs the thing
    # it checks cannot fail twice, which is the same disease as a test that
    # cannot fail at all (CLAUDE.md, bug table).
    import subprocess as _sp, tempfile, shutil
    with tempfile.TemporaryDirectory() as tmp:
        keep = pathlib.Path(tmp) / "sw-assets.json"
        shutil.copy2(sw_path, keep)
        _sp.run(['python3', str(root / 'scripts' / 'gen-sw-manifest.py')],
                capture_output=True)
        fresh = sw_path.read_text()
        stale = keep.read_text() != fresh
        shutil.copy2(keep, sw_path)          # put the repo back as we found it
    if stale:
        err.append("sw-assets.json is stale -- run scripts/gen-sw-manifest.py "
                   "and commit the result")

for w in warn: print(f"  warn: {w}")
for e in err:  print(f"  FAIL: {e}")
pool = sorted({g for c in chars for g in c.get('confusables', [])} - curriculum)
stories = STORY_FILES
print(f"\n{len(chars)} characters, {len(rules['rules'])} cast rules, "
      f"{sum(len(r['variants']) for r in rules['rules'])} variants, "
      f"{sum(len(s2['objects']) for s2 in SCENES.values())} objects in "
      f"{len(SCENES)} scenes, "
      f"{len(pool)} decoys, {len(stories)} stories, "
      f"{len(UNITS)} units of {'/'.join(str(len(u['chars'])) for u in UNITS)}")
print("FAILED" if err else "OK")
sys.exit(1 if err else 0)
