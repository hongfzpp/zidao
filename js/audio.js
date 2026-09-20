/* Voice playback. Decoded into AudioBuffers on the shared AudioContext so
   latency is low and iOS behaves. DESIGN.md §13.1: audio must be unlocked by
   a user gesture on first load -- that's what the tap-to-start screen is for. */

import { initSfx, resumeSfx } from './sfx.js';

const buffers = new Map();
let ctx = null;
let voiceGain = null;
let lastPlayed = null;

export async function initAudio () {
  ctx = initSfx();
  voiceGain = ctx.createGain();
  voiceGain.gain.value = 1.0;
  voiceGain.connect(ctx.destination);
  // Unlock: play one silent buffer inside the gesture.
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, 22050);
  s.connect(ctx.destination);
  s.start(0);
  await ctx.resume();
}

export async function loadVoice (ids) {
  await Promise.all(ids.map(async id => {
    if (buffers.has(id)) return;
    try {
      const res = await fetch(`audio/${id}.m4a`);
      if (!res.ok) throw new Error(res.status);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      buffers.set(id, buf);
    } catch (e) {
      console.warn('[audio] missing', id, e.message);
    }
  }));
}

/** Play a character's recorded word. `id` is the character id ('da'), not the glyph. */
export function say (id) {
  if (!ctx || !buffers.has(id)) return 0;
  resumeSfx();
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(id);
  src.connect(voiceGain);
  src.start();
  lastPlayed = id;
  return buffers.get(id).duration * 1000;
}

export const lastSpoken = () => lastPlayed;
