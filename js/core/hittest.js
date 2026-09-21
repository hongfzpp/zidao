/* PURE. Deciding which object a card was dropped on.

   Two things make the naive "smallest box containing the point" wrong:

   An OPEN DOOR is rotated nearly edge-on, so its bounding box collapses to a
   sliver and becomes almost impossible to hit -- you can open a door and then
   not be able to close it. A hit box therefore has a floor: it is never
   narrower than a fraction of the object's own size, whatever the animation is
   doing to it.

   And things OVERLAP -- a giant cat covers half the room, creatures wander into
   each other, 多 makes a thing wider. Picking the smallest box means aiming
   carefully at something and hitting whatever else happens to be smaller.
   Picking the NEAREST CENTRE matches what the kid was aiming at. */

export const MIN_HIT_RATIO = 0.55;   // of the object's own size
export const PAD = 8;

/** Grow a rect about its centre until it is at least minW x minH. */
export function expandRect (rect, minW, minH) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const w = Math.max(rect.width, minW || 0);
  const h = Math.max(rect.height, minH || 0);
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, cx, cy };
}

export function hitBox (rect, size, { ratio = MIN_HIT_RATIO, pad = PAD } = {}) {
  const min = (size || 0) * ratio;
  const r = expandRect(rect, min, min);
  return { left: r.left - pad, top: r.top - pad,
           width: r.width + pad * 2, height: r.height + pad * 2,
           cx: r.cx, cy: r.cy };
}

export const contains = (box, x, y) =>
  x >= box.left && x <= box.left + box.width &&
  y >= box.top && y <= box.top + box.height;

/**
 * Which candidate was aimed at.
 * `candidates`: [{ id, rect, size }]. Returns the id, or null.
 */
export function pickTarget (candidates, x, y, opts) {
  let best = null, bestDist = Infinity;
  for (const c of candidates || []) {
    const box = hitBox(c.rect, c.size, opts);
    if (!contains(box, x, y)) continue;
    const d = Math.hypot(x - box.cx, y - box.cy);
    if (d < bestDist) { best = c.id; bestDist = d; }
  }
  return best;
}

/* ---------- keeping things apart ---------- */

/** Do two objects on a horizontal line crowd each other? */
export function overlapsAt (x, halfWidth, others, gap = 1.5) {
  return others.some(o =>
    Math.abs(x - o.x) < (halfWidth + o.halfWidth + gap));
}

/**
 * Where a wandering object may move to: its preferred spot if that is clear,
 * otherwise the nearest clear spot, otherwise stay put.
 */
export function clearSpot (want, halfWidth, others, { min = 8, max = 92, gap = 1.5 } = {}) {
  const inBounds = v => Math.max(min, Math.min(max, v));
  const target = inBounds(want);
  if (!overlapsAt(target, halfWidth, others, gap)) return target;
  for (let step = 1; step <= 12; step++) {
    for (const cand of [target + step, target - step]) {
      const v = inBounds(cand);
      if (!overlapsAt(v, halfWidth, others, gap)) return v;
    }
  }
  return null;                       // nowhere to go: stay where you are
}
