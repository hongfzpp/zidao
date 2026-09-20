/* PURE. Which story can be read, and whether it is honest.

   DESIGN.md §6.5: a story is composed EXCLUSIVELY of characters the child
   already owns. That guarantee is the entire value of a decodable reader — the
   kid reads a whole page unaided because we controlled the vocabulary — and it
   is very easy to break by hand, so it is enforced in code and in the build. */

/** Every character used anywhere in a story's pages. */
export function storyGlyphs (story) {
  const out = new Set();
  for (const page of story.pages || []) {
    for (const line of page.text || []) {
      for (const ch of line) if (ch.trim()) out.add(ch);
    }
  }
  return [...out];
}

/**
 * Does the story only use characters it declares?
 * Returns the offending glyphs — empty means it is sound.
 */
export function undeclaredGlyphs (story, chars) {
  const allowed = new Set(
    [...(story.requires || []), ...(story.introduces || [])]
      .map(id => chars.find(c => c.id === id)?.char)
      .filter(Boolean));
  return storyGlyphs(story).filter(g => !allowed.has(g));
}

/** A story unlocks only when every required character is known. */
export function isUnlocked (story, owned) {
  return (story.requires || []).every(id => owned.includes(id));
}

export function unlockedStories (stories, owned) {
  return stories.filter(s => isUnlocked(s, owned));
}

/** The next story worth offering: unlocked, and not yet read. */
export function nextUnread (stories, owned, read = []) {
  return unlockedStories(stories, owned).find(s => !read.includes(s.id)) || null;
}

/** Glue characters a story teaches that the kid does not have yet. */
export function newGlue (story, owned) {
  return (story.introduces || []).filter(id => !owned.includes(id));
}

/** Which required characters the kid is still missing for this story. */
export function missingFor (story, owned) {
  return (story.requires || []).filter(id => !owned.includes(id));
}

/**
 * The whole shelf, with why each story is or isn't readable.
 * status: 'read' | 'ready' | 'locked'
 */
export function shelf (stories, owned, read = []) {
  return stories.map(s => {
    const missing = missingFor(s, owned);
    return {
      story: s,
      missing,
      status: missing.length ? 'locked' : (read.includes(s.id) ? 'read' : 'ready')
    };
  });
}

/** The story the kid is closest to unlocking — what to work toward. */
export function closestLocked (stories, owned) {
  return shelf(stories, owned)
    .filter(e => e.status === 'locked')
    .sort((a, b) => a.missing.length - b.missing.length)[0] || null;
}
