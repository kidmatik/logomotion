import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandKit, ColorRole, Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { ASPECTS, buildTimeline, renderFrame } from "../engine/renderer";
import { useAssets } from "../state/useAssets";
import { fillPhotoScenes } from "../state/store";
import { templateById } from "../templates";
import { PLACEHOLDER_LOGO, defaultBrand } from "../brand/defaults";
import { prepareSvg } from "../brand/logo";
import { svgUrl, tinted } from "../brand/logoUrl";
import { bitmapToSvg } from "../brand/logoImport";
import { makeLogos, type MadeLogo } from "../brand/logoMaker";
import { brandFromSite, fillColorsFromIcon, isWide, pickLogoSlots, preferLogoColors, fixAddressLayout, fontChoices, logoOptions, readSite, type LogoOption, type SiteBrand } from "../brand/fromSite";
import { HEBREW_FONTS, ensureGoogleFont } from "../brand/fonts";
import { isRtlText } from "../engine/kit";
import { normalizeHex } from "../brand/color";
import { resolveColors } from "../engine/kit";
import { PlayerBar, Preview } from "./Preview";
import { brandGradients, gradientCss } from "../engine/backdrop";
import { DropZone } from "./DropZone";
import { Icon } from "./icons";
import { clock } from "../state/clock";
import { music } from "../audio/engine";
import { useLang, type TKey } from "../i18n";

export type Goal = "sting" | "reel" | "film" | "page";
export type Audience = "mine" | "client";

export interface OnboardingResult {
  project: Project;
  goal: Goal;
  audience: Audience;
  /** Website to screenshot into a screens scene. */
  capture: string | null;
  files: File[];
}

const GOALS: { id: Goal; template: string; title: TKey; sub: TKey }[] = [
  { id: "sting", template: "logo-sting", title: "goalSting", sub: "goalStingSub" },
  { id: "reel", template: "brand-reel", title: "goalReel", sub: "goalReelSub" },
  { id: "film", template: "brand-in-motion", title: "goalFilm", sub: "goalFilmSub" },
  { id: "page", template: "brand-in-motion", title: "goalPage", sub: "goalPageSub" },
];

/** The logo moments a gradient picked in onboarding goes behind. */
const HERO = ["reveal", "sting", "wordbuild", "assemble", "signoff", "endcard", "flash"];

const PROFILE_KEY = "logomotion.profile";
export const ONBOARDED_KEY = "logomotion.onboarded";

