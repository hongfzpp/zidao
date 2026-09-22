/* PURE. Which room a unit is played in, and what has to be standing in it.

   Each unit teaches characters that act on particular things: 鱼 蛋 米 肉 菜
   need food to act on, 床 needs a bed. Picking a unit in the parent panel used
   to change nothing at all -- you could choose 第五关 and be left in the house,
   holding 鱼, with no fish anywhere in the room. A character you cannot use is
   worse than a character you have not met.

   So a unit declares the scene it is played in, and `missingTargets` proves the
   declaration is true: every object that unit's characters reach for must
   actually be in that room. The validator runs it over the whole curriculum, so
   adding a character that targets something the room lacks fails the build
   rather than stranding a child. */

/** The scene a unit is played in. Falls back rather than throwing: a unit with
    no declared scene keeps whatever room the child is already standing in. */
export function unitScene (units, n, fallback = null) {
  return (units || []).find(u => u.n === n)?.scene || fallback;
}

/**
 * Everything the given characters reach for, as object ids and object tags.
 *
 * Rules targeting `any` are ignored on purpose: 大 小 多 少 一 二 三 个 work on
 * whatever is present, so they never constrain which room a unit needs.
 */
export function unitTargets (rules, charIds) {
  const want = new Set(charIds || []);
  const ids = new Set(), tags = new Set();
  for (const r of rules || []) {
    if (!want.has(r.char)) continue;
    if (r.target?.id) ids.add(r.target.id);
    if (r.target?.tag) tags.add(r.target.tag);
  }
  return { ids: [...ids], tags: [...tags] };
}

/** Which of `targets` no object in this scene satisfies. Empty means playable. */
export function missingTargets (sceneObjects, targets) {
  const objs = sceneObjects || [];
  const haveIds = new Set(objs.map(o => o.id));
  const haveTags = new Set(objs.flatMap(o => o.tags || []));
  return [
    ...(targets?.ids || []).filter(id => !haveIds.has(id)),
    ...(targets?.tags || []).filter(t => !haveTags.has(t))
  ];
}

/** The unit a character belongs to, or null for glue that belongs to none. */
export function unitOf (chars, id) {
  return (chars || []).find(c => c.id === id)?.unit ?? null;
}

/** The characters of one unit that the kid owns and can actually cast. */
export function unitCards (chars, units, n, owned) {
  const inUnit = (units || []).find(u => u.n === n)?.chars || [];
  const has = new Set(owned || []);
  return inUnit.filter(id =>
    has.has(id) && (chars || []).find(c => c.id === id)?.castable !== false);
}
