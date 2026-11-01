import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import App from "./App";
import type { Project } from "./types";
import { cloudEnabled, supabase } from "./cloud/supabase";
import { authErrorFromUrl, toAccountUser, useSession, type AccountUser } from "./cloud/auth";
import { AccountContext, type Account, type SignInReason } from "./cloud/account";
import { createProject, deleteProject, importGuestProject, listProjects, loadProject, newProjectFrom, renameProject, saveProject, type ProjectRow } from "./cloud/projects";
import { clearLocalMedia, setMediaUser } from "./brand/media";
import { LOCAL_KEY, flushLocalProject, loadLocalProject, saveLocalProject } from "./state/store";
import { SignInDialog } from "./ui/SignInDialog";
import { clock } from "./state/clock";

const RESUME_KEY = "logomotion.resume";
const currentKey = (uid: string) => `logomotion.current.${uid}`;

const noop = () => undefined;

/**
 * Decides who's using the editor. Guests work in this browser; downloading or
 * saving opens the sign-in window. Signed-in users get their projects from
 * their account, autosaved as they edit.
 */
export function Root() {
  const session = useSession();
  const [signIn, setSignIn] = useState<SignInReason | null>(null);
  const [authError] = useState(authErrorFromUrl);
  const [resume, setResume] = useState<string | null>(() => sessionStorage.getItem(RESUME_KEY));
  useEffect(() => {
    if (authError) setSignIn("account");
  }, [authError]);

  const requireSignIn = useCallback((reason: SignInReason, next?: string) => {
    if (next) sessionStorage.setItem(RESUME_KEY, next);
    else sessionStorage.removeItem(RESUME_KEY);
    setSignIn(reason);
  }, []);
  const clearResume = useCallback(() => {
    sessionStorage.removeItem(RESUME_KEY);
    setResume(null);
  }, []);

  const dialog = signIn && (
    <SignInDialog
      reason={signIn}
      error={authError}
      onBeforeRedirect={flushLocalProject}
      onClose={() => {
        setSignIn(null);
        sessionStorage.removeItem(RESUME_KEY);
      }}
    />
  );

  if (cloudEnabled && session === undefined) return <Splash />;

  if (session) {
    return <Workspace key={session.user.id} user={toAccountUser(session.user)} resume={resume} clearResume={clearResume} requireSignIn={requireSignIn} />;
  }

  return (
    <>
      <Guest requireSignIn={requireSignIn} />
      {dialog}
    </>
  );
}

function Guest({ requireSignIn }: { requireSignIn: Account["requireSignIn"] }) {
  const [initial] = useState(loadLocalProject);
  useEffect(() => setMediaUser(null), []);
  const account = useMemo<Account>(
    () => ({
      enabled: cloudEnabled,
      user: null,
      requireSignIn,
      signOut: noop,
      projects: [],
      currentId: null,
      openProject: noop,
      newProject: noop,
      renameProject: noop,
      deleteProject: noop,
      setThumbnail: noop,
      resume: null,
      clearResume: noop,
    }),
    [requireSignIn],
  );
  return (
    <AccountContext.Provider value={account}>
      <App initial={initial} persist={saveLocalProject} />
    </AccountContext.Provider>
  );
}

/** Batches edits into one cloud write per pause, and writes what's pending before switching or leaving. */
function useCloudSaver() {
  const pending = useRef<{ id: string; data?: Project; thumbnail?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) saveProject(p.id, p).catch(() => undefined);
  }, []);
  const queue = useCallback(
    (id: string, change: { data?: Project; thumbnail?: string }) => {
      if (pending.current && pending.current.id !== id) flush();
      pending.current = { ...(pending.current ?? { id }), ...change };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1200);
    },
    [flush],
  );
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);
  return useMemo(() => ({ queue, flush }), [queue, flush]);
}

