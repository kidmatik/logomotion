import { createContext, useContext } from "react";
import type { AccountUser } from "./auth";
import type { ProjectRow } from "./projects";

/** What sign-in is protecting, so the sign-in window can say why it opened. */
export type SignInReason = "download" | "save" | "account";

/**
 * Everything the editor needs to know about the account. Guests can build
 * freely; downloading and saving ask them to sign in first.
 */
export interface Account {
  /** False when Supabase isn't configured: no sign-in at all, everything stays in this browser. */
  enabled: boolean;
  user: AccountUser | null;
  /** Open the sign-in window. `resume` is offered again after coming back from Google. */
  requireSignIn(reason: SignInReason, resume?: string): void;
  signOut(): void;
  /** Signed in only. */
  projects: ProjectRow[];
  currentId: string | null;
  openProject(id: string): void;
  newProject(): void;
  renameProject(id: string, name: string): void;
  deleteProject(id: string): void;
  /** A small preview image of the open project, saved with it for the project list. */
  setThumbnail(dataUrl: string): void;
  /** An action the user started before signing in (e.g. "download"), to offer once more. */
  resume: string | null;
  clearResume(): void;
}

export const AccountContext = createContext<Account | null>(null);

export function useAccount(): Account {
  const a = useContext(AccountContext);
  if (!a) throw new Error("AccountContext missing");
  return a;
}

/** True when this action should first send a guest to sign in. */
export function needsSignIn(a: Account) {
  return a.enabled && !a.user;
}
