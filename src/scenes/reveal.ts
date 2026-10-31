import { ease, lerp, seg, type SceneDef } from "../engine/kit";

/** Logo build: the mark lands, then the name slides out from behind it. */
export const revealScene: SceneDef = {
  type: "reveal",
  name: "Logo build",
  description: "The mark lands in the centre, slides aside, and the name is revealed next to it.",
  defaultDuration: 3.2,
  minDuration: 2,
  maxDuration: 8,
  params: [
    { key: "background", label: "Background", type: "role", default: "white" },
    { key: "markColor", label: "Mark colour", type: "role", default: "primary" },
    { key: "nameColor", label: "Name colour", type: "role", default: "black" },
    {
      key: "layout",
      label: "Lockup",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Auto (by format)" },
        { value: "horizontal", label: "Side by side" },
        { value: "stacked", label: "Stacked" },
      ],
    },
    { key: "settleToPrimary", label: "Name turns primary at the end", type: "boolean", default: true },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h } = rc;
    rc.fill(rc.role(p.background));

    const stacked = p.layout === "stacked" || (p.layout === "auto" && rc.portrait);
    let M = rc.logoHeight(stacked ? 300 : 230);
    let size = rc.nameSize(stacked ? 0.85 : 1);
    let word = rc.measureWordmark(size);
    let mw = rc.logoWidth(M);
    let gap = M * 0.32;

    // Fit the lockup inside 86% of the frame width.
    const total = stacked ? Math.max(mw, word.w) : mw + gap + word.w;
    const fit = Math.min(1, (w * 0.86) / total);
    M *= fit; size *= fit; mw *= fit; gap *= fit;
    word = rc.measureWordmark(size);

    const land = ease.outBack(seg(t, 0, 0.75));
    const move = ease.inOutQuint(seg(t, 0.85, 1.55));
    const textIn = ease.outCubic(seg(t, 1.4, 2.1));

    // Mark position: centred first, then at its spot in the lockup.
    let markX = w / 2, markY = h / 2, textX = 0, textY = 0;
    if (stacked) {
      const blockH = M + gap + word.h;
      markY = lerp(h / 2, h / 2 - blockH / 2 + M / 2, move);
      textX = w / 2 - word.w / 2;
      textY = h / 2 + blockH / 2 - word.h / 2;
    } else {
      const lockW = mw + gap + word.w;
      markX = lerp(w / 2, w / 2 - lockW / 2 + mw / 2, move);
      textX = w / 2 - lockW / 2 + mw + gap;
      textY = h / 2;
    }

    const rot = (1 - land) * -0.35;
    ctx.save();
    ctx.translate(markX, markY);
    ctx.rotate(rot);
    rc.drawLogo(0, 0, M * Math.max(0, land), rc.role(p.markColor));
    ctx.restore();

    // Name revealed through a mask that opens away from the mark.
    if (textIn > 0) {
      const settle = p.settleToPrimary ? ease.inOutCubic(seg(t, duration - 1.2, duration - 0.5)) : 0;
      ctx.save();
      ctx.beginPath();
      if (stacked) {
        ctx.rect(0, textY - word.h, w, word.h * 2 * textIn);
      } else {
        ctx.rect(textX - 4, 0, (word.w + 8) * textIn + 2, h);
      }
      ctx.clip();
      const slide = (1 - textIn) * (stacked ? 0 : -40 * rc.u);
      const lift = stacked ? (1 - textIn) * 30 * rc.u : 0;
      rc.drawWordmark(textX + slide, textY + lift, size, rc.role(p.nameColor), 1 - settle);
      if (settle > 0) rc.drawWordmark(textX + slide, textY + lift, size, rc.colors.primary, settle);
      ctx.restore();
    }
  },
};
