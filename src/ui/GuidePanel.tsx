/**
 * The editor side of the guidelines page: choose and order sections, edit
 * every text, and pick from suggested ideas for anything missing. Visuals
 * (logo, colours, fonts) are edited in the Brand tab and show up here live.
 */
import { useMemo, useState } from "react";
import type { BrandGuide, ColorRole, GuideSectionId } from "../types";
import type { Store } from "../state/store";
import { GUIDE_SECTIONS, editGuide, emptyGuide, fillGuide, guideIdeas, logoRules } from "../guide/model";
import { readBrandPdf } from "../guide/pdf";
import { brandFromPdf, guideFromPdf } from "../guide/sources";
import { colorsFromLogo } from "../guide/logoColors";
import { readSite } from "../brand/fromSite";
import { GOOGLE_FONTS } from "../brand/fonts";
import { normalizeHex } from "../brand/color";
import { resolveColors } from "../engine/kit";
import { DropZone } from "./DropZone";
import { useLang } from "../i18n";
import { LogoSlot } from "./BrandPanel";
import { ColorSwatch, Select } from "./controls";
import { HEBREW_FONTS, WEIGHTS } from "../brand/fonts";
import { PLACEHOLDER_LOGO, defaultBrand } from "../brand/defaults";
import { isMultiColor } from "../brand/logoImport";
import type { Store as StoreT } from "../state/store";
import { Section, Slider, Toggle } from "./controls";
import { Icon } from "./icons";

type Pick = GuideSectionId | "hero";

