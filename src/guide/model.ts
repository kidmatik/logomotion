/**
 * The brand guidelines page: its sections, defaults, and the ideas offered to
 * fill whatever the brand didn't come with. Nothing here needs a PDF or a
 * website: a logo and a name are enough to write a complete first draft.
 */
import type { BrandGuide, BrandKit, ColorRole, GuideSectionId, Project } from "../types";
import { brandIsRtl } from "../engine/kit";
import { hexToRgb } from "../brand/color";

export const GUIDE_SECTIONS: { id: GuideSectionId; en: string; he: string; hint: string }[] = [
  { id: "about", en: "The brand", he: "המותג", hint: "Story, values" },
  { id: "logo", en: "Logo", he: "לוגו", hint: "Versions, clear space, misuse" },
  { id: "color", en: "Colour", he: "צבע", hint: "Codes, proportions, contrast" },
  { id: "type", en: "Typography", he: "טיפוגרפיה", hint: "Fonts and type scale" },
  { id: "voice", en: "Voice & tone", he: "טון ושפה", hint: "How the brand speaks" },
  { id: "motion", en: "Motion", he: "תנועה", hint: "The film, timing, transitions" },
  { id: "examples", en: "In use", he: "דוגמאות", hint: "The brand on real things" },
  { id: "formats", en: "Formats", he: "פורמטים", hint: "Ready sizes to download" },
];

export function sectionLabel(id: GuideSectionId, lang: string) {
  const s = GUIDE_SECTIONS.find((x) => x.id === id)!;
  return lang === "he" ? s.he : s.en;
}

export function emptyGuide(): BrandGuide {
  return {
    sections: GUIDE_SECTIONS.map((s) => ({ id: s.id, enabled: true })),
    intro: "",
    about: "",
    values: [],
    voice: { traits: [], do: [], dont: [] },
    logo: { clearSpace: 0.5, minPx: 80, minMm: 20 },
    colorUsage: { primary: 30, secondary: 10, black: 20, white: 40 },
    colorNames: {},
    extraColors: [],
    bodyFont: null,
    source: {},
    // Everything starts as a suggestion; editing a field makes it yours.
    auto: ["intro", "about", "values", "voice.traits", "voice.do", "voice.dont", "logo", "colorUsage"],
  };
}

/** Fill in anything missing from an older or hand-edited guide. */
export function normalizeGuide(raw: unknown): BrandGuide | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as Partial<BrandGuide>;
  const base = emptyGuide();
  const known = new Set(GUIDE_SECTIONS.map((s) => s.id));
  const sections = (Array.isArray(g.sections) ? g.sections : []).filter((s) => s && known.has(s.id));
  // Sections added in later versions go to the end, switched on.
  for (const s of base.sections) if (!sections.some((x) => x.id === s.id)) sections.push(s);
  return {
    ...base,
    ...g,
    sections,
    values: Array.isArray(g.values) ? g.values : [],
    voice: { ...base.voice, ...(g.voice ?? {}) },
    logo: { ...base.logo, ...(g.logo ?? {}) },
    colorUsage: { ...base.colorUsage, ...(g.colorUsage ?? {}) },
    colorNames: { ...(g.colorNames ?? {}) },
    extraColors: Array.isArray(g.extraColors) ? g.extraColors : [],
    source: { ...(g.source ?? {}) },
    auto: Array.isArray(g.auto) ? g.auto : [],
  };
}

/* ---------------- ideas ---------------- */

type Mood = "bold" | "warm" | "calm" | "fresh" | "premium" | "playful";

