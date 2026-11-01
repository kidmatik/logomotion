import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../types";
import { cloudEnabled } from "../cloud/supabase";
import { addComment, listComments, loadPublicShare, sharedMediaUrl, type CommentKind, type PublicShare, type ShareComment } from "../cloud/shares";
import { useAssets } from "../state/useAssets";
import { ensureGoogleFont } from "../brand/fonts";
import { clock, useClock } from "../state/clock";
import { music } from "../audio/engine";
import { useLang } from "../i18n";
import { Icon } from "../ui/icons";
import { GuidePage, type TFn } from "../guide/GuidePage";
import { GUIDE_T } from "../guide/strings";
import { fillGuide } from "../guide/model";

const NAME_KEY = "logomotion.reviewer";

function fmt(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export function SharePage({ id }: { id: string }) {
  const { t, lang, setLang, dir } = useLang(GUIDE_T);
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


function Guidelines({ share, t, lang, setLang, dir }: { share: PublicShare; t: TFn; lang: string; setLang: (l: "he" | "en") => void; dir: "rtl" | "ltr" }) {
  const project: Project = share.project;
  const loader = useCallback((mediaId: string) => fetch(sharedMediaUrl(share.id, mediaId)).then((r) => (r.ok ? r.blob() : null)), [share.id]);
  const { assets, version } = useAssets(project, loader);
  const b = project.brand;
  // Pages published before the guidelines existed get a complete one from the brand kit.
  const guide = useMemo(() => fillGuide(project, project.guide), [project]);
  const [decision, setDecision] = useState<ShareComment | null>(null);

  useEffect(() => {
    music.setProject(project);
    const unlock = () => music.unlock();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [project]);
  useEffect(() => {
    if (b.font.source === "google") ensureGoogleFont(b.font.family).catch(() => undefined);
    if (guide.bodyFont) ensureGoogleFont(guide.bodyFont.family).catch(() => undefined);
    clock.seek(0);
    clock.setPlaying(true);
  }, [b.font.family, b.font.source, guide.bodyFont]);

  const date = new Date(share.updated_at).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const meta = (share.owner_name ? t("by", { name: share.owner_name }) + " · " : "") + t("updated", { date });

  return (
    <GuidePage
      project={project}
      guide={guide}
      assets={assets}
      assetsVersion={version}
      t={t}
      lang={lang}
      dir={dir}
      title={share.title || b.name}
      meta={meta}
      approvedBy={decision?.kind === "approve" ? decision.author : null}
      onLang={() => setLang(lang === "he" ? "en" : "he")}
      footer={<Feedback share={share} t={t} onDecision={setDecision} />}
    />
  );
}

function Feedback({ share, t, onDecision }: { share: PublicShare; t: TFn; onDecision: (c: ShareComment | null) => void }) {
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
  useEffect(() => onDecision(decision ?? null), [decision, onDecision]);

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
    <section className="gp-section sp-feedback" id="gp-feedback">
      <header className="gp-head">
        <span className="sp-num">✓</span>
        <h2>{t("feedback")}</h2>
      </header>
      <p className="gp-p">{t("feedbackLead")}</p>
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
