import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Accounts and cloud saving run on Supabase. Both values are public by design
 * (the anon / publishable key only allows what the row-level security rules in
 * supabase/schema.sql allow), so they're safe in the browser bundle.
 *
 * When they're missing the app runs as before: no sign-in, everything kept on
 * this device. Once they're set, signing in is required.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const cloudEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, key!, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Name of the private storage bucket that holds uploaded media, one folder per user. */
export const MEDIA_BUCKET = "media";