function hsl(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (d) h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

/** A rough read of the brand's character from its main colour and font. */
export function brandMood(b: BrandKit): Mood {
  const { h, s, l } = hsl(b.colors.primary);
  const serif = /serif|fraunces|playfair|frank ruhl/i.test(b.font.family) && !/sans/i.test(b.font.family);
  if (serif || (s < 0.2 && l < 0.35)) return "premium";
  if (/unbounded|syne|bricolage|secular|varela|rubik/i.test(b.font.family)) return "playful";
  if (s < 0.25) return "calm";
  if (h < 20 || h >= 330) return "bold";
  if (h < 60) return "warm";
  if (h < 170) return "fresh";
  if (h < 260) return "calm";
  return "playful";
}

const IDEAS: Record<"en" | "he", { values: Record<Mood, string[]>; traits: Record<Mood, string[]>; do: string[]; dont: string[] }> = {
  en: {
    values: {
      bold: ["Courage", "Momentum", "Clarity", "Ambition", "Energy", "Impact"],
      warm: ["Warmth", "Optimism", "Craft", "Generosity", "Community", "Joy"],
      calm: ["Trust", "Clarity", "Care", "Reliability", "Focus", "Simplicity"],
      fresh: ["Growth", "Curiosity", "Openness", "Balance", "Honesty", "Progress"],
      premium: ["Quality", "Precision", "Heritage", "Restraint", "Excellence", "Detail"],
      playful: ["Imagination", "Play", "Surprise", "Boldness", "Creativity", "Fun"],
    },
    traits: {
      bold: ["Direct", "Confident", "Energetic", "Decisive", "Fearless"],
      warm: ["Friendly", "Optimistic", "Welcoming", "Human", "Encouraging"],
      calm: ["Clear", "Reassuring", "Thoughtful", "Expert", "Honest"],
      fresh: ["Curious", "Positive", "Open", "Down to earth", "Lively"],
      premium: ["Refined", "Assured", "Considered", "Understated", "Precise"],
      playful: ["Witty", "Imaginative", "Cheeky", "Spirited", "Surprising"],
    },
    do: ["Write short, active sentences", "Lead with what the reader gets", "Use plain words people actually say", "Talk to one person, not to everyone", "Show it with a real example", "Keep one idea per sentence"],
    dont: ["Use jargon or buzzwords", "Shout with capitals and exclamation marks", "Promise what we can't deliver", "Write long paragraphs", "Sound like everyone else in the field", "Use passive voice to hide who does what"],
  },
  he: {
    values: {
      bold: ["אומץ", "תנופה", "בהירות", "שאפתנות", "אנרגיה", "השפעה"],
      warm: ["חום", "אופטימיות", "יצירה", "נדיבות", "קהילה", "שמחה"],
      calm: ["אמון", "בהירות", "אכפתיות", "אמינות", "מיקוד", "פשטות"],
      fresh: ["צמיחה", "סקרנות", "פתיחות", "איזון", "כנות", "התקדמות"],
      premium: ["איכות", "דיוק", "מסורת", "איפוק", "מצוינות", "פרטים"],
      playful: ["דמיון", "משחק", "הפתעה", "נועזות", "יצירתיות", "כיף"],
    },
    traits: {
      bold: ["ישיר", "בטוח בעצמו", "אנרגטי", "החלטי", "נועז"],
      warm: ["חברי", "אופטימי", "מזמין", "אנושי", "מעודד"],
      calm: ["בהיר", "מרגיע", "מעמיק", "מקצועי", "כן"],
      fresh: ["סקרן", "חיובי", "פתוח", "עם הרגליים על הקרקע", "תוסס"],
      premium: ["מעודן", "בטוח", "שקול", "מאופק", "מדויק"],
      playful: ["שנון", "יצירתי", "שובב", "מלא חיים", "מפתיע"],
    },
    do: ["משפטים קצרים ופעילים", "להתחיל במה שהקורא מרוויח", "מילים פשוטות שאנשים באמת אומרים", "לדבר אל אדם אחד", "להראות עם דוגמה אמיתית", "רעיון אחד בכל משפט"],
    dont: ["ז׳רגון ומילים מפוצצות", "לצעוק עם סימני קריאה", "להבטיח מה שאי אפשר לקיים", "פסקאות ארוכות", "להישמע כמו כולם בתחום", "סביל שמסתיר מי עושה מה"],
  },
};

export function guideLang(b: BrandKit): "en" | "he" {
  return brandIsRtl(b) ? "he" : "en";
}

/** Ideas the editor offers for each field, written for this brand. */
/** Ideas are written in `lang` (the page's language), or the brand's own language when not given. */
export function guideIdeas(b: BrandKit, siteDescription = "", pageLang?: string) {
  const lang: "en" | "he" = pageLang === "he" || pageLang === "en" ? pageLang : guideLang(b);
  const mood = brandMood(b);
  const name = b.name || (lang === "he" ? "המותג" : "the brand");
  const tag = b.tagline.trim();
  const ideas = IDEAS[lang];
  const values = ideas.values[mood];
  const intro =
    lang === "he"
      ? [
          `כל מה שצריך כדי להשתמש במותג ${name} נכון: לוגו, צבעים, טיפוגרפיה ותנועה, במקום אחד.`,
          tag ? `${tag}. כך נראה, נשמע וזז ${name} בכל מקום.` : `כך נראה, נשמע וזז ${name} בכל מקום.`,
          `ספר המותג החי של ${name}. תמיד מעודכן, תמיד בגרסה האחרונה.`,
        ]
      : [
          `Everything you need to use the ${name} brand well: logo, colour, type and motion, in one place.`,
          tag ? `${tag}. This is how ${name} looks, sounds and moves, everywhere.` : `This is how ${name} looks, sounds and moves, everywhere.`,
          `The living brand book for ${name}. Always up to date, always the latest version.`,
        ];
  const v = values.slice(0, 3).map((x) => x.toLowerCase());
  const about =
    lang === "he"
      ? [
          ...(siteDescription ? [siteDescription] : []),
          `${name} נבנה סביב ${values[0]}, ${values[1]} ו${values[2]}. כל נקודת מגע, מהאתר ועד הפוסט הבא, צריכה להרגיש כמו ${name}: עקבית, ברורה ומזוהה במבט אחד.`,
          `המותג ${name} מדבר אל אנשים שרוצים ${tag || "יותר"}. השפה החזותית פשוטה בכוונה: לוגו אחד, ארבעה צבעים ומשפחת פונטים אחת, כדי שהמסר יעבור מהר.`,
        ]
      : [
          ...(siteDescription ? [siteDescription] : []),
          `${name} is built on ${v[0]}, ${v[1]} and ${v[2]}. Every touchpoint, from the website to the next post, should feel unmistakably ${name}: consistent, clear and recognisable at a glance.`,
          `${name} speaks to people who want ${tag ? tag.replace(/[.!]$/, "").toLowerCase() : "more from what they use"}. The visual language is simple on purpose: one logo, four colours and one type family, so the message lands fast.`,
        ];
  return { lang, mood, intro, about, values, traits: ideas.traits[mood], do: ideas.do, dont: ideas.dont };
}

/** Proportions that suit the colours: a light brand leans on its light colour, a dark one on dark. */
function usageFor(b: BrandKit): Record<ColorRole, number> {
  const { l } = hsl(b.colors.primary);
  return l > 0.75 ? { primary: 20, secondary: 10, black: 50, white: 20 } : { primary: 30, secondary: 10, black: 20, white: 40 };
}

/** The logo's proportions decide the clear space and the smallest size that stays readable. */
export function logoRules(svg: string) {
  const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const w = vb ? parseFloat(vb[1]) : parseFloat(svg.match(/\bwidth\s*=\s*["']([\d.]+)/)?.[1] ?? "1");
  const h = vb ? parseFloat(vb[2]) : parseFloat(svg.match(/\bheight\s*=\s*["']([\d.]+)/)?.[1] ?? "1");
  const ratio = w > 0 && h > 0 ? w / h : 1;
  if (ratio > 3) return { clearSpace: 0.5, minPx: 120, minMm: 30, ratio };
  if (ratio > 1.6) return { clearSpace: 0.5, minPx: 96, minMm: 25, ratio };
  return { clearSpace: 0.25, minPx: 32, minMm: 10, ratio };
}

/**
 * Complete a guide: every empty field gets the first idea, and is marked as
 * written automatically. Fields a person (or the PDF) filled stay as they are.
 */
export function fillGuide(project: Project, guide: BrandGuide = emptyGuide(), lang?: string): BrandGuide {
  const b = project.brand;
  // Suggested text is written in the page's language, so a Hebrew page reads Hebrew throughout.
  const ideas = guideIdeas(b, guide.source.siteText, lang);
  const g: BrandGuide = structuredClone(guide);
  const auto = new Set(g.auto);
  const fill = <K extends string>(key: K, empty: boolean, set: () => void) => {
    if (empty) {
      set();
      auto.add(key);
    }
  };
  // Fields still holding suggested text get the brand's first idea again, so they keep
  // up when the name, tagline or colours change. Fields a person edited stay as they are.
  const is = (k: string) => guide.auto.includes(k);
  fill("intro", is("intro"), () => (g.intro = ideas.intro[0]));
  fill("about", is("about"), () => (g.about = ideas.about[0]));
  fill("values", is("values"), () => (g.values = ideas.values.slice(0, 4)));
  fill("voice.traits", is("voice.traits"), () => (g.voice.traits = ideas.traits.slice(0, 3)));
  fill("voice.do", is("voice.do"), () => (g.voice.do = ideas.do.slice(0, 3)));
  fill("voice.dont", is("voice.dont"), () => (g.voice.dont = ideas.dont.slice(0, 3)));
  // Automatic values follow the logo and colours as they change; hand-set ones stay.
  if (is("logo")) {
    const r = logoRules(b.logoSvg);
    g.logo = { clearSpace: r.clearSpace, minPx: r.minPx, minMm: r.minMm };
    auto.add("logo");
  }
  if (is("colorUsage")) {
    g.colorUsage = usageFor(b);
    auto.add("colorUsage");
  }
  g.auto = [...auto];
  return g;
}

/** The guide with a field changed by hand: it's no longer marked automatic. */
export function editGuide(g: BrandGuide, key: string, patch: Partial<BrandGuide>): BrandGuide {
  return { ...g, ...patch, auto: g.auto.filter((k) => k !== key) };
}
