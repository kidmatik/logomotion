/**
 * Read a brand style guide PDF in the browser: colours (HEX, RGB, CMYK), font
 * names, the brand story, values and voice. Brand books are laid out very
 * differently, so this reads what it can and the page fills the rest.
 * pdf.js loads only when someone actually drops a PDF.
 */
import { GOOGLE_FONTS } from "../brand/fonts";
import { normalizeHex, rgbToHex } from "../brand/color";
import { imageColors } from "../brand/fromSite";

export interface PdfBrand {
  file: string;
  name: string;
  tagline: string;
  about: string;
  values: string[];
  traits: string[];
  colors: { hex: string; name: string }[];
  /** Font families mentioned, mapped to the nearest Google font; headline font first. */
  fonts: { family: string; original: string }[];
  pages: number;
}

/** Commercial fonts brand books often name, and a free font that looks close. */
const LOOKALIKE: Record<string, string> = {
  helvetica: "Inter", "helvetica neue": "Inter", arial: "Inter", "neue haas grotesk": "Inter", graphik: "Inter", "sf pro": "Inter",
  "proxima nova": "Montserrat", gotham: "Montserrat", avenir: "Figtree", "avenir next": "Figtree", futura: "Jost", "futura pt": "Jost",
  circular: "DM Sans", "gt walsheim": "Outfit", gilroy: "Plus Jakarta Sans", "sofia pro": "Outfit", "brandon grotesque": "Josefin Sans",
  "din": "Barlow", "din pro": "Barlow", "museo sans": "Nunito Sans", "source sans": "Source Sans 3", garamond: "EB Garamond",
  "times new roman": "Frank Ruhl Libre", georgia: "Fraunces", "playfair": "Playfair Display", "aeonik": "Urbanist", "satoshi": "Outfit",
  "general sans": "Plus Jakarta Sans", ploni: "Heebo", almoni: "Heebo", narkis: "Assistant", simpler: "Assistant", "open sans hebrew": "Heebo",
  "roboto": "Roboto", "open sans": "Open Sans", lato: "Lato", poppins: "Poppins", montserrat: "Montserrat", "nunito": "Nunito",
};

const HEADINGS = {
  about: /^(about( us)?|our story|who we are|brand story|mission|our mission|vision|our vision|purpose|our purpose|brand essence|אודות|הסיפור שלנו|מי אנחנו|חזון|ייעוד|מטרה|המותג)\b/i,
  values: /^(values|our values|brand values|core values|pillars|ערכים|ערכי המותג|הערכים שלנו)\b/i,
  voice: /^(tone( of voice)?|voice( and tone| & tone)?|brand voice|personality|brand personality|טון|שפה|קול המותג|אישיות)\b/i,
  tagline: /^(tagline|slogan|claim|סלוגן|תגית)\b/i,
};

function cmykToHex(c: number, m: number, y: number, k: number) {
  const f = (v: number) => Math.round(255 * (1 - v / 100) * (1 - k / 100));
  return rgbToHex({ r: f(c), g: f(m), b: f(y) });
}

/** A short line right before a colour code is usually its name. */
function colourName(line: string) {
  const s = line.replace(/(hex|rgb|cmyk|pantone|pms|ral)\b.*$/i, "").trim();
  return s.length >= 2 && s.length <= 28 && !/\d{2,}/.test(s) ? s : "";
}

/** Text lines of a page, top to bottom, plus the size of each line's text. */
async function pageLines(page: { getTextContent: () => Promise<{ items: unknown[] }> }) {
  const content = await page.getTextContent();
  const rows = new Map<number, { x: number; s: string; size: number }[]>();
  for (const it of content.items as { str: string; transform: number[]; height: number }[]) {
    if (!it.str?.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    const row = rows.get(y) ?? [];
    row.push({ x: it.transform[4], s: it.str, size: Math.abs(it.transform[3]) || it.height });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, r]) => {
      r.sort((a, b) => a.x - b.x);
      return { text: r.map((x) => x.s).join(" ").replace(/\s+/g, " ").trim(), size: Math.max(...r.map((x) => x.size)) };
    })
    .filter((l) => l.text);
}

