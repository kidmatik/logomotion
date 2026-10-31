/**
 * WebGL compositor for photo mockups. One full-frame pass reads the base photo,
 * maps every output pixel onto the logo surface through a homography (with an
 * optional cylinder wrap), and lights the logo with the photo's own shading so
 * it sits in the folds, grain and light of the picture. Materials are built
 * from the logo's blurred height map, so they work with any logo.
 *
 * The result is drawn into the caller's 2D canvas, so preview, thumbnails and
 * export all go through the same renderer.
 */
import type { Art } from "./art";
import { apply, invert, mul, squareToQuad, type Mat3, type Quad } from "./geometry";
import type { MaterialId } from "./library";

const MAT_INDEX: Record<MaterialId, number> = { print: 0, emboss: 1, deboss: 2, foil: 3, spotuv: 4, neon: 5, embroidery: 6, engrave: 7 };

export interface CompositeInput {
  photo: TexImageSource;
  photoW: number;
  photoH: number;
  /** Logo surface on the photo, in photo pixels. */
  quad: Quad;
  /** Output pixel -> photo pixel (affine camera). */
  view: Mat3;
  art: Art;
  material: MaterialId;
  /** Ink colour as 0..1 RGB; ignored when useArtColor. */
  ink: [number, number, number];
  useArtColor: boolean;
  /** 0..1, material-specific amount (ink opacity, depth, glow). */
  strength: number;
  bend: number;
  arc: number;
  /** Light direction on the surface (towards the light). */
  light: [number, number];
  time: number;
  /** 0..1 how far the logo has appeared. */
  reveal: number;
  revealMode: "fade" | "wipe" | "press" | "light";
  /** 0..1 strength of the soft light that sweeps over the whole frame. */
  sweep: number;
  /** Position of the sweeping light, -0.5..1.5 across the frame. */
  sweepPos: number;
  metalA: [number, number, number];
  metalB: [number, number, number];
  /** 0..1 darkens the photo (night look for neon). */
  dim: number;
  /** Average brightness of the bare surface (0..1). */
  surfaceLum: number;
}

