/**
 * Synthesised percussion. Every sound is built from oscillators, noise and
 * filters at play time, so there are no audio files to license or download,
 * and the same code renders live in the preview and offline for the export.
 */

export type Voice =
  | "kick"
  | "stomp"
  | "clap"
  | "snap"
  | "hat"
  | "openhat"
  | "shaker"
  | "rim"
  | "wood"
  | "bin"
  | "lid"
  | "pipe"
  | "tom"
  | "taiko"
  | "snare"
  | "broom"
  | "slap"
  | "sub"
  | "boom"
  | "crash"
  | "riser";

export interface Hit {
  /** Seconds from the start of the video. */
  t: number;
  voice: Voice;
  /** 0..1 */
  vel: number;
  /** Pitch in Hz for tuned voices (sub, pipe). */
  hz?: number;
  /** Length in seconds for voices that sweep (riser). */
  len?: number;
  /** Stereo position -1..1. */
  pan?: number;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Seeded so offline renders are identical every time.
    let s = 12345;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

type Out = AudioNode;

function env(ctx: BaseAudioContext, out: Out, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function noiseBurst(ctx: BaseAudioContext, out: Out, t: number, peak: number, attack: number, decay: number, filter: BiquadFilterType, freq: number, q = 0.8) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(ctx, out, t, peak, attack, decay));
  // Start at a varying offset so repeated hits don't sound machine-identical.
  src.start(t, (t * 7.31) % 1.5, attack + decay + 0.05);
  return f;
}

function tone(ctx: BaseAudioContext, out: Out, t: number, type: OscillatorType, f0: number, f1: number, sweep: number, peak: number, decay: number, attack = 0.002) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  o.connect(env(ctx, out, t, peak, attack, decay));
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Struck metal: a few inharmonic partials, like a bin or a pipe. */
function metal(ctx: BaseAudioContext, out: Out, t: number, base: number, ratios: number[], peak: number, decay: number, type: OscillatorType = "square", bp = 2600) {
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = bp;
  f.Q.value = 0.7;
  const g = env(ctx, out, t, peak, 0.001, decay);
  f.connect(g);
  for (const r of ratios) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = base * r;
    o.connect(f);
    o.start(t);
    o.stop(t + decay + 0.1);
  }
}

