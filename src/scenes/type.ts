import { mix } from "../brand/color";
import { ease, seg, type SceneDef } from "../engine/kit";
import { weightLabel } from "../brand/fonts";

const ALPHABET = ["Aa Bb Cc Dd Ee Ff Gg Hh Ii", "Jj Kk Ll Mm Nn Oo Pp Qq Rr", "Ss Tt Uu Vv Ww Xx Yy Zz"];

/** Type specimen: font name, weights, alphabet and a large glyph pair. */
export const typeScene: SceneDef = {
  type: "type",
  name: "Type specimen",
  description: "Shows the brand typeface: its name, three weights, the alphabet and a big Aa.",
  defaultDuration: 3.2,
  minDuration: 2,
  maxDuration: 8,
  params: [
    { key: "gradient", label: "Gradient colour", type: "role", default: "primary" },
    { key: "ink", label: "Text colour", type: "role", default: "black" },
    { key: "label", label: "Label", type: "text", default: "Primary typeface" },
    { key: "glyphs", label: "Big glyphs", type: "text", default: "Aa" },
  ],
  render(rc, t, duration, p) {
    const { ctx, w, h, u } = rc;
    const tint = rc.role(p.gradient);
    const ink = rc.role(p.ink);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, rc.colors.white);
    g.addColorStop(0.45, mix(tint, rc.colors.white, 0.85));
    g.addColorStop(1, mix(tint, rc.colors.white, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const pad = 90 * u;
    const drift = ease.inOutCubic(seg(t, 0, duration)) * -20 * u;
    const appear = (start: number) => ease.outCubic(seg(t, start, start + 0.6));

    // Label and family name.
    let a = appear(0.1);
    rc.text("— " + String(p.label).toUpperCase(), pad, pad + 40 * u + (1 - a) * 20 * u, 28 * u, ink, { weight: 500, alpha: a, tracking: 0.04 });
    a = appear(0.25);
    const famSize = Math.min(150 * u, (w - pad * 2) / Math.max(4, rc.brand.font.family.length * 0.62));
    rc.text(rc.brand.font.family.toUpperCase(), pad, pad + 60 * u + famSize + (1 - a) * 30 * u, famSize, ink, { weight: 700, alpha: a });

    // Weight pills, the brand weight highlighted.
    const weights = Array.from(new Set([400, rc.brand.font.weight, 700])).sort((x, y) => x - y);
    const pillH = 46 * u;
    const pillsX = rc.portrait ? pad : w - pad;
    const pillsY = rc.portrait ? pad + 130 * u + famSize : pad + 20 * u;
    weights.forEach((wt, i) => {
      const k = ease.outBack(seg(t, 0.45 + i * 0.1, 0.85 + i * 0.1));
      if (k <= 0) return;
      const label = weightLabel(wt).toUpperCase();
      ctx.save();
      ctx.font = rc.font(22 * u, wt);
      const tw = ctx.measureText(label).width + 40 * u;
      ctx.restore();
      const x = rc.portrait ? pillsX + i * 0 : pillsX - tw;
      const y = pillsY + i * (pillH + 14 * u);
      const active = wt === rc.brand.font.weight;
      ctx.save();
      ctx.translate(x + tw / 2, y + pillH / 2);
      ctx.scale(k, k);
      rc.roundRect(-tw / 2, -pillH / 2, tw, pillH, pillH / 2);
      ctx.fillStyle = active ? ink : "transparent";
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5 * u;
      ctx.stroke();
      rc.text(label, 0, 1, 22 * u, active ? rc.colors.white : ink, { weight: wt, align: "center", baseline: "middle" });
      ctx.restore();
    });

    // Alphabet.
    const alphaSize = Math.min(40 * u, (w * (rc.portrait ? 0.84 : 0.42)) / 15);
    ALPHABET.forEach((line, i) => {
      const k = appear(0.6 + i * 0.12);
      const y = h - pad - (ALPHABET.length - 1 - i) * alphaSize * 1.25 - (rc.portrait ? 0 : 0);
      rc.text(line, pad + (1 - k) * -30 * u, y - (rc.portrait ? h * 0.42 : 0), alphaSize, ink, { weight: 400, alpha: k });
    });

    // Big glyphs rising from the bottom edge.
    const big = Math.min(rc.portrait ? 520 * u : 560 * u, h * 0.62);
    const k = ease.outQuint(seg(t, 0.35, 1.3));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    rc.text(String(p.glyphs), w - pad + drift, h - pad * 0.6 + (1 - k) * big, big, ink, { weight: rc.brand.font.weight, align: "right" });
    ctx.restore();
  },
};
