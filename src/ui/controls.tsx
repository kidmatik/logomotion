import { useEffect, useState, type ReactNode } from "react";
import type { ColorRole } from "../types";
import type { ResolvedColors } from "../engine/kit";
import { normalizeHex } from "../brand/color";
import { Icon } from "./icons";

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Help({ children }: { children: ReactNode }) {
  return <p className="help">{children}</p>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <NumberBox value={value} min={min} max={max} step={step} onChange={onChange} />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

export function NumberBox({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, Math.round(n / step) * step)));
    else setText(String(value));
  };
  return (
    <input
      className="numbox"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

export function Stepper({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">−</button>
      <NumberBox value={value} min={min} max={max} step={1} onChange={onChange} />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">+</button>
    </div>
  );
}

export function Select<T extends string | number>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={"select " + (className ?? "")}>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon.Chevron size={16} />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={"toggle" + (checked ? " on" : "")} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="link-btn" onClick={onClick}>
      {children}
    </button>
  );
}

const ROLE_LABEL: Record<ColorRole, string> = { primary: "Primary", secondary: "Secondary", black: "Black", white: "White" };

/** Brand-locked colour picker: only the four brand roles can be chosen. */
export function RolePicker({ value, roles, colors, onChange }: { value: ColorRole; roles?: ColorRole[]; colors: ResolvedColors; onChange: (r: ColorRole) => void }) {
  const list = roles ?? (["primary", "secondary", "black", "white"] as ColorRole[]);
  return (
    <div className="role-picker" role="radiogroup">
      {list.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          title={ROLE_LABEL[r]}
          className={"role-chip" + (value === r ? " active" : "")}
          onClick={() => onChange(r)}
        >
          <span className="dot" style={{ background: colors[r] }} />
          {ROLE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export function ColorSwatch({ label, value, onChange, badge }: { label: string; value: string; onChange: (hex: string) => void; badge?: ReactNode }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="swatch">
      <span className="swatch-label">
        {label} {badge}
      </span>
      <label className="swatch-color" style={{ background: value }}>
        <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} colour`} />
      </label>
      <input
        className="swatch-hex"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = normalizeHex(e.target.value);
          if (n) onChange(n);
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}
