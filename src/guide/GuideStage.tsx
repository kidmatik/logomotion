import { useEffect, useMemo, useRef, useState } from "react";
import type { GuideSectionId, Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { useLang } from "../i18n";
import { ensureGoogleFont } from "../brand/fonts";
import { Icon } from "../ui/icons";
import { GuidePage } from "./GuidePage";
import { GUIDE_T } from "./strings";
import { emptyGuide, fillGuide } from "./model";

type Pick = GuideSectionId | "hero";

/** The guidelines page as the editor shows it: a browser frame you can switch between desktop and phone width. */
export function GuideStage({ project, assets, assetsVersion, picked, onPick }: { project: Project; assets: BrandAssets; assetsVersion: number; picked: Pick | null; onPick: (p: Pick) => void }) {
  const { t, lang, setLang, dir } = useLang(GUIDE_T);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const guide = useMemo(() => fillGuide(project, project.guide ?? emptyGuide(), lang), [project, lang]);
  const scroller = useRef<HTMLDivElement>(null);
  const host = (project.brand.website || project.brand.name || "yourbrand").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  useEffect(() => {
    if (guide.bodyFont) ensureGoogleFont(guide.bodyFont.family).catch(() => undefined);
  }, [guide.bodyFont]);

  // Picking a section in the panel brings it into view.
  useEffect(() => {
    if (!picked) return;
    const el = scroller.current?.querySelector(picked === "hero" ? ".gp-hero" : `#gp-${picked}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [picked]);

  return (
    <div className="guide-stage">
      <div className="guide-bar">
        <span className="guide-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="guide-url" dir="ltr">
          <span className="gl-live" /> {host}
        </span>
        <span className="guide-bar-tools">
          <button type="button" className="link-btn" onClick={() => setLang(lang === "he" ? "en" : "he")}>
            {t("language")}
          </button>
          <span className="ob-seg small" role="radiogroup" aria-label="Preview width">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={device === d} className={device === d ? "active" : ""} onClick={() => setDevice(d)}>
                {d === "desktop" ? "Desktop" : "Phone"}
              </button>
            ))}
          </span>
        </span>
      </div>
      <div className={"guide-scroll " + device} ref={scroller}>
        <div className="guide-frame">
          <GuidePage project={project} guide={guide} assets={assets} assetsVersion={assetsVersion} t={t} lang={lang} dir={dir} onPick={onPick} picked={picked} showAuto />
        </div>
      </div>
      <p className="guide-tip">
        <Icon.Pen size={13} /> Click any section to edit it.
      </p>
    </div>
  );
}
