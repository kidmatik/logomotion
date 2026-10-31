import type { Voice } from "./voices";

/**
 * One bar of 16th notes per line. X = full, x = strong, o = medium, - = ghost, . = rest.
 * layer 0 plays at every intensity, 1 from "Medium", 2 only at "High".
 */
export interface Line {
  voice: Voice;
  a: string;
  /** Every other bar, for variation. */
  b?: string;
  layer: 0 | 1 | 2;
  pan?: number;
  hz?: number;
}

export interface MusicStyle {
  id: string;
  name: string;
  description: string;
  /** Tempo it sounds best at. */
  bpm: number;
  lines: Line[];
  /** Two beats (8 steps) leading into a cut; the last 4 are used when a scene is short. */
  fill: { voice: Voice; steps: string; pan?: number }[];
  /** Played together on every cut. */
  hit: Voice[];
  /** The big hit for logo reveals and the end card. */
  impact: Voice[];
  /** Optional bass line: one note per bar, cycling. */
  bass?: { pattern: string; notes: number[] };
  /** Small timing looseness in seconds, so acoustic styles feel played by people. */
  swing?: number;
}

export const STYLES: MusicStyle[] = [
  {
    id: "stomp",
    name: "Stomp Crew",
    description: "Feet on a wooden stage, hand claps, finger snaps and a push broom. Big and physical.",
    bpm: 116,
    lines: [
      { voice: "stomp", a: "X...x...X.x.x...", b: "X...x...X.x.x.x.", layer: 0 },
      { voice: "clap", a: "....X.......X...", layer: 0 },
      { voice: "snap", a: "..o...o...o...o.", b: "..o.o.o...o.o.o.", layer: 1, pan: 0.4 },
      { voice: "broom", a: "o.......o.......", layer: 1, pan: -0.4 },
      { voice: "slap", a: ".-.-.-.-.-.-.-.-", layer: 2, pan: -0.2 },
      { voice: "clap", a: ".......o.......o", layer: 2, pan: 0.5 },
    ],
    fill: [
      { voice: "stomp", steps: "X.x.XxXX" },
      { voice: "clap", steps: "....x.XX", pan: 0.3 },
    ],
    hit: ["stomp", "clap"],
    impact: ["boom", "clap"],
    swing: 0.004,
  },
  {
    id: "junkyard",
    name: "Junkyard",
    description: "Bins, lids and pipes struck like drums. Clangy, metallic and loud.",
    bpm: 120,
    lines: [
      { voice: "bin", a: "X.....x...X.....", b: "X.....x...X...x.", layer: 0 },
      { voice: "stomp", a: "....X.......X...", layer: 0 },
      { voice: "lid", a: "..x...x...x...xo", layer: 1, pan: 0.45 },
      { voice: "pipe", a: "o......o..o.....", layer: 2, pan: -0.5, hz: 520 },
      { voice: "pipe", a: "....o.......o...", layer: 2, pan: 0.5, hz: 780 },
      { voice: "broom", a: "-.-.-.-.-.-.-.-.", layer: 2, pan: -0.3 },
    ],
    fill: [
      { voice: "bin", steps: "X.x.X.XX" },
      { voice: "lid", steps: "x.x.xxXX", pan: 0.4 },
    ],
    hit: ["bin", "lid"],
    impact: ["boom", "bin"],
    swing: 0.005,
  },
  {
    id: "claps",
    name: "Clap Circle",
    description: "A crowd clapping in interlocking rhythms with snaps and chest slaps. Light and catchy.",
    bpm: 120,
    lines: [
      { voice: "clap", a: "X..x..X...X..x..", layer: 0 },
      { voice: "slap", a: "X.......X.......", layer: 0 },
      { voice: "snap", a: "....x.......x...", layer: 1, pan: -0.4 },
      { voice: "clap", a: "..o...o...o...o.", b: "..o...o...o.o.o.", layer: 1, pan: 0.6 },
      { voice: "stomp", a: "X.......X.......", layer: 2 },
      { voice: "snap", a: "-.-.-.-.-.-.-.-.", layer: 2, pan: 0.3 },
    ],
    fill: [{ voice: "clap", steps: "X.x.XxXX" }],
    hit: ["clap", "stomp"],
    impact: ["boom", "clap"],
    swing: 0.006,
  },
  {
    id: "drumline",
    name: "Drumline",
    description: "Marching snare with ghost notes, bass drum and rim clicks. Tight and driving.",
    bpm: 120,
    lines: [
      { voice: "kick", a: "X...X...X...X...", layer: 0 },
      { voice: "snare", a: "....X.......X...", layer: 0 },
      { voice: "rim", a: "..x...x...x...x.", layer: 1, pan: 0.4 },
      { voice: "snare", a: "-.--.-.--.--.-.-", b: "-.-.--.--.-.--.-", layer: 2, pan: -0.2 },
    ],
    fill: [{ voice: "snare", steps: "oxoxXXXX" }],
    hit: ["kick", "crash"],
    impact: ["boom", "crash"],
  },
  {
    id: "taiko",
    name: "Taiko Thunder",
    description: "Deep festival drums, tom calls and wood clicks. Epic, with lots of space.",
    bpm: 100,
    lines: [
      { voice: "taiko", a: "X.......X..x....", layer: 0 },
      { voice: "tom", a: "....x.......x.x.", layer: 1, pan: 0.3 },
      { voice: "wood", a: "x.x.x.x.x.x.x.x.", layer: 1, pan: -0.4 },
      { voice: "shaker", a: "-o-o-o-o-o-o-o-o", layer: 2, pan: 0.4 },
    ],
    fill: [
      { voice: "taiko", steps: "X...X.XX" },
      { voice: "tom", steps: "..x.x.xx", pan: 0.3 },
    ],
    hit: ["taiko", "crash"],
    impact: ["boom", "taiko"],
    swing: 0.004,
  },
  {
    id: "pulse",
    name: "Street Pulse",
    description: "Four-on-the-floor kick, claps, hats and a sub bass line. Modern and high energy.",
    bpm: 124,
    lines: [
      { voice: "kick", a: "X...X...X...X...", layer: 0 },
      { voice: "clap", a: "....X.......X...", layer: 0 },
      { voice: "hat", a: "..x...x...x...x.", layer: 1, pan: 0.3 },
      { voice: "openhat", a: "..............o.", layer: 1, pan: -0.3 },
      { voice: "hat", a: "-.-.-.-.-.-.-.-.", b: "-.-.-.--.-.-.-.-", layer: 2, pan: 0.5 },
    ],
    bass: { pattern: "X..x..X...x..x..", notes: [55, 55, 65.41, 49] },
    fill: [
      { voice: "kick", steps: "X.X.X.XX" },
      { voice: "clap", steps: "....X.XX" },
    ],
    hit: ["kick", "crash"],
    impact: ["boom", "crash"],
  },
  {
    id: "ticktock",
    name: "Tick Tock",
    description: "Woodblock, rim and a soft kick. Calm and precise, for the slower template.",
    bpm: 100,
    lines: [
      { voice: "wood", a: "X...o...x...o...", layer: 0 },
      { voice: "kick", a: "o.......o.......", layer: 0 },
      { voice: "rim", a: "..o.......o.....", layer: 1, pan: 0.4 },
      { voice: "shaker", a: "-.-.-.-.-.-.-.-.", layer: 2, pan: -0.4 },
    ],
    fill: [{ voice: "wood", steps: "x.x.xXXX" }],
    hit: ["kick", "wood"],
    impact: ["boom"],
  },
];

export const styleById = (id: string) => STYLES.find((s) => s.id === id) ?? STYLES[0];

export const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.55, "-": 0.28 };
