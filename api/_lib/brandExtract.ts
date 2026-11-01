/**
 * Read a brand from a website: name, tagline, logo candidates, colours and
 * fonts. Pure parsing helpers; the network side lives in api/brand.ts.
 */
import { parse, type HTMLElement } from "node-html-parser";

/* ---------------- colours ---------------- */

export interface ColorHit {
  hex: string;
  weight: number;
}

const NAMED: Record<string, string> = { white: "#FFFFFF", black: "#000000" };

function hex2(n: number) {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
}

/** Turn one CSS colour token into #RRGGBB (null for transparent or unreadable). */
export function toHex(token: string): string | null {
  const t = token.trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  let m = t.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) {
      if (h.length === 4 && parseInt(h[3], 16) < 8) return null;
      h = h.slice(0, 3).split("").map((c) => c + c).join("");
    } else if (h.length === 8) {
      if (parseInt(h.slice(6), 16) < 128) return null;
      h = h.slice(0, 6);
    } else if (h.length !== 6) return null;
    return "#" + h.toUpperCase();
  }
  m = t.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const v = (s: string) => (s.endsWith("%") ? (parseFloat(s) * 255) / 100 : parseFloat(s));
    if (m[4] !== undefined) {
      const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 0.5) return null;
    }
    return ("#" + hex2(v(m[1])) + hex2(v(m[2])) + hex2(v(m[3]))).toUpperCase();
  }
  m = t.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    if (m[4] !== undefined && (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) < 0.5) return null;
    const [r, g, b] = hslToRgb(parseFloat(m[1]) / 360, parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
    return ("#" + hex2(r) + hex2(g) + hex2(b)).toUpperCase();
  }
  return null;
}

function hslToRgb(h: number, s: number, l: number) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function hsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return { h, s, l };
}

const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

export class ColorTally {
  private map = new Map<string, number>();
  add(token: string, weight: number) {
    const hex = toHex(token);
    if (hex) this.map.set(hex, (this.map.get(hex) ?? 0) + weight);
  }
  /** Count every colour in a block of CSS; brand-ish custom properties and buttons count more. */
  addCss(css: string, base = 1) {
    for (const m of css.matchAll(/--([\w-]*(?:primary|brand|accent|main|highlight|cta)[\w-]*)\s*:\s*([^;}]+)/gi)) {
      for (const c of m[2].match(COLOR_TOKEN) ?? []) this.add(c, 25 * base);
    }
    for (const m of css.matchAll(/([^{}]*(?:btn|button|cta)[^{}]*)\{([^}]*)\}/gi)) {
      for (const d of m[2].matchAll(/background(?:-color)?\s*:\s*([^;]+)/gi)) for (const c of d[1].match(COLOR_TOKEN) ?? []) this.add(c, 6 * base);
    }
    for (const c of css.match(COLOR_TOKEN) ?? []) this.add(c, base);
  }
  list(): ColorHit[] {
    return [...this.map].map(([hex, weight]) => ({ hex, weight })).sort((a, b) => b.weight - a.weight);
  }
}

export interface ColorRoles {
  primary: string | null;
  secondary: string | null;
  black: string | null;
  white: string | null;
  palette: string[];
}

function hueGap(a: number, b: number) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/** Pick the four brand roles from weighted colours. */
export function assignRoles(hits: ColorHit[]): ColorRoles {
  const chromatic = hits.filter((c) => {
    const { s, l } = hsl(c.hex);
    return s >= 0.28 && l > 0.14 && l < 0.88;
  });
  const primary = chromatic[0]?.hex ?? null;
  let secondary: string | null = null;
  if (primary) {
    const p = hsl(primary);
    secondary =
      chromatic.slice(1).find((c) => {
        const q = hsl(c.hex);
        return (hueGap(p.h, q.h) > 0.08 || Math.abs(p.l - q.l) > 0.22) && c.weight >= chromatic[0].weight * 0.08;
      })?.hex ?? null;
  }
  const dark = hits.filter((c) => hsl(c.hex).l < 0.2);
  const light = hits.filter((c) => {
    const { s, l } = hsl(c.hex);
    return l > 0.93 && s < 0.5;
  });
  // A brand with no colour at all: its darkest colour becomes the primary.
  const black = dark[0]?.hex ?? null;
  const palette: string[] = [];
  for (const c of [...chromatic, ...dark.slice(0, 2), ...light.slice(0, 1)]) {
    if (!palette.includes(c.hex) && palette.length < 10) palette.push(c.hex);
  }
  return { primary: primary ?? black, secondary, black, white: light[0]?.hex ?? null, palette };
}