const VERT = `#version 300 es
in vec2 p;
void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPhoto, uArt, uHeight;
uniform vec2 uRes, uPhotoSize, uArtTexel;
uniform mat3 uView, uSurf;
uniform int uMat, uReveal;
uniform vec3 uInk, uMetalA, uMetalB;
uniform float uUseArt, uRef, uBend, uArc, uTime, uK, uStrength, uSweep, uSweepPos, uDim, uArtAspect;
uniform vec2 uLight;
out vec4 o;

float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

vec3 H(vec2 st){ return texture(uHeight, st).rgb; }

void main(){
  vec2 pix = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 puv = (uView * vec3(pix, 1.)).xy / uPhotoSize;
  vec3 P = texture(uPhoto, clamp(puv, vec2(0.), vec2(1.))).rgb;
  vec3 hq = uSurf * vec3(pix, 1.);
  vec2 st = hq.xy / hq.z;

  float edge = 1.;
  if (uBend > 0.001) {
    float x = st.x * 2. - 1.;
    float phi = asin(clamp(x * sin(uBend), -1., 1.));
    st.x = 0.5 + phi / (2. * uBend);
    st.y -= uArc * (1. - x * x);
    // The print turns away from the camera towards the cylinder's edges.
    edge = 1. - smoothstep(0.82, 1.0, abs(x));
  }

  // Appear animation.
  float k = uK;
  if (uReveal == 2) st = 0.5 + (st - 0.5) * (1. + (1. - k) * 0.12);
  bool inside = st.x >= 0. && st.x <= 1. && st.y >= 0. && st.y <= 1.;
  vec4 A = inside ? texture(uArt, st) : vec4(0.);
  vec3 B = inside ? H(st) : vec3(0.);
  float a = A.a * edge;
  float show = 1.;
  if (uReveal == 0 || uReveal == 2) show = k;
  else if (uReveal == 1) show = smoothstep(st.x - 0.04, st.x + 0.04, k * 1.08 - 0.04);
  else if (uReveal == 3) show = smoothstep(st.x + st.y * 0.4 - 0.08, st.x + st.y * 0.4, k * 1.6 - 0.2);

  vec3 ink = uUseArt > 0.5 ? A.rgb : uInk;
  float shade = clamp((lum(P) + 0.04) / (uRef + 0.04), 0.0, 1.7);

  // Height map gradients (small and medium blur) for bevels and lighting.
  vec2 ex = vec2(uArtTexel.x * 2., 0.), ey = vec2(0., uArtTexel.y * 2.);
  float dx1 = inside ? H(st + ex).r - H(st - ex).r : 0.;
  float dy1 = inside ? H(st + ey).r - H(st - ey).r : 0.;
  float dx2 = inside ? H(st + ex * 3.).g - H(st - ex * 3.).g : 0.;
  float dy2 = inside ? H(st + ey * 3.).g - H(st - ey * 3.).g : 0.;
  vec3 L = normalize(vec3(uLight, 0.9));
  vec3 Pd = P * (1. - uDim);
  vec3 col = Pd;

  if (uMat == 0) {
    // Print: the ink takes the photo's light and texture.
    vec3 c = ink * shade;
    col = mix(Pd, c, a * show * mix(0.75, 1., uStrength));
  } else if (uMat == 1 || uMat == 2 || uMat == 7) {
    float sgn = uMat == 1 ? 1. : -1.;
    float depth = (uMat == 7 ? 2.6 : 2.0) * mix(0.5, 1.5, uStrength) * show;
    // Blend a crisp and a soft bevel so the edge reads as pressed paper, not a line.
    float gx = dx1 * 0.55 + dx2 * 0.45, gy = dy1 * 0.55 + dy2 * 0.45;
    vec3 n = normalize(vec3(-gx * depth * sgn, -gy * depth * sgn, 1.));
    float diff = clamp(dot(n, L) / L.z, 0.6, 1.3);
    float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.), 30.) * 0.08;
    col = Pd * diff + spec * show;
    if (uMat == 1) {
      // Raised: a soft cast shadow away from the light.
      float sh = inside ? H(st + uLight * uArtTexel * 14.).g : 0.;
      col *= 1. - 0.12 * sh * (1. - B.r) * show;
    } else if (uMat == 7) {
      // Engraved: the cut is darker and takes on a burnt tone.
      col = mix(col, col * col * 0.9, A.a * show * mix(0.5, 0.9, uStrength));
    }
  } else if (uMat == 3 || uMat == 4) {
    vec3 n = normalize(vec3(-dx1 * 3., -dy1 * 3., 1.));
    float bevel = dot(n, L) / L.z;
    float band = st.x * 0.8 + st.y * 0.5 + n.x * 0.35 + n.y * 0.25;
    float sweep = exp(-pow((band - (uSweepPos * 1.6 - 0.3)) * 5., 2.));
    if (uMat == 3) {
      float r = 0.5 + 0.5 * sin(band * 7. - uTime * 0.6);
      vec3 metal = mix(uMetalA, uMetalB, 0.4 + 0.6 * smoothstep(0.1, 0.9, r));
      metal *= clamp(pow(shade, 0.6), 0.55, 1.25) * mix(0.85, 1.15, bevel);
      metal += vec3(1., 0.97, 0.9) * sweep * 0.55;
      // Foil is very slightly pressed in, so its edge catches a shadow.
      col = mix(Pd * mix(1., bevel, 0.4), metal, a * show);
    } else {
      // Spot gloss: clear varnish, only the shine and a slight darkening show.
      vec3 gloss = Pd * 0.93 * mix(0.9, 1.1, bevel) + vec3(1.) * sweep * 0.35 * mix(0.6, 1.2, uStrength);
      col = mix(Pd, gloss, a * show);
    }
  } else if (uMat == 5) {
    // Neon: glass tubes along the outline and the glow they cast.
    float tube = smoothstep(0.2, 0.46, B.g) * (1. - smoothstep(0.54, 0.8, B.g));
    float core = pow(tube, 3.);
    // The glow spills mostly outside and around the tubes; the inside stays wall.
    float glow = (B.b * 0.55 + tube * 0.5) * (1. - 0.55 * A.a) * mix(0.6, 1.4, uStrength);
    float on = show;
    vec3 lit = Pd + ink * glow * on * (0.35 + 0.65 * lum(P) + 0.4) * 0.6;
    lit += mix(ink, vec3(1.), core * 0.75) * tube * on * 1.25;
    lit += vec3(0.12) * tube * (1. - on);
    col = lit;
  } else if (uMat == 6) {
    // Embroidery: satin stitches with a raised, rounded edge.
    vec2 q = st * vec2(uArtAspect, 1.) * 160.;
    float jitter = noise(q * 0.15) * 2.;
    float stitch = 0.5 + 0.5 * sin((q.x * 0.82 + q.y * 0.57) * 6.2831 + jitter);
    float thread = mix(0.72, 1.12, smoothstep(0.1, 0.9, stitch));
    vec3 n = normalize(vec3(-dx2 * 6., -dy2 * 6., 1.));
    float diff = dot(n, L) / L.z;
    float fuzzy = smoothstep(0.35, 0.6, A.a + (noise(q * 0.9) - 0.5) * 0.35);
    vec3 c = ink * thread * mix(0.8, 1.15, diff) * clamp(pow(shade, 0.5), 0.6, 1.3);
    float sh = inside ? H(st + uLight * uArtTexel * 10.).g : 0.;
    vec3 base = Pd * (1. - 0.3 * sh * (1. - A.a) * show);
    col = mix(base, c, fuzzy * edge * show);
  }

  // Soft light sweeping across the whole frame, and a gentle vignette.
  vec2 uv = pix / uRes;
  float s = exp(-pow((uv.x + uv.y * 0.35 - uSweepPos) * 3.2, 2.)) * uSweep;
  col += vec3(1., 0.97, 0.92) * s * 0.08;
  float v = length(uv - 0.5);
  col *= 1. - 0.16 * v * v;
  o = vec4(col, 1.);
}`;

