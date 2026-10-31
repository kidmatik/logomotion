import type { Project } from "../types";
import { buildTimeline } from "../engine/renderer";
import { clock } from "../state/clock";
import { buildScore } from "./score";
import { mixBus, play, type Hit } from "./voices";

export const SAMPLE_RATE = 48000;

/** Render the whole soundtrack offline, sample-exact, for the export. */
export async function renderSoundtrack(project: Project): Promise<AudioBuffer | null> {
  const hits = buildScore(project);
  const { total } = buildTimeline(project);
  if (!hits.length || total <= 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  const bus = mixBus(ctx, ctx.destination, project.music.volume);
  // Ease out the last 0.4s so the file never ends on a click.
  bus.master.gain.setValueAtTime(project.music.volume, Math.max(0, total - 0.4));
  bus.master.gain.linearRampToValueAtTime(0, total);
  // Nodes for a hit cost CPU from the moment they exist, so build each half-second
  // of hits just before it plays instead of all of them up front.
  const WINDOW = 0.5;
  const groups = new Map<number, Hit[]>();
  for (const h of hits) {
    const k = Math.floor(h.t / WINDOW);
    groups.set(k, [...(groups.get(k) ?? []), h]);
  }
  for (const [k, group] of groups) {
    const at = Math.max(0, k * WINDOW - 0.1);
    if (at === 0) group.forEach((h) => play(ctx, bus, h));
    else
      ctx.suspend(at).then(() => {
        group.forEach((h) => play(ctx, bus, h));
        ctx.resume();
      });
  }
  return ctx.startRendering();
}

/**
 * Live playback that follows the preview clock. Hits are scheduled a little
 * ahead on the audio clock; the preview clock is then steered by the audio
 * clock so picture and sound can't drift apart. Seeks, loops and edits
 * reschedule from the current time.
 */
class LivePlayer {
  private ctx: AudioContext | null = null;
  private bus: ReturnType<typeof mixBus> | null = null;
  private hits: Hit[] = [];
  private project: Project | null = null;
  private anchor: { audio: number; t: number } | null = null;
  private next = 0;
  private timer = 0;
  muted = false;

  /** Call from a click or key press: browsers only allow sound after one. */
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive", sampleRate: SAMPLE_RATE });
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 25);
  }

  setProject(p: Project) {
    const changed = this.project !== p;
    this.project = p;
    if (!changed) return;
    this.hits = buildScore(p);
    this.restart();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.restart();
  }

  /** Drop everything scheduled and start again from the clock's position. */
  private restart() {
    if (this.bus && this.ctx) {
      const old = this.bus.master;
      old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
      setTimeout(() => old.disconnect(), 200);
    }
    this.bus = null;
    this.anchor = null;
  }

  private tick() {
    const ctx = this.ctx;
    const p = this.project;
    if (!ctx || !p || ctx.state !== "running") return;
    if (!clock.playing || this.muted || !p.music.enabled || !this.hits.length) {
      if (this.bus) this.restart();
      return;
    }
    const now = ctx.currentTime;
    if (this.anchor) {
      // Where the music says we are. Small drift: pull the picture to the sound. Big jump: the user seeked.
      const expected = this.anchor.t + (now - this.anchor.audio);
      const drift = clock.t - expected;
      if (Math.abs(drift) > 0.12) this.restart();
      else if (Math.abs(drift) > 0.004) clock.t = expected;
    }
    if (!this.anchor || !this.bus) {
      this.bus = mixBus(ctx, ctx.destination, p.music.volume);
      this.anchor = { audio: now + 0.06, t: clock.t };
      const from = clock.t;
      this.next = this.hits.findIndex((h) => h.t >= from - 0.001);
      if (this.next < 0) this.next = this.hits.length;
    }
    const horizon = this.anchor.t + (now + 0.2 - this.anchor.audio);
    while (this.next < this.hits.length && this.hits[this.next].t <= horizon) {
      const h = this.hits[this.next++];
      const at = this.anchor.audio + (h.t - this.anchor.t);
      if (at >= now - 0.01) play(ctx, this.bus, { ...h, t: Math.max(now, at) });
    }
  }

  /** Play a short loop of one style, for the style cards. */
  async audition(project: Project, seconds = 4) {
    this.unlock();
    const ctx = this.ctx!;
    clock.setPlaying(false);
    this.restart();
    const hits = buildScore(project).filter((h) => h.t < seconds);
    const bus = mixBus(ctx, ctx.destination, project.music.volume);
    const t0 = ctx.currentTime + 0.05;
    for (const h of hits) play(ctx, bus, { ...h, t: t0 + h.t });
    bus.master.gain.setValueAtTime(project.music.volume, t0 + seconds - 0.3);
    bus.master.gain.linearRampToValueAtTime(0, t0 + seconds);
    this.auditionBus?.master.disconnect();
    this.auditionBus = bus;
  }
  private auditionBus: ReturnType<typeof mixBus> | null = null;

  stopAudition() {
    this.auditionBus?.master.disconnect();
    this.auditionBus = null;
  }
}

export const music = new LivePlayer();
