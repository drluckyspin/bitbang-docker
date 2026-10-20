/**
 * Synthesizes the teaser's music and foley into public/audio: a 57-second electronic bed at 90 BPM whose
 * sections follow the story, laptop and phone typing, soft camera swooshes, a phone buzz, the ping of the
 * /go-remote pulse and the pop of a message landing. Nothing is sampled, and a seeded generator makes every
 * run write identical files. Run with `npm run audio`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
const BEAT = 60 / 90;
/** The teaser's 1700 frames at 30 fps; src/timeline.ts adds them up. */
const LENGTH = 1700 / 30;
const TAU = Math.PI * 2;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const rng = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const random = rng(20261019);
const noise = () => random() * 2 - 1;

class Track {
  constructor(seconds) {
    this.l = new Float32Array(Math.ceil(seconds * SR));
    this.r = new Float32Array(this.l.length);
  }
  add(i, l, r = l) {
    if (i >= 0 && i < this.l.length) {
      this.l[i] += l;
      this.r[i] += r;
    }
  }
}

/** Zavalishin's topology-preserving state-variable filter. */
class Filter {
  s1 = 0;
  s2 = 0;
  g = 0;
  k = 1.414;
  lp = 0;
  bp = 0;
  hp = 0;
  tune(cutoff, q = 0.707) {
    this.g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
    this.k = 1 / q;
  }
  run(x) {
    const { g, k } = this;
    this.hp = (x - (k + g) * this.s1 - this.s2) / (1 + k * g + g * g);
    this.bp = g * this.hp + this.s1;
    this.s1 = g * this.hp + this.bp;
    this.lp = g * this.bp + this.s2;
    this.s2 = g * this.bp + this.lp;
    return this;
  }
}

const blep = (t, dt) => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};

const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

// ---------------------------------------------------------------------------------------------------------
// Instruments. Each writes one note into a dry track and, optionally, a reverb send.

const pad = (dry, send, start, length, midi, gain, cutoff) => {
  const attack = 1.1;
  const release = 1.8;
  const n = Math.ceil((length + release) * SR);
  const i0 = Math.round(start * SR);
  const voices = [-0.07, 0, 0.07].map((cents) => ({ f: mtof(midi + cents), phase: random() }));
  const fl = new Filter();
  const fr = new Filter();
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    if (j % 32 === 0) {
      const c = cutoff(start + t) * (1 + 0.08 * Math.sin(TAU * 0.13 * (start + t) + midi));
      fl.tune(c, 0.8);
      fr.tune(c * 1.04, 0.8);
    }
    const out = [0, 0, 0];
    voices.forEach((v, k) => {
      const dt = v.f / SR;
      v.phase += dt;
      if (v.phase >= 1) v.phase -= 1;
      out[k] = 2 * v.phase - 1 - blep(v.phase, dt);
    });
    const a = t < attack ? Math.sin(((t / attack) * Math.PI) / 2) ** 2 : 1;
    const r = t > length ? Math.exp(-(t - length) / (release / 4)) : 1;
    const env = a * r * gain;
    const l = fl.run(out[0] + 0.5 * out[1]).lp * env;
    const rr = fr.run(out[2] + 0.5 * out[1]).lp * env;
    dry.add(i0 + j, l, rr);
    send?.add(i0 + j, l * 0.5, rr * 0.5);
  }
};

const pluck = (dry, send, start, midi, gain, position) => {
  const f = mtof(midi);
  const n = Math.ceil(1.4 * SR);
  const i0 = Math.round(start * SR);
  const [gl, gr] = pan(position);
  const tone = new Filter();
  tone.tune(3200, 0.6);
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    const index = 1.6 * Math.exp(-t / 0.08);
    const x = Math.sin(TAU * f * t + Math.sin(TAU * f * 2 * t) * index);
    const env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.32) * gain;
    const y = tone.run(x).lp * env;
    dry.add(i0 + j, y * gl, y * gr);
    send?.add(i0 + j, y * gl * 0.6, y * gr * 0.6);
  }
};