/* ---------------- gradients ---------------- */

export interface FoundGradient {
  type: "linear" | "radial";
  angle: number;
  stops: string[];
  weight: number;
}

const SIDES: Record<string, number> = {
  "to top": 0, "to top right": 45, "to right top": 45, "to right": 90, "to bottom right": 135, "to right bottom": 135,
  "to bottom": 180, "to bottom left": 225, "to left bottom": 225, "to left": 270, "to top left": 315, "to left top": 315,
};

/** Split on commas that aren't inside brackets. */
function splitTop(s: string) {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Brand gradients used in CSS: linear and radial, with at least two solid colours. */
export class GradientTally {
  private map = new Map<string, FoundGradient>();
  addCss(css: string, base = 1) {
    const re = /(?:-webkit-)?(repeating-)?(linear|radial)-gradient\(/g;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(css)) && guard++ < 3000) {
      if (m[1]) continue;
      let depth = 1, i = re.lastIndex;
      for (; i < css.length && depth > 0; i++) {
        if (css[i] === "(") depth++;
        else if (css[i] === ")") depth--;
      }
      const inner = css.slice(re.lastIndex, i - 1);
      const parts = splitTop(inner);
      let angle = m[2] === "linear" ? 180 : 0;
      const first = parts[0]?.toLowerCase() ?? "";
      if (m[2] === "linear" && /deg|turn|^to /.test(first)) {
        angle = first.endsWith("turn") ? parseFloat(first) * 360 : SIDES[first] ?? parseFloat(first);
        parts.shift();
      } else if (m[2] === "radial" && !/^(#|rgb|hsl|[a-z]+\s*$)/.test(first)) parts.shift();
      const stops: string[] = [];
      for (const p of parts) {
        const tok = p.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(white|black)\b/)?.[0];
        const hex = tok ? toHex(tok) : null;
        if (hex && stops[stops.length - 1] !== hex) stops.push(hex);
      }
      const distinct = new Set(stops);
      if (distinct.size < 2 || stops.length > 6 || !Number.isFinite(angle)) continue;
      // Grey-to-grey fades are UI shading, not brand gradients.
      if (stops.every((h) => hsl(h).s < 0.15)) continue;
      const key = `${m[2]}|${Math.round(angle)}|${stops.join(",")}`;
      const hit = this.map.get(key);
      if (hit) hit.weight += base;
      else this.map.set(key, { type: m[2] as "linear" | "radial", angle: Math.round(angle), stops: stops.slice(0, 4), weight: base });
    }
  }
  list(max = 4) {
    return [...this.map.values()].sort((a, b) => b.weight - a.weight).slice(0, max);
  }
}

/* ---------------- fonts ---------------- */

const GENERIC = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "helvetica neue", "arial", "helvetica", "inherit", "initial", "unset", "emoji",
  "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "times new roman", "times", "georgia", "courier new",
  "courier", "menlo", "monaco", "consolas", "sf mono", "sf pro display", "sf pro text", "verdana", "tahoma", "math", "revert",
]);

const FONT_KEYWORDS = /^(normal|bold|bolder|lighter|italic|oblique|none|auto|var|calc|small|medium|large|x-large|smaller|larger|\d.*)$/i;

