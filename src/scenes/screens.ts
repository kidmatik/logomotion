import { mix } from "../brand/color";
import { ease, seg, UI_FONT, type MediaEl, type RenderCtx, type SceneDef } from "../engine/kit";
import { drawBrowserChrome } from "./browser";

function sizeOf(el: MediaEl) {
  return el instanceof HTMLVideoElement
    ? { w: el.videoWidth || 16, h: el.videoHeight || 9 }
    : { w: el.naturalWidth || 16, h: el.naturalHeight || 9 };
}

/**
 * Draw media in a viewport. Tall images fill the width and scroll (k: 0 = top,
 * 1 = bottom); anything that doesn't overflow gets a slow push-in instead, so
 * the screen is never a still.
 */
function drawScrolled(rc: RenderCtx, el: MediaEl, x: number, y: number, w: number, h: number, k: number, life: number) {
  const { ctx } = rc;
  const s = sizeOf(el);
  const video = el instanceof HTMLVideoElement;
  let scale = w / s.w;
  const scrolls = !video && s.h * scale > h * 1.04;
  if (!scrolls) scale = Math.max(w / s.w, h / s.h) * (video ? 1 : 1 + 0.06 * life);
  const dw = s.w * scale, dh = s.h * scale;
  const overflow = Math.max(0, dh - h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, w, h);
  ctx.drawImage(el, x + (w - dw) / 2, scrolls ? y - overflow * k : y + (h - dh) * 0.15, dw, dh);
  ctx.restore();
}

/** Scroll like a person reading: a few eased moves with pauses between them. */
function steppedScroll(p: number, steps = 3) {
  const per = 1 / steps;
  const i = Math.min(steps - 1, Math.floor(p / per));
  const local = (p - i * per) / per;
  // Move during the first 60% of each step, then hold.
  return (i + ease.inOutCubic(Math.min(1, local / 0.6))) / steps;
}

function placeholder(rc: RenderCtx, x: number, y: number, w: number, h: number) {
  const { ctx, u } = rc;
  ctx.fillStyle = "#F2F3F6";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#8B8F9A";
  ctx.font = `500 ${Math.max(14, 30 * u)}px ${UI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Add a screenshot or demo in this scene’s settings", x + w / 2, y + h / 2);
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
        { value: "auto", label: "Auto (by how it was captured)" },
        { value: "browser", label: "Browser window" },
        { value: "phone", label: "Phone" },
        { value: "duo", label: "Desktop + phone together" },
      ],
    },
    { key: "mobile", label: "Phone screen (for Desktop + phone)", type: "media", default: "" },
    {
      key: "scroll",
      label: "Scrolling",
      type: "select",
      default: "steps",
      options: [
        { value: "steps", label: "Scroll and pause, like reading" },
        { value: "smooth", label: "One smooth scroll" },
        { value: "none", label: "No scroll" },
      ],
    },
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

    const screens = [...rc.assets.mediaInfo.values()].filter((m) => m.use !== "photo" && rc.assets.media.has(m.id));
    const id = String(p.media || screens[0]?.id || "");
    const el = id ? rc.media(id, t) : null;
    const info = id ? rc.mediaInfo(id) : undefined;
    const s = el ? sizeOf(el) : { w: 16, h: 10 };
    // Prefer how it was captured; otherwise guess from the shape (narrow and tall = phone).
    const isPhone = info?.device ? info.device === "mobile" : s.w <= 1000 && s.h / s.w > 1.25;
    const mobileId = String(p.mobile || screens.find((m) => m.device === "mobile" && m.id !== id)?.id || "");
    const frame = p.frame === "auto" ? (isPhone ? "phone" : "browser") : String(p.frame);

    const enter = ease.outQuint(seg(t, 0, 0.9));
    const life = seg(t, 0, duration);
    const mode = p.scroll === true ? "steps" : p.scroll === false ? "none" : String(p.scroll);
    const sp = seg(t, 0.9, duration - 0.35);
    const scrollK = mode === "none" ? 0 : mode === "smooth" ? ease.inOutCubic(sp) : steppedScroll(sp, duration > 5 ? 4 : 3);
    const caption = String(p.caption || "");
    const capSpace = caption ? 90 * u : 0;

    const phone = (x: number, y: number, PH: number, media: MediaEl | null, k: number) => {
      const PW = PH * 0.49;
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
      if (media) drawScrolled(rc, media, x + inset, y + inset, PW - inset * 2, PH - inset * 2, k, life);
      else placeholder(rc, x + inset, y + inset, PW - inset * 2, PH - inset * 2);
      ctx.restore();
      ctx.fillStyle = "#000";
      rc.roundRect(x + PW / 2 - PW * 0.14, y + inset + PH * 0.015, PW * 0.28, PH * 0.032, PH * 0.016);
      ctx.fill();
    };

    const browser = (x: number, y: number, bw: number, vh: number, media: MediaEl | null, k: number) => {
      const chrome = 166 * u;
      const bh = chrome + vh;
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
      if (media) drawScrolled(rc, media, x, y + chrome, bw, vh, k, life);
      else placeholder(rc, x, y + chrome, bw, vh);
      ctx.restore();
      return chrome;
    };

    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(0, (1 - enter) * 100 * u);

    if (frame === "phone") {
      const PH = Math.min(h * 0.84 - capSpace, 1100 * u, (w * 0.8) / 0.49);
      phone(w / 2 - (PH * 0.49) / 2, (h - capSpace) / 2 - PH / 2, PH, el, scrollK);
    } else if (frame === "duo") {
      // Desktop in a browser, with the phone version overlapping its corner. The phone scrolls a beat behind.
      const portrait = h > w;
      const bw = Math.min(1400 * u, w * (portrait ? 0.9 : 0.74));
      const chrome = 166 * u;
      const vh = Math.min(bw * (portrait ? 0.9 : 0.58), h * (portrait ? 0.5 : 0.78) - chrome - capSpace);
      const bx = portrait ? w / 2 - bw / 2 : w * 0.06;
      const by = portrait ? h * 0.08 : (h - capSpace) / 2 - (chrome + vh) / 2;
      browser(bx, by, bw, vh, el, scrollK);
      const mob = mobileId ? rc.media(mobileId, t) : null;
      const PH = portrait ? h * 0.48 : Math.min(h * 0.8 - capSpace, (chrome + vh) * 1.05);
      const pin = ease.outBack(seg(t, 0.35, 1.2));
      const px = portrait ? w * 0.6 - (PH * 0.49) / 2 : bx + bw - PH * 0.49 * 0.55;
      const py = portrait ? h * 0.44 : by + (chrome + vh) - PH * 0.82;
      ctx.save();
      ctx.translate(0, (1 - pin) * 160 * u);
      ctx.globalAlpha *= Math.min(1, pin);
      phone(px, py, PH, mob ?? el, mode === "none" ? 0 : steppedScroll(seg(t, 1.3, duration - 0.2), 3));
      ctx.restore();
    } else {
      const bw = Math.min(1500 * u, w * 0.86);
      const chrome = 166 * u;
      const vh = Math.min(bw * (h > w ? 1.2 : 0.58), h * 0.8 - chrome - capSpace);
      browser(w / 2 - bw / 2, (h - capSpace) / 2 - (chrome + vh) / 2, bw, vh, el, scrollK);
    }
    ctx.restore();

    if (caption) {
      const a = ease.outCubic(seg(t, 0.4, 1));
      const ink = rc.colors.black;
      rc.text(caption, w / 2, h - 70 * u, 40 * u, ink, { align: "center", alpha: a, weight: 500 });
    }
  },
};
