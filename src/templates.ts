import type { Aspect, SceneInstance, TransitionKind } from "./types";
import { createScene } from "./scenes/registry";

export interface Template {
  id: string;
  name: string;
  description: string;
  aspect: Aspect;
  tempo: { bpm: number; snap: boolean };
  /** Default music style for this template. */
  music: string;
  scenes: () => SceneInstance[];
}

type Step = [type: string, transition: TransitionKind, enabled?: boolean, duration?: number];

function build(steps: Step[]) {
  return () =>
    steps.map(([type, transition, enabled = true, duration]) => {
      const s = createScene(type, transition, enabled);
      if (duration) s.duration = duration;
      return s;
    });
}

export const TEMPLATES: Template[] = [
  {
    id: "brand-in-motion",
    name: "Brand in Motion",
    description: "A calm 30-second walkthrough of the identity: construction, logo, icon, devices, type and colour.",
    aspect: "16:9",
    tempo: { bpm: 116, snap: true },
    music: "stomp",
    scenes: build([
      ["grid", "cut"],
      ["reveal", "cut"],
      ["icon", "fade"],
      ["phone", "slide"],
      ["browser", "wipe"],
      ["screens", "slide", false],
      ["slideshow", "fade", false],
      ["bento", "slide", false],
      ["type", "slide"],
      ["palette", "wipe"],
      ["pattern", "zoom"],
      ["signoff", "fade"],
      ["endcard", "fade", false],
    ]),
  },
  {
    id: "brand-reel",
    name: "Brand Reel",
    description: "A fast 16-second vertical reel for LinkedIn and Instagram, cut on the beat.",
    aspect: "4:5",
    tempo: { bpm: 120, snap: true },
    music: "pulse",
    scenes: build([
      ["blueprint", "cut", true, 3],
      ["wordbuild", "cut", true, 2.5],
      ["assemble", "cut", true, 1.5],
      ["stack", "cut", true, 1.5],
      ["social", "cut", true, 2.5],
      ["screens", "cut", false, 2],
      ["bento", "cut", false, 2],
      ["slideshow", "cut", false, 2],
      ["chrome", "cut", true, 1.5],
      ["marquee", "cut", true, 1.5],
      ["flash", "cut", true, 2],
    ]),
  },
];

export function templateById(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
