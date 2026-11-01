import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function toAccountUser(u: User): AccountUser {
  const m = u.user_metadata ?? {};
  return {
    id: u.id,
    email: u.email ?? "",
    name: m.full_name || m.name || (u.email ?? "").split("@")[0],
    avatarUrl: m.avatar_url || m.picture || null,
  };
}

/** The signed-in session. `undefined` while it's still being restored. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.auth.getSession().then(({ data }) => live && setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return session;
}

export async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
}

/** An error Google or Supabase sent back in the address bar after a failed sign-in. */
export function authErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
  const msg = params.get("error_description") || params.get("error");
  if (!msg) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return msg.replace(/\+/g, " ");
}