interface GL {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
  photoTex: WeakMap<object, WebGLTexture>;
  artTex: Map<string, { color: WebGLTexture; height: WebGLTexture }>;
}

let state: GL | null | undefined;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
}

function init(): GL | null {
  if (state !== undefined) return state;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) return (state = null);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    const names = ["uPhoto", "uArt", "uHeight", "uRes", "uPhotoSize", "uArtTexel", "uView", "uSurf", "uMat", "uReveal", "uInk", "uMetalA", "uMetalB", "uUseArt", "uRef", "uBend", "uArc", "uTime", "uK", "uStrength", "uSweep", "uSweepPos", "uDim", "uArtAspect", "uLight"];
    const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
    gl.uniform1i(loc.uPhoto, 0);
    gl.uniform1i(loc.uArt, 1);
    gl.uniform1i(loc.uHeight, 2);
    state = { canvas, gl, prog, loc, photoTex: new WeakMap(), artTex: new Map() };
  } catch (err) {
    console.error("Mockup renderer unavailable", err);
    state = null;
  }
  return state;
}

function texture(gl: WebGL2RenderingContext, src: TexImageSource, mip: boolean) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}

/** Row-major 3x3 to the column-major array WebGL expects. */
const colMajor = (m: Mat3) => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

export function mockupSupported() {
  return !!init();
}

