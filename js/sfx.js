/* Synthesized sound effects. No audio assets needed.
   DESIGN.md §11: sound design carries a lot of the "fun" load and is cheaper
   than art. Each sound is a tiny Web Audio patch. */

let ctx = null;
let master = null;

export function initSfx () {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.55;
  // Limiter + makeup gain. The "star" sounds (mew, dooropen) are deliberately
  // hot so they stand out; the limiter squashes their peaks and the makeup gain
  // lifts the result, which raises perceived loudness (RMS) without the crunch
  // of clipping. Measured at the destination: peaks must stay under 1.0.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 20;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.1;

  // Soft clipper. The compressor alone does not catch sawtooth transients --
  // measured peaks still hit 1.35 and hard-clipped, which is what made these
  // sounds harsh rather than loud. A tanh curve saturates smoothly and can
  // never exceed 1.0, so the patches can be driven hard and stay clean.
  const shaper = ctx.createWaveShaper();
  const N = 4096, curve = new Float32Array(N), drive = 1.7;
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  shaper.curve = curve;
  shaper.oversample = '4x';

  master.connect(limiter);
  limiter.connect(makeup);
  makeup.connect(shaper);
  shaper.connect(ctx.destination);
  return ctx;
}

export function resumeSfx () { if (ctx && ctx.state === 'suspended') ctx.resume(); }

const now = () => ctx.currentTime;

function env (node, { a = 0.005, d = 0.2, peak = 1, sustain = 0, r = 0.05, t = null } = {}) {
  const t0 = t ?? now();
  const g = node.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
  g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
}

function osc (type, freq, opts = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now());
  o.connect(g); g.connect(opts.dest || master);
  env(g, opts);
  o.start();
  o.stop(now() + (opts.a ?? 0.005) + (opts.d ?? 0.2) + (opts.r ?? 0.05) + 0.05);
  return { o, g };
}

let noiseBuf = null;
function noise (dur = 0.4, opts = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = opts.filter || 'bandpass';
  filt.frequency.setValueAtTime(opts.freq ?? 1000, now());
  filt.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  src.connect(filt); filt.connect(g); g.connect(master);
  env(g, { a: opts.a ?? 0.01, d: opts.d ?? dur, r: opts.r ?? 0.08, peak: opts.peak ?? 0.5 });
  if (opts.sweepTo) filt.frequency.exponentialRampToValueAtTime(opts.sweepTo, now() + dur);
  src.start();
  src.stop(now() + dur + 0.2);
  return { src, filt, g };
}

const R = (a, b) => a + Math.random() * (b - a);

