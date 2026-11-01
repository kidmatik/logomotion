/**
 * The logo download kit: every file a team asks for (vector, transparent PNG,
 * profile pictures, covers, favicons, email, print, slides), made on the fly
 * from the one logo in the brand kit. Each file is tagged with the needs it
 * answers, so "Instagram profile" or "חתימה במייל" finds the right one.
 */
import type { BrandKit } from "../types";
import { resolveColors } from "../engine/kit";
import { contrast } from "../brand/color";
import { prepareSvg } from "../brand/logo";

export type LogoTone = "color" | "dark" | "light";
export type Bg = "none" | "white" | "primary" | "dark";

export interface LogoFile {
  id: string;
  group: "core" | "social" | "web" | "print";
  en: string;
  he: string;
  /** What it's for, one line. */
  whyEn: string;
  whyHe: string;
  /** Pixel size; h = 0 means "follow the logo's shape". */
  w: number;
  h: number;
  bg: Bg;
  tone: LogoTone;
  /** Space around the logo, as a fraction of the shorter side. */
  pad: number;
  /** Platforms crop to a circle: keep the logo inside it. */
  round?: boolean;
  /** Search words, both languages. */
  tags: string;
}

export const GROUPS: { id: LogoFile["group"]; en: string; he: string }[] = [
  { id: "core", en: "Logo", he: "לוגו" },
  { id: "social", en: "Social media", he: "רשתות חברתיות" },
  { id: "web", en: "Website & email", he: "אתר ומייל" },
  { id: "print", en: "Print, slides & video", he: "דפוס, מצגות ווידאו" },
];

