/**
 * Read a brand kit from a public website.
 *
 *   GET /api/brand?url=yourbrand.com  -> JSON
 *
 * Returns the brand name, a tagline, logo candidates (SVG markup or a small
 * image as a data URL), colours sorted into roles, and the fonts the site uses
 * mapped to Google Fonts. Every request goes through safeFetch, which refuses
 * private addresses on every redirect hop.
 */
import { FetchError, safeFetch, text } from "./_lib/safeFetch";
import { ColorTally, FontTally, GradientTally, LOOKALIKE, assignRoles, readPage, toHex } from "./_lib/brandExtract";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": status === 200 ? "public, s-maxage=86400" : "no-store" },
  });
}

const MAX_CSS = 8;
const MAX_LOGOS = 4;

async function isGoogleFamily(family: string) {
  try {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

function svgColors(svg: string, tally: ColorTally) {
  for (const m of svg.matchAll(/(?:fill|stop-color|stroke)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) tally.add(m[1], 30);
}

async function resolveLogo(c: { svg?: string; url?: string; from: string }, page: URL) {
  if (c.svg) return { kind: "svg" as const, svg: c.svg, from: c.from };
  if (!c.url) return null;
  let url: URL;
  try {
    url = new URL(c.url, page);
  } catch {
    return null;
  }
  if (url.protocol === "data:") {
    const m = c.url.match(/^data:image\/svg\+xml(;base64)?,(.*)$/);
    if (m) return { kind: "svg" as const, svg: m[1] ? Buffer.from(m[2], "base64").toString("utf8") : decodeURIComponent(m[2]), from: c.from };
    return null;
  }
  try {
    const f = await safeFetch(url, { maxBytes: 1_500_000, timeoutMs: 6000, accept: "image/svg+xml,image/*" });
    const head = text({ ...f, body: f.body.subarray(0, 400) });
    if (f.type.includes("svg") || /<svg[\s>]/i.test(head)) {
      const svg = text(f);
      return { kind: "svg" as const, svg: svg.slice(svg.indexOf("<svg")), from: c.from, url: url.toString() };
    }
    if (!/^image\/(png|webp|jpeg|gif|x-icon|vnd\.microsoft\.icon)/.test(f.type)) return null;
    const mime = f.type.split(";")[0];
    return { kind: "image" as const, dataUrl: `data:${mime};base64,${Buffer.from(f.body).toString("base64")}`, from: c.from, url: url.toString() };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const raw = (new URL(request.url).searchParams.get("url") ?? "").trim();
  let page: URL;
  try {
    page = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return json({ error: "That doesn't look like a web address." }, 400);
  }

  let html: string;
  try {
    const f = await safeFetch(page, { maxBytes: 3_000_000, accept: "text/html,application/xhtml+xml" });
    page = f.url;
    html = text(f);
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError("We couldn't read that website.");
    return json({ error: err.message }, err.status);
  }

  const info = readPage(html, page);
  const colors = new ColorTally();
  const fonts = new FontTally();
  const gradients = new GradientTally();
  if (info.themeColor) colors.add(info.themeColor, 40);
  colors.addCss(info.inlineCss);
  fonts.addCss(info.inlineCss);
  gradients.addCss(info.inlineCss, 2);
  for (const href of info.stylesheets) if (/fonts\.googleapis\.com/.test(href)) fonts.addGoogleHref(href);
  for (const m of html.matchAll(/@import\s+url\(["']?(https:\/\/fonts\.googleapis\.com[^"')]+)/g)) fonts.addGoogleHref(m[1]);

  const sheets = info.stylesheets.filter((h) => !/fonts\.googleapis\.com/.test(h)).slice(0, MAX_CSS);
  const cssTexts = await Promise.all(
    sheets.map((h) =>
      safeFetch(new URL(h, page), { maxBytes: 1_500_000, timeoutMs: 6000, accept: "text/css" })
        .then(text)
        .catch(() => ""),
    ),
  );
  for (const css of cssTexts) {
    colors.addCss(css);
    fonts.addCss(css);
    gradients.addCss(css);
    for (const m of css.matchAll(/@import\s+url\(["']?(https:\/\/fonts\.googleapis\.com[^"')]+)/g)) fonts.addGoogleHref(m[1]);
  }

  // Logos: keep the best few distinct ones.
  const logos: NonNullable<Awaited<ReturnType<typeof resolveLogo>>>[] = [];
  const seen = new Set<string>();
  for (const c of info.logos) {
    if (logos.length >= MAX_LOGOS) break;
    const key = c.svg ? c.svg.slice(0, 300) : new URL(c.url!, page).toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await resolveLogo(c, page);
    if (r) logos.push(r);
  }
  if (logos[0]?.kind === "svg") svgColors(logos[0].svg, colors);

  const roles = assignRoles(colors.list());

  // Fonts: the most used family, as a Google family or its closest open lookalike.
  const fontList = fonts.list().slice(0, 4);
  const resolved: { family: string; original: string; google: boolean; lookalike: boolean }[] = [];
  for (const f of fontList) {
    const key = f.family.toLowerCase();
    if (fonts.google.has(f.family) || (await isGoogleFamily(f.family))) resolved.push({ family: f.family, original: f.family, google: true, lookalike: false });
    else {
      const alt = LOOKALIKE[key] ?? Object.entries(LOOKALIKE).find(([k]) => key.startsWith(k))?.[1];
      if (alt) resolved.push({ family: alt, original: f.family, google: true, lookalike: true });
      else resolved.push({ family: /serif/i.test(key) && !/sans/i.test(key) ? "Fraunces" : /mono|code/i.test(key) ? "JetBrains Mono" : info.rtl ? "Heebo" : "Inter", original: f.family, google: true, lookalike: true });
    }
  }

  const fontsOut = resolved.filter((f, i) => resolved.findIndex((g) => g.family === f.family) === i);

  return json({
    url: page.toString(),
    website: page.hostname.replace(/^www\./, ""),
    name: info.name,
    tagline: info.tagline,
    description: info.description,
    handle: info.handle,
    rtl: info.rtl,
    lang: info.lang,
    colors: {
      primary: roles.primary,
      secondary: roles.secondary,
      black: roles.black,
      white: roles.white,
      palette: roles.palette,
      theme: info.themeColor ? toHex(info.themeColor) : null,
    },
    fonts: fontsOut,
    gradients: gradients.list(),
    logos,
  });
}