const bass = (dry, start, length, midi, gain) => {
  const f = mtof(midi);
  const n = Math.ceil((length + 0.2) * SR);
  const i0 = Math.round(start * SR);
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    const a = Math.min(1, t / 0.008);
    const d = 0.55 + 0.45 * Math.exp(-t / 0.12);
    const r = t > length ? Math.exp(-(t - length) / 0.04) : 1;
    const x = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.08 * Math.sin(TAU * 3 * f * t);
    dry.add(i0 + j, (Math.tanh(1.4 * x) / Math.tanh(1.4)) * a * d * r * gain);
  }
};

const kick = (dry, start, gain) => {
  const n = Math.ceil(0.5 * SR);
  const i0 = Math.round(start * SR);
  let phase = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    phase += (TAU * (46 + 120 * Math.exp(-t / 0.032))) / SR;
    const env = Math.min(1, t / 0.0015) * Math.exp(-t / 0.17);
    dry.add(i0 + j, (Math.sin(phase) * env + noise() * Math.exp(-t / 0.0012) * 0.12) * gain);
  }
};

const hat = (dry, start, gain, position) => {
  const n = Math.ceil(0.12 * SR);
  const i0 = Math.round(start * SR);
  const [gl, gr] = pan(position);
  const hp = new Filter();
  hp.tune(7600, 0.7);
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    const y = hp.run(noise()).hp * Math.exp(-t / 0.026) * gain;
    dry.add(i0 + j, y * gl, y * gr);
  }
};

const clap = (dry, send, start, gain) => {
  const n = Math.ceil(0.45 * SR);
  const i0 = Math.round(start * SR);
  const bp = new Filter();
  bp.tune(1500, 1.1);
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    let env = 0;
    for (const at of [0, 0.011, 0.022]) if (t >= at) env += Math.exp(-(t - at) / 0.004);
    if (t >= 0.022) env += 0.6 * Math.exp(-(t - 0.022) / 0.1);
    const y = bp.run(noise()).bp * env * gain;
    dry.add(i0 + j, y);
    send.add(i0 + j, y * 0.8);
  }
};

const riser = (dry, send, start, length, gain) => {
  const n = Math.ceil(length * SR);
  const i0 = Math.round(start * SR);
  const bp = new Filter();
  let phase = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    const p = t / length;
    if (j % 32 === 0) bp.tune(280 * 22 ** p, 2.2);
    phase += (TAU * (180 + 520 * p * p)) / SR;
    const env = p * p * (p > 0.97 ? (1 - p) / 0.03 : 1) * gain;
    const y = (bp.run(noise()).bp * 1.6 + Math.sin(phase) * 0.12) * env;
    const [gl, gr] = pan(Math.sin(TAU * 0.7 * t) * 0.5);
    dry.add(i0 + j, y * gl, y * gr);
    send.add(i0 + j, y * 0.6);
  }
};

const impact = (dry, send, start, gain) => {
  const n = Math.ceil(3 * SR);
  const i0 = Math.round(start * SR);
  const lp = new Filter();
  let phase = 0;
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    if (j % 32 === 0) lp.tune(300 + 2400 * Math.exp(-t / 0.12), 0.7);
    phase += (TAU * (36 + 70 * Math.exp(-t / 0.07))) / SR;
    const sub = Math.sin(phase) * Math.exp(-t / 0.9);
    const air = lp.run(noise()).lp * Math.exp(-t / 0.22) * 0.5;
    const y = (sub + air) * Math.min(1, t / 0.002) * gain;
    dry.add(i0 + j, y);
    send.add(i0 + j, air * gain * 0.9);
  }
};

// ---------------------------------------------------------------------------------------------------------
// Effects.

const freeverb = (send, room = 0.86, damp = 0.3) => {
  const out = new Track(send.l.length / SR);
  [send.l, send.r].forEach((input, ch) => {
    const spread = ch * 23;
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((s) => ({ buf: new Float32Array(s + spread), i: 0, store: 0 }));
    const passes = [556, 441, 341, 225].map((s) => ({ buf: new Float32Array(s + spread), i: 0 }));
    const target = ch === 0 ? out.l : out.r;
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.store = o * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of passes) {
        const o = a.buf[a.i];
        a.buf[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o - y;
      }
      target[n] = y;
    }
  });
  return out;
};