const PATCHES = {
  whoomph () {                                    // 大
    const { o } = osc('sine', 150, { a: 0.01, d: 0.5, r: 0.2, peak: 0.85 });
    o.frequency.exponentialRampToValueAtTime(48, now() + 0.5);
    noise(0.45, { freq: 320, sweepTo: 90, q: 0.7, peak: 0.28 });
  },
  squeak () {                                     // 小
    const { o } = osc('sine', 500, { a: 0.008, d: 0.22, r: 0.06, peak: 0.42 });
    o.frequency.exponentialRampToValueAtTime(R(1500, 2100), now() + 0.2);
  },
  pop () {
    const { o } = osc('sine', 700, { a: 0.003, d: 0.09, r: 0.03, peak: 0.6 });
    o.frequency.exponentialRampToValueAtTime(190, now() + 0.09);
  },
  boing () {
    const { o } = osc('triangle', 260, { a: 0.005, d: 0.38, r: 0.08, peak: 0.42 });
    const t = now();
    [520, 300, 610, 340].forEach((f, i) =>
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07 * (i + 1)));
  },
  creak () {
    // peak has to be large: a Q=7 bandpass throws away most of the noise energy,
    // and at peak 0.3 this measured rms 0.0036 -- inaudible in practice.
    const n = noise(0.6, { freq: 420, sweepTo: 1500, q: 7, peak: 2.6, d: 0.55 });
    n.filt.Q.value = 9;
  },
  thud () {
    const { o } = osc('sine', 120, { a: 0.004, d: 0.22, r: 0.08, peak: 0.8 });
    o.frequency.exponentialRampToValueAtTime(40, now() + 0.2);
    noise(0.16, { freq: 180, q: 0.6, peak: 0.35 });
  },
  splash () {
    noise(0.55, { filter: 'highpass', freq: 600, sweepTo: 4200, peak: 0.42, d: 0.5 });
    const { o } = osc('sine', 900, { a: 0.01, d: 0.3, r: 0.1, peak: 0.2 });
    o.frequency.exponentialRampToValueAtTime(280, now() + 0.3);
  },
  drip () {
    const { o } = osc('sine', 1200, { a: 0.003, d: 0.12, r: 0.05, peak: 0.34 });
    o.frequency.exponentialRampToValueAtTime(420, now() + 0.12);
  },
  fire () {
    noise(0.9, { filter: 'bandpass', freq: 900, sweepTo: 340, q: 0.8, peak: 0.4, d: 0.85 });
    for (let i = 0; i < 5; i++) setTimeout(() => {
      if (!ctx) return;
      noise(0.07, { filter: 'bandpass', freq: R(1200, 3200), q: 5, peak: 0.16, d: 0.06 });
    }, R(40, 700));
  },
  thunder () {
    noise(1.5, { filter: 'lowpass', freq: 400, sweepTo: 70, peak: 0.75, d: 1.4, a: 0.05 });
    const { o } = osc('sine', 70, { a: 0.06, d: 1.1, r: 0.35, peak: 0.6 });
    o.frequency.exponentialRampToValueAtTime(30, now() + 1.1);
  },
  purr () {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 58;
    lfo.type = 'sine'; lfo.frequency.value = 26; lg.gain.value = 26;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340;
    o.connect(f); f.connect(g); g.connect(master);
    env(g, { a: 0.1, d: 0.9, r: 0.3, peak: 0.3 });
    o.start(); lfo.start();
    o.stop(now() + 1.4); lfo.stop(now() + 1.4);
  },
  sneeze () {
    noise(0.14, { filter: 'bandpass', freq: 700, q: 1.4, peak: 0.3, d: 0.12 });
    setTimeout(() => {
      if (!ctx) return;
      noise(0.34, { filter: 'highpass', freq: 1400, sweepTo: 600, peak: 0.55, d: 0.3 });
      const { o } = osc('sawtooth', 620, { a: 0.006, d: 0.26, r: 0.08, peak: 0.22 });
      o.frequency.exponentialRampToValueAtTime(180, now() + 0.26);
    }, 190);
  },
  yawn () {
    const { o } = osc('sine', 230, { a: 0.18, d: 0.6, r: 0.22, peak: 0.26 });
    o.frequency.exponentialRampToValueAtTime(140, now() + 0.7);
  },
  zap () {
    const { o } = osc('square', 1500, { a: 0.002, d: 0.07, r: 0.03, peak: 0.24 });
    o.frequency.exponentialRampToValueAtTime(260, now() + 0.07);
    noise(0.09, { filter: 'highpass', freq: 3000, peak: 0.22, d: 0.08 });
  },
  wind () {
    noise(1.4, { filter: 'bandpass', freq: 500, sweepTo: 1300, q: 0.6, peak: 0.26, d: 1.3, a: 0.25 });
  },
  chime () {
    [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => {
      if (!ctx) return;
      osc('sine', f, { a: 0.006, d: 0.5, r: 0.25, peak: 0.24 });
    }, i * 85));
  },
  mew () {                                        // 猫 on the cat
    // A meow is a two-part vowel: "mee" rising, then "ow" falling, with a live
    // wobble. Built on a resonant LOWPASS rather than narrow bandpasses --
    // bandpass kills the body and was why this sounded thin and far away.
    const t = now();
    const base = R(500, 580);                     // never twice the same
    const len = R(0.72, 0.92);

    const out = ctx.createGain();
    out.connect(master);
    env(out, { a: 0.025, d: len * 0.62, r: len * 0.34, peak: 1.8 });

    const contour = (o) => {
      o.frequency.setValueAtTime(base * 0.70, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.30, t + 0.13);  // "mee"
      o.frequency.setValueAtTime(base * 1.30, t + len * 0.36);
      o.frequency.exponentialRampToValueAtTime(base * 0.62, t + len);   // "ow"
    };

    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.detune.value = -9;
    contour(o1); contour(o2);

    const vib = ctx.createOscillator(); vib.type = 'sine';
    vib.frequency.value = R(5.5, 7.5);
    const vibG = ctx.createGain(); vibG.gain.value = base * 0.045;
    vib.connect(vibG); vibG.connect(o1.frequency); vibG.connect(o2.frequency);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 10;
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(2900, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(950, t + len);

    const o2g = ctx.createGain(); o2g.gain.value = 0.28;   // a little grit
    o1.connect(lp); o2.connect(o2g); o2g.connect(lp);
    lp.connect(out);

    o1.start(); o2.start(); vib.start();
    const stop = t + len + 0.25;
    o1.stop(stop); o2.stop(stop); vib.stop(stop);
  },

  dooropen () {                                   // 门 on the door
    // A squeaky old door is STICK-SLIP friction: the hinge grabs and lets go
    // dozens of times a second. That irregularity is the whole character --
    // a smooth pitch ramp reads as a groan, not a squeak. So the pitch is a
    // jittery upward random walk and the amplitude chatters, both scheduled as
    // discrete steps rather than smooth ramps. High and thin, not low.
    const t = now();
    const len = R(1.05, 1.35);
    const base = R(950, 1150);
    const t0 = t + 0.05;

    noise(0.045, { filter: 'highpass', freq: 3200, peak: 0.85, d: 0.035 });  // latch

    const out = ctx.createGain();
    out.connect(master);
    env(out, { a: 0.09, d: len * 0.66, r: 0.32, peak: 3.6, t: t0 });

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t0);
    const STEPS = 26;
    for (let i = 1; i <= STEPS; i++) {
      const rise = 1 + 0.8 * (i / STEPS);          // drifts up as it swings...
      // short ramps, not jumps: instantaneous steps are discontinuities, and
      // measured as broadband hash (spectral centroid 9.5kHz -- a hiss, not a
      // squeak). Ramping keeps the irregularity without the artefacts.
      o.frequency.linearRampToValueAtTime(base * rise * R(0.84, 1.18),
                                          t0 + len * i / STEPS);
    }                                              // ...but never smoothly

    // the hinge grabbing and letting go
    const chatter = ctx.createGain();
    chatter.gain.setValueAtTime(1, t0);
    const CHATTER = 48;
    for (let i = 0; i < CHATTER; i++) {
      chatter.gain.linearRampToValueAtTime(R(0.3, 1), t0 + len * i / CHATTER);
    }

    const bp = ctx.createBiquadFilter();
    // Q was 10: a narrow bandpass throws away most of the squeal's energy, which
    // let the closing thud dominate and pulled the whole sound down to a 584Hz
    // boom. Wider passes more of the shriek through.
    bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(base * 1.8, t0);
    bp.frequency.exponentialRampToValueAtTime(base * 3.0, t0 + len);

    // keep it a squeak rather than a hiss
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.7;

    o.connect(bp); bp.connect(chatter); chatter.connect(lp); lp.connect(out);
    o.start(t0); o.stop(t0 + len + 0.25);

    setTimeout(() => {                             // it comes to rest
      if (!ctx) return;
      const { o: th } = osc('sine', 130, { a: 0.01, d: 0.22, r: 0.1, peak: 0.5 });
      th.frequency.exponentialRampToValueAtTime(58, now() + 0.22);
      noise(0.1, { filter: 'lowpass', freq: 600, peak: 0.28, d: 0.08 });
    }, (len + 0.08) * 1000);
  },

  woof () {                                       // 狗 on the dog
    // Two short barks. Lower and blunter than the meow: a falling pitch with a
    // hard attack, not a vowel slide.
    const bark = (at, base) => setTimeout(() => {
      if (!ctx) return;
      const t = now();
      const out = ctx.createGain(); out.connect(master);
      env(out, { a: 0.006, d: 0.11, r: 0.07, peak: 1.7 });
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.75, t + 0.14);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 7;
      lp.frequency.setValueAtTime(1700, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.14);
      o.connect(lp); lp.connect(out);
      o.start(); o.stop(t + 0.25);
      noise(0.05, { filter: 'bandpass', freq: 900, q: 1.2, peak: 0.5, d: 0.04 });
    }, at);
    bark(0, R(300, 350));
    bark(R(150, 200), R(270, 320));
  },

  springs () {                                    // 床 on the bed
    const t = now();
    const { o } = osc('triangle', 220, { a: 0.005, d: 0.4, r: 0.12, peak: 0.9 });
    [430, 250, 500, 290, 520].forEach((f, i) =>
      o.frequency.exponentialRampToValueAtTime(f, t + 0.075 * (i + 1)));
    noise(0.25, { filter: 'bandpass', freq: 1800, q: 6, peak: 0.35, d: 0.22 });
  },

  lampclick () {                                  // 灯 on the lamp
    noise(0.03, { filter: 'highpass', freq: 4000, peak: 0.9, d: 0.025 });
    setTimeout(() => {
      if (!ctx) return;
      osc('sine', 1320, { a: 0.008, d: 0.35, r: 0.2, peak: 0.55 });
      osc('sine', 1980, { a: 0.008, d: 0.3, r: 0.18, peak: 0.28 });
    }, 55);
  },

  wingflap () {                                   // 飞
    // Beats that speed up and fade, like something getting airborne.
    let t = 0;
    for (let i = 0; i < 7; i++) {
      const at = t;
      setTimeout(() => {
        if (!ctx) return;
        noise(0.11, { filter: 'bandpass', freq: R(280, 620), q: 1.4,
                      peak: 0.85 * (1 - i / 9), d: 0.09 });
      }, at);
      t += 155 - i * 12;                          // accelerating
    }
    const { o } = osc('sine', 300, { a: 0.05, d: 0.5, r: 0.25, peak: 0.35 });
    o.frequency.exponentialRampToValueAtTime(620, now() + 0.6);
  },

  snore () {                                      // 睡
    const t = now();
    const { o } = osc('sawtooth', 90, { a: 0.18, d: 0.5, r: 0.3, peak: 0.5 });
    o.frequency.exponentialRampToValueAtTime(58, t + 0.8);
  },

  womp () {                                       // a decoy: nothing happens
    const { o } = osc('triangle', 300, { a: 0.01, d: 0.3, r: 0.1, peak: 0.3 });
    o.frequency.exponentialRampToValueAtTime(110, now() + 0.3);
    noise(0.2, { filter: 'lowpass', freq: 600, sweepTo: 200, peak: 0.12, d: 0.18 });
  },
  sparkle () {
    for (let i = 0; i < 4; i++) setTimeout(() => {
      if (!ctx) return;
      osc('sine', R(1400, 2800), { a: 0.004, d: 0.16, r: 0.08, peak: 0.16 });
    }, i * 55);
  }
};

export function sfx (id) {
  if (!ctx) return;
  resumeSfx();
  const p = PATCHES[id];
  if (!p) return;
  try { p(); } catch (e) { /* never let a sound break a cast */ }
}
