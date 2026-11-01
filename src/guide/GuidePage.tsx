/**
 * The live brand guidelines page: a real, sectioned brand book built from the
 * project. The same component draws the preview in the editor and the public
 * page at /s/<id>, so what you edit is what your team sees.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Aspect, BrandGuide, ColorRole, GuideSectionId, GuideStyleKey, Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { brandIsRtl, resolveColors } from "../engine/kit";
import { buildTimeline } from "../engine/renderer";
import { sceneDef } from "../scenes/registry";
import { contrast, hexToRgb, mix } from "../brand/color";
import { prepareSvg } from "../brand/logo";
import { tinted } from "../brand/logoUrl";
import { weightLabel } from "../brand/fonts";
import { gradientCss } from "../engine/backdrop";
import { clock, useClock } from "../state/clock";
import { PlayerBar, Preview } from "../ui/Preview";
import { Icon } from "../ui/icons";
import { SceneLoop, downloadScenePng } from "./SceneLoop";
import { sectionLabel } from "./model";
import { GROUPS, LOGO_FILES, NEEDS, fileName, filePng, fileSize, fileSvg, isVector, kitZip, matchNeed, saveBlob, svgDataUrl, type LogoFile } from "./logoKit";

export type TFn = (k: string, v?: Record<string, string | number>) => string;

function fmt(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

function download(name: string, data: string | Blob, type = "image/svg+xml") {
  const url = URL.createObjectURL(typeof data === "string" ? new Blob([data], { type }) : data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToPng(src: string, width = 2048): Promise<Blob | null> {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => undefined);
  if (!img.naturalWidth) return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * img.naturalHeight) / img.naturalWidth);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

function cmyk(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) return "0 0 0 100";
  const f = (v: number) => Math.round(((1 - v / 255 - k) / (1 - k)) * 100);
  return `${f(r)} ${f(g)} ${f(b)} ${Math.round(k * 100)}`;
}

const ink = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111");

function CopyChip({ value, t }: { value: string; t: TFn }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="sp-copy"
      dir="ltr"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      title={t("copy")}
    >
      <span>{value}</span>
      {done ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
    </button>
  );
}

export interface GuidePageProps {
  project: Project;
  guide: BrandGuide;
  assets: BrandAssets;
  assetsVersion: number;
  t: TFn;
  lang: string;
  dir: "rtl" | "ltr";
  /** Page title (defaults to the brand name). */
  title?: string;
  /** "Shared by … · Updated …" */
  meta?: string;
  /** Name of whoever approved the brand, for the badge in the hero. */
  approvedBy?: string | null;
  /** Language switch, shown in the top bar. */
  onLang?: () => void;
  /** Extra section at the end (the feedback box on the public page). */
  footer?: ReactNode;
  /** In the editor: click a section to edit it. */
  onPick?: (id: GuideSectionId | "hero") => void;
  picked?: GuideSectionId | "hero" | null;
  /** Mark text written automatically (editor only). */
  showAuto?: boolean;
  /** Editor only: take a real SVG when the logo is just a picture. */
  onLogoSvg?: (svg: string) => void;
}

