import type { Backdrop, BrandGradient, ColorRole, SceneInstance } from "../types";
import type { Store } from "../state/store";
import { DEFAULT_BACKDROP, brandGradients, gradientCss } from "../engine/backdrop";
import { resolveColors } from "../engine/kit";
import { Help, LinkButton, Select, Slider } from "./controls";
import { Icon } from "./icons";

const MODES: { value: Backdrop["mode"]; label: string }[] = [
  { value: "scene", label: "Scene's own" },
  { value: "solid", label: "Colour" },
  { value: "gradient", label: "Gradient" },
];

const MOTIONS: { value: Backdrop["motion"]; label: string }[] = [
  { value: "none", label: "Still" },
  { value: "drift", label: "Slow drift" },
  { value: "rotate", label: "Rotate" },
  { value: "pulse", label: "Pulse" },
];

const ROLES: { role: ColorRole; label: string }[] = [
  { role: "primary", label: "Primary" },
  { role: "secondary", label: "Secondary" },
  { role: "black", label: "Black" },
  { role: "white", label: "White" },
];

/** A scene's background: its own design, a brand colour, or a brand gradient (optionally moving). */
export function BackdropControl({ scene, store }: { scene: SceneInstance; store: Store }) {
  const { project, update } = store;
  const b = scene.backdrop ?? DEFAULT_BACKDROP;
  const colors = resolveColors(project.brand);
  const gradients = brandGradients(project.brand);
  const set = (patch: Partial<Backdrop>, key?: string) =>
    update((d) => {
      const s = d.scenes.find((x) => x.uid === scene.uid);
      if (s) s.backdrop = { ...(s.backdrop ?? DEFAULT_BACKDROP), ...patch };
    }, key && `${scene.uid}:bg:${key}`);

  return (
    <div className="backdrop-control">
      <h4 className="param-group">Background</h4>
      <div className="segmented wide" role="radiogroup" aria-label="Background">
        {MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={b.mode === m.value} className={b.mode === m.value ? "active" : ""} onClick={() => set({ mode: m.value })}>
            {m.label}
          </button>
        ))}
      </div>
      {b.mode === "solid" && (
        <div className="bd-swatches">
          {ROLES.map(({ role, label }) => (
            <button key={role} type="button" className={"bd-swatch" + (b.color === role ? " active" : "")} style={{ background: colors[role] }} title={label} aria-label={label} onClick={() => set({ color: role })} />
          ))}
        </div>
      )}
      {b.mode === "gradient" && (
        <>
          <div className="bd-swatches">
            {gradients.map((g) => (
              <button key={g.id} type="button" className={"bd-swatch wide" + (b.gradient === g.id ? " active" : "")} style={{ background: gradientCss(g) }} title={g.name} aria-label={g.name} onClick={() => set({ gradient: g.id })} />
            ))}
          </div>
          <div className="field">
            <span className="field-label">Movement</span>
            <Select value={b.motion} options={MOTIONS} onChange={(motion) => set({ motion })} />
          </div>
          <Help>Gradients come from your brand: the ones read from your website (edit them in Brand → Gradients) and a few made from your colours.</Help>
        </>
      )}
      {b.mode !== "scene" && (
        <LinkButton
          onClick={() =>
            update((d) => {
              for (const s of d.scenes) s.backdrop = { ...b };
            })
          }
        >
          Use this background on every scene
        </LinkButton>
      )}
    </div>
  );
}

/** Brand → Gradients: the brand's own gradients, editable, used by scene backgrounds. */
export function GradientsEditor({ store }: { store: Store }) {
  const { project, update } = store;
  const list = project.brand.gradients ?? [];
  const colors = resolveColors(project.brand);
  const change = (id: string, fn: (g: BrandGradient) => void, key?: string) =>
    update((d) => {
      const g = d.brand.gradients.find((x) => x.id === id);
      if (g) fn(g);
    }, key && `grad:${id}:${key}`);
  return (
    <div className="gradients-editor">
      {list.length === 0 && <Help>No brand gradients yet. Quick start reads them from your website, or add one here.</Help>}
      {list.map((g) => (
        <div key={g.id} className="grad-row">
          <span className="grad-preview" style={{ background: gradientCss(g) }} />
          <div className="grad-body">
            <div className="grad-head">
              <input className="grad-name" value={g.name} onChange={(e) => change(g.id, (x) => void (x.name = e.target.value), "name")} aria-label="Gradient name" />
              <Select
                value={g.type}
                options={[
                  { value: "linear", label: "Linear" },
                  { value: "radial", label: "Radial" },
                  { value: "mesh", label: "Mesh" },
                ]}
                onChange={(type) => change(g.id, (x) => void (x.type = type))}
              />
              <button type="button" className="icon-btn" aria-label="Delete gradient" onClick={() => update((d) => void (d.brand.gradients = d.brand.gradients.filter((x) => x.id !== g.id)))}>
                <Icon.Trash size={14} />
              </button>
            </div>
            <div className="grad-stops">
              {g.stops.map((s, i) => (
                <label key={i} className="grad-stop" style={{ background: s }} title={s}>
                  <input type="color" value={s} onChange={(e) => change(g.id, (x) => void (x.stops[i] = e.target.value.toUpperCase()), `stop${i}`)} aria-label={`Colour ${i + 1}`} />
                </label>
              ))}
              {g.stops.length < 4 && (
                <button type="button" className="grad-stop add" aria-label="Add a colour" onClick={() => change(g.id, (x) => void x.stops.push(colors.secondary))}>
                  <Icon.Plus size={12} />
                </button>
              )}
              {g.stops.length > 2 && (
                <button type="button" className="grad-stop add" aria-label="Remove the last colour" onClick={() => change(g.id, (x) => void x.stops.pop())}>
                  −
                </button>
              )}
            </div>
            {g.type === "linear" && <Slider label="Angle" value={g.angle} min={0} max={360} step={1} unit="°" onChange={(v) => change(g.id, (x) => void (x.angle = v), "angle")} />}
          </div>
        </div>
      ))}
      <LinkButton
        onClick={() =>
          update((d) => {
            const n = d.brand.gradients.length + 1;
            d.brand.gradients.push({ id: `g${Date.now().toString(36)}`, name: `Gradient ${n}`, type: "linear", angle: 135, stops: [colors.primary, colors.secondary] });
          })
        }
      >
        <Icon.Plus size={14} /> Add a gradient
      </LinkButton>
    </div>
  );
}
