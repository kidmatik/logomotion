/**
 * Logo maker for brands that don't have a logo yet: monogram marks and
 * typographic wordmarks built from the brand name in the brand font.
 *
 * Letters become real vector outlines (opentype.js reads the font file from
 * the Fontsource CDN, which mirrors Google Fonts), so the results stay sharp
 * at any size and download as clean SVG. If the font can't be read (an
 * uploaded font, or the CDN is unreachable) the letters are drawn on a canvas
 * instead.
 */
import opentype from "opentype.js";
import { isRtlText } from "../engine/kit";

type Font = opentype.Font;

const fontCache = new Map<string, Promise<Font | null>>();

function fontsourceId(family: string) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function loadFont(family: string, weight: number, subset: "latin" | "hebrew"): Promise<Font | null> {
  const key = `${family}|${weight}|${subset}`;
  if (!fontCache.has(key)) {
    fontCache.set(
      key,
      (async () => {
        const id = fontsourceId(family);
        for (const w of [weight, 600, 700, 400].filter((v, i, a) => a.indexOf(v) === i)) {
          try {
            const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${subset}-${w}-normal.ttf`);
            if (!res.ok) continue;
            return opentype.parse(await res.arrayBuffer());
          } catch {
            /* try the next weight */
          }
        }
        return null;
      })(),
    );
  }
  return fontCache.get(key)!;
}

interface Run {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Lay out a line of text, sized to fit maxW × maxH and centred on (cx, cy). Tracking is in ems. */
function fit(font: Font, text: string, cx: number, cy: number, maxW: number, maxH: number, tracking = 0): Run {
  const probe = shiftRun(font, text, 100, tracking, 0, 0);
  const size = 100 * Math.min(maxW / (probe.x2 - probe.x1 || 1), maxH / (probe.y2 - probe.y1 || 1));
  const at = shiftRun(font, text, size, tracking, 0, 0);
  return shiftRun(font, text, size, tracking, cx - (at.x1 + at.x2) / 2, cy - (at.y1 + at.y2) / 2);
}

/** Lay out a line of text as one SVG path starting at (dx, dy) on the baseline. */
function shiftRun(font: Font, text: string, size: number, tracking: number, dx: number, dy: number): Run {
  const rtl = isRtlText(text);
  const chars = rtl ? [...text].reverse().join("") : text;
  // One glyph per letter; skipping OpenType substitutions keeps this robust across fonts.
  const glyphs = [...chars].map((c) => font.charToGlyph(c));
  const scale = size / font.unitsPerEm;
  let x = dx;
  let d = "";
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const n = (v: number) => (Math.round(v * 100) / 100).toString();
  glyphs.forEach((g, i) => {
    // Read the outline in font units and place it ourselves: calling getPath repeatedly on
    // the same glyph corrupts its cached points in opentype.js 2.0.
    const X = (v: number) => x + v * scale;
    const Y = (v: number) => dy - v * scale;
    const track = (px: number, py: number) => {
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      x1 = Math.min(x1, px);
      y1 = Math.min(y1, py);
      x2 = Math.max(x2, px);
      y2 = Math.max(y2, py);
    };
    for (const c of g.path.commands) {
      if (c.type === "Z") d += "Z";
      else if (c.type === "M" || c.type === "L") {
        d += `${c.type}${n(X(c.x))} ${n(Y(c.y))}`;
        track(X(c.x), Y(c.y));
      } else if (c.type === "Q") {
        d += `Q${n(X(c.x1))} ${n(Y(c.y1))} ${n(X(c.x))} ${n(Y(c.y))}`;
        track(X(c.x), Y(c.y));
        track(X(c.x1), Y(c.y1));
      } else if (c.type === "C") {
        d += `C${n(X(c.x1))} ${n(Y(c.y1))} ${n(X(c.x2))} ${n(Y(c.y2))} ${n(X(c.x))} ${n(Y(c.y))}`;
        track(X(c.x), Y(c.y));
      }
    }
    const next = glyphs[i + 1];
    const kern = next ? font.getKerningValue(g, next) : 0;
    x += (g.advanceWidth ?? 0) * scale + (Number.isFinite(kern) ? kern * scale : 0) + tracking * size;
  });
  if (!isFinite(x1)) return { d: "", x1: 0, y1: 0, x2: 0, y2: 0 };
  return { d, x1, y1, x2, y2 };
}

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

const svgDoc = (vb: string, d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path fill="#111111" d="${d}"/></svg>`;

/** A shape with letters cut out of it. A mask keeps overlapping letter contours from leaving specks. */
const knockout = (shape: string, letters: string, evenoddShape = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><mask id="k" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><path fill="#000" d="${letters}"/></mask></defs><path fill="#111111"${evenoddShape ? ' fill-rule="evenodd"' : ""} mask="url(#k)" d="${shape}"/></svg>`;

/** The letters a monogram is made of: the first letter, or the first letters of two words. */
export function initials(name: string) {
  const words = name
    .replace(/\.(com|io|co|design|studio|app|net|org|il|ai)\b/gi, " $1")
    .split(/[\s._\-/]+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const first = (w: string) => [...w].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "";
  const one = first(words[0] ?? name).toLocaleUpperCase();
  const two = words.length > 1 ? (one + first(words[1]).toLocaleUpperCase()) : one;
  return { one: one || "A", two: two || "A" };
}

export interface MadeLogo {
  id: string;
  label: string;
  kind: "mark" | "wordmark";
  svg: string;
}

/** Canvas fallback: the text drawn in the loaded web font, wrapped in an SVG. */
function rasterText(text: string, family: string, weight: number, frame?: "circle" | "square"): string {
  const S = 512;
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = `${weight} 300px "${family}", sans-serif`;
  const wide = !frame;
  const tw = g.measureText(text).width;
  c.width = wide ? Math.ceil(tw + 40) : S;
  c.height = wide ? 380 : S;
  g.font = `${weight} ${wide ? 300 : 260}px "${family}", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#111";
  if (frame) {
    g.beginPath();
    if (frame === "circle") g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    else g.roundRect(0, 0, S, S, S * 0.22);
    g.fill();
    g.globalCompositeOperation = "destination-out";
  }
  g.fillText(text, c.width / 2, c.height / 2 + 10);
  const png = c.toDataURL("image/png");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}"><image width="${c.width}" height="${c.height}" href="${png}"/></svg>`;
}

/** Every logo idea for a name. Marks go in the Logo slot, wordmarks replace the typed name. */
export async function makeLogos(name: string, family: string, weight: number, source: "google" | "upload" = "google"): Promise<MadeLogo[]> {
  const clean = name.trim() || "Brand";
  const { one, two } = initials(clean);
  const rtl = isRtlText(clean);
  const font = source === "google" ? await loadFont(family, weight, rtl ? "hebrew" : "latin") : null;
  const out: MadeLogo[] = [];

  if (font) {
    try {
      return vectorLogos(font, clean, one, two, rtl);
    } catch {
      /* fall back to drawn letters below */
    }
  }
  {
    out.push({ id: "circle", label: "Circle monogram", kind: "mark", svg: rasterText(one, family, weight, "circle") });
    out.push({ id: "square", label: "Square monogram", kind: "mark", svg: rasterText(two, family, weight, "square") });
    out.push({ id: "wordmark", label: "Wordmark", kind: "wordmark", svg: rasterText(clean, family, weight) });
    return out;
  }
}

function vectorLogos(font: Font, clean: string, one: string, two: string, rtl: boolean): MadeLogo[] {
  const out: MadeLogo[] = [];
  // Marks, drawn in a 100 × 100 box.
  const L = fit(font, one, 50, 50, 54, 54);
  out.push({ id: "circle", label: "Circle monogram", kind: "mark", svg: knockout(circle(50, 50, 50), L.d) });
  const L2 = fit(font, two, 50, 50, 64, 48, two.length > 1 ? -0.04 : 0);
  out.push({ id: "square", label: "Square monogram", kind: "mark", svg: knockout(roundRect(0, 0, 100, 100, 24), L2.d) });
  const L3 = fit(font, one, rtl ? 58 : 42, 50, 70, 80);
  const dotR = 9;
  const dotX = rtl ? Math.max(4 + dotR, L3.x1 - dotR - 4) : Math.min(96 - dotR, L3.x2 + dotR + 4);
  out.push({ id: "dot", label: "Letter and dot", kind: "mark", svg: svgDoc("0 0 100 100", L3.d + circle(dotX, L3.y2 - dotR, dotR)) });
  const L4 = fit(font, one, 50, 50, 46, 46);
  out.push({ id: "ring", label: "Ring", kind: "mark", svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#111111" fill-rule="evenodd" d="${circle(50, 50, 50) + circle(50, 50, 43)}"/><path fill="#111111" d="${L4.d}"/></svg>` });
  if (two.length > 1) {
    const top = fit(font, two[0], 50, 27, 60, 42);
    const bottom = fit(font, two[1], 50, 75, 60, 42);
    out.push({ id: "stack", label: "Stacked initials", kind: "mark", svg: svgDoc("0 0 100 100", top.d + bottom.d) });
  }

  // Wordmarks: the whole name, laid out as outlines.
  const word = (text: string, tracking: number) => {
    const r = shiftRun(font, text, 200, tracking, 0, 0);
    const pad = 4;
    return { r, vb: `${(r.x1 - pad).toFixed(1)} ${(r.y1 - pad).toFixed(1)} ${(r.x2 - r.x1 + pad * 2).toFixed(1)} ${(r.y2 - r.y1 + pad * 2).toFixed(1)}` };
  };
  const plain = word(clean, -0.01);
  out.push({ id: "wm-clean", label: "Clean wordmark", kind: "wordmark", svg: svgDoc(plain.vb, plain.r.d) });
  const tight = word(clean.toLocaleLowerCase(), -0.05);
  if (!rtl) out.push({ id: "wm-tight", label: "Tight lowercase", kind: "wordmark", svg: svgDoc(tight.vb, tight.r.d) });
  const caps = word(clean.toLocaleUpperCase(), 0.12);
  if (!rtl) out.push({ id: "wm-caps", label: "Spaced capitals", kind: "wordmark", svg: svgDoc(caps.vb, caps.r.d) });
  // Name with a round full stop that stands out, a common modern accent (not for names that already have a dot).
  if (clean.includes(".")) return out;
  const base = clean.replace(/[.\s]+$/, "");
  const accent = word(base, -0.02);
  const h = accent.r.y2 - accent.r.y1;
  const r = h * 0.11;
  const cx = rtl ? accent.r.x1 - r * 2.2 : accent.r.x2 + r * 2.2;
  const minX = Math.min(accent.r.x1, cx - r) - 4;
  const maxX = Math.max(accent.r.x2, cx + r) + 4;
  out.push({
    id: "wm-dot",
    label: "Wordmark with dot",
    kind: "wordmark",
    svg: svgDoc(`${minX.toFixed(1)} ${(accent.r.y1 - 4).toFixed(1)} ${(maxX - minX).toFixed(1)} ${(h + 8).toFixed(1)}`, accent.r.d + circle(cx, accent.r.y2 - r, r)),
  });
  return out;
}
