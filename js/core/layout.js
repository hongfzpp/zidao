/* PURE. Card sizing.
   A kid should never have to scroll to find a character, so cards shrink to
   fit. Below a legible minimum we WRAP to a second row rather than scroll: a
   second row is visible, a scrolled-off card is not. */

export const CARD = Object.freeze({ pad: 24, max: 96, min: 48, maxRows: 3 });

const gapFor = perRow => (perRow > 10 ? 10 : 16);

export function layoutFor (n, hostWidth, cfg = CARD) {
  if (n <= 0) return { size: cfg.max, gap: 16, rows: 1, perRow: 0 };

  for (let rows = 1; rows <= cfg.maxRows; rows++) {
    const perRow = Math.ceil(n / rows);
    const gap = gapFor(perRow);
    const avail = hostWidth - cfg.pad * 2 - gap * (perRow - 1);
    const size = Math.floor(avail / perRow);
    if (size >= cfg.min) {
      return { size: Math.min(cfg.max, size), gap, rows, perRow };
    }
  }

  // Extremely narrow: fit as many minimum-size cards per row as possible.
  const gap = 10;
  const perRow = Math.max(1, Math.floor((hostWidth - cfg.pad * 2 + gap) / (cfg.min + gap)));
  return { size: cfg.min, gap, rows: Math.ceil(n / perRow), perRow };
}

/** Width the widest row will occupy. Tests assert this never exceeds the host. */
export function rowWidth (n, layout, cfg = CARD) {
  if (n <= 0) return 0;
  const perRow = Math.min(layout.perRow || n, n);
  return perRow * layout.size + (perRow - 1) * layout.gap + cfg.pad * 2;
}
