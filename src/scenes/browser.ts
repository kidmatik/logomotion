import { mix } from "../brand/color";
import { ease, seg, UI_FONT, type RenderCtx, type SceneDef } from "../engine/kit";

/** Browser chrome (tabs bar + toolbar) drawn at a given rect. Shared with the screens scene. */
export function drawBrowserChrome(
  rc: RenderCtx,
  x: number,
  y: number,
  bw: number,
  opts: { url: string; title: string; caret?: boolean; tint: string },
) {
  const { ctx, u } = rc;
  const tabH = 74 * u, barH = 92 * u;
  const tabBar = mix(opts.tint, "#FFFFFF", 0.78);
  ctx.fillStyle = tabBar;
  ctx.fillRect(x, y, bw, tabH);
  // Window dots.
  [0, 1, 2].forEach((i) => {
    ctx.fillStyle = mix(opts.tint, "#FFFFFF", 0.15 + i * 0.25);
    ctx.beginPath();
    ctx.arc(x + 38 * u + i * 30 * u, y + tabH / 2, 9 * u, 0, Math.PI * 2);
    ctx.fill();
  });
  // Active tab.
  const tx = x + 150 * u, tw = Math.min(330 * u, bw * 0.45), ty = y + 14 * u;
  ctx.fillStyle = "#FFFFFF";
  rc.roundRect(tx, ty, tw, tabH - 14 * u + 2, 18 * u);
  ctx.fill();
  const fav = 34 * u;
  ctx.fillStyle = rc.colors.primary;
  rc.roundRect(tx + 22 * u, ty + (tabH - 14 * u) / 2 - fav / 2, fav, fav, 8 * u);
  ctx.fill();
  rc.drawLogo(tx + 22 * u + fav / 2, ty + (tabH - 14 * u) / 2, fav * 0.62, rc.colors.white, { knockout: true });
  ctx.save();
  ctx.beginPath();
  ctx.rect(tx + 66 * u, ty, tw - 120 * u, tabH);
  ctx.clip();
  ctx.fillStyle = "#24262D";
  ctx.font = `500 ${24 * u}px ${UI_FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(opts.title, tx + 68 * u, ty + (tabH - 14 * u) / 2);
  ctx.restore();
  ctx.strokeStyle = "#555A66";
  ctx.lineWidth = 2.5 * u;
  const xx = tx + tw - 34 * u, xy = ty + (tabH - 14 * u) / 2, s = 8 * u;
  ctx.beginPath();
  ctx.moveTo(xx - s, xy - s); ctx.lineTo(xx + s, xy + s);
  ctx.moveTo(xx + s, xy - s); ctx.lineTo(xx - s, xy + s);
  ctx.stroke();
  // New-tab plus.
  const px = tx + tw + 40 * u;
  ctx.beginPath();
  ctx.moveTo(px - s, xy); ctx.lineTo(px + s, xy);
  ctx.moveTo(px, xy - s); ctx.lineTo(px, xy + s);
  ctx.stroke();

  // Toolbar.
  const ty2 = y + tabH;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(x, ty2, bw, barH);
  ctx.strokeStyle = "#3C3F48";
  ctx.lineWidth = 3 * u;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cy = ty2 + barH / 2;
  const ix = x + 44 * u, gap = 54 * u, a = 11 * u;
  // back
  ctx.beginPath(); ctx.moveTo(ix + a, cy); ctx.lineTo(ix - a, cy); ctx.moveTo(ix - a + 8 * u, cy - 8 * u); ctx.lineTo(ix - a, cy); ctx.lineTo(ix - a + 8 * u, cy + 8 * u); ctx.stroke();
  // forward
  const fx = ix + gap;
  ctx.beginPath(); ctx.moveTo(fx - a, cy); ctx.lineTo(fx + a, cy); ctx.moveTo(fx + a - 8 * u, cy - 8 * u); ctx.lineTo(fx + a, cy); ctx.lineTo(fx + a - 8 * u, cy + 8 * u); ctx.stroke();
  // reload
  const rx = ix + gap * 2;
  ctx.beginPath(); ctx.arc(rx, cy, a, -Math.PI * 0.2, Math.PI * 1.5); ctx.stroke();
  // home
  const hx = ix + gap * 3;
  ctx.beginPath(); ctx.moveTo(hx - a, cy); ctx.lineTo(hx, cy - a); ctx.lineTo(hx + a, cy); ctx.moveTo(hx - a * 0.7, cy - 2 * u); ctx.lineTo(hx - a * 0.7, cy + a); ctx.lineTo(hx + a * 0.7, cy + a); ctx.lineTo(hx + a * 0.7, cy - 2 * u); ctx.stroke();
  // address pill
  const ax = ix + gap * 4, aw = bw - (ax - x) - 34 * u, ah = 54 * u;
  ctx.fillStyle = "#F0F1F4";
  rc.roundRect(ax, cy - ah / 2, aw, ah, ah / 2);
  ctx.fill();
  // lock
  ctx.fillStyle = "#3C3F48";
  ctx.fillRect(ax + 26 * u, cy - 3 * u, 16 * u, 13 * u);
  ctx.beginPath(); ctx.lineWidth = 2.5 * u; ctx.arc(ax + 34 * u, cy - 4 * u, 5.5 * u, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = "#3C3F48";
  ctx.font = `400 ${24 * u}px ${UI_FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(opts.url, ax + 60 * u, cy + 1);
  if (opts.caret) {
    const cw = ctx.measureText(opts.url).width;
    ctx.fillRect(ax + 62 * u + cw, cy - 14 * u, 2 * u, 28 * u);
  }
  ctx.lineCap = "butt";
  return { height: tabH + barH };
}

/** Browser: the tab shows the favicon and the website is typed into the address bar. */
export const browserScene: SceneDef = {
  type: "browser",
  name: "Browser tab",
  description: "A browser window rises in with the favicon in its tab, and the website is typed into the address bar.",
  defaultDuration: 3,
  minDuration: 2,
  maxDuration: 8,
  params: [
    { key: "gradient", label: "Background colour", type: "role", default: "primary" },
    { key: "title", label: "Tab title", type: "text", default: "", placeholder: "Uses the brand name" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const tint = rc.role(p.gradient);
    const g = rc.portrait ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, rc.colors.white);
    g.addColorStop(0.35, mix(tint, rc.colors.white, 0.75));
    g.addColorStop(1, tint);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Draw the window at a comfortable size, then scale it to fill the frame.
    const zoomFit = rc.portrait ? 1.3 : Math.min(1.5, (w * 0.86) / (1180 * u));
    const bw = rc.portrait ? (w * 0.9) / zoomFit : 1180 * u;
    const bh = 166 * u;
    const enter = ease.outQuint(seg(t, 0, 0.9));
    const x = w / 2 - bw / 2;
    const y = h / 2 - bh / 2 + (1 - enter) * 120 * u;
    const scale = 1 + 0.05 * ease.inOutCubic(seg(t, 1, duration));

    const url = rc.brand.website || rc.brand.name;
    const typed = Math.round(url.length * seg(t, 0.9, Math.min(duration - 0.6, 0.9 + url.length * 0.09)));
    const caret = Math.floor(t * 2.4) % 2 === 0 || typed < url.length;

    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale * zoomFit, scale * zoomFit);
    ctx.translate(-w / 2, -h / 2);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 60 * u;
    ctx.shadowOffsetY = 24 * u;
    ctx.fillStyle = "#fff";
    rc.roundRect(x, y, bw, bh, 30 * u);
    ctx.fill();
    ctx.restore();
    ctx.save();
    rc.roundRect(x, y, bw, bh, 30 * u);
    ctx.clip();
    drawBrowserChrome(rc, x, y, bw, {
      url: url.slice(0, typed),
      title: String(p.title || rc.brand.name),
      caret,
      tint,
    });
    ctx.restore();
    ctx.restore();
  },
};