export function GuidePage(props: GuidePageProps) {
  const { project, guide, assets, assetsVersion, t, lang, dir, title, meta, approvedBy, onLang, footer, onPick, picked } = props;
  const b = project.brand;
  const c = resolveColors(b);
  const brandDir = brandIsRtl(b) ? "rtl" : "ltr";
  const font = { fontFamily: `"${b.font.family}", "Heebo", sans-serif`, fontWeight: b.font.weight };
  const sections = guide.sections.filter((s) => s.enabled).map((s) => s.id);
  const name = title || b.name;
  const fileBase = (b.name || "brand").toLowerCase().replace(/[^\w֐-׿]+/g, "-");
  const scroller = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(`gp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Custom colours: CSS variables on the page or on one part of it.
  const themed = (key: GuideStyleKey, base: string) => {
    const st = guide.styles?.[key];
    const vars: Record<string, string> = {};
    if (st?.bg) vars["--gp-bg"] = st.bg;
    if (st?.text) vars["--gp-ink"] = st.text;
    if (st?.heading || st?.text) vars["--gp-head"] = (st.heading || st.text)!;
    if (st?.accent) vars["--gp-accent"] = st.accent;
    const on = Object.keys(vars).length > 0;
    return { className: base + (on && key !== "page" ? " themed" : ""), style: vars as CSSProperties };
  };
  const pick = (id: GuideSectionId | "hero") => (onPick ? { onClick: () => onPick(id), "data-picked": picked === id ? "" : undefined, "data-pickable": "" } : {});

  const body: Record<GuideSectionId, () => ReactNode> = {
    about: () => <About {...props} font={font} brandDir={brandDir} />,
    logo: () => <Logo {...props} fileBase={fileBase} />,
    files: () => <LogoFiles {...props} />,
    color: () => <Colour {...props} />,
    type: () => <Type {...props} brandDir={brandDir} />,
    voice: () => <Voice {...props} font={font} brandDir={brandDir} />,
    motion: () => <Motion {...props} />,
    examples: () => <Examples {...props} />,
    formats: () => <Formats {...props} fileBase={fileBase} />,
  };

  return (
    <div
      className={themed("page", "gp" + (onPick ? " editing" : "")).className}
      dir={dir}
      lang={lang}
      style={{ ["--sp-primary" as string]: c.primary, ["--sp-secondary" as string]: c.secondary, ["--sp-dark" as string]: c.black, ["--sp-light" as string]: c.white, ...themed("page", "").style }}
    >
      <header {...themed("top", "gp-top")}>
        <span className="sp-brand gp-txt">
          <img src={tinted(b.logoSvg, b.logoColorMode === "original" ? null : c.black)} alt="" />
          <strong style={font}>{b.name}</strong>
        </span>
        <nav className="gp-nav" aria-label={t("contents")}>
          {sections.map((id) => (
            <a key={id} href={`#gp-${id}`} onClick={scroller(id)}>
              {sectionLabel(id, lang)}
            </a>
          ))}
        </nav>
        {onLang && (
          <button type="button" className="link-btn gp-lang" onClick={onLang}>
            {t("language")}
          </button>
        )}
      </header>

      <section {...themed("hero", "gp-hero")} {...pick("hero")}>
        <div className="gp-hero-text">
          <p className="sp-eyebrow">{t("guidelines")}</p>
          <h1 className="gp-txt" style={{ ...font, fontSize: `clamp(34px, ${Math.min(7, 56 / Math.max(8, name.length))}cqi, 88px)` }}>
            {name}
          </h1>
          {guide.intro && (
            <p className="gp-intro gp-txt">
              {guide.intro}
            </p>
          )}
          {meta && <p className="sp-meta">{meta}</p>}
          {guide.source.pdf && <p className="sp-meta">{t("sourcePdf", { file: guide.source.pdf })}</p>}
        </div>
        <div className="gp-player" dir="ltr">
          <div className="stage-card">
            <Preview project={project} assets={assets} assetsVersion={assetsVersion} />
            <PlayerBar project={project} />
          </div>
          {approvedBy && (
            <span className="gp-approved">
              <Icon.Check size={14} /> {t("approved", { name: approvedBy })}
            </span>
          )}
        </div>
      </section>

      <main className="gp-main">
        {sections.map((id, i) => (
          <section key={id} id={`gp-${id}`} {...themed(id, "gp-section gp-sec-" + id)} {...pick(id)}>
            <header className="gp-head">
              <span className="sp-num">{String(i + 1).padStart(2, "0")}</span>
              <h2>{sectionLabel(id, lang)}</h2>
            </header>
            {body[id]()}
          </section>
        ))}
        {footer}
      </main>

      <footer className="sp-foot">
        <a href="/" target="_blank" rel="noreferrer">
          <span className="brand-dot" aria-hidden /> {t("madeWith")}
        </a>
      </footer>
    </div>
  );
}

type Extra = { font?: React.CSSProperties; brandDir?: "rtl" | "ltr"; fileBase?: string };

