import { mix } from "../brand/color";
import { ease, seg, UI_FONT, type MediaEl, type RenderCtx, type SceneDef } from "../engine/kit";
import { drawBrowserChrome } from "./browser";

function sizeOf(el: MediaEl) {
  return el instanceof HTMLVideoElement
    ? { w: el.videoWidth || 16, h: el.videoHeight || 9 }
    : { w: el.naturalWidth || 16, h: el.naturalHeight || 9 };
}

/** Draw media filling a viewport at full width, scrolled by k (0 = top, 1 = bottom). */
function drawScrolled(rc: RenderCtx, el: MediaEl, x: number, y: number, w: number, h: number, k: number) {
  const { ctx } = rc;
  const s = sizeOf(el);
  const scale = Math.max(w / s.w, h / s.h);
  const dw = s.w * scale, dh = s.h * scale;
  const overflow = Math.max(0, dh - h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(el, x + (w - dw) / 2, y - overflow * k, dw, dh);
  ctx.restore();
}

function placeholder(rc: RenderCtx, x: number, y: number, w: number, h: number) {
  const { ctx, u } = rc;
  ctx.fillStyle = "#F2F3F6";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#8B8F9A";
  ctx.font = `500 ${Math.max(14, 30 * u)}px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Add a screenshot or demo in “Your screens”", x + w / 2, y + h / 2);
  ctx.textAlign = "left";
}

/** Your screens: a real screenshot or demo video, scrolling inside a browser or phone. */
export const screensScene: SceneDef = {
  type: "screens",
  name: "Your screens",
  description: "Shows a real screenshot or demo video of your site, app or social page inside a browser or phone, with a slow scroll.",
  defaultDuration: 4,
  minDuration: 2,
  maxDuration: 15,
  params: [
    { key: "media", label: "Screen", type: "media", default: "" },
    {
      key: "frame",
      label: "Device",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Auto (by screen shape)" },
        { value: "browser", label: "Browser window" },
        { value: "phone", label: "Phone" },
      ],
    },
    { key: "scroll", label: "Scroll through the page", type: "boolean", default: true },
    { key: "background", label: "Background colour", type: "role", default: "primary" },
    { key: "caption", label: "Caption", type: "text", default: "", placeholder: "Optional" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const tint = rc.role(p.background);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, rc.colors.white);
    g.addColorStop(0.5, mix(tint, rc.colors.white, 0.7));
    g.addColorStop(1, tint);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const firstId = [...rc.assets.mediaInfo.values()].find((m) => m.use !== "photo" && rc.assets.media.has(m.id))?.id;
    const id = String(p.media || firstId || "");
    const el = id ? rc.media(id, t) : null;
    const s = el ? sizeOf(el) : { w: 16, h: 10 };
    const tall = s.h / s.w > 1.25;
    const frame = p.frame === "auto" ? (tall ? "phone" : "browser") : p.frame;
    const enter = ease.outQuint(seg(t, 0, 0.9));
    const scrollK = p.scroll ? ease.inOutCubic(seg(t, 0.9, duration - 0.4)) : 0;
    const caption = String(p.caption || "");
    const capSpace = caption ? 90 * u : 0;

    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(0, (1 - enter) * 100 * u);

    if (frame === "phone") {
      const PH = Math.min(h * 0.84 - capSpace, 1100 * u), PW = PH * 0.49;
      const x = w / 2 - PW / 2, y = (h - capSpace) / 2 - PH / 2;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 70 * u;
      ctx.shadowOffsetY = 30 * u;
      ctx.fillStyle = "#121318";
      rc.roundRect(x, y, PW, PH, PW * 0.16);
      ctx.fill();
      ctx.restore();
      const inset = PW * 0.035;
      ctx.save();
      rc.roundRect(x + inset, y + inset, PW - inset * 2, PH - inset * 2, PW * 0.13);
      ctx.clip();
      if (el) drawScrolled(rc, el, x + inset, y + inset, PW - inset * 2, PH - inset * 2, scrollK);
      else placeholder(rc, x + inset, y + inset, PW - inset * 2, PH - inset * 2);
      ctx.restore();
      ctx.fillStyle = "#000";
      rc.roundRect(w / 2 - PW * 0.14, y + inset + PH * 0.015, PW * 0.28, PH * 0.032, PH * 0.016);
      ctx.fill();
    } else {
      const bw = Math.min(1500 * u, w * 0.86);
      const chrome = 166 * u;
      const vh = Math.min(bw * 0.58, h * 0.8 - chrome - capSpace);
      const bh = chrome + vh;
      const x = w / 2 - bw / 2, y = (h - capSpace) / 2 - bh / 2;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 60 * u;
      ctx.shadowOffsetY = 24 * u;
      ctx.fillStyle = "#fff";
      rc.roundRect(x, y, bw, bh, 26 * u);
      ctx.fill();
      ctx.restore();
      ctx.save();
      rc.roundRect(x, y, bw, bh, 26 * u);
      ctx.clip();
      drawBrowserChrome(rc, x, y, bw, { url: rc.brand.website || rc.brand.name, title: rc.brand.name, tint });
      if (el) drawScrolled(rc, el, x, y + chrome, bw, vh, scrollK);
      else placeholder(rc, x, y + chrome, bw, vh);
      ctx.restore();
    }
    ctx.restore();

    if (caption) {
      const a = ease.outCubic(seg(t, 0.4, 1));
      const ink = rc.colors.black;
      rc.text(caption, w / 2, h - 70 * u, 40 * u, ink, { align: "center", alpha: a, weight: 500 });
    }
  },
};
