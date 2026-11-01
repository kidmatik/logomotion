/**
 * Hebrew and English for the screens people outside the editor see first:
 * onboarding and the shared brand page. The editor itself is English for now.
 */
import { useCallback, useEffect, useState } from "react";

export type Lang = "en" | "he";

const KEY = "logomotion.lang";

const en = {
  skip: "Skip",
  back: "Back",
  next: "Next",
  done: "Open the editor",
  stepOf: "Step {n} of {total}",
  // step 1
  goalTitle: "What do you want to make?",
  goalSub: "Pick one to start. You can change everything later.",
  goalSting: "Logo intro or outro",
  goalStingSub: "A 4-second reveal with a sound hit, for the start or end of any video.",
  goalReel: "Social reel",
  goalReelSub: "A fast vertical reel for Instagram and LinkedIn, cut on the beat.",
  goalFilm: "Brand film",
  goalFilmSub: "A calm walkthrough of the identity, for presentations and websites.",
  goalPage: "Live brand guidelines",
  goalPageSub: "A shareable page with your brand in motion, instead of a PDF.",
  whoTitle: "Who is it for?",
  whoMine: "My own brand",
  whoClient: "A client I design for",
  // step 2
  brandTitle: "Tell us about the brand",
  brandSub: "Paste the website and we'll pull the logo, colours, fonts and name.",
  brandSubClient: "Paste your client's website and we'll pull the logo, colours, fonts and name.",
  urlPlaceholder: "yourbrand.com",
  read: "Get my brand",
  reading: "Reading the site…",
  or: "or",
  uploadLogo: "Upload a logo (SVG, PNG)",
  noLogo: "No logo yet? Type the name and we'll make one",
  namePlaceholder: "Brand name",
  makeLogo: "Make a logo",
  siteFailed: "We couldn't read that site: {msg} You can upload a logo or type the name instead.",
  siteBlocked: "That website doesn't let automatic visitors in, so we couldn't read it. Upload the logo or type the name instead.",
  sitePartial: "{site} doesn't let automatic visitors in, so we could only get its name and icon, and took the colours from the icon. Check them below, and upload the real logo for the sharpest result.",
  // step 3
  reviewTitle: "Is this your brand?",
  reviewSub: "Tap anything to change it. The video on the right updates as you go.",
  logo: "Logo",
  generated: "Made for you",
  colors: "Colours",
  colorsHint: "Pick a role, then tap a colour from the site.",
  primary: "Primary",
  secondary: "Secondary",
  dark: "Dark",
  light: "Light",
  font: "Font",
  gradients: "Gradients",
  gradientsHint: "Tap one to put it behind the logo moments. Gradients from your site come first.",
  fontLookalike: "Your site uses {font}, which isn't free to use here, so we picked the closest open font.",
  name: "Name",
  tagline: "Tagline",
  website: "Website",
  handle: "Social handle",
  noLogoFound: "We didn't find a logo on the site, so here are a few made from the name.",
  // step 4
  moreTitle: "Anything else to show?",
  moreSub: "Optional. These make the video feel like yours.",
  captureSite: "Capture my website on desktop and mobile",
  captureHint: "We take screenshots of {site} and add them to a screens scene.",
  addMedia: "Add product photos, screenshots or demo videos",
  dropHint: "Drop files or click to choose",
  added: "{n} added",
  finishing: "Putting it together…",
  // language
  language: "עברית",
};

type Dict = typeof en;