export class FontTally {
  private map = new Map<string, number>();
  google = new Set<string>();
  private add(raw: string, weight: number) {
    const first = raw
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
      .find((s) => s && !s.startsWith("var(") && !GENERIC.has(s.toLowerCase()) && !/^__/.test(s) && !/fallback/i.test(s));
    if (!first || first.length > 48) return;
    // Next.js and similar rename fonts, e.g. "__Inter_d65c78": recover the real name.
    const clean = first
      .replace(/_[0-9a-f]{5,}$/i, "")
      .replace(/^_+/, "")
      .replace(/_/g, " ")
      .replace(/\s+(variable|vf|web|webfont|regular|display var)$/i, "")
      .trim();
    if (!/^[A-Za-z\u0590-\u05ff][\w\s.\u0590-\u05ff-]*$/.test(clean) || FONT_KEYWORDS.test(clean)) return;
    if (clean) this.map.set(clean, (this.map.get(clean) ?? 0) + weight);
  }
  addCss(css: string) {
    for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
      const heading = /(^|[\s,>])(h1|h2|\.?[\w-]*(?:heading|title|display|hero|headline)[\w-]*)\b/i.test(m[1]);
      for (const d of m[2].matchAll(/font-family\s*:\s*([^;}]+)/gi)) this.add(d[1], heading ? 4 : 1);
      for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) {
        if (/,|sans-serif|serif|monospace/.test(d[2]) && /sans-serif|serif|monospace|system-ui/.test(d[2]) && !/mono|code/i.test(d[1])) this.add(d[2], /head|display|title/i.test(d[1]) ? 4 : 2);
      }
    }
  }
  addGoogleHref(href: string) {
    try {
      const u = new URL(href, "https://fonts.googleapis.com");
      for (const f of u.searchParams.getAll("family")) {
        for (const part of f.split("|")) {
          const name = part.split(":")[0].replace(/\+/g, " ").trim();
          if (name) {
            this.google.add(name);
            this.map.set(name, (this.map.get(name) ?? 0) + 3);
          }
        }
      }
    } catch {
      /* not a URL */
    }
  }
  list() {
    return [...this.map].sort((a, b) => b[1] - a[1]).map(([family, weight]) => ({ family, weight }));
  }
}

/** Common paid or system fonts and the closest open Google family. */
export const LOOKALIKE: Record<string, string> = {
  "circular": "DM Sans", "circular std": "DM Sans", "circularxx": "DM Sans", "gt walsheim": "Outfit", "gt walsheim pro": "Outfit",
  "graphik": "Inter", "sf pro": "Inter", "helvetica now": "Inter", "neue haas grotesk": "Inter", "neue haas unica": "Inter",
  "suisse intl": "Inter", "aktiv grotesk": "Inter", "proxima nova": "Montserrat", "gotham": "Montserrat", "avenir": "Figtree",
  "avenir next": "Figtree", "futura": "Jost", "futura pt": "Jost", "brandon grotesque": "Josefin Sans", "gilroy": "Plus Jakarta Sans",
  "eina": "Manrope", "tt commons": "Manrope", "tt norms": "Manrope", "sofia pro": "Outfit", "apercu": "Work Sans", "founders grotesk": "Work Sans",
  "national": "Work Sans", "aeonik": "Urbanist", "pp neue montreal": "Inter", "neue montreal": "Inter", "satoshi": "Outfit",
  "general sans": "Plus Jakarta Sans", "clash display": "Syne", "cabinet grotesk": "Bricolage Grotesque", "styrene": "Space Grotesk",
  "styrene a": "Space Grotesk", "tiempos": "Fraunces", "tiempos headline": "Fraunces", "gt sectra": "Fraunces", "canela": "Playfair Display",
  "recoleta": "Fraunces", "freight display": "Playfair Display", "ogg": "DM Serif Display", "pp editorial new": "Instrument Serif",
  "ibm plex sans": "IBM Plex Sans", "geist": "Geist", "geist sans": "Geist", "geist mono": "Geist Mono", "sohne": "Inter", "söhne": "Inter",
  "calibre": "Figtree", "lato": "Lato", "open sans": "Open Sans", "segoe": "Open Sans", "ploni": "Heebo", "almoni": "Heebo",
  "narkis": "Assistant", "simpler": "Assistant", "fb": "Heebo",
};

/* ---------------- page ---------------- */

export interface LogoCandidate {
  score: number;
  /** Inline SVG markup, or a URL to fetch. */
  svg?: string;
  url?: string;
  from: string;
}

export interface PageInfo {
  name: string;
  tagline: string;
  description: string;
  lang: string;
  rtl: boolean;
  themeColor: string | null;
  handle: string;
  stylesheets: string[];
  logos: LogoCandidate[];
  inlineCss: string;
}

function attrs(el: HTMLElement | null, depth = 3) {
  let s = "";
  for (let e: HTMLElement | null = el, i = 0; e && i < depth; e = e.parentNode as HTMLElement | null, i++) {
    s += ` ${e.getAttribute?.("class") ?? ""} ${e.getAttribute?.("id") ?? ""} ${e.getAttribute?.("aria-label") ?? ""} ${e.getAttribute?.("alt") ?? ""}`;
  }
  return s.toLowerCase();
}