export const LOGO_FILES: LogoFile[] = [
  { id: "logo", group: "core", en: "Logo, full colour", he: "לוגו בצבע מלא", whyEn: "Transparent background. The one to use by default.", whyHe: "רקע שקוף. ברירת המחדל לכל שימוש.", w: 2000, h: 0, bg: "none", tone: "color", pad: 0, tags: "logo default transparent png svg vector colour color main לוגו שקוף וקטור ראשי צבע" },
  { id: "logo-dark", group: "core", en: "Logo, one colour dark", he: "לוגו בצבע אחד כהה", whyEn: "For light backgrounds, stamps, single-colour printing.", whyHe: "לרקע בהיר, חותמות והדפסה בצבע אחד.", w: 2000, h: 0, bg: "none", tone: "dark", pad: 0, tags: "black mono one colour light background stamp שחור כהה צבע אחד רקע בהיר חותמת" },
  { id: "logo-light", group: "core", en: "Logo, white", he: "לוגו לבן", whyEn: "For dark backgrounds and over photos.", whyHe: "לרקע כהה ומעל תמונות.", w: 2000, h: 0, bg: "none", tone: "light", pad: 0, tags: "white negative dark background photo inverse לבן רקע כהה תמונה נגטיב" },
  { id: "logo-on-brand", group: "core", en: "Logo on brand colour", he: "לוגו על צבע המותג", whyEn: "Ready-made tile for stickers, posts and placeholders.", whyHe: "אריח מוכן למדבקות, פוסטים ומקומות שמורים.", w: 2000, h: 2000, bg: "primary", tone: "light", pad: 0.22, tags: "tile square brand colour sticker מדבקה ריבוע צבע מותג" },

  { id: "avatar", group: "social", en: "Profile picture", he: "תמונת פרופיל", whyEn: "Instagram, Facebook, WhatsApp, TikTok. Safe inside the round crop.", whyHe: "אינסטגרם, פייסבוק, וואטסאפ, טיקטוק. נשאר בתוך החיתוך העגול.", w: 1080, h: 1080, bg: "primary", tone: "light", pad: 0.24, round: true, tags: "profile avatar instagram facebook whatsapp tiktok threads round circle פרופיל אינסטגרם פייסבוק וואטסאפ טיקטוק תמונה עגול" },
  { id: "avatar-light", group: "social", en: "Profile picture, light", he: "תמונת פרופיל בהירה", whyEn: "LinkedIn, X, Google Business, Slack. Logo in colour on white.", whyHe: "לינקדאין, X, גוגל לעסק, סלאק. לוגו צבעוני על לבן.", w: 800, h: 800, bg: "white", tone: "color", pad: 0.22, round: true, tags: "linkedin x twitter google business slack teams profile avatar לינקדאין טוויטר גוגל סלאק פרופיל" },
  { id: "cover-linkedin", group: "social", en: "LinkedIn cover", he: "באנר לינקדאין", whyEn: "1584 × 396. Logo kept clear of the profile picture.", whyHe: "1584 × 396. הלוגו לא מוסתר ע״י תמונת הפרופיל.", w: 1584, h: 396, bg: "primary", tone: "light", pad: 0.3, tags: "linkedin cover banner header לינקדאין קאבר באנר" },
  { id: "cover-x", group: "social", en: "X (Twitter) header", he: "באנר X (טוויטר)", whyEn: "1500 × 500.", whyHe: "1500 × 500.", w: 1500, h: 500, bg: "dark", tone: "light", pad: 0.3, tags: "x twitter header banner cover טוויטר באנר" },
  { id: "cover-facebook", group: "social", en: "Facebook cover", he: "תמונת נושא לפייסבוק", whyEn: "1640 × 624. Works on phone and desktop.", whyHe: "1640 × 624. עובד בטלפון ובמחשב.", w: 1640, h: 624, bg: "primary", tone: "light", pad: 0.3, tags: "facebook cover banner page פייסבוק קאבר תמונת נושא" },
  { id: "cover-youtube", group: "social", en: "YouTube banner", he: "באנר יוטיוב", whyEn: "2560 × 1440, logo inside the area every screen shows.", whyHe: "2560 × 1440, הלוגו בתוך האזור שכל מסך מציג.", w: 2560, h: 1440, bg: "dark", tone: "light", pad: 0.42, tags: "youtube channel banner art יוטיוב ערוץ באנר" },
  { id: "post", group: "social", en: "Square post", he: "פוסט מרובע", whyEn: "1080 × 1080 announcement or placeholder post.", whyHe: "1080 × 1080 לפוסט הכרזה או פוסט זמני.", w: 1080, h: 1080, bg: "white", tone: "color", pad: 0.3, tags: "post instagram feed square פוסט פיד ריבוע" },

  { id: "favicon", group: "web", en: "Favicon", he: "פאביקון", whyEn: "The icon in the browser tab (also as SVG).", whyHe: "האייקון בלשונית הדפדפן (גם כ־SVG).", w: 512, h: 512, bg: "primary", tone: "light", pad: 0.16, tags: "favicon browser tab icon website פאביקון אייקון לשונית אתר" },
  { id: "app-icon", group: "web", en: "App & home-screen icon", he: "אייקון אפליקציה", whyEn: "1024 × 1024 for iPhone, Android and web apps.", whyHe: "1024 × 1024 לאייפון, אנדרואיד ואפליקציות ווב.", w: 1024, h: 1024, bg: "primary", tone: "light", pad: 0.24, tags: "app icon ios android apple touch pwa home screen אפליקציה אייקון אייפון אנדרואיד" },
  { id: "og", group: "web", en: "Link preview image", he: "תמונת שיתוף לקישור", whyEn: "1200 × 630, shown when your site is shared on WhatsApp, LinkedIn or Slack.", whyHe: "1200 × 630, מופיעה כשמשתפים את האתר בוואטסאפ, לינקדאין או סלאק.", w: 1200, h: 630, bg: "white", tone: "color", pad: 0.3, tags: "og open graph share preview link website seo meta שיתוף קישור תצוגה מקדימה אתר" },
  { id: "email", group: "web", en: "Email signature", he: "חתימה במייל", whyEn: "Small, light file that looks sharp in Gmail and Outlook.", whyHe: "קובץ קטן וקל שנראה חד בג׳ימייל ובאאוטלוק.", w: 400, h: 0, bg: "none", tone: "color", pad: 0, tags: "email signature gmail outlook mail newsletter מייל חתימה ג׳ימייל אאוטלוק ניוזלטר" },
  { id: "header", group: "web", en: "Website header logo", he: "לוגו לכותרת האתר", whyEn: "800 px wide, crisp on retina screens.", whyHe: "800 פיקסלים רוחב, חד במסכי רטינה.", w: 800, h: 0, bg: "none", tone: "color", pad: 0, tags: "website header navbar web retina אתר כותרת תפריט" },

  { id: "print", group: "print", en: "Print, high resolution", he: "לדפוס, ברזולוציה גבוהה", whyEn: "5000 px PNG. For print shops, send the SVG too.", whyHe: "PNG ברוחב 5000. לבית דפוס שלחו גם את ה־SVG.", w: 5000, h: 0, bg: "none", tone: "color", pad: 0, tags: "print printing merch shirt sign poster large high resolution vector דפוס הדפסה חולצה שלט פוסטר רזולוציה גבוהה מרצ׳" },
  { id: "slide", group: "print", en: "Presentation slide", he: "שקף למצגת", whyEn: "1920 × 1080 title or closing slide.", whyHe: "1920 × 1080 שקף פתיחה או סיום.", w: 1920, h: 1080, bg: "dark", tone: "light", pad: 0.34, tags: "presentation slide keynote powerpoint google slides deck מצגת שקף פאוורפוינט קינוט" },
  { id: "watermark", group: "print", en: "Video watermark", he: "סימן מים לווידאו", whyEn: "White, see-through, for the corner of videos and photos.", whyHe: "לבן ושקוף למחצה, לפינת סרטונים ותמונות.", w: 600, h: 0, bg: "none", tone: "light", pad: 0, tags: "watermark video photo corner overlay reels סימן מים וידאו תמונה פינה" },
];