const pingPong = (src, time, feedback) => {
  const d = Math.round(time * SR);
  const out = new Track(src.l.length / SR);
  const bl = new Float32Array(src.l.length);
  const br = new Float32Array(src.l.length);
  const tone = new Filter();
  tone.tune(2600, 0.6);
  for (let i = 0; i < src.l.length; i++) {
    const ol = i >= d ? bl[i - d] : 0;
    const or = i >= d ? br[i - d] : 0;
    bl[i] = (src.l[i] + src.r[i]) * 0.5 + tone.run(or).lp * feedback;
    br[i] = ol;
    out.l[i] = ol;
    out.r[i] = or;
  }
  return out;
};

const peak = (t) => {
  let m = 0;
  for (let i = 0; i < t.l.length; i++) m = Math.max(m, Math.abs(t.l[i]), Math.abs(t.r[i]));
  return m;
};

const normalize = (t, db) => {
  const g = 10 ** (db / 20) / (peak(t) || 1);
  for (let i = 0; i < t.l.length; i++) {
    t.l[i] *= g;
    t.r[i] *= g;
  }
  return t;
};

const writeWav = (name, t) => {
  const n = t.l.length;
  const data = Buffer.alloc(44 + n * 4);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, t.l[i])) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, t.r[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(join(OUT, name), data);
  console.log(`wrote public/audio/${name} (${(n / SR).toFixed(2)}s)`);
};

// ---------------------------------------------------------------------------------------------------------
// The soundtrack. Its beats fall on frames 15 + 20n of the video, so beat 0 is half a second in. Beat 12 is
// Enter on /go-remote, 44 the conversation landing on the phone, 69 "Your files never leave your machine."
// and 79 the brand.

const OFFSET = 0.5;
const at = (b) => OFFSET + b * BEAT;

const CHORDS = [
  { at: 0, root: 45, notes: [57, 60, 64, 67, 71] },
  { at: 8, root: 41, notes: [53, 57, 60, 64, 67] },
  { at: 12, root: 48, notes: [55, 60, 64, 67, 74] },
  { at: 20, root: 43, notes: [55, 59, 62, 64, 69] },
  { at: 26, root: 45, notes: [57, 60, 64, 67, 71] },
  { at: 32, root: 41, notes: [53, 57, 60, 64, 67] },
  { at: 35, root: 43, notes: [55, 59, 62, 64, 69] },
  { at: 38, root: 48, notes: [55, 60, 64, 67, 74] },
  { at: 46, root: 45, notes: [57, 60, 64, 67, 71] },
  { at: 50, root: 41, notes: [53, 57, 60, 64, 67] },
  { at: 55, root: 43, notes: [55, 59, 62, 64, 69] },
  { at: 60, root: 48, notes: [48, 55, 60, 64, 67, 71, 74] },
  { at: 64, root: 41, notes: [53, 57, 60, 64, 67] },
  { at: 69, root: 43, notes: [55, 59, 62, 64, 69] },
  { at: 79, root: 48, notes: [48, 55, 60, 64, 67, 71, 74] },
];
const END_BEAT = (LENGTH - OFFSET) / BEAT;
const chordAt = (b) => [...CHORDS].reverse().find((c) => c.at <= b) ?? CHORDS[0];

/** The pads stay dark until the drop, open up through the breath before the landing, and again into the brand. */
const padCutoff = (s) => {
  const b = (s - OFFSET) / BEAT;
  if (b < 12) return 850;
  if (b < 34) return 1300;
  if (b < 38) return 1300 + 900 * ((b - 34) / 4) ** 2;
  if (b < 69) return 1850;
  if (b < 79) return 900 + 2600 * ((b - 69) / 10) ** 2;
  return 2200;
};