/** Schedule one hit into a mix bus. */
export function play(ctx: BaseAudioContext, bus: Bus, h: Hit) {
  const t = h.t;
  const v = Math.max(0.05, Math.min(1, h.vel));
  const o = bus.channel(h.pan ?? 0);

  switch (h.voice) {
    case "kick":
      tone(ctx, o, t, "sine", 150, 42, 0.12, 0.95 * v, 0.38);
      noiseBurst(ctx, o, t, 0.12 * v, 0.001, 0.02, "lowpass", 1500);
      break;
    case "stomp":
      // A foot on a wooden stage: low thud, a dull slap and the floor ringing a little.
      tone(ctx, o, t, "sine", 110, 38, 0.09, 1.0 * v, 0.32);
      noiseBurst(ctx, o, t, 0.55 * v, 0.002, 0.09, "lowpass", 520, 0.5);
      tone(ctx, o, t + 0.004, "triangle", 230, 160, 0.05, 0.18 * v, 0.08);
      break;
    case "clap": {
      // Several hands, a few milliseconds apart.
      for (const [d, a] of [[0, 0.7], [0.011, 0.6], [0.022, 0.8]] as const) noiseBurst(ctx, o, t + d, a * v, 0.001, 0.035, "bandpass", 1150, 0.9);
      noiseBurst(ctx, o, t + 0.03, 0.55 * v, 0.002, 0.16, "bandpass", 1300, 0.7);
      break;
    }
    case "snap":
      noiseBurst(ctx, o, t, 0.7 * v, 0.001, 0.035, "highpass", 2400, 0.6);
      tone(ctx, o, t, "sine", 2100, 1700, 0.02, 0.25 * v, 0.03);
      break;
    case "hat":
      noiseBurst(ctx, o, t, 0.32 * v, 0.001, 0.035, "highpass", 7500, 0.5);
      break;
    case "openhat":
      noiseBurst(ctx, o, t, 0.28 * v, 0.002, 0.24, "highpass", 6800, 0.5);
      break;
    case "shaker":
      noiseBurst(ctx, o, t, 0.25 * v, 0.018, 0.07, "bandpass", 6200, 1.2);
      break;
    case "rim":
      tone(ctx, o, t, "triangle", 1650, 1600, 0.01, 0.45 * v, 0.035);
      noiseBurst(ctx, o, t, 0.3 * v, 0.001, 0.015, "highpass", 3000);
      break;
    case "wood":
      tone(ctx, o, t, "sine", 980, 940, 0.02, 0.6 * v, 0.07);
      tone(ctx, o, t, "sine", 1960, 1900, 0.02, 0.15 * v, 0.03);
      break;
    case "bin":
      // Kicking a metal bin: a dull boom under a clangy, inharmonic ring.
      tone(ctx, o, t, "sine", 140, 70, 0.08, 0.7 * v, 0.25);
      metal(ctx, o, t, 196, [1, 1.47, 2.09, 2.56, 3.31], 0.22 * v, 0.42, "square", 2200);
      noiseBurst(ctx, o, t, 0.3 * v, 0.001, 0.08, "bandpass", 1800, 0.6);
      break;
    case "lid":
      metal(ctx, o, t, 420, [1, 1.59, 2.37, 3.14], 0.2 * v, 0.28, "square", 4200);
      noiseBurst(ctx, o, t, 0.25 * v, 0.001, 0.05, "highpass", 3500);
      break;
    case "pipe": {
      const f = h.hz ?? 520;
      metal(ctx, o, t, f, [1, 2.76, 5.4], 0.35 * v, 0.7, "sine", f * 2);
      break;
    }
    case "tom":
      tone(ctx, o, t, "sine", 180, 95, 0.18, 0.85 * v, 0.42);
      noiseBurst(ctx, o, t, 0.15 * v, 0.001, 0.04, "lowpass", 900);
      break;
    case "taiko":
      tone(ctx, o, t, "sine", 92, 52, 0.25, 1.0 * v, 1.0);
      tone(ctx, o, t, "triangle", 140, 90, 0.15, 0.25 * v, 0.3);
      noiseBurst(ctx, o, t, 0.4 * v, 0.002, 0.12, "lowpass", 700, 0.5);
      break;
    case "snare":
      noiseBurst(ctx, o, t, 0.6 * v, 0.001, 0.17, "bandpass", 1900, 0.6);
      tone(ctx, o, t, "triangle", 210, 170, 0.06, 0.4 * v, 0.1);
      break;
    case "broom":
      // A push broom swept across the floor.
      noiseBurst(ctx, o, t, 0.32 * v, 0.06, 0.16, "bandpass", 3300, 0.9);
      break;
    case "slap":
      // Hand on chest or thigh.
      tone(ctx, o, t, "sine", 210, 120, 0.05, 0.55 * v, 0.1);
      noiseBurst(ctx, o, t, 0.4 * v, 0.001, 0.05, "bandpass", 900, 0.8);
      break;
    case "sub": {
      const f = h.hz ?? 55;
      tone(ctx, o, t, "sine", f, f, 0.01, 0.55 * v, Math.max(0.15, h.len ?? 0.3), 0.01);
      tone(ctx, o, t, "triangle", f * 2, f * 2, 0.01, 0.12 * v, Math.max(0.1, (h.len ?? 0.3) * 0.6), 0.01);
      break;
    }
    case "boom":
      // The big hit on a reveal: stomp, sub drop and a long wash.
      tone(ctx, o, t, "sine", 120, 34, 0.35, 1.0 * v, 1.4);
      noiseBurst(ctx, o, t, 0.6 * v, 0.002, 0.12, "lowpass", 600, 0.5);
      noiseBurst(ctx, o, t, 0.22 * v, 0.004, 1.5, "highpass", 4200, 0.4);
      break;
    case "crash":
      noiseBurst(ctx, o, t, 0.3 * v, 0.003, 1.3, "highpass", 5200, 0.4);
      break;
    case "riser": {
      const len = h.len ?? 1;
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 2.5;
      f.frequency.setValueAtTime(350, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * v, t + len * 0.95);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 0.02);
      src.connect(f).connect(g).connect(o);
      src.start(t);
      src.stop(t + len + 0.05);
      break;
    }
  }
}

export interface Bus {
  master: GainNode;
  /** A shared input at a stereo position (with its reverb send), so hits don't each build their own. */
  channel(pan: number): AudioNode;
}

/** Mix bus: dry + a small room, through a gentle compressor. */
export function mixBus(ctx: BaseAudioContext, dest: AudioNode, volume: number): Bus {
  const master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  comp.connect(master).connect(dest);

  // A small wooden room, from a generated impulse so nothing is downloaded.
  const room = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 0.9);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let s = 777 + ch;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((s / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
  }
  room.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  room.connect(wet).connect(comp);
  const channels = new Map<number, AudioNode>();
  return {
    master,
    channel(pan) {
      const key = Math.round(pan * 10) / 10;
      let node = channels.get(key);
      if (!node) {
        const p = ctx.createStereoPanner();
        p.pan.value = key;
        p.connect(comp);
        const send = ctx.createGain();
        send.gain.value = 0.35;
        p.connect(send).connect(room);
        channels.set(key, p);
        node = p;
      }
      return node;
    },
  };
}
