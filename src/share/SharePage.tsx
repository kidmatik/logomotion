import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColorRole, Project } from "../types";
import { cloudEnabled } from "../cloud/supabase";
import { addComment, listComments, loadPublicShare, sharedMediaUrl, type CommentKind, type PublicShare, type ShareComment } from "../cloud/shares";
import { useAssets } from "../state/useAssets";
import { PlayerBar, Preview } from "../ui/Preview";
import { buildTimeline } from "../engine/renderer";
import { sceneDef } from "../scenes/registry";
import { brandIsRtl, resolveColors } from "../engine/kit";
import { hexToRgb, contrast } from "../brand/color";
import { prepareSvg } from "../brand/logo";
import { tinted } from "../brand/logoUrl";
import { ensureGoogleFont, weightLabel } from "../brand/fonts";
import { clock, useClock } from "../state/clock";
import { music } from "../audio/engine";
import { useLang } from "../i18n";
import { gradientCss } from "../engine/backdrop";
import { Icon } from "../ui/icons";

const T = {
  en: {
    loading: "Loading the brand…",
    notFound: "This page doesn't exist or was taken down.",
    noCloud: "Live pages aren't set up on this site yet.",
    guidelines: "Brand guidelines",
    updated: "Updated {date}",
    by: "Shared by {name}",
    motion: "In motion",
    logo: "Logo",
    logoLead: "Use the logo as supplied. Keep clear space around it equal to the height of the mark, and don't stretch, recolour or add effects.",
    onLight: "On light",
    onDark: "On dark",
    onBrand: "On brand colour",
    downloadSvg: "Download SVG",
    wordmark: "Wordmark",
    color: "Colour",
    colorLead: "Four colours carry the whole identity. Lead with primary, use secondary as the accent.",
    copy: "Copy",
    copied: "Copied",
    primary: "Primary",
    secondary: "Secondary",
    black: "Dark",
    white: "Light",
    textOn: "Text contrast {ratio}:1",
    type: "Typography",
    typeLead: "One family across headlines and text.",
    getFont: "Get the font",
    scenes: "Scenes",
    scenesLead: "Jump to any moment of the film.",
    feedback: "Feedback",
    feedbackLead: "Leave a comment on any moment, or approve the brand.",
    yourName: "Your name",
    comment: "Write a comment…",
    pinTime: "At {time}",
    send: "Send comment",
    approve: "Approve",
    changes: "Request changes",
    approved: "Approved by {name}",
    changesBy: "Changes requested by {name}",
    noComments: "No comments yet.",
    closed: "Comments are closed on this page.",
    nameNeeded: "Add your name first.",
    madeWith: "Made with LogoMotion",
    language: "עברית",
  },
  he: {
    loading: "טוענים את המותג…",
    notFound: "העמוד הזה לא קיים או שהוסר.",
    noCloud: "עמודים חיים עוד לא הוגדרו באתר הזה.",
    guidelines: "ספר מותג",
    updated: "עודכן {date}",
    by: "שותף על ידי {name}",
    motion: "בתנועה",
    logo: "לוגו",
    logoLead: "השתמשו בלוגו כפי שהוא. השאירו סביבו מרווח נקי בגובה הסמל, ואל תמתחו, תצבעו מחדש או תוסיפו אפקטים.",
    onLight: "על רקע בהיר",
    onDark: "על רקע כהה",
    onBrand: "על צבע המותג",
    downloadSvg: "הורדת SVG",
    wordmark: "וורדמארק",
    color: "צבע",
    colorLead: "ארבעה צבעים נושאים את כל השפה. הראשי מוביל, המשני משמש כהדגשה.",
    copy: "העתקה",
    copied: "הועתק",
    primary: "ראשי",
    secondary: "משני",
    black: "כהה",
    white: "בהיר",
    textOn: "ניגודיות טקסט {ratio}:1",
    type: "טיפוגרפיה",
    typeLead: "משפחה אחת לכותרות ולטקסט.",
    getFont: "להורדת הפונט",
    scenes: "סצנות",
    scenesLead: "קפיצה לכל רגע בסרט.",
    feedback: "פידבק",
    feedbackLead: "השאירו תגובה על כל רגע, או אשרו את המותג.",
    yourName: "השם שלך",
    comment: "כתבו תגובה…",
    pinTime: "בדקה {time}",
    send: "שליחת תגובה",
    approve: "אישור",
    changes: "בקשת שינויים",
    approved: "אושר על ידי {name}",
    changesBy: "{name} ביקש/ה שינויים",
    noComments: "עדיין אין תגובות.",
    closed: "התגובות בעמוד הזה סגורות.",
    nameNeeded: "הוסיפו קודם את השם שלכם.",
    madeWith: "נוצר עם LogoMotion",
    language: "English",
  },
};

