import { useSyncExternalStore } from "react";

/**
 * Playback clock shared by the preview, the player bar and the timeline. Kept
 * outside React state so the sidebar doesn't re-render on every frame.
 */
class Clock {
  t = 0;
  playing = true;
  loop = true;
  private listeners = new Set<() => void>();
  private snapshot = { t: 0, playing: true };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = () => this.snapshot;

  private emit() {
    this.snapshot = { t: this.t, playing: this.playing };
    this.listeners.forEach((l) => l());
  }

  seek(t: number) {
    this.t = Math.max(0, t);
    this.emit();
  }

  setPlaying(p: boolean) {
    this.playing = p;
    this.emit();
  }

  toggle() {
    this.setPlaying(!this.playing);
  }

  /** Advance during playback; called by the preview loop. */
  advance(dt: number, total: number) {
    if (!this.playing || total <= 0) return;
    let t = this.t + dt;
    if (t >= total) t = this.loop ? t % total : total;
    this.t = t;
    this.emit();
  }
}

export const clock = new Clock();

export function useClock() {
  return useSyncExternalStore(clock.subscribe, clock.get);
}