function Workspace({ user, resume, clearResume, requireSignIn }: { user: AccountUser; resume: string | null; clearResume: () => void; requireSignIn: Account["requireSignIn"] }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [current, setCurrent] = useState<{ id: string; project: Project } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saver = useCloudSaver();
  const latest = useRef<Project | null>(null);

  setMediaUser(user.id);

  const open = useCallback(
    async (id: string) => {
      saver.flush();
      try {
        const project = await loadProject(id);
        latest.current = project;
        localStorage.setItem(currentKey(user.id), id);
        clock.seek(0);
        setCurrent({ id, project });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [saver, user.id],
  );

  // First load: bring in guest work, make sure there's at least one project, open the last one used.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const imported = await importGuestProject();
        let list = await listProjects();
        if (!list.length) list = [await createProject(newProjectFrom(loadLocalProject()))];
        if (!live) return;
        setProjects(list);
        const remembered = localStorage.getItem(currentKey(user.id));
        const pick = imported?.id ?? (list.some((p) => p.id === remembered) ? remembered! : list[0].id);
        await open(pick);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const currentId = current?.id ?? null;
  const currentRef = useRef(currentId);
  currentRef.current = currentId;
  const lastThumb = useRef<string | null>(null);
  // Stable, so the editor's thumbnail timer isn't reset by unrelated re-renders.
  const setThumbnail = useCallback(
    (url: string) => {
      const id = currentRef.current;
      if (!id || url === lastThumb.current) return;
      lastThumb.current = url;
      saver.queue(id, { thumbnail: url });
      setProjects((list) => list.map((p) => (p.id === id ? { ...p, thumbnail: url } : p)));
    },
    [saver],
  );
  const touch = useCallback((id: string, patch: Partial<ProjectRow> = {}) => {
    setProjects((list) => {
      const row = list.find((p) => p.id === id);
      if (!row) return list;
      return [{ ...row, ...patch, updated_at: new Date().toISOString() }, ...list.filter((p) => p.id !== id)];
    });
  }, []);

  const persist = useCallback(
    (p: Project) => {
      if (!currentId) return;
      latest.current = p;
      saver.queue(currentId, { data: p });
      touch(currentId);
    },
    [currentId, saver, touch],
  );

  const account = useMemo<Account>(
    () => ({
      enabled: true,
      user,
      requireSignIn,
      async signOut() {
        saver.flush();
        localStorage.removeItem(currentKey(user.id));
        localStorage.removeItem(LOCAL_KEY);
        await clearLocalMedia().catch(() => undefined);
        await supabase?.auth.signOut();
      },
      projects,
      currentId,
      openProject: (id) => id !== currentId && open(id),
      async newProject() {
        try {
          const row = await createProject(newProjectFrom(latest.current ?? loadLocalProject()));
          setProjects((list) => [row, ...list]);
          await open(row.id);
        } catch (e) {
          setError((e as Error).message);
        }
      },
      renameProject(id, name) {
        const clean = name.trim().slice(0, 80);
        if (!clean) return;
        setProjects((list) => list.map((p) => (p.id === id ? { ...p, name: clean } : p)));
        renameProject(id, clean).catch(() => undefined);
      },
      async deleteProject(id) {
        const rest = projects.filter((p) => p.id !== id);
        try {
          if (id === currentId) {
            saver.flush();
            const next = rest[0] ?? (await createProject(newProjectFrom(latest.current ?? loadLocalProject())));
            if (!rest.length) rest.push(next);
            await open(next.id);
          }
          await deleteProject(id, user.id);
          setProjects(rest);
        } catch (e) {
          setError((e as Error).message);
        }
      },
      setThumbnail,
      resume,
      clearResume,
    }),
    [user, requireSignIn, projects, currentId, open, saver, setThumbnail, resume, clearResume],
  );

  if (error && !current) {
    return (
      <div className="splash">
        <div className="splash-card">
          <strong>Couldn't open your projects</strong>
          <p>{error}</p>
          <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button type="button" className="link-btn" onClick={() => account.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  if (!current) return <Splash label="Opening your projects…" />;

  return (
    <AccountContext.Provider value={account}>
      <App key={current.id} initial={current.project} persist={persist} />
      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </AccountContext.Provider>
  );
}

function Splash({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="splash" aria-busy="true">
      <div className="splash-inner">
        <span className="brand-dot pulse" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