/** Needs people ask for, as quick picks. */
export const NEEDS: { en: string; he: string; files: string[] }[] = [
  { en: "Transparent PNG", he: "PNG שקוף", files: ["logo", "logo-dark", "logo-light"] },
  { en: "Vector (SVG)", he: "וקטור (SVG)", files: ["logo", "logo-dark", "logo-light", "print"] },
  { en: "Profile picture", he: "תמונת פרופיל", files: ["avatar", "avatar-light"] },
  { en: "Dark background", he: "רקע כהה", files: ["logo-light", "slide"] },
  { en: "Website", he: "אתר", files: ["header", "favicon", "og", "app-icon"] },
  { en: "Email signature", he: "חתימה במייל", files: ["email"] },
  { en: "Social covers", he: "באנרים לרשתות", files: ["cover-linkedin", "cover-x", "cover-facebook", "cover-youtube"] },
  { en: "Print & merch", he: "דפוס ומרצ׳", files: ["print", "logo-dark", "logo"] },
  { en: "Presentation", he: "מצגת", files: ["slide", "logo", "logo-light"] },
  { en: "Video", he: "וידאו", files: ["watermark", "cover-youtube"] },
];

/** Files that answer a free-text need ("instagram", "רקע כהה"), best first. */
export function matchNeed(q: string): string[] {
  const words = q.toLowerCase().split(/[\s,/]+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return LOGO_FILES.map((f) => {
    const hay = `${f.tags} ${f.en} ${f.he}`.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? (f.tags.toLowerCase().split(" ").includes(w) ? 2 : 1) : 0), 0);
    return { id: f.id, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.id);
}

/** The logo has real vector shapes (not just a picture wrapped in SVG). */
export function isVector(svg: string) {
  return !/<image\b/.test(svg);
}

function paint(svgText: string, color: string | null) {
  const p = prepareSvg(svgText);
  if (!p.ok || !p.svg) return null;
  const doc = new DOMParser().parseFromString(p.svg, "image/svg+xml");
  if (color && !doc.querySelector("image")) {
    doc.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line, g, svg, text, use").forEach((el) => {
      if (el.closest("mask, clipPath, defs")) return;
      if (el.getAttribute("fill") !== "none") el.setAttribute("fill", color);
      if (el.getAttribute("stroke") && el.getAttribute("stroke") !== "none") el.setAttribute("stroke", color);
      el.removeAttribute("style");
    });
    doc.querySelectorAll("style").forEach((s) => s.remove());
  }
  return doc.documentElement;
}

/** Files that only exist as one-colour versions. */
const MONO = new Set(["logo-dark", "logo-light", "watermark"]);

/**
 * A logo in several colours isn't knocked out to white on brand-colour tiles
 * (a filled shape would turn into a blank blob): it keeps its colours on the light colour.
 */
function keepsColours(f: LogoFile, b: BrandKit) {
  return b.logoColorMode === "original" && !MONO.has(f.id);
}

function bgColor(bg: Bg, b: BrandKit, f?: LogoFile) {
  const c = resolveColors(b);
  if (f && bg === "primary" && keepsColours(f, b)) return c.white;
  return bg === "white" ? c.white : bg === "primary" ? c.primary : bg === "dark" ? c.black : null;
}

