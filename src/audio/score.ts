import type { Project } from "../types";
import { buildTimeline } from "../engine/renderer";
import { VEL, styleById } from "./styles";
import type { Hit } from "./voices";

/** Scenes where the logo lands; they get the big impact on their first frame. */
const REVEALS = new Set(["reveal", "assemble", "wordbuild", "icon"]);
const LAYERS = { calm: 0, medium: 1, high: 2 } as const;

/**
 * Turn the timeline into a list of hits. The rhythm restarts on every cut, so
 * each cut lands on a downbeat even when scene lengths aren't whole beats;
 * fills are counted back from the cut so they always resolve on it.
 */
export function buildScore(project: Project): Hit[] {
  const m = project.music;
  if (!m.enabled) return [];
  const style = styleById(m.style);
  const { entries, total } = buildTimeline(project);
  if (!entries.length) return [];
  const beat = 60 / project.tempo.bpm;
  const step = beat / 4;
  const maxLayer = LAYERS[m.intensity];
  const out: Hit[] = [];
  const add = (h: Hit) => {
    if (h.t >= 0 && h.t < total) out.push(h);
  };
  // Deterministic looseness so repeated renders match exactly.
  const jitter = (i: number) => (style.swing ? Math.sin(i * 12.9898) * style.swing : 0);
  let n = 0;

  const finaleIdx = m.ending ? entries.length - 1 : -1;
  const finale = finaleIdx > 0 && (entries[finaleIdx].scene.type === "endcard" || entries[finaleIdx].scene.type === "signoff" || entries.length > 2);

  entries.forEach((e, idx) => {
    const isFinale = finale && idx === finaleIdx;
    const beforeFinale = finale && idx === finaleIdx - 1;

    // Hit on the cut, and the big impact where the logo lands or the end card arrives.
    if (m.hits || idx === 0) for (const v of style.hit) add({ t: e.start, voice: v, vel: 1 });
    if (isFinale || (m.hits && REVEALS.has(e.scene.type))) for (const v of style.impact) add({ t: e.start, voice: v, vel: 1 });

    // A drop-out before the end card: build with a riser, then one beat of silence.
    const breakLen = beforeFinale && e.dur >= beat * 3 ? beat : 0;
    if (breakLen) add({ t: Math.max(e.start, e.end - breakLen - beat * 3), voice: "riser", vel: 0.9, len: Math.min(beat * 3, e.dur - breakLen) });
    const bodyEnd = e.end - breakLen;

    // Fill into the next cut, counted back from the cut itself.
    let fillSteps = 0;
    if (m.fills && idx < entries.length - 1 && !breakLen) fillSteps = e.dur >= beat * 6 ? 8 : e.dur >= beat * 3 ? 4 : 0;
    const fillStart = bodyEnd - fillSteps * step;

    if (isFinale) {
      // The end card: half-time on the base layer, then everyone stops on one last hit.
      const lastHit = e.end - beat * 1.5;
      for (let k = 8; e.start + k * step < lastHit - step / 2; k += 8) add({ t: e.start + k * step, voice: style.hit[0], vel: 0.5 });
      if (lastHit > e.start + beat) for (const v of style.hit) add({ t: lastHit, voice: v, vel: 1 });
      return;
    }

    for (let k = 0; ; k++) {
      const t = e.start + k * step;
      if (t >= (fillSteps ? fillStart : bodyEnd) - step * 0.5) break;
      const bar = Math.floor(k / 16);
      for (const line of style.lines) {
        if (line.layer > maxLayer) continue;
        const pat = bar % 2 && line.b ? line.b : line.a;
        const ch = pat[k % 16];
        const vel = VEL[ch];
        if (!vel) continue;
        // The cut hit already covers the very first step.
        if (k === 0 && (m.hits || idx === 0) && style.hit.includes(line.voice)) continue;
        add({ t: t + (k ? jitter(n++) : 0), voice: line.voice, vel: vel * (m.intensity === "calm" ? 0.85 : 1), pan: line.pan, hz: line.hz });
      }
      if (style.bass && maxLayer >= 1) {
        const ch = style.bass.pattern[k % 16];
        if (VEL[ch]) add({ t, voice: "sub", vel: VEL[ch], hz: style.bass.notes[(bar + idx) % style.bass.notes.length], len: step * 2.5 });
      }
    }

    for (let j = 0; j < fillSteps; j++) {
      const t = fillStart + j * step;
      for (const f of style.fill) {
        const ch = f.steps[f.steps.length - fillSteps + j];
        const vel = VEL[ch];
        if (vel) add({ t, voice: f.voice, vel, pan: f.pan });
      }
    }
  });

  return out.sort((a, b) => a.t - b.t);
}