/** Has the user already been through onboarding (or skipped it) on this browser? */
export function onboarded() {
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

/** A project still showing the sample brand: worth offering onboarding. */
export function isPristine(p: Project) {
  return p.brand.logoSvg === PLACEHOLDER_LOGO && p.brand.name === defaultBrand.name && p.media.length === 0;
}

function withTemplate(p: Project, id: string): Project {
  const t = templateById(id);
  const scenes = t.scenes();
  fillPhotoScenes(scenes, p.media);
  return { ...p, template: t.id, aspect: t.aspect, tempo: { ...t.tempo }, music: { ...p.music, style: t.music }, scenes };
}

/** A small looping player for the goal cards, drawn by the real renderer. */
function LiveThumb({ project, assets }: { project: Project; assets: BrandAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w: AW, h: AH } = ASPECTS[project.aspect];
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const box = c.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = box.height;
    const w = Math.min(box.width, (h * AW) / AH);
    c.style.width = `${w}px`;
    c.style.height = `${(w * AH) / AW}px`;
    c.width = Math.round(w * dpr);
    c.height = Math.round(((w * AH) / AW) * dpr);
    const ctx = c.getContext("2d")!;
    const { total, entries } = buildTimeline(project);
    const hero = entries.find((e) => ["reveal", "wordbuild", "sting"].includes(e.scene.type));
    let t = hero ? hero.start + 0.6 : 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      t = (t + Math.min(0.1, (now - last) / 1000)) % Math.max(0.1, total);
      last = now;
      try {
        renderFrame(ctx, c.width, c.height, project, assets, t);
      } catch {
        /* a thumbnail failing shouldn't break onboarding */
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [project, assets, AW, AH]);
  return <canvas ref={ref} />;
}

/**
 * The "Live brand guidelines" card: a tiny brand page in a browser window that
 * scrolls through its sections (motion, colour, type, logo) and gets approved.
 */
function GuidelinesThumb({ project, assets, url }: { project: Project; assets: BrandAssets; url: string }) {
  const b = project.brand;
  const c = resolveColors(b);
  const font = { fontFamily: `"${b.font.family}"`, fontWeight: b.font.weight };
  const logo = useMemo(() => tinted(b.logoSvg, b.logoColorMode === "original" ? null : c.black), [b.logoSvg, b.logoColorMode, c.black]);
  const logoLight = useMemo(() => tinted(b.logoSvg, b.logoColorMode === "original" ? null : c.white), [b.logoSvg, b.logoColorMode, c.white]);
  return (
    <span className="gl-thumb" dir="ltr" style={{ ["--gl-primary" as string]: c.primary, ["--gl-secondary" as string]: c.secondary, ["--gl-dark" as string]: c.black, ["--gl-light" as string]: c.white }}>
      <span className="gl-window">
        <span className="gl-bar">
          <i />
          <i />
          <i />
          <span className="gl-url">
            <span className="gl-live" /> {url}
          </span>
        </span>
        <span className="gl-page">
          <span className="gl-scroll">
            <span className="gl-sec gl-hero">
              <span className="gl-hero-text">
                <strong style={font}>{b.name}</strong>
                <span className="gl-hero-lines">
                  <span className="gl-eyebrow" />
                  <span className="gl-line" />
                  <span className="gl-line short" />
                </span>
              </span>
              <span className="gl-video">
                <LiveThumb project={project} assets={assets} />
              </span>
            </span>
            <span className="gl-sec gl-colors">
              <span style={{ background: c.primary }} />
              <span style={{ background: c.secondary }} />
              <span style={{ background: c.black }} />
              <span style={{ background: c.white }} />
            </span>
            <span className="gl-sec gl-type">
              <strong style={font}>Aa</strong>
              <span>
                <span className="gl-line" />
                <span className="gl-line" />
                <span className="gl-line short" />
              </span>
            </span>
            <span className="gl-sec gl-logos">
              <span style={{ background: c.white }}>{logo && <img src={logo} alt="" />}</span>
              <span style={{ background: c.black }}>{logoLight && <img src={logoLight} alt="" />}</span>
            </span>
          </span>
        </span>
      </span>
      <span className="gl-approved">
        <Icon.Check size={10} /> Approved
      </span>
    </span>
  );
}

/** What the brand page's address could look like, for the thumbnail. */
function pageUrl(brand: BrandKit) {
  const host = (brand.website || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return host || brand.name || "yourbrand.com";
}

const ROLES: { role: ColorRole; key: TKey }[] = [
  { role: "primary", key: "primary" },
  { role: "secondary", key: "secondary" },
  { role: "black", key: "dark" },
  { role: "white", key: "light" },
];

export function Onboarding({ initial, onFinish, onSkip }: { initial: Project; onFinish: (r: OnboardingResult) => void; onSkip: () => void }) {
  const { t, lang, setLang, dir } = useLang();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [audience, setAudience] = useState<Audience>(() => (localStorage.getItem(PROFILE_KEY) === "client" ? "client" : "mine"));
  const [draft, setDraft] = useState<Project>(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<SiteBrand | null>(null);
  const [siteLogos, setSiteLogos] = useState<LogoOption[]>([]);
  const [made, setMade] = useState<MadeLogo[]>([]);
  const [noLogoName, setNoLogoName] = useState("");
  const [role, setRole] = useState<ColorRole>("primary");
  const [capture, setCapture] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const { assets, version } = useAssets(draft);
  const brand = draft.brand;
  const colors = resolveColors(brand);

  useEffect(() => music.setProject(draft), [draft]);

  const setBrand = (patch: Partial<BrandKit>) => setDraft((d) => ({ ...d, brand: { ...d.brand, ...patch, colors: { ...d.brand.colors, ...(patch.colors ?? {}) } } }));

  // Thumbnails for the goal cards, each in the template's own format.
  const goalProjects = useMemo(() => GOALS.map((g) => withTemplate(draft, g.template)), [draft.brand, draft.media]); // eslint-disable-line react-hooks/exhaustive-deps

  // Logo ideas from the name, refreshed when the name or font changes.
  useEffect(() => {
    if (step < 2) return;
    let live = true;
    const id = setTimeout(() => {
      ensureGoogleFont(brand.font.family)
        .catch(() => undefined)
        .then(() => makeLogos(brand.name, brand.font.family, brand.font.weight, brand.font.source))
        .then((list) => live && setMade(list))
        .catch(() => live && setMade([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [step, brand.name, brand.font.family, brand.font.weight, brand.font.source]);

  // The live preview starts playing on the review step.
  useEffect(() => {
    if (step === 2) {
      clock.seek(0);
      clock.setPlaying(true);
    }
  }, [step]);

  const pickGoal = (g: Goal) => {
    setGoal(g);
    setDraft((d) => withTemplate(d, GOALS.find((x) => x.id === g)!.template));
  };

  const readBrand = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const read = await fillColorsFromIcon(await readSite(url));
      const logos = await logoOptions(read);
      const s = read.blocked ? read : await preferLogoColors(read, logos[0]);
      setSite(s);
      setSiteLogos(logos);
      setDraft((d) => {
        const patch = brandFromSite(s, d.brand);
        const { logo, wordmark } = pickLogoSlots(logos);
        return {
          ...d,
          brand: {
            ...d.brand,
            ...patch,
            colors: { ...d.brand.colors, ...(patch.colors ?? {}) },
            font: (() => {
              const f = patch.font ?? d.brand.font;
              return isRtlText(patch.name ?? "") && !HEBREW_FONTS.has(f.family) && !s.fonts.some((x) => x.family === f.family && !x.lookalike) ? { family: "Heebo", source: "google" as const, weight: f.weight } : f;
            })(),
            logoSvg: logo?.svg ?? PLACEHOLDER_LOGO,
            // A two-colour wordmark keeps its colours too, so the pair matches the site.
            logoColorMode: logo?.original || wordmark?.original ? "original" : "primary",
            lettermarkSvg: wordmark?.svg ?? null,
            useLettermark: !!wordmark,
          },
        };
      });
      setStep(2);
    } catch (e) {
      const msg = (e as Error).message;
      setError(/automatic visitors/.test(msg) ? t("siteBlocked") : t("siteFailed", { msg }));
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (list: File[]) => {
    const f = list[0];
    if (!f) return;
    setError(null);
    let svg: string | null = null;
    let original = false;
    if (f.type === "image/svg+xml" || /\.svg$/i.test(f.name)) {
      const text = await f.text();
      if (prepareSvg(text).ok) svg = text;
    } else if (f.type.startsWith("image/")) {
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(f);
      });
      const out = await bitmapToSvg(dataUrl);
      svg = out?.svg ?? null;
      original = true;
    }
    if (!svg) return setError(lang === "he" ? "לא הצלחנו לקרוא את הקובץ הזה." : "We couldn't read that file.");
    const option = { id: "upload", svg, original, label: f.name };
    setSiteLogos((l) => [option, ...l.filter((x) => x.id !== "upload")]);
    setBrand({ logoSvg: svg, logoColorMode: original ? "original" : "primary" });
    setStep(2);
  };

  const startWithoutLogo = () => {
    const name = noLogoName.trim();
    if (!name) return;
    const hebrew = isRtlText(name);
    setBrand({
      name,
      nameLine2: "",
      tagline: "",
      website: brand.website === defaultBrand.website ? "" : brand.website,
      handle: hebrew ? "" : name.toLowerCase().replace(/[^\w.]+/g, ""),
      credit: `by ${name}`,
      logoSvg: PLACEHOLDER_LOGO,
      lettermarkSvg: null,
      useLettermark: false,
      // A Hebrew name needs a font with Hebrew letters.
      ...(hebrew && !HEBREW_FONTS.has(brand.font.family) ? { font: { family: "Heebo", source: "google" as const, weight: 700 } } : {}),
    });
    setStep(2);
  };

  // A brand that came without a logo gets the first idea from the logo maker.
  useEffect(() => {
    if (step === 2 && brand.logoSvg === PLACEHOLDER_LOGO && made.length) {
      const mark = made.find((m) => m.kind === "mark");
      if (mark) setBrand({ logoSvg: mark.svg, logoColorMode: "primary" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, made]);

  const finish = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    localStorage.setItem(PROFILE_KEY, audience);
    onFinish({ project: draft, goal: goal ?? "film", audience, capture: capture && site ? site.url : null, files });
  };
  const skip = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    onSkip();
  };

  const marks = made.filter((m) => m.kind === "mark");
  const wordmarks = made.filter((m) => m.kind === "wordmark");
  const lookalike = site?.fonts[0]?.lookalike && site.fonts[0].family === brand.font.family ? site.fonts[0].original : null;
  const fonts = fontChoices(site);
  const total = 4;

  return (
    <div className="ob" dir={dir} lang={lang}>
      <header className="ob-top">
        <span className="ob-logo">
          <span className="brand-dot" aria-hidden /> LogoMotion
        </span>
        <span className="ob-steps" aria-label={t("stepOf", { n: step + 1, total })}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i <= step ? "on" : ""} />
          ))}
        </span>
        <span className="ob-top-actions">
          <button type="button" className="link-btn" onClick={() => setLang(lang === "he" ? "en" : "he")}>
            {t("language")}
          </button>
          <button type="button" className="ghost-btn small" onClick={skip}>
            {t("skip")}
          </button>
        </span>
      </header>

      <div className={"ob-body" + (step >= 2 ? " with-preview" : "")}>
        <section className="ob-main">
          {step === 0 && (
            <>
              <h1>{t("goalTitle")}</h1>
              <p className="ob-sub">{t("goalSub")}</p>
              <div className="ob-goals">
                {GOALS.map((g, i) => (
                  <button key={g.id} type="button" className={"ob-goal" + (goal === g.id ? " active" : "")} onClick={() => pickGoal(g.id)} aria-pressed={goal === g.id}>
                    <span className={"ob-goal-thumb" + (g.id === "page" ? " page" : "")}>
                      {g.id === "page" ? (
                        <GuidelinesThumb project={goalProjects[i]} assets={assets} url={pageUrl(brand)} />
                      ) : (
                        <LiveThumb project={goalProjects[i]} assets={assets} />
                      )}
                    </span>
                    <strong>{t(g.title)}</strong>
                    <small>{t(g.sub)}</small>
                  </button>
                ))}
              </div>
              <h2 className="ob-h2">{t("whoTitle")}</h2>
              <div className="ob-seg" role="radiogroup">
                {(["mine", "client"] as Audience[]).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={audience === a} className={audience === a ? "active" : ""} onClick={() => setAudience(a)}>
                    {t(a === "mine" ? "whoMine" : "whoClient")}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>{t("brandTitle")}</h1>
              <p className="ob-sub">{t(audience === "client" ? "brandSubClient" : "brandSub")}</p>
              <form
                className="ob-url"
                onSubmit={(e) => {
                  e.preventDefault();
                  readBrand();
                }}
              >
                <Icon.Link size={20} />
                <input dir="ltr" autoFocus value={url} onChange={(e) => setUrl(fixAddressLayout(e.target.value))} placeholder={t("urlPlaceholder")} aria-label={t("website")} inputMode="url" />
                <button type="submit" className="primary-btn" disabled={busy || !url.trim()}>
                  {busy ? t("reading") : t("read")}
                </button>
              </form>
              {busy && <div className="ob-reading" aria-live="polite"><span className="brand-dot pulse" /> {t("reading")}</div>}
              {error && <p className="error">{error}</p>}
              <div className="ob-or">
                <span>{t("or")}</span>
              </div>
              <div className="ob-alt">
                <DropZone accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onFiles={uploadLogo} className="ob-alt-card">
                  <Icon.Upload size={20} />
                  <span>{t("uploadLogo")}</span>
                </DropZone>
                <form
                  className="ob-alt-card ob-noname"
                  onSubmit={(e) => {
                    e.preventDefault();
                    startWithoutLogo();
                  }}
                >
                  <Icon.Sparkle size={20} />
                  <span>{t("noLogo")}</span>
                  <div className="ob-inline">
                    <input value={noLogoName} onChange={(e) => setNoLogoName(e.target.value)} placeholder={t("namePlaceholder")} aria-label={t("namePlaceholder")} />
                    <button type="submit" className="ghost-btn small" disabled={!noLogoName.trim()}>
                      {t("makeLogo")}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>{t("reviewTitle")}</h1>
              <p className="ob-sub">{t("reviewSub")}</p>
              {site?.blocked && <p className="ob-note ob-warn">{t("sitePartial", { site: site.website })}</p>}

              <div className="ob-field">
                <label>{t("logo")} {!site?.blocked && site?.confidence && site.confidence.logo === "low" && <span className="ob-check" title={t("checkHint")}>{t("checkThis")}</span>}</label>
                {site && !siteLogos.length && <p className="ob-note">{t("noLogoFound")}</p>}
                {siteLogos.some((l) => l.id !== "upload" && /<image\b/.test(l.svg) && l.svg === brand.logoSvg) && (
                  <div className="ob-note ob-warn ob-ask-vector">
                    <span>{t(siteLogos.some((l) => l.small && l.svg === brand.logoSvg) ? "logoSmall" : "logoBitmap")}</span>
                    <DropZone accept=".svg,image/svg+xml,image/png" onFiles={uploadLogo} className="ghost-btn small">
                      <Icon.Upload size={14} /> {t("uploadSvg")}
                    </DropZone>
                  </div>
                )}
                <div className="ob-logos">
                  {[...siteLogos.map((l) => ({ ...l, made: false })), ...marks.map((m) => ({ id: m.id, svg: m.svg, original: false, label: m.label, made: true }))].map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={"ob-logo-tile" + (brand.logoSvg === l.svg ? " active" : "") + ("light" in l && l.light ? " on-dark" : "")}
                      onClick={() => setBrand({ logoSvg: l.svg, logoColorMode: l.original ? "original" : "primary" })}
                      title={l.label}
                    >
                      <img src={svgUrl(l.svg)} alt={l.label} style={l.original ? undefined : { filter: "none" }} />
                      {l.made && <span className="ob-tag">{t("generated")}</span>}
                    </button>
                  ))}
                  <DropZone accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onFiles={uploadLogo} className="ob-logo-tile add">
                    <Icon.Upload size={18} />
                  </DropZone>
                </div>
                {(wordmarks.length > 0 || siteLogos.some(isWide)) && (
                  <div className="ob-logos words">
                    <button type="button" className={"ob-word-tile" + (!brand.useLettermark ? " active" : "")} onClick={() => setBrand({ useLettermark: false })} style={{ fontFamily: `"${brand.font.family}"`, fontWeight: brand.font.weight }}>
                      {brand.name}
                    </button>
                    {[...siteLogos.filter(isWide), ...wordmarks].map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className={"ob-word-tile" + (brand.useLettermark && brand.lettermarkSvg === w.svg ? " active" : "") + ("light" in w && w.light ? " on-dark" : "")}
                        onClick={() => setBrand({ lettermarkSvg: w.svg, useLettermark: true })}
                        title={w.label}
                      >
                        <img src={svgUrl(w.svg)} alt={w.label} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="ob-field">
                <label>{t("colors")} {!site?.blocked && site?.confidence && site.confidence.colors !== "high" && <span className="ob-check" title={t("checkHint")}>{t("checkThis")}</span>}</label>
                <div className="ob-roles">
                  {ROLES.map(({ role: r, key }) => (
                    <button key={r} type="button" className={"ob-role" + (role === r ? " active" : "")} onClick={() => setRole(r)}>
                      <span className="ob-swatch" style={{ background: colors[r] }}>
                        <input
                          type="color"
                          value={colors[r]}
                          aria-label={t(key)}
                          onChange={(e) => {
                            const hex = normalizeHex(e.target.value);
                            if (hex) setBrand({ colors: { ...brand.colors, [r]: hex }, ...(r === "secondary" ? { secondaryAuto: false } : {}) });
                          }}
                        />
                      </span>
                      <span>
                        <strong>{t(key)}</strong>
                        <small dir="ltr">{colors[r]}</small>
                      </span>
                    </button>
                  ))}
                </div>
                {site && site.colors.palette.length > 0 && (
                  <>
                    <p className="ob-note">{t("colorsHint")}</p>
                    <div className="ob-palette">
                      {site.colors.palette.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className="ob-chip"
                          style={{ background: hex }}
                          title={hex}
                          aria-label={hex}
                          onClick={() => setBrand({ colors: { ...brand.colors, [role]: hex }, ...(role === "secondary" ? { secondaryAuto: false } : {}) })}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="ob-field">
                <label>{t("gradients")}</label>
                <p className="ob-note">{t("gradientsHint")}</p>
                <div className="ob-gradients">
                  {brandGradients(brand).map((g) => {
                    const active = draft.scenes.some((sc) => HERO.includes(sc.type) && sc.backdrop?.mode === "gradient" && sc.backdrop.gradient === g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className={"ob-gradient" + (active ? " active" : "")}
                        style={{ background: gradientCss(g) }}
                        title={g.name}
                        aria-label={g.name}
                        aria-pressed={active}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            scenes: d.scenes.map((sc) => (HERO.includes(sc.type) ? { ...sc, backdrop: active ? undefined : { mode: "gradient", color: "primary", gradient: g.id, motion: "drift" } } : sc)),
                          }))
                        }
                      />
                    );
                  })}
                </div>
              </div>

              <div className="ob-field">
                <label>{t("font")} {!site?.blocked && site?.confidence && site.confidence.fonts === "low" && <span className="ob-check" title={t("checkHint")}>{t("checkThis")}</span>}</label>
                <select className="ob-select" value={brand.font.family} onChange={(e) => setBrand({ font: { ...brand.font, family: e.target.value, source: "google" } })} style={{ fontFamily: `"${brand.font.family}"` }}>
                  {[...new Set([brand.font.family, ...fonts])].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                {lookalike && <p className="ob-note">{t("fontLookalike", { font: lookalike })}</p>}
              </div>

              <div className="ob-grid2">
                <label className="ob-input">
                  <span>{t("name")}</span>
                  <input value={brand.name} onChange={(e) => setBrand({ name: e.target.value, credit: `by ${e.target.value}` })} />
                </label>
                <label className="ob-input">
                  <span>{t("tagline")}</span>
                  <input value={brand.tagline} onChange={(e) => setBrand({ tagline: e.target.value })} />
                </label>
                <label className="ob-input">
                  <span>{t("website")}</span>
                  <input dir="ltr" value={brand.website} onChange={(e) => setBrand({ website: e.target.value })} />
                </label>
                <label className="ob-input">
                  <span>{t("handle")}</span>
                  <input dir="ltr" value={brand.handle} onChange={(e) => setBrand({ handle: e.target.value.replace(/^@/, "") })} />
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1>{t("moreTitle")}</h1>
              <p className="ob-sub">{t("moreSub")}</p>
              {site && (
                <label className="ob-check">
                  <input type="checkbox" checked={capture} onChange={(e) => setCapture(e.target.checked)} />
                  <span>
                    <strong>{t("captureSite")}</strong>
                    <small>{t("captureHint", { site: site.website })}</small>
                  </span>
                </label>
              )}
              <DropZone accept="image/*,video/*" multiple onFiles={(f) => setFiles((cur) => [...cur, ...f])} className="ob-media">
                <Icon.Image size={22} />
                <strong>{t("addMedia")}</strong>
                <small>{files.length ? t("added", { n: files.length }) : t("dropHint")}</small>
              </DropZone>
              {files.length > 0 && (
                <ul className="ob-files">
                  {files.map((f, i) => (
                    <li key={i}>
                      <span>{f.name}</span>
                      <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                        <Icon.Close size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {step >= 2 && (
          <aside className="ob-preview" dir="ltr">
            <div className="stage-card">
              <Preview project={draft} assets={assets} assetsVersion={version} />
              <PlayerBar project={draft} />
            </div>
          </aside>
        )}
      </div>

      <footer className="ob-foot">
        {step > 0 ? (
          <button type="button" className="ghost-btn" onClick={() => setStep(step - 1)}>
            {t("back")}
          </button>
        ) : (
          <span />
        )}
        {step === 0 && (
          <button type="button" className="primary-btn" disabled={!goal} onClick={() => setStep(1)}>
            {t("next")}
          </button>
        )}
        {step === 1 && (
          <button type="button" className="link-btn" onClick={() => setStep(2)}>
            {t("next")}
          </button>
        )}
        {step === 2 && (
          <button type="button" className="primary-btn" onClick={() => setStep(3)}>
            {t("next")}
          </button>
        )}
        {step === 3 && (
          <button type="button" className="primary-btn" onClick={finish}>
            {t("done")}
          </button>
        )}
      </footer>
    </div>
  );
}