/** The logo's colour for a tone on a background (one-colour logos only). */
function toneColor(f: LogoFile, b: BrandKit): string | null {
  const c = resolveColors(b);
  if (keepsColours(f, b)) return null;
  if (f.tone === "dark") return c.black;
  if (f.tone === "light") {
    const bg = bgColor(f.bg, b);
    // Light on a light brand colour won't read: use dark instead.
    return bg && contrast(bg, c.white) < 2 ? c.black : c.white;
  }
  // Full colour: a multi-colour logo keeps its colours, a one-colour logo takes the brand colour.
  if (b.logoColorMode === "original") return null;
  const bg = bgColor(f.bg, b);
  return bg && contrast(bg, c.primary) < 2 ? c.black : c.primary;
}

function logoBox(svgEl: Element) {
  const vb = (svgEl.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = parseFloat(svgEl.getAttribute("width") ?? "100") || 100;
  const h = parseFloat(svgEl.getAttribute("height") ?? "100") || 100;
  return { x: 0, y: 0, w, h };
}

/** The file as SVG markup: the logo nested as real vectors, on its background. */
export function fileSvg(f: LogoFile, b: BrandKit): string | null {
  const el = paint(b.logoSvg, toneColor(f, b));
  if (!el) return null;
  const box = logoBox(el);
  const ratio = box.w / box.h;
  const W = f.h ? f.w : Math.round(box.w);
  const H = f.h ? f.h : Math.round(box.h);
  const short = Math.min(W, H);
  const pad = short * f.pad * (f.round ? 1.1 : 1);
  let lw = W - pad * 2, lh = H - pad * 2;
  if (lw / lh > ratio) lw = lh * ratio;
  else lh = lw / ratio;
  el.setAttribute("x", String((W - lw) / 2));
  el.setAttribute("y", String((H - lh) / 2));
  el.setAttribute("width", String(lw));
  el.setAttribute("height", String(lh));
  if (!el.getAttribute("viewBox")) el.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const bg = bgColor(f.bg, b, f);
  const inner = new XMLSerializer().serializeToString(el);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ""}${inner}</svg>`;
}

/** Pixel size of the PNG for a file. */
export function fileSize(f: LogoFile, b: BrandKit) {
  if (f.h) return { w: f.w, h: f.h };
  const el = paint(b.logoSvg, null);
  const box = el ? logoBox(el) : { w: 1, h: 1 };
  return { w: f.w, h: Math.max(1, Math.round((f.w * box.h) / box.w)) };
}

export function svgDataUrl(svg: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export async function filePng(f: LogoFile, b: BrandKit): Promise<Blob | null> {
  const svg = fileSvg(f, b);
  if (!svg) return null;
  const { w, h } = fileSize(f, b);
  const img = new Image();
  img.src = svgDataUrl(svg);
  await img.decode().catch(() => undefined);
  if (!img.naturalWidth) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (f.id === "watermark") ctx.globalAlpha = 0.6;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

export function fileName(f: LogoFile, b: BrandKit, ext: "png" | "svg") {
  const base = (b.name || "brand").toLowerCase().replace(/[^\w֐-׿]+/g, "-").replace(/^-|-$/g, "") || "brand";
  const { w, h } = fileSize(f, b);
  return `${base}-${f.id}${ext === "png" ? `-${w}x${h}` : ""}.${ext}`;
}

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- a small ZIP writer (stored, no compression: PNGs are already compressed) ---------- */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function zip(files: { name: string; data: Blob | string }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === "string" ? enc.encode(f.data) : new Uint8Array(await f.data.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name as BlobPart, data as BlobPart);
    const cen = new DataView(new ArrayBuffer(46 + name.length));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    new Uint8Array(cen.buffer).set(name, 46);
    central.push(new Uint8Array(cen.buffer));
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer], { type: "application/zip" });
}

/** Every file in the kit, PNG and (when the logo is a real vector) SVG, in folders. */
export async function kitZip(b: BrandKit, onProgress?: (n: number, total: number) => void) {
  const vector = isVector(b.logoSvg);
  const out: { name: string; data: Blob | string }[] = [];
  let i = 0;
  for (const f of LOGO_FILES) {
    onProgress?.(++i, LOGO_FILES.length);
    const png = await filePng(f, b);
    if (png) out.push({ name: `png/${fileName(f, b, "png")}`, data: png });
    if (vector) {
      const svg = fileSvg(f, b);
      if (svg) out.push({ name: `svg/${fileName(f, b, "svg")}`, data: svg });
    }
  }
  return zip(out);
}
