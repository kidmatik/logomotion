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
  /** Brand gradients (from the website or made by hand). Scenes can use them as backgrounds. */
  gradients: BrandGradient[];
  /** Reading direction of the video. "auto" switches to right-to-left when the brand text is Hebrew or Arabic. */
  direction: TextDirection;
}

export type TextDirection = "auto" | "rtl" | "ltr";

export interface BrandGradient {
  id: string;
  name: string;
  /** "mesh" is soft colour blobs drifting over the first colour. */
  type: "linear" | "radial" | "mesh";
  /** Degrees, CSS convention (0 = upwards, 90 = to the right). */
  angle: number;
  /** Two to four hex colours. */
  stops: string[];
}

/**
 * A scene's own background, replacing the one the scene draws. "scene" keeps
 * the scene's design. Colours come from the brand (a colour role or a brand
 * gradient), so the brand stays consistent.
 */
export interface Backdrop {
  mode: "scene" | "solid" | "gradient";
  color: ColorRole;
  /** Id of a gradient from brandGradients() (auto ones start with "auto-"). */
  gradient: string;
  motion: "none" | "drift" | "rotate" | "pulse";
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
  /** Optional background override for this scene. */
  backdrop?: Backdrop;
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

export interface MusicSettings {
  enabled: boolean;
  /** Id from src/audio/styles.ts */
  style: string;
  intensity: "calm" | "medium" | "high";
  /** 0..1 */
  volume: number;
  /** Accent every cut. */
  hits: boolean;
  /** Drum fills that resolve on each cut. */
  fills: boolean;
  /** Riser, a beat of silence and a big hit into the last scene. */
  ending: boolean;
}

export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

export interface Project {
  version: 1;
  /** Which template the scene list started from. */
  template: string;
  aspect: Aspect;
  /** Optional musical timing: when snap is on, scene lengths round to whole beats. */
  tempo: { bpm: number; snap: boolean };
  /** Generated percussion that follows the timeline. */
  music: MusicSettings;
  brand: BrandKit;
  /** Metadata only; the files themselves live in IndexedDB on this device. */
  media: MediaItem[];
  scenes: SceneInstance[];
  /** The live brand guidelines page built from this project (see src/guide). */
  guide?: BrandGuide;
}

export type GuideSectionId = "about" | "logo" | "color" | "type" | "voice" | "motion" | "examples" | "formats";

/**
 * The written part of the brand guidelines page. Everything visual (logo,
 * colours, type, motion, examples, formats) comes from the brand kit and the
 * film, so the page stays in step with the editor. Any field can be empty:
 * the page fills the gaps from the logo and brand kit.
 */
export interface BrandGuide {
  sections: { id: GuideSectionId; enabled: boolean }[];
  /** One or two sentences under the brand name at the top of the page. */
  intro: string;
  /** The brand story: who it's for and what it stands for. */
  about: string;
  /** Three to five words the brand stands for. */
  values: string[];
  voice: { traits: string[]; do: string[]; dont: string[] };
  logo: {
    /** Clear space around the logo, as a fraction of the logo's height. */
    clearSpace: number;
    /** Smallest width on screen (px) and in print (mm). */
    minPx: number;
    minMm: number;
  };
  /** How much of a layout each colour should take, in percent. */
  colorUsage: Record<ColorRole, number>;
  /** Names for the four colours, e.g. "Sunset Orange". */
  colorNames: Partial<Record<ColorRole, string>>;
  /** More colours from the brand book, beyond the four roles. */
  extraColors: { name: string; hex: string }[];
  /** A second family for body text, when the brand has one. */
  bodyFont: BrandFont | null;
  /** Where the content came from. */
  source: { pdf?: string; site?: string; siteText?: string };
  /** Fields written automatically rather than by a person, so the editor can mark them. */
  auto: string[];
}
