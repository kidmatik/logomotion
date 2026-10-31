import { useEffect, useRef, useState } from "react";
import { useAccount } from "../cloud/account";
import { Icon } from "./icons";

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString();
}

/** Your projects, saved to your account: switch, add, rename, delete. Signed-in only. */
export function ProjectSwitcher() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && (setOpen(false), setEditing(null));
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  if (!account.user) return null;
  const current = account.projects.find((p) => p.id === account.currentId);

  return (
    <div className="menu-wrap" ref={wrap}>
      <button type="button" className="project-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Your projects">
        <Icon.Folder size={16} />
        <span className="project-name">{current?.name ?? "Project"}</span>
        <Icon.Chevron size={14} />
      </button>
      {open && (
        <div className="projects-pop" role="menu">
          <div className="projects-head">
            <strong>Your projects</strong>
            <button type="button" className="ghost-btn small" onClick={() => (account.newProject(), setOpen(false))} title="Start a new project with this brand kit">
              <Icon.Plus size={14} /> New
            </button>
          </div>
          <ul className="projects-list">
            {account.projects.map((p) => (
              <li key={p.id} className={p.id === account.currentId ? "active" : ""}>
                <button type="button" className="project-open" onClick={() => (account.openProject(p.id), setOpen(false))} disabled={editing === p.id}>
                  <span className="project-thumb">{p.thumbnail ? <img src={p.thumbnail} alt="" /> : <Icon.Image size={16} />}</span>
                  <span className="project-meta">
                    {editing === p.id ? (
                      <input
                        autoFocus
                        defaultValue={p.name}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => (account.renameProject(p.id, e.target.value), setEditing(null))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <strong>{p.name}</strong>
                    )}
                    <small>Edited {ago(p.updated_at)}</small>
                  </span>
                </button>
                <span className="project-actions">
                  <button type="button" className="icon-btn" title="Rename" aria-label={`Rename ${p.name}`} onClick={() => setEditing(p.id)}>
                    <Icon.Pen size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Delete"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => confirm(`Delete "${p.name}" and its media? This can't be undone.`) && account.deleteProject(p.id)}
                  >
                    <Icon.Trash size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="projects-foot">New projects keep your current brand kit.</p>
        </div>
      )}
    </div>
  );
}