function closest(el: HTMLElement, test: (e: HTMLElement) => boolean, max = 8) {
  for (let e: HTMLElement | null = el.parentNode as HTMLElement | null, i = 0; e && i < max; e = e.parentNode as HTMLElement | null, i++) {
    if (e.tagName && test(e)) return e;
  }
  return null;
}

function isHomeLink(a: HTMLElement | null, page: URL) {
  const href = a?.getAttribute("href");
  if (!href) return false;
  try {
    const u = new URL(href, page);
    return u.hostname.replace(/^www\./, "") === page.hostname.replace(/^www\./, "") && /^\/?([a-z]{2}(-[a-z]{2})?\/?)?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** A row of many logos is a customer wall, not the brand's own logo. */
function inLogoWall(el: HTMLElement) {
  const wall = closest(el, (e) => (e.querySelectorAll("img, svg").length ?? 0) >= 6 && !/header|nav/i.test(e.tagName), 4);
  return !!wall && !closest(el, (e) => /^(header|nav)$/i.test(e.tagName), 6);
}

function splitTitle(title: string) {
  return title.split(/\s+[|–—·•:\-]\s+|\s*[|–—·•]\s*/).map((s) => s.trim()).filter(Boolean);
}

function squash(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9֐-׿]/g, "");
}

