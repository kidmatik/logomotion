import { useEffect, useState } from "react";
import type { SignInReason } from "../cloud/account";
import { signInWithGoogle } from "../cloud/auth";
import { Icon } from "./icons";

const COPY: Record<SignInReason, { title: string; body: string }> = {
  download: {
    title: "Sign in to download your video",
    body: "Downloads are free while LogoMotion is in beta. Sign in once and your video renders right after.",
  },
  save: {
    title: "Sign in to save your project",
    body: "Your brand kit, scenes and media are saved to your account, so you can pick up on any device.",
  },
  share: {
    title: "Sign in to share a live brand page",
    body: "Your brand page lives on your account, so you can update it and read your client's comments any time.",
  },
  account: {
    title: "Sign in to LogoMotion",
    body: "Save your brand kits, projects and media to your account and download your videos.",
  },
};

/** Google's multicolour "G", drawn per Google's sign-in button guidelines. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function SignInDialog({ reason, error, onClose, onBeforeRedirect }: { reason: SignInReason; error: string | null; onClose: () => void; onBeforeRedirect: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(error);
  const copy = COPY[reason];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = async () => {
    setBusy(true);
    setFailed(null);
    onBeforeRedirect();
    try {
      await signInWithGoogle();
    } catch (e) {
      setFailed((e as Error).message || "Couldn't reach Google. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="signin-overlay" role="dialog" aria-modal="true" aria-labelledby="signin-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="signin-card">
        <button type="button" className="icon-btn signin-close" onClick={onClose} aria-label="Close">
          <Icon.Close />
        </button>
        <div className="signin-brand">
          <span className="brand-dot" aria-hidden />
          <span>LogoMotion</span>
        </div>
        <h2 id="signin-title">{copy.title}</h2>
        <p className="signin-body">{copy.body}</p>
        <button type="button" className="google-btn" onClick={go} disabled={busy}>
          <GoogleG />
          <span>{busy ? "Opening Google…" : "Continue with Google"}</span>
        </button>
        {failed && (
          <p className="signin-error" role="alert">
            {failed}
          </p>
        )}
        <ul className="signin-points">
          <li>
            <Icon.Check size={14} /> What you've made so far comes with you
          </li>
          <li>
            <Icon.Check size={14} /> Projects, brand kit and media saved to your account
          </li>
          <li>
            <Icon.Check size={14} /> Open them on any device
          </li>
        </ul>
        <p className="signin-fine">We only use your name, email and profile photo from Google.</p>
      </div>
    </div>
  );
}
