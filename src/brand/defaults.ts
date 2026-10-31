import type { BrandKit, MusicSettings, Project } from "../types";
import { TEMPLATES } from "../templates";

/** A neutral placeholder mark shown until the user uploads their own logo. */
export const PLACEHOLDER_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M46 6A44 44 0 1 0 94 54H46Z" fill="#111111"/>
  <rect x="56" y="6" width="38" height="38" rx="9" fill="#111111"/>
</svg>`;

export const defaultBrand: BrandKit = {
  logoSvg: PLACEHOLDER_LOGO,
  lettermarkSvg: null,
  useLettermark: false,
  logoScale: 1,
  lettermarkScale: 1,
  name: "matan.design",
  nameLine2: "",
  font: { family: "Outfit", source: "google", weight: 600 },
  nameSize: 136,
  lineSpacing: 1,
  colors: {
    primary: "#EC7513",
    secondary: "#FFC72E",
    black: "#00123D",
    white: "#FFFFFF",
  },
  secondaryAuto: false,
  logoColorMode: "primary",
  website: "matan.design",
  tagline: "Design with intent",
  credit: "by Matan Kidrony",
  handle: "matan.design",
  signLine1: "BRAND",
  signLine2: "STUDIO",
};

export const DEFAULT_BLACK = "#0E0F14";
export const DEFAULT_WHITE = "#FFFFFF";

export function defaultProject(): Project {
  const t = TEMPLATES[0];
  return {
    version: 1,
    template: t.id,
    aspect: t.aspect,
    tempo: { ...t.tempo },
    music: defaultMusic(t.music),
    brand: structuredClone(defaultBrand),
    media: [],
    scenes: t.scenes(),
  };
}

export function defaultMusic(style = "stomp"): MusicSettings {
  return { enabled: true, style, intensity: "high", volume: 0.8, hits: true, fills: true, ending: true };
}
