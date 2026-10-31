/**
 * Unsplash proxy. Keeps the access key on the server (set UNSPLASH_ACCESS_KEY
 * in Vercel) and caches searches at the edge so the hourly limit lasts longer.
 *
 *   GET /api/unsplash?status=1                  -> { enabled }
 *   GET /api/unsplash?q=coffee&page=1&orientation=landscape -> Unsplash search JSON
 *   GET /api/unsplash?track=<photo id>          -> pings Unsplash's download endpoint (required by their guidelines)
 *
 * Only these fixed Unsplash endpoints are ever called; no caller-supplied URLs.
 */
declare const process: { env: Record<string, string | undefined> };

const API = "https://api.unsplash.com";
const ORIENTATIONS = new Set(["landscape", "portrait", "squarish"]);

function json(body: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
}

export async function GET(request: Request) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const url = new URL(request.url);
  if (url.searchParams.has("status")) return json({ enabled: Boolean(key) }, 200, "public, s-maxage=300");
  if (!key) return json({ error: "Unsplash isn't set up on this server." }, 501);
  const headers = { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" };

  const track = url.searchParams.get("track");
  if (track !== null) {
    if (!/^[\w-]{1,64}$/.test(track)) return json({ error: "Bad photo id." }, 400);
    const res = await fetch(`${API}/photos/${track}/download`, { headers });
    return json({ ok: res.ok }, res.ok ? 200 : 502);
  }

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return json({ error: "Missing search words." }, 400);
  const page = Math.min(50, Math.max(1, Number(url.searchParams.get("page")) || 1));
  const orientation = url.searchParams.get("orientation") ?? "";
  const params = new URLSearchParams({ query: q, page: String(page), per_page: "24", content_filter: "high" });
  if (ORIENTATIONS.has(orientation)) params.set("orientation", orientation);
  const res = await fetch(`${API}/search/photos?${params}`, { headers });
  if (!res.ok) return json({ error: res.status === 403 || res.status === 429 ? "Unsplash is busy. Try again in a minute." : `Unsplash search failed (${res.status}).` }, res.status === 429 ? 429 : 502);
  return json(await res.json(), 200, "public, s-maxage=3600, stale-while-revalidate=86400");
}
