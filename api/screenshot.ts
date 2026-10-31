/**
 * Screenshot a public web page for the "Your screens" scene.
 *
 *   GET /api/screenshot?url=https://example.com&device=desktop|mobile  -> image/jpeg
 *
 * Uses the Microlink screenshot API (free tier, no key; set MICROLINK_API_KEY
 * for the paid tier). We only ever call Microlink and then download the image
 * from Microlink's own CDN, never an address the caller chooses.
 */
declare const process: { env: Record<string, string | undefined> };

function fail(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let target: URL;
  try {
    target = new URL(params.get("url") ?? "");
  } catch {
    return fail("That doesn't look like a web address.", 400);
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE.test(target.hostname)) return fail("Only public http(s) pages can be captured.", 400);
  const mobile = params.get("device") === "mobile";

  const key = process.env.MICROLINK_API_KEY;
  const q = new URLSearchParams({
    url: target.toString(),
    screenshot: "true",
    meta: "false",
    "screenshot.type": "jpeg",
    "screenshot.quality": "82",
    // Tall enough for the browser scene to scroll through, small enough to send back quickly.
    "viewport.width": mobile ? "390" : "1440",
    "viewport.height": mobile ? "1700" : "2600",
    "viewport.deviceScaleFactor": mobile ? "2" : "1",
    "viewport.isMobile": mobile ? "true" : "false",
    "viewport.hasTouch": mobile ? "true" : "false",
    adblock: "true",
    waitUntil: "networkidle2",
  });
  const api = key ? "https://pro.microlink.io" : "https://api.microlink.io";
  let info: { status?: string; message?: string; data?: { screenshot?: { url?: string } } };
  try {
    const res = await fetch(`${api}/?${q}`, { headers: key ? { "x-api-key": key } : {} });
    info = await res.json();
    if (res.status === 429) return fail("The free capture quota is used up for now. Try again later, or upload a screenshot instead.", 429);
  } catch {
    return fail("The capture service didn't respond. Try again, or upload a screenshot instead.", 502);
  }
  const shot = info.data?.screenshot?.url;
  if (info.status !== "success" || !shot) return fail(info.message ? `Couldn't capture that page: ${info.message}` : "Couldn't capture that page. It may block automatic screenshots.", 502);

  let img: URL;
  try {
    img = new URL(shot);
  } catch {
    return fail("The capture service sent back something unexpected.", 502);
  }
  if (img.protocol !== "https:" || !/(^|\.)microlink\.io$/.test(img.hostname)) return fail("The capture service sent back something unexpected.", 502);
  const pic = await fetch(img);
  if (!pic.ok) return fail(`Couldn't download the screenshot (${pic.status}).`, 502);
  return new Response(await pic.arrayBuffer(), {
    headers: { "content-type": pic.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, s-maxage=86400" },
  });
}