function firstSentence(s: string, max = 70) {
  const one = s.split(/(?<=[.!?])\s/)[0].trim();
  if (one.length <= max) return one.replace(/[.]$/, "");
  return one.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function resolveUse(svg: HTMLElement, root: HTMLElement) {
  for (const use of svg.querySelectorAll("use")) {
    const ref = (use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "").replace(/^#/, "");
    if (!ref) continue;
    const target = root.querySelector(`[id="${ref.replace(/"/g, "")}"]`);
    if (!target) return false;
    const g = target.tagName.toLowerCase() === "symbol" ? target.innerHTML : target.outerHTML;
    if (!svg.getAttribute("viewBox") && target.getAttribute("viewBox")) svg.setAttribute("viewBox", target.getAttribute("viewBox")!);
    use.replaceWith(`<g>${g}</g>`);
  }
  return true;
}

export function readPage(html: string, page: URL): PageInfo {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });
  const meta = (sel: string) => root.querySelector(sel)?.getAttribute("content")?.trim() ?? "";
  const htmlEl = root.querySelector("html");
  const lang = (htmlEl?.getAttribute("lang") ?? "").toLowerCase();
  const rtl = (htmlEl?.getAttribute("dir") ?? "").toLowerCase() === "rtl" || /^(he|iw|ar|fa)\b/.test(lang);

  // Structured data often names the organisation and its logo outright.
  let ldName = "";
  let ldLogo = "";
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.text);
      const items: unknown[] = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const it of items as Record<string, unknown>[]) {
        const type = String(it?.["@type"] ?? "");
        if (!/Organization|Corporation|Brand|LocalBusiness|WebSite/i.test(type)) continue;
        if (!ldName && typeof it.name === "string" && !/WebSite/i.test(type)) ldName = it.name;
        const logo = it.logo as string | { url?: string } | undefined;
        if (!ldLogo && logo) ldLogo = typeof logo === "string" ? logo : logo.url ?? "";
      }
    } catch {
      /* broken JSON-LD is common */
    }
  }

  const host = page.hostname.replace(/^www\./, "");
  const hostRoot = host.split(".").slice(0, -1).join(".") || host;
  const title = root.querySelector("title")?.text.trim() ?? "";
  const parts = splitTitle(title);
  const siteName = meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]') || meta('meta[name="apple-mobile-web-app-title"]');
  let name = ldName || siteName;
  if (!name) name = parts.find((p) => squash(p).includes(squash(hostRoot)) || squash(hostRoot).includes(squash(p))) ?? "";
  if (!name || name.length > 40) name = hostRoot.charAt(0).toUpperCase() + hostRoot.slice(1);
  const description = meta('meta[name="description"]') || meta('meta[property="og:description"]');
  const rest = parts.filter((p) => squash(p) !== squash(name) && !squash(name).includes(squash(p)));
  const tagline = rest[0] && rest[0].length >= 4 && rest[0].length <= 60 ? rest[0] : description ? firstSentence(description, 60) : "";

  const themeColor = toHex(meta('meta[name="theme-color"]'));

  let handle = "";
  const socials: [RegExp, number][] = [
    [/instagram\.com\/([\w.]+)/i, 4],
    [/(?:twitter|x)\.com\/(\w+)/i, 3],
    [/tiktok\.com\/@([\w.]+)/i, 2],
    [/linkedin\.com\/company\/([\w-]+)/i, 1],
  ];
  let best = 0;
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    for (const [re, rank] of socials) {
      const m = href.match(re);
      if (m && rank > best && !/^(share|intent|p|reel|explore|home|hashtag)$/i.test(m[1])) {
        handle = m[1];
        best = rank;
      }
    }
  }

  const stylesheets = root
    .querySelectorAll('link[rel~="stylesheet"], link[as="style"]')
    .map((l) => l.getAttribute("href"))
    .filter((h): h is string => !!h);
  let inlineCss = root.querySelectorAll("style").map((s) => s.text).join("\n");
  inlineCss += "\n" + root.querySelectorAll("[style]").map((e) => `x{${e.getAttribute("style")}}`).join("\n");

  // ---- logo candidates
  const logos: LogoCandidate[] = [];
  const nameKey = squash(name);
  if (ldLogo) logos.push({ score: 9, url: ldLogo, from: "structured data" });

  const svgs = root.querySelectorAll("svg");
  svgs.forEach((svg, i) => {
    const a = svg.closest("a") as HTMLElement | null;
    const label = attrs(svg) + " " + (svg.querySelector("title")?.text ?? "").toLowerCase();
    let score = 0;
    if (/logo|brand|wordmark/.test(label)) score += 5;
    if (nameKey && squash(label).includes(nameKey)) score += 3;
    if (isHomeLink(a, page)) score += 4;
    if (closest(svg, (e) => /^(header|nav)$/i.test(e.tagName) || /header|navbar|topbar/.test(attrs(e, 1)))) score += 3;
    if (i < 3) score += 2;
    if (closest(svg, (e) => e.tagName === "BUTTON")) score -= 6;
    if (inLogoWall(svg)) score -= 7;
    const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] <= 24 && vb[3] <= 24 && !/logo/.test(label)) score -= 4;
    if (svg.querySelectorAll("path, rect, circle, polygon, ellipse, use").length === 0) return;
    if (score < 4) return;
    if (!resolveUse(svg, root)) return;
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    logos.push({ score, svg: svg.outerHTML, from: "page" });
  });

  root.querySelectorAll("img").forEach((img, i) => {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || (img.getAttribute("srcset") ?? "").split(/\s+/)[0];
    if (!src || src.startsWith("data:image/gif")) return;
    const label = attrs(img) + " " + src.toLowerCase();
    let score = 0;
    if (/logo|brand|wordmark/.test(label)) score += 5;
    const alt = squash(img.getAttribute("alt") ?? "");
    if (nameKey && alt.includes(nameKey)) score += 3;
    // "Acme logo" on a studio's site is a client's logo, not the studio's own.
    else if (nameKey && alt.length > 2 && !closest(img, (e) => /^(header|nav)$/i.test(e.tagName), 8)) score -= 4;
    if (isHomeLink(img.closest("a") as HTMLElement | null, page)) score += 4;
    if (closest(img, (e) => /^(header|nav)$/i.test(e.tagName) || /header|navbar/.test(attrs(e, 1)))) score += 3;
    if (i < 3) score += 1;
    if (inLogoWall(img)) score -= 7;
    if (/\.svg(\?|$)/i.test(src)) score += 1;
    if (score >= 5) logos.push({ score, url: src, from: "page" });
  });

  for (const l of root.querySelectorAll("link[rel]")) {
    const rel = (l.getAttribute("rel") ?? "").toLowerCase();
    const href = l.getAttribute("href");
    if (!href) continue;
    const svg = /\.svg(\?|$)/i.test(href) || l.getAttribute("type") === "image/svg+xml";
    if (rel.includes("mask-icon")) logos.push({ score: 3, url: href, from: "icon" });
    else if (rel.includes("icon") && svg) logos.push({ score: 3, url: href, from: "icon" });
    else if (rel.includes("apple-touch-icon")) logos.push({ score: 1, url: href, from: "app icon" });
  }

  logos.sort((a, b) => b.score - a.score);
  return { name, tagline, description, lang, rtl, themeColor, handle, stylesheets, logos, inlineCss };
}
