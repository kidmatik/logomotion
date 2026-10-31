import { useEffect, useState } from "react";
import type { MusicSettings } from "../types";
import type { Store } from "../state/store";
import { STYLES } from "../audio/styles";
import { music } from "../audio/engine";
import { buildTimeline } from "../engine/renderer";
import { buildScore } from "../audio/score";
import { clock } from "../state/clock";
import { Help, Section, Slider, Toggle } from "./controls";
import { Icon } from "./icons";

/** A tiny drawing of one bar of the style's base rhythm. */
function RhythmGlyph({ lines }: { lines: { a: string; layer: number }[] }) {
  const base = lines.filter((l) => l.layer === 0).slice(0, 2);
  return (
    <span className="rhythm" aria-hidden>
      {base.map((l, r) => (
        <span key={r} className="rhythm-row">
          {[...l.a].map((c, i) => (
            <i key={i} className={c === "X" ? "on" : c === "x" ? "mid" : c === "o" ? "low" : ""} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function MusicPanel({ store }: { store: Store }) {
  const { project, update } = store;
  const m = project.music;
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const set = (fn: (m: MusicSettings) => void, key?: string) => update((d) => fn(d.music), key && "music:" + key);
  const { entries, total } = buildTimeline(project);
  const cuts = Math.max(0, entries.length - 1);
  const hitCount = buildScore(project).length;

  useEffect(() => {
    if (!auditioning) return;
    const id = setTimeout(() => setAuditioning(null), 4000);
    return () => clearTimeout(id);
  }, [auditioning]);
  useEffect(() => () => music.stopAudition(), []);

  return (
    <div className="panel-scroll">
      <div className="music-hero">
        <span className="mh-icon">
          <Icon.Music size={20} />
        </span>
        <div>
          <strong>Soundtrack</strong>
          <p>{m.enabled ? `Locked to your ${entries.length} scenes: ${cuts} cuts, ${total.toFixed(1)}s, ${project.tempo.bpm} BPM.` : "Off. The video downloads silent."}</p>
        </div>
        <Toggle checked={m.enabled} label="Music" onChange={(v) => set((x) => void (x.enabled = v))} />
      </div>

      {m.enabled && (
        <>
          <Section title="Style">
            <div className="style-grid">
              {STYLES.map((s) => {
                const active = s.id === m.style;
                return (
                  <div key={s.id} className={"style-card" + (active ? " active" : "")}>
                    <button
                      type="button"
                      className="style-main"
                      onClick={() =>
                        update((d) => {
                          d.music.style = s.id;
                          // Each style has a tempo it grooves at; scenes re-snap to its beat.
                          d.tempo.bpm = s.bpm;
                        })
                      }
                      aria-pressed={active}
                    >
                      <RhythmGlyph lines={s.lines} />
                      <strong>{s.name}</strong>
                      <small>{s.description}</small>
                      <span className="style-bpm">{s.bpm} BPM</span>
                    </button>
                    <button
                      type="button"
                      className={"style-play" + (auditioning === s.id ? " playing" : "")}
                      aria-label={`Listen to ${s.name}`}
                      title="Listen (4 seconds)"
                      onClick={() => {
                        if (auditioning === s.id) {
                          music.stopAudition();
                          setAuditioning(null);
                          return;
                        }
                        // Audition over the real timeline, so you hear it against your own cuts.
                        music.audition({ ...project, music: { ...m, style: s.id, enabled: true }, tempo: { ...project.tempo, bpm: s.bpm } });
                        setAuditioning(s.id);
                      }}
                    >
                      {auditioning === s.id ? <Icon.Pause size={14} /> : <Icon.Play size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Energy">
            <div className="segmented wide" role="radiogroup" aria-label="Intensity">
              {(["calm", "medium", "high"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={m.intensity === k} className={m.intensity === k ? "active" : ""} onClick={() => set((x) => void (x.intensity = k))}>
                  {k === "calm" ? "Calm" : k === "medium" ? "Medium" : "High"}
                </button>
              ))}
            </div>
            <Slider label="Volume" value={Math.round(m.volume * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set((x) => void (x.volume = v / 100), "vol")} />
            <Slider label="Tempo" value={project.tempo.bpm} min={80} max={160} step={1} unit="BPM" onChange={(v) => update((d) => void (d.tempo.bpm = v), "bpm")} />
          </Section>

          <Section title="Sync to the edit">
            <div className="toggle-row">
              <span>Cut scenes on the beat</span>
              <Toggle checked={project.tempo.snap} label="Cut scenes on the beat" onChange={(v) => update((d) => void (d.tempo.snap = v))} />
            </div>
            <div className="toggle-row">
              <span>Hit on every cut</span>
              <Toggle checked={m.hits} label="Hit on every cut" onChange={(v) => set((x) => void (x.hits = v))} />
            </div>
            <div className="toggle-row">
              <span>Drum fill into each cut</span>
              <Toggle checked={m.fills} label="Drum fill into each cut" onChange={(v) => set((x) => void (x.fills = v))} />
            </div>
            <div className="toggle-row">
              <span>Big ending (build, pause, final hit)</span>
              <Toggle checked={m.ending} label="Big ending" onChange={(v) => set((x) => void (x.ending = v))} />
            </div>
            <Help>
              The rhythm restarts on every cut, fills count back from the next cut, and logo reveals get a big impact. Change a scene's length or order and the music rewrites itself. {hitCount} hits in this edit.
            </Help>
          </Section>

          <Help>
            Every sound is generated in your browser from synthesised percussion: no samples, no licences, free for any use. It's baked into the downloaded MP4.
          </Help>
          <button type="button" className="ghost-btn wide" onClick={() => (music.unlock(), clock.seek(0), clock.setPlaying(true))}>
            <Icon.Play size={14} /> Play from the start
          </button>
        </>
      )}
    </div>
  );
}
