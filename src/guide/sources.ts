/** Turn what a brand book PDF said into brand kit values and guide text. */
import type { BrandGuide, BrandKit, ColorRole } from "../types";
import { autoSecondary, hexToRgb, luminance } from "../brand/color";
import type { PdfBrand } from "./pdf";
import { emptyGuide } from "./model";
import { defaultBrand } from "../brand/defaults";

function sat(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
  return hi === 0 ? 0 : (hi - lo) / hi;
}

/** Sort the book's colours into the four roles; the rest become extra colours. */
export function pdfColorRoles(pdf: PdfBrand, current: BrandKit) {
  const list = pdf.colors;
  const vivid = list.filter((c) => sat(c.hex) > 0.25 && luminance(c.hex) > 0.02 && luminance(c.hex) < 0.92);
  const dark = list.find((c) => luminance(c.hex) < 0.04);
  const light = list.find((c) => luminance(c.hex) > 0.85);
  // A brand whose main colour is dark (navy, black) still needs a primary: use the first colour listed.
  const primary = vivid[0] ?? list.find((c) => c !== dark && c !== light) ?? null;
  const secondary = vivid.find((c) => c !== primary) ?? null;
  const roles: Partial<Record<ColorRole, { hex: string; name: string }>> = {};
  if (primary) roles.primary = primary;
  if (secondary) roles.secondary = secondary;
  if (dark) roles.black = dark;
  if (light) roles.white = light;
  const used = new Set(Object.values(roles).map((c) => c!.hex));
  const extra = list.filter((c) => !used.has(c.hex)).slice(0, 8);
  const p = roles.primary?.hex ?? current.colors.primary;
  return {
    colors: {
      primary: p,
      secondary: roles.secondary?.hex ?? autoSecondary(p),
      black: roles.black?.hex ?? current.colors.black,
      white: roles.white?.hex ?? current.colors.white,
    },
    secondaryAuto: !roles.secondary,
    names: Object.fromEntries(Object.entries(roles).filter(([, c]) => c!.name).map(([r, c]) => [r, c!.name])) as Partial<Record<ColorRole, string>>,
    extra: extra.map((c, i) => ({ hex: c.hex, name: c.name || `Colour ${i + 1}` })),
  };
}

export function brandFromPdf(pdf: PdfBrand, current: BrandKit): Partial<BrandKit> {
  const roles = pdf.colors.length ? pdfColorRoles(pdf, current) : null;
  const font = pdf.fonts[0];
  // Still the sample brand: its website, handle and tagline don't belong to this one.
  const sample = current.name === defaultBrand.name && !!pdf.name;
  return {
    ...(sample ? { website: "", handle: pdf.name.toLowerCase().replace(/[^\w.]+/g, ""), tagline: "" } : {}),
    ...(pdf.name ? { name: pdf.name, credit: `by ${pdf.name}` } : {}),
    ...(pdf.tagline ? { tagline: pdf.tagline } : {}),
    ...(roles ? { colors: roles.colors, secondaryAuto: roles.secondaryAuto } : {}),
    ...(font ? { font: { family: font.family, source: "google" as const, weight: current.font.weight || 600 } } : {}),
  };
}

export function guideFromPdf(pdf: PdfBrand, current: BrandKit, base: BrandGuide = emptyGuide()): BrandGuide {
  const roles = pdf.colors.length ? pdfColorRoles(pdf, current) : null;
  const body = pdf.fonts[1];
  return {
    ...base,
    about: pdf.about || base.about,
    values: pdf.values.length ? pdf.values : base.values,
    voice: { ...base.voice, traits: pdf.traits.length ? pdf.traits : base.voice.traits },
    colorNames: roles?.names ?? base.colorNames,
    extraColors: roles?.extra ?? base.extraColors,
    bodyFont: body ? { family: body.family, source: "google", weight: 400 } : base.bodyFont,
    source: { ...base.source, pdf: pdf.file },
    auto: base.auto.filter((k) => !(k === "about" && pdf.about) && !(k === "values" && pdf.values.length) && !(k === "voice.traits" && pdf.traits.length)),
  };
}
