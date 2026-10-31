import { mix } from "../brand/color";
import { ease, lerp, seg, UI_FONT, type SceneDef } from "../engine/kit";
import { drawIconTile } from "./icon";

/** Phone home screen: a tilted phone glides in and the brand's app icon pops onto it. */
export const phoneScene: SceneDef = {
  type: "phone",
  name: "Phone",
  description: "A tilted phone slides in and the app icon pops onto its home screen.",
  defaultDuration: 3,
  minDuration: 2,
  maxDuration: 8,
  params: [
    { key: "background", label: "Background", type: "role", default: "white" },
    { key: "tile", label: "Icon colour", type: "role", default: "primary" },
    { key: "wallpaper", label: "Wallpaper", type: "role", default: "black", roles: ["black", "primary", "secondary"] },
    { key: "label", label: "Icon label", type: "text", default: "", placeholder: "Uses the brand name" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const bg = rc.role(p.background);
    const g0 = ctx.createLinearGradient(0, 0, w, h);
    g0.addColorStop(0, bg);
    g0.addColorStop(1, mix(bg, rc.colors.primary, 0.12));
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, w, h);

    const enter = ease.outQuint(seg(t, 0, 1.1));
    const zoom = ease.inOutCubic(seg(t, 1.5, duration));
    const PW = 560 * u, PH = 1140 * u;

    ctx.save();
    ctx.translate(w * (rc.portrait ? 0.5 : 0.56), h * 0.62 + (1 - enter) * h * 0.7);
    ctx.scale(lerp(1, 1.18, zoom), lerp(1, 1.18, zoom));
    ctx.rotate(lerp(-0.3, -0.2, enter) + zoom * 0.05);

    // Body and shadow.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 80 * u;
    ctx.shadowOffsetY = 40 * u;
    ctx.fillStyle = "#121318";
    rc.roundRect(-PW / 2, -PH / 2, PW, PH, 86 * u);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#3A3C44";
    ctx.lineWidth = 4 * u;
    rc.roundRect(-PW / 2 + 2 * u, -PH / 2 + 2 * u, PW - 4 * u, PH - 4 * u, 84 * u);
    ctx.stroke();

    // Screen.
    const inset = 20 * u;
    const sx = -PW / 2 + inset, sy = -PH / 2 + inset, sw = PW - inset * 2, sh = PH - inset * 2;
    ctx.save();
    rc.roundRect(sx, sy, sw, sh, 68 * u);
    ctx.clip();
    const wall = rc.role(p.wallpaper);
    const wg = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    wg.addColorStop(0, mix(wall, "#000000", 0.25));
    wg.addColorStop(0.6, wall);
    wg.addColorStop(1, mix(wall, rc.colors.primary, 0.35));
    ctx.fillStyle = wg;
    ctx.fillRect(sx, sy, sw, sh);

    // Status bar and dynamic island.
    ctx.fillStyle = "#000";
    rc.roundRect(-70 * u, sy + 22 * u, 140 * u, 40 * u, 20 * u);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${30 * u}px ${UI_FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText("9:41", sx + 50 * u, sy + 44 * u);

    // App grid: the brand icon plus neutral placeholders.
    const cols = 4, icon = 96 * u, gx = (sw - cols * icon) / (cols + 1);
    const label = String(p.label || rc.brand.name);
    const muted = ["#3B3F4A", "#545866", "#2E3240", mix(rc.colors.secondary, "#333", 0.35)];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < cols; col++) {
        const x = sx + gx + col * (icon + gx) + icon / 2;
        const y = sy + 150 * u + row * (icon + 64 * u) + icon / 2;
        if (row === 0 && col === 0) {
          const pop = ease.outBack(seg(t, 0.8, 1.3));
          if (pop > 0) drawIconTile(rc, x, y, icon * pop, rc.role(p.tile), rc.colors.white);
          ctx.globalAlpha = seg(t, 1.0, 1.3);
          ctx.fillStyle = "#fff";
          ctx.font = `500 ${18 * u}px ${UI_FONT}`;
          ctx.textAlign = "center";
          ctx.fillText(label.length > 12 ? label.slice(0, 11) + "…" : label, x, y + icon / 2 + 22 * u);
          ctx.textAlign = "left";
          ctx.globalAlpha = 1;
          // Notification badge.
          const b = ease.outBack(seg(t, 1.3, 1.6));
          if (b > 0) {
            ctx.fillStyle = "#FF3B30";
            ctx.beginPath();
            ctx.arc(x + icon / 2 - 4 * u, y - icon / 2 + 4 * u, 16 * u * b, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = muted[(row * 3 + col) % muted.length];
          ctx.globalAlpha = 0.85;
          rc.roundRect(x - icon / 2, y - icon / 2, icon, icon, icon * 0.23);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
    ctx.restore();
  },
};
