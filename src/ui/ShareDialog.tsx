import { useCallback, useEffect, useState } from "react";
import type { Project } from "../types";
import { useAccount } from "../cloud/account";
import { deleteComment, deleteShare, findShare, ownerComments, publishShare, setCommentsOpen, shareUrl, type ShareComment, type ShareRow } from "../cloud/shares";
import { clock } from "../state/clock";
import { Icon } from "./icons";
import { Toggle } from "./controls";

function fmt(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

/**
 * The live brand page for this project: create it, keep it up to date, and
 * read what clients said. Visitors don't need an account.
 */
export function ShareDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const account = useAccount();
  const [share, setShare] = useState<ShareRow | null | undefined>(undefined);
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [title, setTitle] = useState(project.brand.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const projectId = account.currentId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadComments = useCallback((id: string) => ownerComments(id).then(setComments).catch(() => undefined), []);

  useEffect(() => {
    if (!account.user || !projectId) return;
    findShare(projectId)
      .then((s) => {
        setShare(s);
        if (s) {
          setTitle(s.title || project.brand.name);
          loadComments(s.id);
        }
      })
      .catch((e) => {
        setError((e as Error).message);
        setShare(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.user, projectId]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const publish = () =>
    run("publish", async () => {
      if (!projectId) throw new Error("Open a saved project first.");
      const row = await publishShare({ projectId, project, title: title.trim() || project.brand.name, ownerName: account.user?.name ?? "", existing: share ?? null });
      setShare(row);
    });

  const stale = !!share && JSON.stringify(share.data) !== JSON.stringify(project);
  const url = share ? shareUrl(share.id) : "";
  const decision = [...comments].reverse().find((c) => c.kind !== "comment");

  let body;
  if (!account.enabled) {
    body = (
      <p className="share-text">
        Live brand pages are stored in your account, so accounts need to be set up for this site first (Supabase and Google sign-in). Once they are, run the updated <code>supabase/schema.sql</code> once and this button works.
      </p>
    );
  } else if (!account.user) {
    body = (
      <>
        <p className="share-text">Sign in to publish a live page. Your client opens it without an account, watches the film, copies colours and fonts, and approves or comments on any moment.</p>
        <button type="button" className="primary-btn" onClick={() => account.requireSignIn("share", "share")}>
          Sign in to share
        </button>
      </>
    );
  } else if (share === undefined) {
    body = <p className="hint-busy">Loading…</p>;
  } else if (!share) {
    body = (
      <>
        <p className="share-text">
          Publish a live brand page: the film playing in real time, the logo on light, dark and brand colour with SVG downloads, colours with HEX, RGB and CMYK, the type specimen, and a feedback box where your client can comment on any moment or approve.
        </p>
        <label className="share-field">
          <span>Page title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="button" className="primary-btn" disabled={!!busy} onClick={publish}>
          <Icon.Link size={15} /> {busy ? "Publishing…" : "Create live page"}
        </button>
        <p className="share-fine">Anyone with the link can view the page and leave comments. Media in the video is copied to the page so it plays anywhere.</p>
      </>
    );
  } else {
    body = (
      <>
        <div className="share-link">
          <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Page link" />
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Icon.Check size={15} /> : <Icon.Copy size={15} />} {copied ? "Copied" : "Copy"}
          </button>
          <a className="ghost-btn" href={url} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
        <div className="share-row">
          <span className={"share-state" + (stale ? " stale" : "")}>{stale ? "You've changed the project since the page was updated." : "The page shows your latest version."}</span>
          <button type="button" className={stale ? "primary-btn" : "ghost-btn"} disabled={!!busy || !stale} onClick={publish}>
            {busy === "publish" ? "Updating…" : "Update page"}
          </button>
        </div>
        <div className="share-row">
          <span>Let visitors comment and approve</span>
          <Toggle
            checked={share.allow_comments}
            onChange={(v) => run("comments", async () => {
              await setCommentsOpen(share.id, v);
              setShare({ ...share, allow_comments: v });
            })}
          />
        </div>

        <div className="share-feedback">
          <div className="share-feedback-head">
            <strong>Feedback {comments.length > 0 && <span className="count">{comments.length}</span>}</strong>
            <button type="button" className="link-btn" onClick={() => loadComments(share.id)}>
              Refresh
            </button>
          </div>
          {decision && (
            <p className={"share-decision " + decision.kind}>
              {decision.kind === "approve" ? `Approved by ${decision.author}` : `${decision.author} asked for changes`} · {new Date(decision.created_at).toLocaleDateString()}
            </p>
          )}
          {comments.length === 0 ? (
            <p className="share-fine">No comments yet. Send the link to your client.</p>
          ) : (
            <ul className="share-comments">
              {comments.map((c) => (
                <li key={c.id} className={c.kind}>
                  <div>
                    <strong>{c.author}</strong>
                    {c.at_time !== null && (
                      <button type="button" className="sp-time" onClick={() => (clock.seek(c.at_time!), clock.setPlaying(false))} title="Show this moment">
                        {fmt(c.at_time)}
                      </button>
                    )}
                    {c.kind !== "comment" && <span className={"sp-badge " + c.kind}>{c.kind === "approve" ? "Approved" : "Changes"}</span>}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Delete comment"
                      onClick={() => run("delete-comment", async () => {
                        await deleteComment(c.id);
                        setComments((l) => l.filter((x) => x.id !== c.id));
                      })}
                    >
                      <Icon.Trash size={13} />
                    </button>
                  </div>
                  {c.body && <p dir="auto">{c.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          className="link-btn danger-link"
          disabled={!!busy}
          onClick={() => {
            if (!window.confirm("Take the page down? The link stops working and its comments are deleted.")) return;
            run("delete", async () => {
              await deleteShare(share.id, share.data ?? project);
              setShare(null);
              setComments([]);
            });
          }}
        >
          Take the page down
        </button>
      </>
    );
  }

  return (
    <div className="signin-overlay" role="dialog" aria-modal="true" aria-label="Live brand page" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="signin-card share-card">
        <button type="button" className="icon-btn signin-close" aria-label="Close" onClick={onClose}>
          <Icon.Close size={16} />
        </button>
        <h2>Live brand page</h2>
        {body}
        {error && <p className="signin-error">{error}</p>}
      </div>
    </div>
  );
}
