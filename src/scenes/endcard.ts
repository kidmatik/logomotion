import { mix } from "../brand/color";
import { ease, lerp, seg, type SceneDef, type Treatment } from "../engine/kit";
import { parseGallery } from "./photos";

/** End card: full lockup, tagline and website. */
export const endcardScene: SceneDef = {
  type: "endcard",
  name: "End card",
  description: "Closing frame with the logo lockup, tagline and website, over your brand colour or a background photo.",
  defaultDuration: 3,
  minDuration: 1.6,
  maxDuration: 8,
  params: [
    { key: "background", label: "Background", type: "role", default: "primary" },
    { key: "photo", label: "Background photo (optional)", type: "gallery", default: "", max: 1, group: "Background photo" },
    { key: "photoOpacity", label: "Photo opacity", type: "number", default: 35, min: 5, max: 100, step: 1, unit: "%", group: "Background photo" },
    {
      key: "photoTreatment",
      label: "Photo colour",
      type: "select",
      default: "mono",
      group: "Background photo",
      options: [
        { value: "none", label: "Original colours" },
        { value: "mono", label: "Black and white" },
        { value: "duotone", label: "Duotone" },
        { value: "tint", label: "Brand tint" },
      ],
    },
    { key: "photoMotion", label: "Slow zoom on the photo", type: "boolean", default: true, group: "Background photo" },
    { key: "ink", label: "Logo and text colour", type: "role", default: "white", group: "Logo and text" },
    { key: "showTagline", label: "Show tagline", type: "boolean", default: true, group: "Logo and text" },
    { key: "showWebsite", label: "Show website", type: "boolean", default: true, group: "Logo and text" },
  ],
  render(rc, t, _duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const ink = rc.role(p.ink);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, mix(bg, "#FFFFFF", 0.06));
    g.addColorStop(1, mix(bg, "#000000", 0.12));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Optional photo, laid over the brand colour so the opacity blends it into the background.
    const photo = parseGallery(p.photo).find((x) => rc.assets.media.has(x.id));
    if (photo) {
      const zoom = p.photoMotion ? lerp(1.12, 1.02, ease.outCubic(seg(t, 0, Math.max(1, _duration)))) : 1;
      rc.drawCover(photo.id, 0, 0, w, h, { zoom, treatment: String(p.photoTreatment) as Treatment, tint: bg, time: t, alpha: Number(p.photoOpacity ?? 35) / 100 });
    }

    const k = ease.outQuint(seg(t, 0, 0.9));
    let M = rc.logoHeight(150);
    let size = rc.nameSize(0.75);
    let word = rc.measureWordmark(size);
    let mw = rc.logoWidth(M);
    let gap = M * 0.3;
    const fit = Math.min(1, (w * 0.82) / (mw + gap + word.w));
    M *= fit; size *= fit; mw *= fit; gap *= fit;
    word = rc.measureWordmark(size);
    const lockW = mw + gap + word.w;
    const x0 = w / 2 - lockW / 2;
    const cy = h / 2 - 30 * u + (1 - k) * 40 * u;
    ctx.save();
    ctx.globalAlpha = k;
    rc.drawLogo(rc.mirror(x0 + mw / 2), cy, M, ink);
    rc.drawWordmark(rc.mirror(x0 + mw + gap, word.w), cy, size, ink);
    ctx.restore();

    if (p.showTagline && rc.brand.tagline) {
      const a = ease.outCubic(seg(t, 0.5, 1.1));
      rc.text(rc.brand.tagline, w / 2, cy + M / 2 + 90 * u + (1 - a) * 16 * u, 40 * u, ink, { weight: 400, align: "center", alpha: a * 0.9 });
    }
    if (p.showWebsite && rc.brand.website) {
      const a = ease.outCubic(seg(t, 0.8, 1.4));
      rc.text(rc.brand.website, w / 2, h - 80 * u, 28 * u, ink, { weight: 500, align: "center", alpha: a * 0.75, tracking: 0.06 });
    }
  },
};
