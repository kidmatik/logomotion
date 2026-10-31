/** Google Fonts families offered in the picker. All are open-licensed. */
export const GOOGLE_FONTS = [
  "Outfit",
  "Inter",
  "DM Sans",
  "Manrope",
  "Plus Jakarta Sans",
  "Sora",
  "Space Grotesk",
  "Poppins",
  "Montserrat",
  "Work Sans",
  "Urbanist",
  "Lexend",
  "Figtree",
  "Syne",
  "Unbounded",
  "Bricolage Grotesque",
  "Fraunces",
  "Playfair Display",
  "DM Serif Display",
  "Instrument Serif",
  "JetBrains Mono",
  // Families with Hebrew letters.
  "Heebo",
  "Assistant",
  "Rubik",
  "Noto Sans Hebrew",
  "Secular One",
  "Varela Round",
  "Frank Ruhl Libre",
];

/** Families in the list above that include Hebrew letters (Latin too). */
export const HEBREW_FONTS = new Set(["Heebo", "Assistant", "Rubik", "Noto Sans Hebrew", "Secular One", "Varela Round", "Frank Ruhl Libre"]);

/** Weight range each family ships with; Google rejects a request for a weight a family doesn't have. */
const WEIGHT_RANGE: Record<string, [number, number]> = {
  Manrope: [200, 800],
  "Plus Jakarta Sans": [200, 800],
  Sora: [100, 800],
  "Space Grotesk": [300, 700],
  Syne: [400, 800],
  "Bricolage Grotesque": [200, 800],
  "Playfair Display": [400, 900],
  "DM Serif Display": [400, 400],
  "Instrument Serif": [400, 400],
  "JetBrains Mono": [100, 800],
  Assistant: [200, 800],
  "Secular One": [400, 400],
  "Varela Round": [400, 400],
};

function weightsFor(family: string) {
  const [lo, hi] = WEIGHT_RANGE[family] ?? [100, 900];
  return [300, 400, 500, 600, 700, 800, 900].filter((w) => w >= lo && w <= hi);
}

export const WEIGHTS: { value: number; label: string }[] = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra bold" },
  { value: 900, label: "Black" },
];

export function weightLabel(w: number): string {
  return WEIGHTS.find((x) => x.value === w)?.label ?? String(w);
}

const loadedSheets = new Set<string>();

/** Inject the Google Fonts stylesheet for a family (all weights) and wait until it is usable. */
export async function ensureGoogleFont(family: string, weights: number[] = weightsFor(family)) {
  if (!loadedSheets.has(family)) {
    loadedSheets.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    // Ask only for weights the family has; the browser falls back to the nearest one for the rest.
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weightsFor(family).join(";")}&display=swap`;
    document.head.appendChild(link);
    await new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    });
  }
  await Promise.all(
    // Sample text covers the Latin and Hebrew subsets, which Google serves as separate files.
    weights.map((w) => document.fonts.load(`${w} 48px "${family}"`, "Aa אב").catch(() => undefined)),
  );
}

/** Register a font file the user dropped in. It never leaves the browser. */
export async function registerUploadedFont(file: File): Promise<string> {
  const family = file.name.replace(/\.(woff2?|ttf|otf)$/i, "").replace(/[^\w\s-]/g, "").trim() || "Brand Font";
  const data = await file.arrayBuffer();
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
  return family;
}