const NAME_KEY = "logomotion.reviewer";

function fmt(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cmyk(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) return "0 0 0 100";
  const f = (v: number) => Math.round(((1 - v / 255 - k) / (1 - k)) * 100);
  return `${f(r)} ${f(g)} ${f(b)} ${Math.round(k * 100)}`;
}

function CopyChip({ value, t }: { value: string; t: (k: string) => string }) {
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

export function SharePage({ id }: { id: string }) {
  const { t, lang, setLang, dir } = useLang(T);
  const [share, setShare] = useState<PublicShare | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudEnabled) return;
    loadPublicShare(id)
      .then((s) => {
        setShare(s);
        if (s) document.title = `${s.title || s.project.brand.name} · ${lang === "he" ? "ספר מותג" : "Brand guidelines"}`;
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!cloudEnabled) return <Message text={t("noCloud")} />;
  if (error) return <Message text={error} />;
  if (share === undefined) return <Message text={t("loading")} busy />;
  if (share === null) return <Message text={t("notFound")} />;
  return <Guidelines share={share} t={t} lang={lang} setLang={setLang} dir={dir} />;
}

function Message({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <div className="splash" aria-busy={busy}>
      <div className="splash-inner">
        {busy && <span className="brand-dot pulse" aria-hidden />}
        <span>{text}</span>
      </div>
    </div>
  );
}

type TFn = (k: string, v?: Record<string, string | number>) => string;

function Guidelines({ share, t, lang, setLang, dir }: { share: PublicShare; t: TFn; lang: string; setLang: (l: "he" | "en") => void; dir: "rtl" | "ltr" }) {
  const project: Project = share.project;
  const loader = useCallback((mediaId: string) => fetch(sharedMediaUrl(share.id, mediaId)).then((r) => (r.ok ? r.blob() : null)), [share.id]);
  const { assets, version } = useAssets(project, loader);
  const b = project.brand;
  const colors = resolveColors(b);
  const brandDir = brandIsRtl(b) ? "rtl" : "ltr";
  const { entries } = useMemo(() => buildTimeline(project), [project]);
  const { t: now } = useClock();

  useEffect(() => {
    music.setProject(project);
    const unlock = () => music.unlock();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [project]);
  useEffect(() => {
    if (b.font.source === "google") ensureGoogleFont(b.font.family).catch(() => undefined);
    clock.seek(0);
    clock.setPlaying(true);
  }, [b.font.family, b.font.source]);

  const roles: { role: ColorRole; label: string }[] = [
    { role: "primary", label: t("primary") },
    { role: "secondary", label: t("secondary") },
    { role: "black", label: t("black") },
    { role: "white", label: t("white") },
  ];
  const fileBase = (b.name || "brand").toLowerCase().replace(/[^\w֐-׿]+/g, "-");
  const date = new Date(share.updated_at).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="sp" dir={dir} lang={lang} style={{ ["--sp-primary" as string]: colors.primary, ["--sp-dark" as string]: colors.black }}>
      <header className="sp-top">
        <span className="sp-brand" dir={brandDir}>
          <img src={tinted(b.logoSvg, b.logoColorMode === "original" ? null : colors.black)} alt="" />
          <strong style={{ fontFamily: `"${b.font.family}"`, fontWeight: b.font.weight }}>{b.name}</strong>
        </span>
        <span className="sp-top-meta">
          <span>{t("guidelines")}</span>
          <button type="button" className="link-btn" onClick={() => setLang(lang === "he" ? "en" : "he")}>
            {t("language")}
          </button>
        </span>
      </header>

      <section className="sp-hero">
        <div className="sp-hero-text">
          <p className="sp-eyebrow">{t("guidelines")}</p>
          <h1 dir={brandDir} style={{ fontFamily: `"${b.font.family}"`, fontWeight: b.font.weight, fontSize: `clamp(34px, ${Math.min(6, 48 / Math.max(8, (share.title || b.name).length))}vw, 84px)` }}>
            {share.title || b.name}
          </h1>
          {b.tagline && <p className="sp-tagline" dir={brandDir}>{b.tagline}</p>}
          <p className="sp-meta">
            {share.owner_name ? t("by", { name: share.owner_name }) + " · " : ""}
            {t("updated", { date })}
          </p>
        </div>
        <div className="sp-player" dir="ltr">
          <div className="stage-card">
            <Preview project={project} assets={assets} assetsVersion={version} />
            <PlayerBar project={project} />
          </div>
        </div>
      </section>

      <main className="sp-main">
        <section className="sp-section">
          <header>
            <span className="sp-num">01</span>
            <h2>{t("logo")}</h2>
            <p>{t("logoLead")}</p>
          </header>
          <div className="sp-logos">
            {[
              { bg: colors.white, fg: b.logoColorMode === "original" ? null : colors.black, label: t("onLight") },
              { bg: colors.black, fg: b.logoColorMode === "original" ? null : colors.white, label: t("onDark") },
              { bg: colors.primary, fg: b.logoColorMode === "original" ? null : contrast(colors.primary, colors.white) >= contrast(colors.primary, colors.black) ? colors.white : colors.black, label: t("onBrand") },
            ].map((v) => (
              <figure key={v.label} className="sp-logo-tile" style={{ background: v.bg }}>
                <img src={tinted(b.logoSvg, v.fg)} alt={`${b.name} ${t("logo")}`} />
                <figcaption style={{ color: contrast(v.bg, "#ffffff") > 3 ? "#fff" : "#111" }}>{v.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="sp-actions">
            <button type="button" className="ghost-btn" onClick={() => download(`${fileBase}-logo.svg`, prepareSvg(b.logoSvg).svg ?? b.logoSvg, "image/svg+xml")}>
              <Icon.Download size={15} /> {t("downloadSvg")} · {t("logo")}
            </button>
            {b.useLettermark && b.lettermarkSvg && (
              <button type="button" className="ghost-btn" onClick={() => download(`${fileBase}-wordmark.svg`, prepareSvg(b.lettermarkSvg!).svg ?? b.lettermarkSvg!, "image/svg+xml")}>
                <Icon.Download size={15} /> {t("downloadSvg")} · {t("wordmark")}
              </button>
            )}
          </div>
        </section>

        <section className="sp-section">
          <header>
            <span className="sp-num">02</span>
            <h2>{t("color")}</h2>
            <p>{t("colorLead")}</p>
          </header>
          <div className="sp-colors">
            {roles.map(({ role, label }) => {
              const hex = colors[role];
              const { r, g, b: bl } = hexToRgb(hex);
              const ink = contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111";
              return (
                <div key={role} className={"sp-color" + (role === "primary" ? " big" : "")}>
                  <div className="sp-color-swatch" style={{ background: hex, color: ink }}>
                    <strong>{label}</strong>
                    <small>{t("textOn", { ratio: contrast(hex, ink).toFixed(1) })}</small>
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
        </section>

        <section className="sp-section">
          <header>
            <span className="sp-num">03</span>
            <h2>{t("type")}</h2>
            <p>{t("typeLead")}</p>
          </header>
          <div className="sp-type" style={{ fontFamily: `"${b.font.family}", "Heebo", sans-serif` }}>
            <div className="sp-type-big" style={{ fontWeight: b.font.weight }}>{brandIsRtl(b) ? "אב" : "Aa"}</div>
            <div className="sp-type-info">
              <h3 style={{ fontWeight: b.font.weight }}>{b.font.family}</h3>
              <p className="sp-code" dir="ltr">{weightLabel(b.font.weight)} · {b.font.weight}</p>
              <p className="sp-type-sample" dir={brandDir} style={{ fontWeight: b.font.weight }}>
                {brandIsRtl(b) ? "אבגדהוזחטיכלמנסעפצקרשת" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
              </p>
              <p className="sp-type-sample light" dir={brandDir}>
                {brandIsRtl(b) ? "אבגדהוזחטיכלמנסעפצקרשת 0123456789" : "abcdefghijklmnopqrstuvwxyz 0123456789"}
              </p>
              {b.font.source === "google" && (
                <a className="ghost-btn" href={`https://fonts.google.com/specimen/${encodeURIComponent(b.font.family).replace(/%20/g, "+")}`} target="_blank" rel="noreferrer">
                  <Icon.Link size={15} /> {t("getFont")}
                </a>
              )}
            </div>
          </div>
        </section>

        <section className="sp-section">
          <header>
            <span className="sp-num">04</span>
            <h2>{t("motion")}</h2>
            <p>{t("scenesLead")}</p>
          </header>
          <ol className="sp-scenes" dir="ltr">
            {entries.map((e) => {
              const active = now >= e.start && now < e.end;
              return (
                <li key={e.scene.uid}>
                  <button
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => {
                      clock.seek(e.start + 0.01);
                      clock.setPlaying(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <span className="sp-scene-time">{fmt(e.start)}</span>
                    <span>{sceneDef(e.scene.type)?.name ?? e.scene.type}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <Feedback share={share} t={t} />
      </main>

      <footer className="sp-foot">
        <a href="/" target="_blank" rel="noreferrer">
          <span className="brand-dot" aria-hidden /> {t("madeWith")}
        </a>
      </footer>
    </div>
  );
}

function Feedback({ share, t }: { share: PublicShare; t: TFn }) {
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t: now } = useClock();

  const refresh = useCallback(() => listComments(share.id).then(setComments).catch(() => undefined), [share.id]);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const decision = [...comments].reverse().find((c) => c.kind !== "comment");

  const send = async (kind: CommentKind) => {
    if (!name.trim()) return setError(t("nameNeeded"));
    if (kind === "comment" && !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
      await addComment(share.id, { author: name.trim(), body: body.trim(), at_time: kind === "comment" && pin ? Math.round(clock.t * 10) / 10 : null, kind });
      setBody("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sp-section sp-feedback">
      <header>
        <span className="sp-num">05</span>
        <h2>{t("feedback")}</h2>
        <p>{t("feedbackLead")}</p>
      </header>
      {decision && (
        <p className={"sp-decision " + decision.kind}>
          {decision.kind === "approve" ? <Icon.Check size={16} /> : <Icon.Pen size={16} />}
          {t(decision.kind === "approve" ? "approved" : "changesBy", { name: decision.author })}
        </p>
      )}
      <ul className="sp-comments">
        {comments.length === 0 && <li className="sp-empty">{t("noComments")}</li>}
        {comments.map((c) => (
          <li key={c.id} className={c.kind}>
            <div className="sp-comment-head">
              <strong>{c.author}</strong>
              {c.at_time !== null && (
                <button type="button" className="sp-time" dir="ltr" onClick={() => (clock.seek(c.at_time!), clock.setPlaying(false), window.scrollTo({ top: 0, behavior: "smooth" }))}>
                  {fmt(c.at_time)}
                </button>
              )}
              {c.kind !== "comment" && <span className={"sp-badge " + c.kind}>{t(c.kind === "approve" ? "approve" : "changes")}</span>}
              <small>{new Date(c.created_at).toLocaleString()}</small>
            </div>
            {c.body && <p dir="auto">{c.body}</p>}
          </li>
        ))}
      </ul>
      {share.allow_comments ? (
        <div className="sp-form">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("yourName")} aria-label={t("yourName")} maxLength={60} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("comment")} aria-label={t("comment")} maxLength={2000} rows={3} dir="auto" />
          <div className="sp-form-row">
            <label className="sp-pin">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
              <span dir="ltr">{t("pinTime", { time: fmt(now) })}</span>
            </label>
            <span className="sp-form-actions">
              <button type="button" className="ghost-btn" disabled={busy} onClick={() => send("changes")}>
                {t("changes")}
              </button>
              <button type="button" className="ghost-btn approve" disabled={busy} onClick={() => send("approve")}>
                <Icon.Check size={15} /> {t("approve")}
              </button>
              <button type="button" className="primary-btn" disabled={busy || !body.trim()} onClick={() => send("comment")}>
                {t("send")}
              </button>
            </span>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <p className="sp-empty">{t("closed")}</p>
      )}
    </section>
  );
}
