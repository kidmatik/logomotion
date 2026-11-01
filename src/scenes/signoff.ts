import { rgba } from "../brand/color";
import { ease, isRtlText, seg, type SceneDef } from "../engine/kit";

/** Typed sign-off: the website (or tagline) is typed on a dark field with a warm glow. */
export const signoffScene: SceneDef = {
  type: "signoff",
  name: "Typed sign-off",
  description: "The website or tagline is typed out on a dark background with a soft brand glow.",
  defaultDuration: 3,
  minDuration: 1.6,
  maxDuration: 8,
  params: [
    {
      key: "content",
      label: "Text",
      type: "select",
      default: "website",
      options: [
        { value: "website", label: "Website" },
        { value: "tagline", label: "Tagline" },
        { value: "name", label: "Brand name" },
      ],
    },
    { key: "background", label: "Background", type: "role", default: "black" },
    { key: "glow", label: "Glow colour", type: "role", default: "primary" },
    { key: "showMark", label: "Show the mark at the end", type: "boolean", default: false },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    rc.fill(bg);
    const glowK = ease.outCubic(seg(t, 0, 1.2));
    const g = ctx.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, Math.max(w, h) * 0.7);
    g.addColorStop(0, rgba(rc.role(p.glow), 0.42 * glowK));
    g.addColorStop(1, rgba(rc.role(p.glow), 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const text = String(p.content === "tagline" ? rc.brand.tagline : p.content === "name" ? rc.brand.name : rc.brand.website || rc.brand.name);
    const end = Math.min(duration - 0.5, 0.3 + text.length * 0.08);
    const n = Math.round(text.length * seg(t, 0.3, end));
    const shown = text.slice(0, n);
    const size = Math.min(86 * u, (w * 0.8) / Math.max(6, text.length * 0.55));
    const ink = rc.colors.white === bg ? rc.colors.black : rc.colors.white;

    ctx.save();
    ctx.font = rc.font(size, 400);
    ctx.direction = rc.textDir(text);
    const full = ctx.measureText(text).width;
    ctx.restore();
    const markK = p.showMark ? ease.outBack(seg(t, end + 0.1, end + 0.6)) : 0;
    const y = h / 2 + markK * 40 * u;
    // Hebrew is typed from the right, with the caret moving left.
    const rtlText = isRtlText(text);
    const x = rtlText ? w / 2 + full / 2 : w / 2 - full / 2;
    const tw = rc.text(shown, x, y, size, ink, { weight: 400, baseline: "middle", align: rtlText ? "right" : "left" });
    if (Math.floor(t * 2.2) % 2 === 0 || n < text.length) {
      ctx.fillStyle = ink;
      ctx.fillRect(rtlText ? x - tw - 7 * u : x + tw + 4 * u, y - size * 0.55, Math.max(2, 3 * u), size * 1.1);
    }
    if (markK > 0) rc.drawLogo(w / 2, y - size - 90 * u, rc.logoHeight(110) * markK, rc.colors.primary);
  },
};
