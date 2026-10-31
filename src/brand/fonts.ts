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
];

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
export async function ensureGoogleFont(family: string, weights: number[] = [300, 400, 500, 600, 700, 800, 900]) {
  if (!loadedSheets.has(family)) {
    loadedSheets.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    // Ask for the full weight range; families without a weight fall back to the nearest one.
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700;800;900&display=swap`;
    document.head.appendChild(link);
    await new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    });
  }
  await Promise.all(
    weights.map((w) => document.fonts.load(`${w} 48px "${family}"`).catch(() => undefined)),
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