function Auto({ show, k, guide, t }: { show?: boolean; k: string; guide: BrandGuide; t: TFn }) {
  return show && guide.auto.includes(k) ? <span className="gp-auto" title={t("autoNote")}><Icon.Sparkle size={11} /> {t("autoNote")}</span> : null;
}

function About({ guide, project, t, font, showAuto }: GuidePageProps & Extra) {
  const c = resolveColors(project.brand);
  const tiles = [c.primary, c.black, c.secondary, c.white];
  return (
    <>
      <div className="gp-lead">
        <p className="gp-big gp-txt">
          {guide.about}
        </p>
        <Auto show={showAuto} k="about" guide={guide} t={t} />
      </div>
      {guide.values.length > 0 && (
        <>
          <h3 className="gp-h3">{t("values")}</h3>
          <div className="gp-values gp-txt">
            {guide.values.map((v, i) => {
              const bg = tiles[i % tiles.length];
              return (
                <div key={v + i} className="gp-value" style={{ background: bg, color: ink(bg) }}>
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  <strong style={font}>{v}</strong>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Logo({ project, guide, t, fileBase }: GuidePageProps & Extra) {
  const b = project.brand;
  const c = resolveColors(b);
  const original = b.logoColorMode === "original";
  const onBrand = original ? null : ink(c.primary);
  const dark = tinted(b.logoSvg, original ? null : c.black);
  const light = tinted(b.logoSvg, original ? null : c.white);
  const versions = [
    { bg: c.white, src: dark, label: t("onLight") },
    { bg: c.black, src: light, label: t("onDark") },
    { bg: c.primary, src: tinted(b.logoSvg, onBrand), label: t("onBrand") },
    ...(b.lettermarkSvg && b.useLettermark ? [{ bg: c.white, src: tinted(b.lettermarkSvg, c.black), label: t("wordmark") }] : []),
  ];
  const pad = `${guide.logo.clearSpace * 100}%`;
  const misuse: { label: string; style: React.CSSProperties; bg?: string; src?: string }[] = [
    { label: t("dStretch"), style: { transform: "scaleX(1.6) scaleY(0.8)" } },
    { label: t("dRotate"), style: { transform: "rotate(-18deg)" } },
    { label: t("dRecolor"), style: {}, src: tinted(b.logoSvg, mix(c.primary, "#7b2ff7", 0.7)) },
    { label: t("dEffects"), style: { filter: `drop-shadow(6px 8px 0 ${c.secondary}) blur(0.4px)` } },
    { label: t("dBusy"), style: {}, bg: `repeating-linear-gradient(45deg, ${c.secondary} 0 14px, ${mix(c.primary, "#ffffff", 0.3)} 14px 28px)`, src: tinted(b.logoSvg, original ? null : mix(c.secondary, "#ffffff", 0.2)) },
    { label: t("dOutline"), style: {}, src: outline(b.logoSvg, c.black) },
  ];
  return (
    <>
      <p className="gp-p">{t("logoLead")}</p>
      <div className="gp-logo-hero" style={{ background: c.white }}>
        <div className="gp-clear" style={{ padding: `calc(${pad} * 0.32)` }}>
          <img src={dark} alt={`${b.name} ${t("logo")}`} />
          <span className="gp-x tl">x</span>
          <span className="gp-x br">x</span>
        </div>
      </div>
      <div className="gp-cols">
        <div>
          <h3 className="gp-h3">{t("clearSpace")}</h3>
          <p className="gp-p">{t("clearSpaceLead", { x: guide.logo.clearSpace === 1 ? "x" : `${guide.logo.clearSpace}x` })}</p>
        </div>
        <div>
          <h3 className="gp-h3">{t("minSize")}</h3>
          <p className="gp-p">{t("minSizeLead", { px: guide.logo.minPx, mm: guide.logo.minMm })}</p>
          <div className="gp-min" dir="ltr">
            <img src={dark} alt="" style={{ width: guide.logo.minPx }} />
            <span className="sp-code">{guide.logo.minPx}px</span>
          </div>
        </div>
      </div>
      <h3 className="gp-h3">{t("versions")}</h3>
      <div className="gp-versions">
        {versions.map((v) => (
          <figure key={v.label} className="sp-logo-tile" style={{ background: v.bg }}>
            <img src={v.src} alt="" />
            <figcaption style={{ color: ink(v.bg) }}>{v.label}</figcaption>
          </figure>
        ))}
      </div>
      <h3 className="gp-h3">{t("misuse")}</h3>
      <div className="gp-misuse">
        {misuse.map((m) => (
          <figure key={m.label}>
            <div className="gp-misuse-tile" style={{ background: m.bg ?? "#f4f4f6" }}>
              <img src={m.src ?? dark} alt="" style={m.style} />
              <span className="gp-cross" aria-hidden>
                <Icon.Close size={14} />
              </span>
            </div>
            <figcaption>{m.label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="sp-actions">
        <button type="button" className="ghost-btn" onClick={() => download(`${fileBase}-logo.svg`, prepareSvg(b.logoSvg).svg ?? b.logoSvg)}>
          <Icon.Download size={15} /> {t("downloadSvg")}
        </button>
        <button type="button" className="ghost-btn" onClick={() => svgToPng(dark).then((blob) => blob && download(`${fileBase}-logo.png`, blob))}>
          <Icon.Download size={15} /> {t("downloadPng")} · {t("onLight")}
        </button>
        <button type="button" className="ghost-btn" onClick={() => svgToPng(light).then((blob) => blob && download(`${fileBase}-logo-white.png`, blob))}>
          <Icon.Download size={15} /> {t("downloadPng")} · {t("onDark")}
        </button>
      </div>
    </>
  );
}

/** The logo drawn as an outline only, to show what not to do. */
function outline(svg: string, color: string) {
  const p = prepareSvg(svg);
  if (!p.ok || !p.svg || /<image\b/.test(p.svg)) return tinted(svg, color);
  const doc = new DOMParser().parseFromString(p.svg, "image/svg+xml");
  const root = doc.documentElement;
  const vb = (root.getAttribute("viewBox") ?? "0 0 100 100").split(/[\s,]+/).map(Number);
  const sw = Math.max(vb[2], vb[3]) * 0.012;
  doc.querySelectorAll("path, rect, circle, ellipse, polygon, polyline").forEach((el) => {
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", String(sw));
    el.removeAttribute("style");
  });
  doc.querySelectorAll("style").forEach((s) => s.remove());
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(root));
}

function Colour({ project, guide, t }: GuidePageProps) {
  const b = project.brand;
  const c = resolveColors(b);
  const roles: { role: ColorRole; label: string }[] = [
    { role: "primary", label: t("primary") },
    { role: "secondary", label: t("secondary") },
    { role: "black", label: t("black") },
    { role: "white", label: t("white") },
  ];
  const all = [...roles.map((r) => ({ hex: c[r.role], name: guide.colorNames[r.role] || r.label })), ...guide.extraColors];
  const pairs = useMemo(() => {
    // For each colour as a background, every other colour that can sit on it as text, best first.
    const out: { bg: string; fg: string; ratio: number; bgName: string; fgName: string }[] = [];
    for (const bg of all) {
      const fits = all.filter((fg) => fg.hex !== bg.hex).map((fg) => ({ bg: bg.hex, fg: fg.hex, ratio: contrast(bg.hex, fg.hex), bgName: bg.name, fgName: fg.name })).sort((a, b) => b.ratio - a.ratio);
      out.push(...fits.slice(0, 2));
    }
    return out.filter((p) => p.ratio >= 2).slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(all)]);
  const total = roles.reduce((s, r) => s + (guide.colorUsage[r.role] || 0), 0) || 1;
  return (
    <>
      <p className="gp-p">{t("colorLead")}</p>
      <div className="gp-colors">
        {roles.map(({ role, label }) => {
          const hex = c[role];
          const { r, g, b: bl } = hexToRgb(hex);
          return (
            <div key={role} className={"sp-color" + (role === "primary" ? " big" : "")}>
              <div className="sp-color-swatch" style={{ background: hex, color: ink(hex) }}>
                <strong>{guide.colorNames[role] || label}</strong>
                <small>{guide.colorNames[role] ? `${label} · ` : ""}{t("textOn", { ratio: contrast(hex, ink(hex)).toFixed(1) })}</small>
              </div>
              <div className="sp-color-codes">
                <CopyChip value={hex} t={t} />
                <CopyChip value={`rgb(${r}, ${g}, ${bl})`} t={t} />
                <span className="sp-code" dir="ltr">CMYK {cmyk(hex)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="gp-h3">{t("usage")}</h3>
      <p className="gp-p">{t("usageLead")}</p>
      <div className="gp-usage" dir="ltr">
        {roles
          .filter((r) => guide.colorUsage[r.role] > 0)
          .sort((a, b) => guide.colorUsage[b.role] - guide.colorUsage[a.role])
          .map((r) => (
            <span key={r.role} style={{ flex: guide.colorUsage[r.role] / total, background: c[r.role], color: ink(c[r.role]) }}>
              {Math.round((guide.colorUsage[r.role] / total) * 100)}%
            </span>
          ))}
      </div>

      <h3 className="gp-h3">{t("tints")}</h3>
      <div className="gp-tints" dir="ltr">
        {(["primary", "secondary", "black"] as ColorRole[]).map((role) => (
          <div key={role} className="gp-tint-row">
            {[1, 0.8, 0.6, 0.4, 0.2, 0.08].map((k) => {
              const hex = mix("#FFFFFF", c[role], k);
              return (
                <button key={k} type="button" title={hex} style={{ background: hex, color: ink(hex) }} onClick={() => navigator.clipboard?.writeText(hex)}>
                  <small>{Math.round(k * 100)}</small>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {guide.extraColors.length > 0 && (
        <>
          <h3 className="gp-h3">{t("more")}</h3>
          <div className="gp-extra">
            {guide.extraColors.map((x) => (
              <div key={x.hex + x.name} className="gp-extra-color">
                <span style={{ background: x.hex }} />
                <strong>{x.name}</strong>
                <CopyChip value={x.hex} t={t} />
              </div>
            ))}
          </div>
        </>
      )}

      {(b.gradients ?? []).length > 0 && (
        <div className="sp-gradients">
          {b.gradients.map((g) => (
            <div key={g.id} className="sp-gradient">
              <span style={{ background: gradientCss(g) }} />
              <CopyChip value={gradientCss(g)} t={t} />
            </div>
          ))}
        </div>
      )}

      <h3 className="gp-h3">{t("pairs")}</h3>
      <p className="gp-p">{t("pairsLead")}</p>
      <div className="gp-pairs">
        {pairs.map((p) => (
          <div key={p.bg + p.fg} className="gp-pair" style={{ background: p.bg, color: p.fg }}>
            <strong>Aa</strong>
            <span>
              {p.fgName} / {p.bgName}
            </span>
            <em className={p.ratio >= 4.5 ? "ok" : p.ratio >= 3 ? "mid" : "bad"} dir="ltr">
              {p.ratio.toFixed(1)}:1 · {p.ratio >= 7 ? "AAA" : p.ratio >= 4.5 ? "AA" : p.ratio >= 3 ? t("large") : t("fail")}
            </em>
          </div>
        ))}
      </div>
    </>
  );
}

function Type({ project, guide, t, brandDir }: GuidePageProps & Extra) {
  const b = project.brand;
  const rtl = brandDir === "rtl";
  const head = { fontFamily: `"${b.font.family}", "Heebo", sans-serif` };
  const bodyFam = guide.bodyFont?.family ?? b.font.family;
  const bodyStyle = { fontFamily: `"${bodyFam}", "Heebo", sans-serif` };
  const sample = guide.about || b.tagline || b.name;
  const scale = [
    { k: "display", size: 64, w: b.font.weight, lh: 1.05, text: b.tagline || b.name, style: head },
    { k: "heading", size: 40, w: b.font.weight, lh: 1.1, text: b.name, style: head },
    { k: "subheading", size: 24, w: Math.min(b.font.weight, 600), lh: 1.3, text: b.tagline || b.name, style: head },
    { k: "body", size: 16, w: 400, lh: 1.6, text: sample, style: bodyStyle },
    { k: "caption", size: 12, w: 500, lh: 1.4, text: b.website || b.name, style: bodyStyle },
  ];
  const fontLink = (family: string) => (
    <a className="ghost-btn" href={`https://fonts.google.com/specimen/${encodeURIComponent(family).replace(/%20/g, "+")}`} target="_blank" rel="noreferrer">
      <Icon.Link size={15} /> {t("getFont")}
    </a>
  );
  return (
    <>
      <div className="sp-type" style={head}>
        <div className="sp-type-big" style={{ fontWeight: b.font.weight }}>{rtl ? "אב" : "Aa"}</div>
        <div className="sp-type-info">
          <h3 style={{ fontWeight: b.font.weight }}>{b.font.family}</h3>
          <p className="sp-code" dir="ltr">{weightLabel(b.font.weight)} · {b.font.weight}</p>
          <p className="sp-type-sample gp-txt" style={{ fontWeight: b.font.weight }}>
            {rtl ? "אבגדהוזחטיכלמנסעפצקרשת" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
          </p>
          <p className="sp-type-sample light gp-txt">
            {rtl ? "אבגדהוזחטיכלמנסעפצקרשת 0123456789" : "abcdefghijklmnopqrstuvwxyz 0123456789"}
          </p>
          {b.font.source === "google" && fontLink(b.font.family)}
        </div>
      </div>
      {guide.bodyFont && (
        <div className="gp-bodyfont" style={bodyStyle}>
          <span className="sp-code">{t("bodyFont")}</span>
          <strong>{guide.bodyFont.family}</strong>
          {fontLink(guide.bodyFont.family)}
        </div>
      )}
      <h3 className="gp-h3">{t("scale")}</h3>
      <div className="gp-scale">
        {scale.map((s) => (
          <div key={s.k} className="gp-scale-row">
            <span className="sp-code" dir="ltr">
              {t(s.k)} · {s.size}px · {s.w}
            </span>
            <p className="gp-txt" style={{ ...s.style, fontSize: `min(${s.size}px, ${s.size / 6}cqi)`, fontWeight: s.w, lineHeight: s.lh }}>
              {s.text}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

function Voice({ guide, project, t, font, showAuto }: GuidePageProps & Extra) {
  const c = resolveColors(project.brand);
  return (
    <>
      <p className="gp-p">{t("voiceLead", { name: project.brand.name })}</p>
      {guide.voice.traits.length > 0 && (
        <div className="gp-traits gp-txt">
          <span className="sp-code">{t("weAre")}</span>
          {guide.voice.traits.map((x, i) => (
            <strong key={x + i} style={{ ...font, color: i % 2 ? c.black : c.primary }}>
              {x}
            </strong>
          ))}
          <Auto show={showAuto} k="voice.traits" guide={guide} t={t} />
        </div>
      )}
      <div className="gp-dodont">
        <div className="gp-do">
          <h3 className="gp-h3">
            <Icon.Check size={16} /> {t("doLabel")}
          </h3>
          <ul className="gp-txt">
            {guide.voice.do.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="gp-dont">
          <h3 className="gp-h3">
            <Icon.Close size={16} /> {t("dontLabel")}
          </h3>
          <ul className="gp-txt">
            {guide.voice.dont.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function Motion({ project, assets, t }: GuidePageProps) {
  const { entries, total } = useMemo(() => buildTimeline(project), [project]);
  const { t: now } = useClock();
  const transitions = [...new Set(entries.slice(1).map((e) => e.scene.transition))];
  const hero = ["sting", "reveal", "wordbuild", "assemble"].find((type) => project.scenes.some((s) => s.type === type)) ?? "reveal";
  return (
    <>
      <p className="gp-p">
        {t("motionLead", { cuts: project.tempo.snap ? t("cutsBeat", { bpm: project.tempo.bpm }) : t("cutsFree"), secs: Math.round(total) })}
      </p>
      <div className="gp-cols">
        <figure className="gp-example">
          <SceneLoop project={project} assets={assets} type={hero} aspect="16:9" />
          <figcaption>{t("logoMotion")}</figcaption>
        </figure>
        <div>
          <h3 className="gp-h3">{t("transitions")}</h3>
          <div className="gp-chips">
            {transitions.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <h3 className="gp-h3">{t("scenes")}</h3>
          <ol className="sp-scenes">
            {entries.map((e) => (
              <li key={e.scene.uid}>
                <button
                  type="button"
                  className={now >= e.start && now < e.end ? "active" : ""}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    clock.seek(e.start + 0.01);
                    clock.setPlaying(true);
                    document.querySelector(".gp-hero")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span className="sp-scene-time">{fmt(e.start)}</span>
                  <span>{sceneDef(e.scene.type)?.name ?? e.scene.type}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

const EXAMPLES: { type: string; key: string; aspect: Aspect }[] = [
  { type: "icon", key: "exIcon", aspect: "1:1" },
  { type: "phone", key: "exPhone", aspect: "1:1" },
  { type: "browser", key: "exBrowser", aspect: "16:9" },
  { type: "social", key: "exSocial", aspect: "1:1" },
  { type: "mockup", key: "exMockup", aspect: "1:1" },
  { type: "pattern", key: "exPattern", aspect: "16:9" },
  { type: "palette", key: "exPalette", aspect: "1:1" },
  { type: "signoff", key: "exSign", aspect: "1:1" },
];

function Examples({ project, assets, t }: GuidePageProps) {
  return (
    <>
      <p className="gp-p">{t("examplesLead")}</p>
      <div className="gp-examples">
        {EXAMPLES.map((e) => (
          <figure key={e.type} className={"gp-example a" + e.aspect.replace(":", "x")}>
            <SceneLoop project={project} assets={assets} type={e.type} aspect={e.aspect} />
            <figcaption>{t(e.key)}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

const FORMATS: { key: string; aspect: Aspect; size: string; type: string; round?: boolean }[] = [
  { key: "fPost", aspect: "1:1", size: "1080 × 1080", type: "reveal" },
  { key: "fStory", aspect: "9:16", size: "1080 × 1920", type: "reveal" },
  { key: "fVideo", aspect: "16:9", size: "1920 × 1080", type: "signoff" },
  { key: "fAvatar", aspect: "1:1", size: "1080 × 1080", type: "icon", round: true },
];

function Formats({ project, assets, t, fileBase }: GuidePageProps & Extra) {
  return (
    <>
      <p className="gp-p">{t("formatsLead")}</p>
      <div className="gp-formats">
        {FORMATS.map((f) => (
          <figure key={f.key} className={"gp-format a" + f.aspect.replace(":", "x")}>
            <div className="gp-format-frame">
              <SceneLoop project={project} assets={assets} type={f.type} aspect={f.aspect} round={f.round} />
            </div>
            <figcaption>
              <strong>{t(f.key)}</strong>
              <span className="sp-code" dir="ltr">
                {f.size}
              </span>
              <button
                type="button"
                className="ghost-btn small"
                onClick={(ev) => {
                  ev.stopPropagation();
                  downloadScenePng(project, assets, f.type, f.aspect, `${fileBase}-${f.key.slice(1).toLowerCase()}-${f.aspect.replace(":", "x")}.png`);
                }}
              >
                <Icon.Download size={14} /> PNG
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

function LogoFiles({ project, t, lang, onLogoSvg }: GuidePageProps) {
  const b = project.brand;
  const he = lang === "he";
  const [q, setQ] = useState("");
  const [need, setNeed] = useState<number | null>(null);
  const [zipping, setZipping] = useState<string | null>(null);
  const vector = isVector(b.logoSvg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previews = useMemo(() => new Map(LOGO_FILES.map((f) => [f.id, fileSvg(f, b)])), [b.logoSvg, b.logoColorMode, b.colors, b.secondaryAuto]);
  const ids = need !== null ? NEEDS[need].files : q.trim() ? matchNeed(q) : null;
  const shown = ids ? ids.map((id) => LOGO_FILES.find((f) => f.id === id)!).filter(Boolean) : null;

  const card = (f: LogoFile) => {
    const svg = previews.get(f.id);
    const { w, h } = fileSize(f, b);
    return (
      <div key={f.id} className="gp-file">
        <div className={"gp-file-art" + (f.bg === "none" ? " clear" + (f.tone === "light" ? " darkish" : "") : "")}>
          {svg && <img src={svgDataUrl(svg)} alt="" className={f.round ? "round" : ""} />}
        </div>
        <div className="gp-file-info">
          <strong>{he ? f.he : f.en}</strong>
          <small>{he ? f.whyHe : f.whyEn}</small>
          <span className="sp-code" dir="ltr">
            {w} × {h}
            {f.bg === "none" ? ` · ${t("transparent")}` : ""}
          </span>
        </div>
        <div className="gp-file-actions" dir="ltr">
          <button type="button" className="ghost-btn small" onClick={(e) => (e.stopPropagation(), filePng(f, b).then((blob) => blob && saveBlob(fileName(f, b, "png"), blob)))}>
            <Icon.Download size={13} /> PNG
          </button>
          {vector && svg && (
            <button type="button" className="ghost-btn small" onClick={(e) => (e.stopPropagation(), saveBlob(fileName(f, b, "svg"), new Blob([svg], { type: "image/svg+xml" })))}>
              <Icon.Download size={13} /> SVG
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <p className="gp-p">{t("filesLead")}</p>
      {!vector && (
        <div className="gp-novector">
          <span>{onLogoSvg ? t("noVectorEditor") : t("noVector")}</span>
          {onLogoSvg && (
            <label className="ghost-btn small" onClick={(e) => e.stopPropagation()}>
              <Icon.Upload size={13} /> {t("uploadSvg")}
              <input
                type="file"
                accept=".svg,image/svg+xml"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) onLogoSvg(await file.text());
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      )}
      <div className="gp-need" onClick={(e) => e.stopPropagation()}>
        <div className="gp-need-search">
          <Icon.Search size={16} />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setNeed(null);
            }}
            placeholder={t("needPlaceholder")}
            aria-label={t("needPlaceholder")}
          />
        </div>
        <div className="gp-need-chips">
          <button type="button" className={need === null && !q ? "active" : ""} onClick={() => (setNeed(null), setQ(""))}>
            {t("allFiles")}
          </button>
          {NEEDS.map((n, i) => (
            <button key={n.en} type="button" className={need === i ? "active" : ""} onClick={() => (setNeed(need === i ? null : i), setQ(""))}>
              {he ? n.he : n.en}
            </button>
          ))}
        </div>
      </div>
      {shown ? (
        shown.length ? (
          <div className="gp-files">{shown.map(card)}</div>
        ) : (
          <p className="gp-p">{t("noMatch")}</p>
        )
      ) : (
        GROUPS.map((g) => (
          <div key={g.id} className="gp-file-group">
            <h3 className="gp-h3">{he ? g.he : g.en}</h3>
            <div className="gp-files">{LOGO_FILES.filter((f) => f.group === g.id).map(card)}</div>
          </div>
        ))
      )}
      <div className="sp-actions">
        <button
          type="button"
          className="ghost-btn"
          disabled={!!zipping}
          onClick={async (e) => {
            e.stopPropagation();
            const blob = await kitZip(b, (n, total) => setZipping(t("zipping", { n, total })));
            setZipping(null);
            saveBlob(`${(b.name || "brand").toLowerCase().replace(/[^\w\u0590-\u05FF]+/g, "-")}-logo-kit.zip`, blob);
          }}
        >
          <Icon.Download size={15} /> {zipping ?? t("downloadAll")}
        </button>
      </div>
    </>
  );
}
