import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../types";
import type { BrandAssets, MediaEl } from "../engine/kit";
import { loadSvg, outlineSvg, type LogoAsset } from "../brand/logo";
import { ensureGoogleFont } from "../brand/fonts";
import { blobToElement, getBlob } from "../brand/media";

/**
 * Keep the drawable brand assets (logo rasters, fonts, media elements) in step
 * with the project. `version` bumps whenever something finishes loading so the
 * preview knows to redraw.
 */
export function useAssets(project: Project) {
  const [logo, setLogo] = useState<LogoAsset | null>(null);
  const [logoOutline, setLogoOutline] = useState<LogoAsset | null>(null);
  const [lettermark, setLettermark] = useState<LogoAsset | null>(null);
  const [version, setVersion] = useState(0);
  const mediaRef = useRef(new Map<string, MediaEl>());
  const { brand, media } = project;

  useEffect(() => {
    let live = true;
    loadSvg(brand.logoSvg).then((a) => live && setLogo(a)).catch(() => live && setLogo(null));
    const outline = outlineSvg(brand.logoSvg);
    if (outline) loadSvg(outline).then((a) => live && setLogoOutline(a)).catch(() => live && setLogoOutline(null));
    else setLogoOutline(null);
    return () => {
      live = false;
    };
  }, [brand.logoSvg]);

  useEffect(() => {
    let live = true;
    if (!brand.lettermarkSvg) setLettermark(null);
    else loadSvg(brand.lettermarkSvg).then((a) => live && setLettermark(a)).catch(() => live && setLettermark(null));
    return () => {
      live = false;
    };
  }, [brand.lettermarkSvg]);

  useEffect(() => {
    if (brand.font.source !== "google") return;
    let live = true;
    ensureGoogleFont(brand.font.family).then(() => live && setVersion((v) => v + 1));
    return () => {
      live = false;
    };
  }, [brand.font.family, brand.font.source]);

  // Load any media we don't have an element for yet; drop removed ones.
  const mediaKey = media.map((m) => m.id).join(",");
  useEffect(() => {
    const map = mediaRef.current;
    const ids = new Set(media.map((m) => m.id));
    for (const [id, el] of map) {
      if (!ids.has(id)) {
        if (el instanceof HTMLVideoElement) el.pause();
        URL.revokeObjectURL(el.src);
        map.delete(id);
      }
    }
    let live = true;
    Promise.all(
      media
        .filter((m) => !map.has(m.id))
        .map(async (m) => {
          const blob = await getBlob(m.id);
          if (!blob || !live) return;
          map.set(m.id, await blobToElement(blob, m.kind));
        }),
    ).finally(() => live && setVersion((v) => v + 1));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  /** Put a freshly added element straight into the map so it shows without a reload. */
  const addMediaElement = useCallback((id: string, el: MediaEl) => {
    mediaRef.current.set(id, el);
    setVersion((v) => v + 1);
  }, []);

  // Keep media in project order so "first screen" is predictable.
  const ordered = new Map<string, MediaEl>();
  for (const m of media) {
    const el = mediaRef.current.get(m.id);
    if (el) ordered.set(m.id, el);
  }
  const assets: BrandAssets = { logo, logoOutline, lettermark, media: ordered, mediaInfo: new Map(media.map((m) => [m.id, m])) };
  return { assets, version, addMediaElement };
}