/** The paragraph after a heading, up to the next heading-like line. */
function after(lines: { text: string; size: number }[], i: number, max = 420) {
  const body = lines[i].size;
  const out: string[] = [];
  const rest = lines[i].text.replace(/^[^:]*:\s*/, "");
  if (rest !== lines[i].text && rest.length > 3) out.push(rest);
  for (let j = i + 1; j < lines.length && out.join(" ").length < max; j++) {
    const l = lines[j];
    if (l.size >= body * 0.98 && j > i + 1 && l.text.length < 40) break;
    if (Object.values(HEADINGS).some((h) => h.test(l.text))) break;
    out.push(l.text);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function words(s: string) {
  return s
    .split(/[•·|,;\n/]| {2,}|\s[-–]\s/)
    .map((w) => w.replace(/^[\d.\s-]+/, "").trim())
    .filter((w) => w.length >= 3 && w.length <= 24 && w.split(" ").length <= 3)
    .slice(0, 6);
}

export async function readBrandPdf(file: File): Promise<PdfBrand> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, 60);
  const out: PdfBrand = { file: file.name, name: "", tagline: "", about: "", values: [], traits: [], colors: [], fonts: [], pages: doc.numPages };
  const fontCount = new Map<string, { n: number; original: string }>();
  const seen = new Set<string>();
  const addColor = (hex: string | null, name: string) => {
    if (!hex) return;
    const h = hex.toUpperCase();
    if (seen.has(h)) return;
    seen.add(h);
    out.colors.push({ hex: h, name });
  };
  const fontNames = [...new Set([...GOOGLE_FONTS, ...Object.keys(LOOKALIKE)])];

  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const lines = await pageLines(page);
    if (p === 1 && lines.length) {
      const biggest = [...lines].sort((a, b) => b.size - a.size)[0];
      if (biggest.text.length <= 40) out.name = biggest.text.replace(/\b(brand|style|guide(lines)?|book|manual|identity)\b/gi, "").replace(/\s+/g, " ").trim();
    }
    lines.forEach((l, i) => {
      const t = l.text;
      const prev = i > 0 ? colourName(lines[i - 1].text) : "";
      const own = colourName(t);
      for (const m of t.matchAll(/(?:#|hex[:\s]*#?)([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) addColor(normalizeHex("#" + m[1]), own || prev);
      for (const m of t.matchAll(/\bR(?:GB)?\s*[:\s]?\s*(\d{1,3})[\s,/]+(?:G\s*[:\s]?\s*)?(\d{1,3})[\s,/]+(?:B\s*[:\s]?\s*)?(\d{1,3})\b/gi)) {
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        if (r <= 255 && g <= 255 && b <= 255) addColor(rgbToHex({ r, g, b }), own || prev);
      }
      if (!/hex|#|rgb/i.test(t))
        for (const m of t.matchAll(/\bC(?:MYK)?\s*[:\s]?\s*(\d{1,3})[\s,/]+(?:M\s*[:\s]?\s*)?(\d{1,3})[\s,/]+(?:Y\s*[:\s]?\s*)?(\d{1,3})[\s,/]+(?:K\s*[:\s]?\s*)?(\d{1,3})\b/gi)) {
          const v = [+m[1], +m[2], +m[3], +m[4]];
          if (v.every((x) => x <= 100)) addColor(cmykToHex(v[0], v[1], v[2], v[3]), own || prev);
        }
      const low = t.toLowerCase();
      for (const f of fontNames) {
        if (low.includes(f.toLowerCase()) && new RegExp(`(^|[^a-z])${f.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(low)) {
          const family = LOOKALIKE[f.toLowerCase()] ?? f;
          const at = low.indexOf(f.toLowerCase());
          const cur = fontCount.get(family) ?? { n: 0, original: t.slice(at, at + f.length) };
          cur.n += l.size;
          fontCount.set(family, cur);
        }
      }
      if (!out.about && HEADINGS.about.test(t)) out.about = after(lines, i);
      if (!out.values.length && HEADINGS.values.test(t)) out.values = words(after(lines, i, 200));
      if (!out.traits.length && HEADINGS.voice.test(t)) out.traits = words(after(lines, i, 200));
      if (!out.tagline && HEADINGS.tagline.test(t)) out.tagline = after(lines, i, 80).slice(0, 80);
    });
  }

  // No colour codes written anywhere: take the main colours of the first pages.
  if (!out.colors.length) {
    for (let p = 1; p <= Math.min(pages, 4); p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 0.4 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas } as never).promise;
      for (const hex of await imageColors(canvas.toDataURL("image/png"), 3)) addColor(hex, "");
    }
  }
  out.fonts = [...fontCount.entries()].sort((a, b) => b[1].n - a[1].n).map(([family, v]) => ({ family, original: v.original }));
  out.about = out.about.slice(0, 600);
  await doc.destroy();
  return out;
}
