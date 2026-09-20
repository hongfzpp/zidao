/* PURE. Judging whether the child said a character correctly.

   This is harder than it looks and the difficulty shapes the whole feature.

   Single-character Mandarin is close to the worst case for speech recognition:
   no surrounding context to disambiguate, and Chinese is homophone-dense. A
   child saying 大 ("dà") will frequently come back from the recogniser as 打 or
   答 — a *correct pronunciation* transcribed as a different character. Judging
   on character identity alone would mark a child wrong for saying the right
   thing, which is the worst failure this app could have.

   So a match is accepted when any recogniser alternative contains the target
   character OR one of its authored homophones. Homophones deliberately exclude
   other characters in the curriculum: 窗/床 and 水/睡 differ only by tone, and
   accepting one for the other would teach nothing.

   Recognition is never a gate. A miss produces encouragement, never a failure —
   see DESIGN.md §16, which is why this stayed out of v1. */

// Keep only CJK ideographs. Enumerating punctuation is a losing game -- the
// recogniser emits full-width commas, ASCII commas, spaces and ideographic
// spaces interchangeably -- and the matcher only ever cares about characters.
const clean = s => String(s || '').replace(/[^\u4e00-\u9fff]/g, '');

/** Every string worth checking: each alternative, plus a concatenation. */
export function normalise (transcripts) {
  const list = (transcripts || []).map(clean).filter(Boolean);
  return list.length > 1 ? [...list, list.join('')] : list;
}

/** Characters we would accept as evidence that `def` was pronounced right. */
export function acceptedFor (def) {
  return [def.char, ...(def.homophones || [])];
}

/**
 * Which of `targets` (glyphs) the child appears to have said.
 * Returns { said: string[], heard: string } — `heard` is the best transcript,
 * kept for the parent panel, never shown to the child.
 */
export function matchSpoken (targets, transcripts, chars) {
  const texts = normalise(transcripts);
  const said = [];
  for (const glyph of targets) {
    const def = chars.find(c => c.char === glyph);
    if (!def) continue;
    const accepted = acceptedFor(def);
    if (texts.some(t => accepted.some(a => t.includes(a)))) said.push(glyph);
  }
  return { said, heard: texts[0] || '' };
}

/** 0–1. Used only to pick the celebration, never to pass or fail. */
export function score (targets, said) {
  if (!targets.length) return 0;
  return said.length / targets.length;
}

/**
 * How the app should respond. There is no 'wrong' — the worst outcome is
 * 'again', which is an invitation, not a verdict.
 */
export function verdict (targets, said) {
  const s = score(targets, said);
  if (s >= 1) return 'all';
  if (s > 0) return 'some';
  return 'again';
}