/** Draw the composited mockup into a 2D context filling w×h. Returns false if WebGL is unavailable. */
export function composite(ctx: CanvasRenderingContext2D, w: number, h: number, inp: CompositeInput): boolean {
  const s = init();
  if (!s) return false;
  const { gl, loc, canvas } = s;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);

  let pt = s.photoTex.get(inp.photo as object);
  if (!pt) s.photoTex.set(inp.photo as object, (pt = texture(gl, inp.photo, true)));
  let at = s.artTex.get(inp.art.key);
  if (!at) {
    at = { color: texture(gl, inp.art.color, true), height: texture(gl, inp.art.height, false) };
    s.artTex.set(inp.art.key, at);
    if (s.artTex.size > 12) {
      const [oldKey, old] = s.artTex.entries().next().value!;
      gl.deleteTexture(old.color);
      gl.deleteTexture(old.height);
      s.artTex.delete(oldKey);
    }
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pt);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, at.color);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, at.height);

  // Output pixel -> surface unit square: (photo px -> unit)^-1 after the camera.
  const surf = mul(invert(squareToQuad(inp.quad)), inp.view);
  gl.uniformMatrix3fv(loc.uView, false, colMajor(inp.view));
  gl.uniformMatrix3fv(loc.uSurf, false, colMajor(surf));
  gl.uniform2f(loc.uRes, w, h);
  gl.uniform2f(loc.uPhotoSize, inp.photoW, inp.photoH);
  gl.uniform2f(loc.uArtTexel, 1 / inp.art.width, 1 / inp.art.heightPx);
  gl.uniform1f(loc.uArtAspect, inp.art.width / inp.art.heightPx);
  gl.uniform1i(loc.uMat, MAT_INDEX[inp.material]);
  gl.uniform1i(loc.uReveal, { fade: 0, wipe: 1, press: 2, light: 3 }[inp.revealMode]);
  gl.uniform3fv(loc.uInk, inp.ink);
  gl.uniform3fv(loc.uMetalA, inp.metalA);
  gl.uniform3fv(loc.uMetalB, inp.metalB);
  gl.uniform1f(loc.uUseArt, inp.useArtColor ? 1 : 0);
  gl.uniform1f(loc.uRef, inp.surfaceLum);
  gl.uniform1f(loc.uBend, inp.bend);
  gl.uniform1f(loc.uArc, inp.arc);
  gl.uniform1f(loc.uTime, inp.time);
  gl.uniform1f(loc.uK, inp.reveal);
  gl.uniform1f(loc.uStrength, inp.strength);
  gl.uniform1f(loc.uSweep, inp.sweep);
  gl.uniform1f(loc.uSweepPos, inp.sweepPos);
  gl.uniform1f(loc.uDim, inp.dim);
  const ln = Math.hypot(inp.light[0], inp.light[1]) || 1;
  gl.uniform2f(loc.uLight, inp.light[0] / ln, inp.light[1] / ln);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  ctx.drawImage(canvas, 0, 0, w, h);
  return true;
}

/* ---------- surface statistics ---------- */

const stats = new WeakMap<object, Map<string, { lum: number; color: string }>>();

/** Average colour and brightness of the bare surface inside the quad. */
export function surfaceStats(photo: CanvasImageSource, pw: number, ph: number, quad: Quad) {
  const key = quad.flat().map((n) => n.toFixed(1)).join(",");
  let m = stats.get(photo as object);
  if (!m) stats.set(photo as object, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const S = 96;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(photo, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const H = squareToQuad(quad);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 1; i < 12; i++)
    for (let j = 1; j < 12; j++) {
      const [x, y] = apply(H, [i / 12, j / 12]);
      const px = Math.max(0, Math.min(S - 1, Math.round((x / pw) * S)));
      const py = Math.max(0, Math.min(S - 1, Math.round((y / ph) * S)));
      const o = (py * S + px) * 4;
      r += d[o];
      gg += d[o + 1];
      b += d[o + 2];
      n++;
    }
  r /= n * 255;
  gg /= n * 255;
  b /= n * 255;
  const hex = "#" + [r, gg, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  const res = { lum: 0.2126 * r + 0.7152 * gg + 0.0722 * b, color: hex };
  m.set(key, res);
  return res;
}
