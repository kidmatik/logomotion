import { useEffect, useState } from "react";
import type { Store } from "../state/store";
import { DEFAULT_BLACK, DEFAULT_WHITE, PLACEHOLDER_LOGO, defaultBrand } from "../brand/defaults";
import { GOOGLE_FONTS, HEBREW_FONTS, WEIGHTS, registerUploadedFont } from "../brand/fonts";
import { brandIsRtl, isRtlText } from "../engine/kit";
import { prepareSvg } from "../brand/logo";
import { contrast } from "../brand/color";
import { resolveColors } from "../engine/kit";
import { ColorSwatch, Help, LinkButton, Section, Select, Slider, Stepper, TextInput, Toggle } from "./controls";
import { DropZone } from "./DropZone";
import { Icon } from "./icons";
import { makeLogos, type MadeLogo } from "../brand/logoMaker";
import { GradientsEditor } from "./BackdropControl";

function svgPreviewUrl(svg: string) {
  const p = prepareSvg(svg);
  return p.ok && p.svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(p.svg) : "";
}

function LogoSlot({
  svg,
  isPlaceholder,
  title,
  onSvg,
  onClear,
}: {
  svg: string | null;
  isPlaceholder: boolean;
  title: string;
  onSvg: (svg: string) => void;
  onClear: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const take = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const text = await f.text();
    const check = prepareSvg(text);
    if (!check.ok) return setError(check.error ?? "That file isn't a valid SVG.");
    setError(null);
    onSvg(text);
  };
  const hasArt = svg && !isPlaceholder;
  return (
    <>
      <DropZone accept=".svg,image/svg+xml" onFiles={take} className="logo-drop">
        <span className="logo-thumb">{hasArt ? <img src={svgPreviewUrl(svg!)} alt="" /> : <Icon.Pen size={22} />}</span>
        <span className="logo-copy">
          <strong>{hasArt ? `${title} in use` : `Upload your ${title.toLowerCase()}`}</strong>
          <small>SVG · drop, click or paste (Ctrl+V)</small>
        </span>
        {hasArt && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${title.toLowerCase()}`}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <Icon.Close size={16} />
          </button>
        )}
      </DropZone>
      {error && <p className="error">{error}</p>}
    </>
  );
}

export function BrandPanel({ store }: { store: Store }) {
  const { project, update } = store;
  const b = project.brand;
  const colors = resolveColors(b);
  const [fontError, setFontError] = useState<string | null>(null);

  // Paste an SVG anywhere to set the logo.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type === "image/svg+xml");
      const apply = (svg: string) => prepareSvg(svg).ok && update((d) => void (d.brand.logoSvg = svg));
      if (file) file.text().then(apply);
      else if (text.trim().startsWith("<svg") || text.includes("<svg")) apply(text.slice(text.indexOf("<svg")));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [update]);

  const fontOptions = [...new Set([...GOOGLE_FONTS, b.font.family])].map((f) => ({ value: f, label: HEBREW_FONTS.has(f) ? `${f} · עברית` : f }));
  const rtl = brandIsRtl(b);
  const hebrewText = isRtlText(`${b.name} ${b.nameLine2} ${b.tagline}`);

  const checks: string[] = [];
  if (contrast(colors.primary, colors.white) < 2) checks.push("Primary is very light, so white text and marks on it may be hard to read.");
  if (contrast(colors.black, colors.white) < 7) checks.push("Black and White are close together. Text contrast will suffer in dark scenes.");
  if (contrast(colors.primary, colors.secondary) < 1.25) checks.push("Primary and Secondary are almost the same colour.");

  return (
    <div className="panel-scroll">
      <Section title="Logo">
        <LogoSlot
          title="Logo"
          svg={b.logoSvg}
          isPlaceholder={b.logoSvg === PLACEHOLDER_LOGO}
          onSvg={(svg) => update((d) => void (d.brand.logoSvg = svg))}
          onClear={() => update((d) => void (d.brand.logoSvg = PLACEHOLDER_LOGO))}
        />
        <Slider label="Logo size" value={Math.round(b.logoScale * 100)} min={40} max={180} step={1} unit="%" onChange={(v) => update((d) => void (d.brand.logoScale = v / 100), "logoScale")} />
        <Help>Makes the logo bigger or smaller in every scene at once. 100% is the balanced size.</Help>
        <LogoMaker store={store} />
      </Section>

      <Section title="Name">
        <div className="name-card">
          <div className="name-controls">
            <Select
              value={b.font.family}
              options={fontOptions}
              onChange={(family) => update((d) => void (d.brand.font = { ...d.brand.font, family, source: d.brand.font.source === "upload" && family === d.brand.font.family ? "upload" : "google" }))}
            />
            <Select value={b.font.weight} options={WEIGHTS} onChange={(weight) => update((d) => void (d.brand.font.weight = weight))} />
            <Stepper value={b.nameSize} min={40} max={260} step={4} unit="px" onChange={(v) => update((d) => void (d.brand.nameSize = v), "nameSize")} />
          </div>
          <input className="name-input" dir="auto" style={{ fontFamily: `"${b.font.family}"`, fontWeight: b.font.weight }} value={b.name} onChange={(e) => update((d) => void (d.brand.name = e.target.value), "name")} aria-label="Brand name" />
          <input className="name-line2" dir="auto" value={b.nameLine2} placeholder="Second line (optional)" onChange={(e) => update((d) => void (d.brand.nameLine2 = e.target.value), "name2")} aria-label="Second line" />
        </div>
        <DropZone
          accept=".woff,.woff2,.ttf,.otf"
          className="inline-drop"
          onFiles={async (files) => {
            try {
              const family = await registerUploadedFont(files[0]);
              setFontError(null);
              update((d) => void (d.brand.font = { ...d.brand.font, family, source: "upload" }));
            } catch {
              setFontError("Couldn't read that font file.");
            }
          }}
        >
          <Icon.Upload size={15} /> Use your own font file (WOFF, TTF, OTF)
        </DropZone>
        {fontError && <p className="error">{fontError}</p>}
        {b.font.source === "upload" && <Help>Uploaded fonts stay on this device. Add the file again after you reload the page.</Help>}
        {hebrewText && b.font.source === "google" && !HEBREW_FONTS.has(b.font.family) && (
          <Help>{b.font.family} has no Hebrew letters, so Hebrew is shown in Heebo. Pick a font marked עברית to use one font for everything.</Help>
        )}
        <div className="field">
          <span className="field-label">Reading direction</span>
          <div className="segmented wide" role="radiogroup" aria-label="Reading direction">
            {(
              [
                ["auto", rtl && b.direction === "auto" ? "Auto · RTL" : "Auto"],
                ["rtl", "Right to left"],
                ["ltr", "Left to right"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={b.direction === v} className={b.direction === v ? "active" : ""} onClick={() => update((d) => void (d.brand.direction = v))}>
                {label}
              </button>
            ))}
          </div>
          <Help>Auto switches to right to left when the name or tagline is in Hebrew: the mark moves to the right of the name, text builds from the right and slides run the other way. Websites and handles always stay left to right.</Help>
        </div>
      </Section>

      <Section title="Lettermark" aside={<Toggle checked={b.useLettermark} label="Use a lettermark" onChange={(v) => update((d) => void (d.brand.useLettermark = v))} />}>
        {b.useLettermark ? (
          <>
            <LogoSlot
              title="Lettermark"
              svg={b.lettermarkSvg}
              isPlaceholder={!b.lettermarkSvg}
              onSvg={(svg) => update((d) => void (d.brand.lettermarkSvg = svg))}
              onClear={() => update((d) => void (d.brand.lettermarkSvg = null))}
            />
            <Slider label="Size" value={Math.round(b.lettermarkScale * 100)} min={40} max={180} step={1} unit="%" onChange={(v) => update((d) => void (d.brand.lettermarkScale = v / 100), "lmScale")} />
            <Help>The lettermark replaces the typed name in the logo scenes. The name and font are still used in the phone, browser and type scenes.</Help>
          </>
        ) : (
          <Help>Turn this on if your brand has a wordmark drawn as an SVG.</Help>
        )}
      </Section>

      <Section title="Colours">
        <div className="swatches">
          <ColorSwatch label="Primary" value={b.colors.primary} onChange={(v) => update((d) => void (d.brand.colors.primary = v), "c-primary")} />
          <ColorSwatch
            label="Secondary"
            value={colors.secondary}
            badge={b.secondaryAuto ? <span className="badge">AUTO</span> : null}
            onChange={(v) =>
              update((d) => {
                d.brand.colors.secondary = v;
                d.brand.secondaryAuto = false;
              }, "c-secondary")
            }
          />
          <ColorSwatch label="Black" value={b.colors.black} onChange={(v) => update((d) => void (d.brand.colors.black = v), "c-black")} />
          <ColorSwatch label="White" value={b.colors.white} onChange={(v) => update((d) => void (d.brand.colors.white = v), "c-white")} />
        </div>
        <Help>Every scene picks from these four colours only, so a change here updates the whole video. Black and white work with any brand colour; very different shades may make some parts harder to see.</Help>
        <div className="field">
          <span className="field-label">Logo colours</span>
          <Select
            value={b.logoColorMode}
            options={[
              { value: "primary", label: "Logo in the brand colours of each scene" },
              { value: "original", label: "Keep my logo's own colours" },
            ]}
            onChange={(v) => update((d) => void (d.brand.logoColorMode = v))}
          />
        </div>
        <div className="link-row">
          {!b.secondaryAuto && <LinkButton onClick={() => update((d) => void (d.brand.secondaryAuto = true))}>Secondary back to auto</LinkButton>}
          <LinkButton
            onClick={() =>
              update((d) => {
                d.brand.colors.black = DEFAULT_BLACK;
                d.brand.colors.white = DEFAULT_WHITE;
              })
            }
          >
            Black and white back to default
          </LinkButton>
        </div>
        {checks.length > 0 && (
          <ul className="checks">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Gradients">
        <GradientsEditor store={store} />
        <Help>Use them behind any scene: Scenes → open a scene → Background → Gradient.</Help>
      </Section>

      <Section title="Details">
        <div className="field">
          <span className="field-label">Website</span>
          <TextInput value={b.website} onChange={(v) => update((d) => void (d.brand.website = v), "website")} placeholder={defaultBrand.website} />
        </div>
        <div className="field">
          <span className="field-label">Tagline</span>
          <TextInput value={b.tagline} onChange={(v) => update((d) => void (d.brand.tagline = v), "tagline")} placeholder="A short line about the brand" />
        </div>
        <div className="field">
          <span className="field-label">Text on the wall sign (2 lines)</span>
          <TextInput value={b.signLine1} onChange={(v) => update((d) => void (d.brand.signLine1 = v), "sign1")} />
          <TextInput value={b.signLine2} onChange={(v) => update((d) => void (d.brand.signLine2 = v), "sign2")} />
        </div>
      </Section>

      <div className="privacy">
        <Icon.Lock size={16} />
        <p>
          <strong>Private by design.</strong> Your logo, fonts, screenshots and text stay in your browser. Only a URL you ask us to capture is sent to the screenshot service.
        </p>
      </div>
    </div>
  );
}

/** "No logo yet?": monograms and wordmarks made from the brand name, one click to use. */
function LogoMaker({ store }: { store: Store }) {
  const { project, update } = store;
  const b = project.brand;
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<MadeLogo[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setIdeas(null);
    makeLogos(b.name, b.font.family, b.font.weight, b.font.source)
      .then((l) => live && setIdeas(l))
      .catch(() => live && setIdeas([]));
    return () => {
      live = false;
    };
  }, [open, b.name, b.font.family, b.font.weight, b.font.source]);
  if (!open) {
    return (
      <LinkButton onClick={() => setOpen(true)}>
        <Icon.Sparkle size={14} /> No logo yet? Make one from your name
      </LinkButton>
    );
  }
  return (
    <div className="logo-maker">
      <div className="logo-maker-head">
        <strong>Made from “{b.name}” in {b.font.family}</strong>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
          <Icon.Close size={14} />
        </button>
      </div>
      {!ideas ? (
        <p className="hint-busy">Drawing ideas…</p>
      ) : (
        <div className="logo-maker-grid">
          {ideas.map((l) => {
            const active = l.kind === "mark" ? b.logoSvg === l.svg : b.useLettermark && b.lettermarkSvg === l.svg;
            return (
              <button
                key={l.id}
                type="button"
                className={"logo-maker-tile" + (l.kind === "wordmark" ? " wide" : "") + (active ? " active" : "")}
                title={l.kind === "mark" ? `${l.label}: use as the logo` : `${l.label}: use instead of the typed name`}
                onClick={() =>
                  update((d) => {
                    if (l.kind === "mark") {
                      d.brand.logoSvg = l.svg;
                      d.brand.logoColorMode = "primary";
                    } else {
                      d.brand.lettermarkSvg = l.svg;
                      d.brand.useLettermark = true;
                    }
                  })
                }
              >
                <img src={svgPreviewUrl(l.svg)} alt={l.label} />
              </button>
            );
          })}
        </div>
      )}
      <Help>Marks replace the logo. Wordmarks replace the typed name (turn off Lettermark below to go back). Change the font or name above and the ideas follow.</Help>
    </div>
  );
}
