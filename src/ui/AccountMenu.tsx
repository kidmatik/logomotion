import { useEffect, useRef, useState } from "react";
import { useAccount } from "../cloud/account";
import { useSyncState } from "../cloud/sync";
import { Icon } from "./icons";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Avatar({ url, name, size = 30 }: { url: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return url && !broken ? (
    <img className="avatar" src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size }} aria-hidden>
      {initials(name) || "?"}
    </span>
  );
}

/** Saved / Saving… / not saved, for the open project. */
export function SaveStatus() {
  const { pending, error } = useSyncState();
  if (error && !pending)
    return (
      <span className="save-status error" title={error}>
        <Icon.Cloud size={16} /> <span className="btn-label">Not saved</span>
      </span>
    );
  return (
    <span className="save-status" aria-live="polite">
      {pending ? <Icon.Cloud size={16} /> : <Icon.CloudCheck size={16} />}
      <span className="btn-label">{pending ? "Saving…" : "Saved"}</span>
    </span>
  );
}

/** Top-right: Save + Sign in for guests, save status and the account menu once signed in. */
export function AccountControls() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  if (!account.enabled) return null;
  const { user } = account;
  if (!user)
    return (
      <>
        <button type="button" className="ghost-btn" onClick={() => account.requireSignIn("save", "save")} title="Save this project to your account">
          <Icon.Cloud size={16} /> <span className="btn-label">Save</span>
        </button>
        <button type="button" className="link-btn signin-link" onClick={() => account.requireSignIn("account")}>
          Sign in
        </button>
      </>
    );

  return (
    <>
      <SaveStatus />
      <div className="menu-wrap" ref={wrap}>
        <button type="button" className="avatar-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Account: ${user.name}`} title={user.email}>
          <Avatar url={user.avatarUrl} name={user.name} />
        </button>
        {open && (
          <div className="menu account-menu">
            <div className="account-head">
              <Avatar url={user.avatarUrl} name={user.name} size={36} />
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
            <hr />
            <button type="button" onClick={() => (setOpen(false), account.signOut())}>
              <Icon.SignOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