const soundtrack = () => {
  const dry = new Track(LENGTH + 4);
  const plucks = new Track(LENGTH + 4);
  const send = new Track(LENGTH + 4);

  CHORDS.forEach((c, i) => {
    const next = CHORDS[i + 1]?.at ?? END_BEAT;
    const gain = c.at === 79 ? 0.07 : 0.055;
    const start = c.at === 0 ? 0 : at(c.at);
    for (const m of c.notes) pad(dry, send, start, at(next) - start, m, gain, padCutoff);
  });

  const pattern = [0, 2, 4, 3, 1, 2, 4, 3];
  for (let e = 0; e < 75 * 2; e++) {
    const b = e / 2;
    const breath = b >= 34 && b < 38;
    if (breath && e % 2) continue;
    const chord = chordAt(b);
    const note = chord.notes[pattern[e % 8] % chord.notes.length] + 12;
    const accent = e % 4 === 0 ? 1 : 0.68;
    const level = b < 12 ? 0.085 : breath ? 0.075 : 0.11;
    pluck(plucks, send, at(b), note, level * accent * (0.85 + 0.15 * random()), e % 2 ? 0.35 : -0.35);
  }

  for (let b = 12; b < 75; b += b < 44 ? 2 : 1) {
    if (b >= 34 && b < 38) continue;
    kick(dry, at(b), b < 38 ? 0.3 : 0.36);
    bass(dry, at(b), (b < 38 ? 1.8 : 0.9) * BEAT, chordAt(b).root, 0.15);
  }
  for (let b = 26; b < 75; b++) if (b < 40 || b >= 44) hat(dry, at(b + 0.5), 0.06 + 0.02 * random(), b % 2 ? 0.3 : -0.3);
  for (let b = 52; b < 75; b++) hat(dry, at(b + 0.25), 0.025, -0.5);
  for (const b of [53, 57, 62, 64, 66, 73]) clap(dry, send, at(b), 0.16);

  riser(dry, send, at(9), 3 * BEAT, 0.07);
  impact(dry, send, at(12), 0.1);
  riser(dry, send, at(41), 3 * BEAT, 0.18);
  impact(dry, send, at(44), 0.5);
  riser(dry, send, at(66), 3 * BEAT, 0.16);
  impact(dry, send, at(69), 0.32);
  riser(dry, send, at(76), 3 * BEAT, 0.2);
  impact(dry, send, at(79), 0.62);

  const echo = pingPong(plucks, BEAT * 0.75, 0.38);
  const verb = freeverb(send);
  const mix = new Track(LENGTH);
  const hp = [new Filter(), new Filter()];
  hp.forEach((f) => f.tune(32, 0.7));
  for (let i = 0; i < mix.l.length; i++) {
    const t = i / SR;
    const fade = t > LENGTH - 2 ? Math.max(0, 1 - (t - (LENGTH - 2)) / 2) : 1;
    const l = dry.l[i] + plucks.l[i] + echo.l[i] * 0.32 + verb.l[i] * 1.1;
    const r = dry.r[i] + plucks.r[i] + echo.r[i] * 0.32 + verb.r[i] * 1.1;
    mix.l[i] = Math.tanh(hp[0].run(l).hp * 1.1) * fade;
    mix.r[i] = Math.tanh(hp[1].run(r).hp * 1.1) * fade;
  }
  return normalize(mix, -1);
};

// ---------------------------------------------------------------------------------------------------------
// Foley.

const typing = (seconds, soft) => {
  const t = new Track(seconds);
  let at = 0.02;
  while (at < seconds - 0.1) {
    const v = 0.55 + 0.45 * random();
    const i0 = Math.round(at * SR);
    const bp = new Filter();
    bp.tune(soft ? 4200 + 600 * random() : 2600 + 900 * random(), soft ? 1.4 : 1.1);
    const [gl, gr] = pan((random() - 0.5) * 0.4);
    for (let j = 0; j < 0.06 * SR; j++) {
      const s = j / SR;
      const click = bp.run(noise()).bp * Math.exp(-s / (soft ? 0.004 : 0.007));
      const thock = soft ? 0 : Math.sin(TAU * 150 * s) * Math.exp(-s / 0.018) * 0.35;
      const bottom = !soft && s > 0.009 ? bp.bp * 0.4 * Math.exp(-(s - 0.009) / 0.006) : 0;
      const y = (click + thock + bottom) * v;
      t.add(i0 + j, y * gl, y * gr);
    }
    at += soft ? 0.085 + random() * 0.07 : 0.06 + random() * 0.06;
  }
  return normalize(t, -3);
};

