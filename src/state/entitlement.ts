/**
 * Who may download videos.
 *
 * Payments aren't wired up yet, so the paywall is off unless VITE_PAYWALL=on.
 * When it is on, accounts listed in VITE_FREE_EMAILS (comma separated) always
 * have full access; everyone else will need the Lifetime plan. The real check
 * will also run on the server once sign-in and payments exist.
 */
export interface Account {
  email: string;
  plan: "free" | "lifetime";
}

export const PAYWALL_ENABLED = import.meta.env.VITE_PAYWALL === "on";

const FREE_EMAILS = new Set(
  String(import.meta.env.VITE_FREE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function canDownload(account: Account | null): boolean {
  if (!PAYWALL_ENABLED) return true;
  if (!account) return false;
  return account.plan === "lifetime" || FREE_EMAILS.has(account.email.toLowerCase());
}
