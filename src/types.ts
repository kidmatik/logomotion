/** The four colour roles every scene draws from. Scenes never hold raw hex values. */
export type ColorRole = "primary" | "secondary" | "black" | "white";

export type LogoColorMode = "primary" | "original";

export interface BrandFont {
  /** CSS family name, e.g. "Outfit". */
  family: string;
  /** Where the font comes from: a Google Fonts family or a file the user dropped in. */
  source: "google" | "upload";
  weight: number;
}

export interface BrandKit {
  /** Raw SVG markup of the main logo mark. */
  logoSvg: string;
  /** Optional lettermark SVG; when set it replaces the typed name in logo scenes. */
  lettermarkSvg: string | null;
  useLettermark: boolean;
  /** Global multiplier applied to the logo in every scene (1 = balanced). */
  logoScale: number;
  lettermarkScale: number;
  name: string;
  nameLine2: string;
  font: BrandFont;
  /** Name size at the 1080p reference height, in px. */
  nameSize: number;
  lineSpacing: number;
  colors: {
    primary: string;
    secondary: string;
    black: string;
    white: string;
  };
  secondaryAuto: boolean;
  logoColorMode: LogoColorMode;
  website: string;
  tagline: string;
  /** Small caption used in reel scenes, e.g. "by Studio Name". */
  credit: string;
  /** Social handle shown on the profile mockup, without the @. */
  handle: string;
  signLine1: string;
  signLine2: string;
}

export type TransitionKind = "cut" | "fade" | "slide" | "wipe" | "zoom";

export type ParamValue = string | number | boolean;

export interface SceneInstance {
  /** Unique per instance, so the same scene type can appear twice. */
  uid: string;
  type: string;
  enabled: boolean;
  duration: number;
  transition: TransitionKind;
  params: Record<string, ParamValue>;
}

/** Where a stock photo came from, so it can be credited properly. */
export interface MediaCredit {
  provider: "unsplash" | "pexels" | "openverse";
  author: string;
  authorUrl?: string;
  /** The photo's page on the provider. */
  sourceUrl: string;
  license: string;
  licenseUrl?: string;
}

/**
 * A real brand asset: a screenshot or product demo ("screen"), or a photo for
 * the photo scenes ("photo"), uploaded, captured or picked from stock.
 */
export interface MediaItem {
  id: string;
  kind: "image" | "video";
  use: "screen" | "photo";
  label: string;
  origin: "upload" | "capture" | "stock";
  credit?: MediaCredit;
  /** Focal point (0..1) kept in frame when the image is cropped to fit any layout. */
  focusX: number;
  focusY: number;
  /** The page a capture came from. */
  sourceUrl?: string;
  device?: "desktop" | "mobile";
  width: number;
  height: number;
}

export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

export interface Project {
  version: 1;
  /** Which template the scene list started from. */
  template: string;
  aspect: Aspect;
  /** Optional musical timing: when snap is on, scene lengths round to whole beats. */
  tempo: { bpm: number; snap: boolean };
  brand: BrandKit;
  /** Metadata only; the files themselves live in IndexedDB on this device. */
  media: MediaItem[];
  scenes: SceneInstance[];
}