const keyReturn = () => {
  const t = new Track(0.4);
  const bp = new Filter();
  bp.tune(1700, 1);
  for (let j = 0; j < 0.3 * SR; j++) {
    const s = j / SR;
    const y = bp.run(noise()).bp * Math.exp(-s / 0.012) + Math.sin(TAU * 105 * s) * Math.exp(-s / 0.035) * 0.5;
    t.add(j, y);
  }
  return normalize(t, -3);
};

const swoosh = (seconds, peakAt, low, high) => {
  const t = new Track(seconds);
  const bl = new Filter();
  const br = new Filter();
  for (let j = 0; j < seconds * SR; j++) {
    const s = j / SR;
    const p = s < peakAt ? s / peakAt : 1 - (s - peakAt) / (seconds - peakAt);
    if (j % 32 === 0) {
      const c = low * (high / low) ** Math.max(0, p);
      bl.tune(c, 1.6);
      br.tune(c * 1.07, 1.6);
    }
    const env = Math.max(0, p) ** 2.2;
    const [gl, gr] = pan(-0.6 + 1.2 * (s / seconds));
    t.add(j, bl.run(noise()).bp * env * gl, br.run(noise()).bp * env * gr);
  }
  return normalize(t, -3);
};

const buzz = () => {
  const t = new Track(0.5);
  for (let j = 0; j < 0.45 * SR; j++) {
    const s = j / SR;
    const gate = s < 0.18 || (s > 0.24 && s < 0.42) ? 1 : 0;
    const env = gate * Math.min(1, (s % 0.24) / 0.01);
    const y = Math.tanh(3 * Math.sin(TAU * 172 * s)) * (0.6 + 0.4 * Math.sin(TAU * 31 * s)) * env;
    t.add(j, y);
  }
  return normalize(t, -3);
};

/** The ring that leaves /go-remote on Enter: a soft ping with a slight fall in pitch, in a small room. */
const pulse = () => {
  const t = new Track(1.6);
  const send = new Track(1.6);
  let phase = 0;
  for (let j = 0; j < 0.9 * SR; j++) {
    const s = j / SR;
    phase += (TAU * (540 + 160 * Math.exp(-s / 0.04))) / SR;
    const env = Math.min(1, s / 0.004) * Math.exp(-s / 0.17);
    const y = (Math.sin(phase) * 0.8 + Math.sin(phase * 2.005) * 0.1) * env;
    t.add(j, y);
    send.add(j, y);
  }
  const verb = freeverb(send, 0.78, 0.4);
  for (let i = 0; i < t.l.length; i++) {
    t.l[i] += verb.l[i] * 0.6;
    t.r[i] += verb.r[i] * 0.6;
  }
  return normalize(t, -3);
};

/** A part of the conversation landing in the phone's chat: a short, soft drop in pitch. */
const pop = () => {
  const t = new Track(0.3);
  let phase = 0;
  for (let j = 0; j < 0.25 * SR; j++) {
    const s = j / SR;
    phase += (TAU * (520 + 480 * Math.exp(-s / 0.018))) / SR;
    const y = Math.sin(phase) * Math.min(1, s / 0.002) * Math.exp(-s / 0.05) + noise() * Math.exp(-s / 0.002) * 0.08;
    t.add(j, y);
  }
  return normalize(t, -3);
};

mkdirSync(OUT, { recursive: true });
writeWav("soundtrack.wav", soundtrack());
writeWav("keys-laptop.wav", typing(4, false));
writeWav("keys-phone.wav", typing(4, true));
writeWav("key-return.wav", keyReturn());
writeWav("swoosh-long.wav", swoosh(1.1, 0.55, 260, 3800));
writeWav("swoosh-short.wav", swoosh(0.5, 0.22, 400, 5200));
writeWav("buzz.wav", buzz());
writeWav("pulse.wav", pulse());
writeWav("pop.wav", pop());