export function GuidePanel({ store, picked, onPick, onShare, onBrandTab }: { store: Store; picked: Pick | null; onPick: (p: Pick | null) => void; onShare: () => void; onBrandTab: () => void }) {
  const { project, update } = store;
  const stored = project.guide ?? emptyGuide();
  const { lang } = useLang();
  const guide = useMemo(() => fillGuide(project, stored, lang), [project, stored, lang]);
  const ideas = useMemo(() => guideIdeas(project.brand, stored.source.siteText, lang), [project.brand, stored.source.siteText, lang]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [site, setSite] = useState(project.brand.website);

  /** Save a change to one field; it stops being automatic. */
  const set = (key: string, patch: Partial<BrandGuide>, merge?: string) => update((d) => void (d.guide = editGuide(d.guide ?? stored, key, patch)), merge);
  const setRaw = (fn: (g: BrandGuide) => BrandGuide, merge?: string) => update((d) => void (d.guide = fn(d.guide ?? stored)), merge);

  const importPdf = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy("pdf");
    setNote(null);
    try {
      const pdf = await readBrandPdf(f);
      update((d) => {
        const patch = brandFromPdf(pdf, d.brand);
        d.guide = guideFromPdf(pdf, d.brand, d.guide ?? stored);
        d.brand = { ...d.brand, ...patch, colors: { ...d.brand.colors, ...(patch.colors ?? {}) } };
      });
      const found = [pdf.colors.length && `${pdf.colors.length} colours`, pdf.fonts.length && `fonts (${pdf.fonts.map((x) => x.original).slice(0, 2).join(", ")})`, pdf.about && "the brand story", pdf.values.length && "values", pdf.traits.length && "voice"].filter(Boolean);
      setNote(found.length ? `Read ${pdf.pages} pages: found ${found.join(", ")}. Everything else is suggested; edit anything below.` : `We couldn't find text in this PDF (it may be images only). The page is filled with suggestions instead.`);
    } catch (e) {
      setNote(`We couldn't read that PDF: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const readWebsite = async () => {
    if (!site.trim()) return;
    setBusy("site");
    setNote(null);
    try {
      const s = await readSite(site);
      setRaw((g) => ({ ...g, source: { ...g.source, site: s.url, siteText: s.description || g.source.siteText } }));
      if (s.description) set("about", { about: s.description });
      setNote(s.description ? "Took the brand story from the website. Pick another idea below if you prefer." : "The website has no description to borrow, so the suggestions stay.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const logoColours = async () => {
    const patch = await colorsFromLogo(project.brand.logoSvg, project.brand);
    if (!patch) return setNote("The logo is one neutral colour, so there are no brand colours to take from it. Set them in the Brand tab.");
    update((d) => void (d.brand = { ...d.brand, ...patch, colors: { ...d.brand.colors, ...(patch.colors ?? {}) } }));
    setNote("Colours now come from the logo.");
  };

  const move = (i: number, by: number) =>
    setRaw((g) => {
      const list = [...g.sections];
      const j = i + by;
      if (j < 0 || j >= list.length) return g;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...g, sections: list };
    });

  const auto = (k: string) => (guide.auto.includes(k) ? <span className="gp-auto-tag"><Icon.Sparkle size={11} /> Suggested</span> : null);
  const c = resolveColors(project.brand);

  return (
    <div className="panel-scroll guide-panel">
      <div className="guide-cta">
        <button type="button" className="primary-btn" onClick={onShare}>
          <Icon.Link size={15} /> Publish & share
        </button>
        <span>One link for the whole team. It updates when you publish again.</span>
      </div>

      {picked ? (
        <button type="button" className="link-btn guide-back" onClick={() => onPick(null)}>
          <Icon.Chevron size={14} style={{ transform: "rotate(90deg)" }} /> All sections
        </button>
      ) : (
        <>
      <Section title="Brand basics">
        <BrandBasics store={store} />
        <button type="button" className="link-btn" onClick={onBrandTab}>
          More brand settings (gradients, lettermark, second line)
        </button>
      </Section>

      <Section title="Start from">
        <div className="guide-sources">
          <DropZone accept="application/pdf,.pdf" onFiles={importPdf} className="guide-source">
            <Icon.File size={18} />
            <span>
              <strong>{busy === "pdf" ? "Reading the PDF…" : "Brand book PDF"}</strong>
              <small>{stored.source.pdf ? `From ${stored.source.pdf}. Drop another to replace.` : "Optional. Colours, fonts, story and values are read from it."}</small>
            </span>
          </DropZone>
          <button type="button" className="guide-source" onClick={logoColours}>
            <Icon.Sparkle size={18} />
            <span>
              <strong>Colours from the logo</strong>
              <small>When the logo is all you have.</small>
            </span>
          </button>
          <form
            className="guide-site"
            onSubmit={(e) => {
              e.preventDefault();
              readWebsite();
            }}
          >
            <input dir="ltr" value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourbrand.com" aria-label="Website" />
            <button type="submit" className="ghost-btn small" disabled={!!busy || !site.trim()}>
              {busy === "site" ? "Reading…" : "Read story"}
            </button>
          </form>
        </div>
        {note && <p className="guide-note">{note}</p>}
      </Section>

      <Section title="Sections">
        <ul className="guide-sections">
          <li className={picked === "hero" ? "active" : ""}>
            <button type="button" className="guide-sec-name" onClick={() => onPick(picked === "hero" ? null : "hero")}>
              <strong>Cover</strong>
              <small>Title, intro, the film</small>
            </button>
          </li>
          {guide.sections.map((s, i) => {
            const def = GUIDE_SECTIONS.find((x) => x.id === s.id)!;
            return (
              <li key={s.id} className={(picked === s.id ? "active" : "") + (s.enabled ? "" : " off")}>
                <button type="button" className="guide-sec-name" onClick={() => onPick(picked === s.id ? null : s.id)}>
                  <strong>{def.en}</strong>
                  <small>{def.hint}</small>
                </button>
                <span className="guide-sec-tools">
                  <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon.Chevron size={14} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Move down" disabled={i === guide.sections.length - 1} onClick={() => move(i, 1)}>
                    <Icon.Chevron size={14} />
                  </button>
                  <Toggle checked={s.enabled} onChange={(v) => setRaw((g) => ({ ...g, sections: g.sections.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)) }))} />
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

        </>
      )}

      {picked === "hero" && (
        <Section title="Cover" aside={auto("intro")}>
          <BrandBasics store={store} parts={["name"]} />
          <TextArea value={guide.intro} onChange={(v) => set("intro", { intro: v }, "guide-intro")} />
          <Ideas list={ideas.intro} current={[guide.intro]} onPick={(v) => set("intro", { intro: v })} />
          <p className="guide-hint">The page title is set when you publish. The film is the one in the Video view.</p>
        </Section>
      )}

      {picked === "about" && (
        <>
          <Section title="Brand story" aside={auto("about")}>
            <TextArea value={guide.about} rows={6} onChange={(v) => set("about", { about: v }, "guide-about")} />
            <Ideas list={ideas.about} current={[guide.about]} onPick={(v) => set("about", { about: v })} long />
          </Section>
          <Section title="Values" aside={auto("values")}>
            <ListEditor items={guide.values} onChange={(v) => set("values", { values: v })} placeholder="Add a value" chips />
            <Ideas list={ideas.values} current={guide.values} onPick={(v) => set("values", { values: [...guide.values, v] })} add />
          </Section>
        </>
      )}

      {picked === "logo" && (
        <Section title="Logo rules" aside={auto("logo")}>
          <BrandBasics store={store} parts={["logo"]} />
          <Slider label="Clear space (× logo height)" value={guide.logo.clearSpace} min={0.1} max={1.5} step={0.05} onChange={(v) => set("logo", { logo: { ...guide.logo, clearSpace: v } }, "guide-clear")} />
          <Slider label="Minimum width on screen" value={guide.logo.minPx} min={16} max={300} step={2} unit="px" onChange={(v) => set("logo", { logo: { ...guide.logo, minPx: v } }, "guide-minpx")} />
          <Slider label="Minimum width in print" value={guide.logo.minMm} min={5} max={80} step={1} unit="mm" onChange={(v) => set("logo", { logo: { ...guide.logo, minMm: v } }, "guide-minmm")} />
          {!guide.auto.includes("logo") && (
            <button type="button" className="link-btn" onClick={() => setRaw((g) => ({ ...g, logo: { ...g.logo, ...pickRules(logoRules(project.brand.logoSvg)) }, auto: [...g.auto, "logo"] }))}>
              Use the suggested rules for this logo
            </button>
          )}
        </Section>
      )}

      {picked === "color" && (
        <>
          <Section title="Colours">
            <BrandBasics store={store} parts={["colors"]} />
            <button type="button" className="link-btn" onClick={logoColours}>
              <Icon.Sparkle size={13} /> Take the colours from the logo
            </button>
          </Section>
          <Section title="Colour names">
            {(["primary", "secondary", "black", "white"] as ColorRole[]).map((r) => (
              <label key={r} className="guide-color-name">
                <span style={{ background: c[r] }} />
                <input value={guide.colorNames[r] ?? ""} placeholder={{ primary: "Primary", secondary: "Secondary", black: "Dark", white: "Light" }[r]} onChange={(e) => set("colorNames", { colorNames: { ...guide.colorNames, [r]: e.target.value } }, "guide-cname-" + r)} />
              </label>
            ))}
          </Section>
          <Section title="Proportions" aside={auto("colorUsage")}>
            {(["primary", "secondary", "black", "white"] as ColorRole[]).map((r) => (
              <Slider key={r} label={guide.colorNames[r] || { primary: "Primary", secondary: "Secondary", black: "Dark", white: "Light" }[r]} value={guide.colorUsage[r]} min={0} max={100} step={5} unit="%" onChange={(v) => set("colorUsage", { colorUsage: { ...guide.colorUsage, [r]: v } }, "guide-usage-" + r)} />
            ))}
          </Section>
          <Section title="Supporting colours">
            {guide.extraColors.map((x, i) => (
              <div key={i} className="guide-extra">
                <input type="color" value={x.hex} onChange={(e) => set("extraColors", { extraColors: guide.extraColors.map((y, j) => (j === i ? { ...y, hex: normalizeHex(e.target.value) ?? y.hex } : y)) }, "guide-extra-" + i)} aria-label="Colour" />
                <input value={x.name} onChange={(e) => set("extraColors", { extraColors: guide.extraColors.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }, "guide-extra-name-" + i)} />
                <button type="button" className="icon-btn" aria-label="Remove" onClick={() => set("extraColors", { extraColors: guide.extraColors.filter((_, j) => j !== i) })}>
                  <Icon.Trash size={13} />
                </button>
              </div>
            ))}
            <button type="button" className="link-btn" onClick={() => set("extraColors", { extraColors: [...guide.extraColors, { hex: c.secondary, name: `Colour ${guide.extraColors.length + 1}` }] })}>
              <Icon.Plus size={13} /> Add a colour
            </button>
          </Section>
        </>
      )}

      {picked === "type" && (
        <Section title="Fonts">
          <BrandBasics store={store} parts={["font"]} />
          <label className="guide-field">
            <span>Body text font</span>
            <select value={guide.bodyFont?.family ?? ""} onChange={(e) => set("bodyFont", { bodyFont: e.target.value ? { family: e.target.value, source: "google", weight: 400 } : null })}>
              <option value="">Same as headlines ({project.brand.font.family})</option>
              {[...new Set([...(guide.bodyFont ? [guide.bodyFont.family] : []), ...GOOGLE_FONTS])].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </Section>
      )}

      {picked === "voice" && (
        <>
          <Section title="Personality" aside={auto("voice.traits")}>
            <ListEditor items={guide.voice.traits} onChange={(v) => set("voice.traits", { voice: { ...guide.voice, traits: v } })} placeholder="Add a word" chips />
            <Ideas list={ideas.traits} current={guide.voice.traits} onPick={(v) => set("voice.traits", { voice: { ...guide.voice, traits: [...guide.voice.traits, v] } })} add />
          </Section>
          <Section title="Do" aside={auto("voice.do")}>
            <ListEditor items={guide.voice.do} onChange={(v) => set("voice.do", { voice: { ...guide.voice, do: v } })} placeholder="Add a rule" />
            <Ideas list={ideas.do} current={guide.voice.do} onPick={(v) => set("voice.do", { voice: { ...guide.voice, do: [...guide.voice.do, v] } })} add />
          </Section>
          <Section title="Don't" aside={auto("voice.dont")}>
            <ListEditor items={guide.voice.dont} onChange={(v) => set("voice.dont", { voice: { ...guide.voice, dont: v } })} placeholder="Add a rule" />
            <Ideas list={ideas.dont} current={guide.voice.dont} onPick={(v) => set("voice.dont", { voice: { ...guide.voice, dont: [...guide.voice.dont, v] } })} add />
          </Section>
        </>
      )}

      {picked === "files" && (
        <Section title="Logo files">
          <p className="guide-hint">Every file is made from your logo and colours: transparent PNGs, SVG vectors, profile pictures, covers, favicons, email signature, print and slides. Visitors can search by need ("Instagram profile", "dark background") or download everything as a ZIP.</p>
          <BrandBasics store={store} parts={["logo"]} />
        </Section>
      )}

      {(picked === "motion" || picked === "examples" || picked === "formats") && (
        <Section title={GUIDE_SECTIONS.find((s) => s.id === picked)!.en}>
          <p className="guide-hint">
            {picked === "motion" && "This section shows your film and its logo animation. Edit the film in the Video view: its scenes, timing and music all show up here."}
            {picked === "examples" && "Your brand on an app icon, phone, website, social profile, merchandise and more, drawn live from your logo and colours. Change the brand and every example follows."}
            {picked === "formats" && "Square, portrait, story, video and profile picture, each ready to download as an image from the page."}
          </p>
        </Section>
      )}

      {!picked && <p className="guide-hint guide-pad">Pick a section to edit it, or click it on the page. Text marked “Suggested” was written for you from the brand; change anything.</p>}
    </div>
  );
}

function pickRules(r: { clearSpace: number; minPx: number; minMm: number }) {
  return { clearSpace: r.clearSpace, minPx: r.minPx, minMm: r.minMm };
}

function TextArea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea className="guide-text" dir="auto" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Suggested ideas: tap one to use it (or add it to a list). */
function Ideas({ list, current, onPick, add, long }: { list: string[]; current: string[]; onPick: (v: string) => void; add?: boolean; long?: boolean }) {
  const left = list.filter((x) => !current.includes(x));
  if (!left.length) return null;
  return (
    <div className={"guide-ideas" + (long ? " long" : "")}>
      <span className="guide-ideas-label">
        <Icon.Sparkle size={12} /> Ideas
      </span>
      {left.map((x) => (
        <button key={x} type="button" dir="auto" onClick={() => onPick(x)} title={x}>
          {add && <Icon.Plus size={11} />} {long ? (x.length > 110 ? x.slice(0, 110) + "…" : x) : x}
        </button>
      ))}
    </div>
  );
}

function ListEditor({ items, onChange, placeholder, chips }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; chips?: boolean }) {
  const [draft, setDraft] = useState("");
  const addItem = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className={"guide-list" + (chips ? " chips" : "")}>
      {items.map((x, i) =>
        chips ? (
          <span key={i} className="guide-chip" dir="auto">
            {x}
            <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon.Close size={11} />
            </button>
          </span>
        ) : (
          <div key={i} className="guide-row">
            <input dir="auto" value={x} onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value : y)))} />
            <button type="button" className="icon-btn" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon.Trash size={13} />
            </button>
          </div>
        ),
      )}
      <form
        className="guide-add"
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
      >
        <input dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="icon-btn" aria-label="Add" disabled={!draft.trim()}>
          <Icon.Plus size={14} />
        </button>
      </form>
    </div>
  );
}

const ROLE_LABEL: Record<ColorRole, string> = { primary: "Primary", secondary: "Secondary", black: "Dark", white: "Light" };

/** Logo, name, colours and font, editable right here: fix anything the import got wrong without leaving the page. */
function BrandBasics({ store, parts = ["logo", "name", "colors", "font"] }: { store: StoreT; parts?: ("logo" | "name" | "colors" | "font")[] }) {
  const { project, update } = store;
  const b = project.brand;
  const c = resolveColors(b);
  const fonts = [...new Set([b.font.family, ...GOOGLE_FONTS])].map((f) => ({ value: f, label: HEBREW_FONTS.has(f) ? `${f} · עברית` : f }));
  return (
    <div className="guide-basics">
      {parts.includes("logo") && (
        <>
          <LogoSlot
            title="Logo"
            svg={b.logoSvg}
            isPlaceholder={b.logoSvg === PLACEHOLDER_LOGO}
            onSvg={async (svg) => {
              // Still on the sample colours: the logo's own colours are a better start.
              const sample = (["primary", "secondary", "black"] as const).every((r) => b.colors[r].toUpperCase() === defaultBrand.colors[r].toUpperCase());
              const fromLogo = sample ? await colorsFromLogo(svg, b) : null;
              update((d) => {
                d.brand.logoSvg = svg;
                d.brand.logoColorMode = isMultiColor(svg) ? "original" : "primary";
                if (fromLogo) d.brand = { ...d.brand, ...fromLogo, colors: { ...d.brand.colors, ...(fromLogo.colors ?? {}) } };
              });
            }}
            onClear={() => update((d) => void (d.brand.logoSvg = PLACEHOLDER_LOGO))}
          />
          {/<image\b/.test(b.logoSvg) && <p className="guide-warn">This logo is a picture, not a vector. Upload the SVG above for sharp files and real SVG downloads.</p>}
          <label className="guide-check">
            <input type="checkbox" checked={b.logoColorMode === "original"} onChange={(e) => update((d) => void (d.brand.logoColorMode = e.target.checked ? "original" : "primary"))} />
            <span>Keep the logo's own colours</span>
          </label>
        </>
      )}
      {parts.includes("name") && (
        <div className="guide-two">
          <label className="guide-field">
            <span>Brand name</span>
            <input className="guide-input" dir="auto" value={b.name} onChange={(e) => update((d) => void (d.brand.name = e.target.value), "name")} />
          </label>
          <label className="guide-field">
            <span>Tagline</span>
            <input className="guide-input" dir="auto" value={b.tagline} onChange={(e) => update((d) => void (d.brand.tagline = e.target.value), "tagline")} />
          </label>
        </div>
      )}
      {parts.includes("colors") && (
        <div className="swatches">
          {(["primary", "secondary", "black", "white"] as ColorRole[]).map((r) => (
            <ColorSwatch key={r} label={ROLE_LABEL[r]} value={c[r]} onChange={(hex) => update((d) => void ((d.brand.colors[r] = hex), r === "secondary" && (d.brand.secondaryAuto = false)), "c-" + r)} />
          ))}
        </div>
      )}
      {parts.includes("font") && (
        <div className="guide-two">
          <label className="guide-field">
            <span>Headline font</span>
            <Select value={b.font.family} options={fonts} onChange={(family) => update((d) => void (d.brand.font = { ...d.brand.font, family, source: "google" }))} />
          </label>
          <label className="guide-field">
            <span>Weight</span>
            <Select value={b.font.weight} options={WEIGHTS} onChange={(weight) => update((d) => void (d.brand.font.weight = weight))} />
          </label>
        </div>
      )}
    </div>
  );
}
