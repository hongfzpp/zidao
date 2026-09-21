/* PURE. Which room palette is in play.

   Each unit has its own look, so finishing one is visible before the parent
   panel is ever opened: the room changes. The six read as a day passing, which
   gives the progression a shape a small child can follow without being told.

   The scene decides the room's materials (a kitchen floor is tiled, a house
   floor is boards); the unit decides its light. */

export const DEFAULT_UNIT = 1;

/** The unit the kid is currently working in: the furthest one they have reached. */
export function currentUnit (chars, owned) {
  let n = DEFAULT_UNIT;
  for (const id of owned || []) {
    const u = chars.find(c => c.id === id)?.unit;
    if (u && u > n) n = u;
  }
  return n;
}

export function themeFor (units, n) {
  if (!units || !units.length) return null;
  const exact = units.find(u => u.n === n);
  if (exact?.theme) return exact.theme;
  // an unnumbered or theme-less unit falls back to the last one that has a theme
  const withTheme = units.filter(u => u.theme);
  return withTheme.length ? withTheme[Math.min(n, withTheme.length) - 1].theme : null;
}

/** CSS custom properties for a theme, merged with a scene's own materials. */
export function cssVars (theme, scene = {}) {
  if (!theme) return {};
  const out = {
    '--wall': theme.wall,
    '--wall-2': theme.wall2,
    '--floor': scene.floor || theme.floor,
    '--floor-2': scene.floor2 || theme.floor2,
    '--room-tint': theme.tint || 'transparent'
  };
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