const he: Dict = {
  skip: "דלג",
  back: "חזרה",
  next: "המשך",
  done: "פתח את העורך",
  stepOf: "שלב {n} מתוך {total}",
  goalTitle: "מה תרצו ליצור?",
  goalSub: "בחרו אחד כדי להתחיל. אפשר לשנות הכל אחר כך.",
  goalSting: "פתיח או סגיר ללוגו",
  goalStingSub: "חשיפת לוגו של 4 שניות עם סאונד, לתחילת או לסוף כל סרטון.",
  goalReel: "ריל לרשתות",
  goalReelSub: "ריל אנכי מהיר לאינסטגרם ולינקדאין, חתוך על הביט.",
  goalFilm: "סרט מותג",
  goalFilmSub: "מעבר רגוע על השפה המותגית, למצגות ולאתרים.",
  goalPage: "ספר מותג חי",
  goalPageSub: "עמוד לשיתוף עם המותג בתנועה, במקום PDF.",
  whoTitle: "בשביל מי זה?",
  whoMine: "המותג שלי",
  whoClient: "לקוח שאני מעצב/ת עבורו",
  brandTitle: "ספרו לנו על המותג",
  brandSub: "הדביקו את כתובת האתר ונשלוף את הלוגו, הצבעים, הפונטים והשם.",
  brandSubClient: "הדביקו את כתובת האתר של הלקוח ונשלוף את הלוגו, הצבעים, הפונטים והשם.",
  urlPlaceholder: "yourbrand.co.il",
  read: "שלפו את המותג",
  reading: "קוראים את האתר…",
  or: "או",
  uploadLogo: "העלו לוגו (SVG, PNG)",
  noLogo: "אין עדיין לוגו? הקלידו את השם וניצור אחד",
  namePlaceholder: "שם המותג",
  makeLogo: "צרו לוגו",
  siteFailed: "לא הצלחנו לקרוא את האתר: {msg} אפשר להעלות לוגו או להקליד את השם.",
  siteBlocked: "האתר הזה חוסם מבקרים אוטומטיים, אז לא הצלחנו לקרוא אותו. העלו את הלוגו או הקלידו את השם.",
  sitePartial: "האתר {site} חוסם מבקרים אוטומטיים, אז הצלחנו לקחת רק את השם והאייקון שלו, והצבעים נלקחו מהאייקון. בדקו אותם למטה, ולתוצאה הכי חדה העלו את הלוגו האמיתי.",
  reviewTitle: "זה המותג שלכם?",
  reviewSub: "לחצו על כל דבר כדי לשנות. הסרטון מתעדכן בזמן אמת.",
  logo: "לוגו",
  generated: "נוצר בשבילכם",
  colors: "צבעים",
  colorsHint: "בחרו תפקיד ואז לחצו על צבע מהאתר.",
  primary: "ראשי",
  secondary: "משני",
  dark: "כהה",
  light: "בהיר",
  font: "פונט",
  gradients: "גרדיאנטים",
  gradientsHint: "לחצו על אחד כדי לשים אותו מאחורי רגעי הלוגו. הגרדיאנטים מהאתר שלכם מופיעים ראשונים.",
  fontLookalike: "באתר יש את {font}, שאינו חינמי לשימוש כאן, אז בחרנו את הפונט הפתוח הכי קרוב.",
  name: "שם",
  tagline: "סלוגן",
  website: "אתר",
  handle: "שם משתמש ברשתות",
  noLogoFound: "לא מצאנו לוגו באתר, אז הנה כמה שיצרנו מהשם.",
  moreTitle: "עוד משהו להראות?",
  moreSub: "לא חובה. אלה יגרמו לסרטון להרגיש שלכם.",
  captureSite: "צלמו את האתר שלי בדסקטופ ובמובייל",
  captureHint: "נצלם מסך של {site} ונוסיף אותו לסצנת מסכים.",
  addMedia: "הוסיפו תמונות מוצר, צילומי מסך או סרטוני דמו",
  dropHint: "גררו קבצים או לחצו לבחירה",
  added: "נוספו {n}",
  finishing: "מרכיבים הכל…",
  language: "English",
};

const DICTS: Record<Lang, Dict> = { en, he };
export type TKey = keyof Dict;

function initialLang(): Lang {
  const saved = localStorage.getItem(KEY);
  if (saved === "he" || saved === "en") return saved;
  return /^he|^iw/i.test(navigator.language || "") ? "he" : "en";
}

const listeners = new Set<(l: Lang) => void>();
let current: Lang | null = null;

export function translate(lang: Lang, key: TKey, vars: Record<string, string | number> = {}) {
  return DICTS[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** The chosen language (shared by every screen that uses it) and a t() for it. */
export function useLang(extra?: Partial<Record<Lang, Record<string, string>>>) {
  const [lang, setLangState] = useState<Lang>(() => (current ??= initialLang()));
  useEffect(() => {
    listeners.add(setLangState);
    return () => void listeners.delete(setLangState);
  }, []);
  const setLang = useCallback((l: Lang) => {
    current = l;
    localStorage.setItem(KEY, l);
    listeners.forEach((f) => f(l));
  }, []);
  const t = useCallback(
    (key: TKey | string, vars?: Record<string, string | number>) => {
      const own = extra?.[lang]?.[key];
      if (own !== undefined) return own.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""));
      return key in en ? translate(lang, key as TKey, vars) : key;
    },
    [lang, extra],
  );
  return { lang, setLang, t, dir: lang === "he" ? ("rtl" as const) : ("ltr" as const) };
}
