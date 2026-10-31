/**
 * Pexels proxy. Keeps the API key on the server (set PEXELS_API_KEY in Vercel)
 * and caches searches at the edge so the hourly limit lasts longer.
 *
 *   GET /api/pexels?status=1                               -> { enabled }
 *   GET /api/pexels?q=coffee&page=1&orientation=landscape  -> Pexels search JSON
 *
 * Only the fixed Pexels search endpoint is ever called; no caller-supplied URLs.
 */
declare const process: { env: Record<string, string | undefined> };

const ORIENTATIONS = new Set(["landscape", "portrait", "square"]);

function json(body: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
}

export async function GET(request: Request) {
  const key = process.env.PEXELS_API_KEY;
  const url = new URL(request.url);
  if (url.searchParams.has("status")) return json({ enabled: Boolean(key) }, 200, "public, s-maxage=300");
  if (!key) return json({ error: "Pexels isn't set up on this server." }, 501);

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return json({ error: "Missing search words." }, 400);
  const page = Math.min(50, Math.max(1, Number(url.searchParams.get("page")) || 1));
  const orientation = url.searchParams.get("orientation") ?? "";
  const params = new URLSearchParams({ query: q, page: String(page), per_page: "24" });
  if (ORIENTATIONS.has(orientation)) params.set("orientation", orientation);
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key } });
  if (!res.ok) return json({ error: res.status === 429 ? "Pexels is busy. Try again in a minute." : `Pexels search failed (${res.status}).` }, res.status === 429 ? 429 : 502);
  return json(await res.json(), 200, "public, s-maxage=3600, stale-while-revalidate=86400");
}
