/**
 * A small 3D product studio (three.js): a can, a coffee cup, a box or a pair of
 * business cards wrapped in the brand, lit with a soft studio light and a
 * reflection environment, on a seamless floor in a brand colour. Because the
 * objects are real 3D, the camera can orbit a full 360° around them.
 *
 * One shared WebGL renderer draws into an offscreen canvas; the frame is then
 * copied into the scene's 2D canvas, like the photo mockups.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RenderCtx, type BrandAssets } from "../engine/kit";
import type { BrandKit } from "../types";
import { mix } from "../brand/color";

export type ProductKind = "can" | "cup" | "box" | "cards";

export interface StudioLook {
  object: ProductKind;
  /** Colour of the object's body and of the logo on it. */
  body: string;
  ink: string;
  /** Second colour for stripes, the back card, the lid band. */
  accent: string;
  /** Backdrop and floor. */
  backdrop: string;
}

export interface StudioCamera {
  /** Angle around the object (radians, 0 = straight on the front). */
  azimuth: number;
  /** Angle above the floor (radians). */
  elevation: number;
  /** Distance as a multiple of the object's framing distance. */
  distance: number;
  /** Vertical lens (degrees). */
  fov: number;
  /** Look-at offset in object units (to frame the logo for close-ups). */
  targetY: number;
  roll: number;
}

export interface StudioPose {
  /** Spin of the object itself around its vertical axis. */
  spin: number;
  /** Lift above the floor (object units) and a gentle tilt. */
  lift: number;
  tilt: number;
  /** 0..1 scale-in. */
  scale: number;
}

interface Studio {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Group;
  floor: THREE.Mesh;
  floorMat: THREE.MeshBasicMaterial;
  shadowFloor: THREE.Mesh;
  key: THREE.DirectionalLight;
  builtKey: string;
  textures: THREE.Texture[];
  /** Height of the current object (for framing). */
  size: number;
}

let studio: Studio | null | undefined;

function init(): Studio | null {
  if (studio !== undefined) return studio;
  try {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.85;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);

    // Seamless floor in the backdrop colour, plus a separate shadow catcher.
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.22 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = 0.001;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-2.5, 4.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -2;
    sc.right = sc.top = 2;
    sc.near = 0.5;
    sc.far = 15;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4);
    rim.position.set(3, 2.5, -3.5);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.35));

    const root = new THREE.Group();
    scene.add(root);
    studio = { renderer, scene, camera, root, floor, floorMat, shadowFloor, key, builtKey: "", textures: [], size: 1 };
  } catch (err) {
    console.error("3D studio unavailable", err);
    studio = null;
  }
  return studio;
}

export function studioSupported() {
  return !!init();
}

/* ---------- brand textures ---------- */

type Layout = "wrap" | "front" | "back" | "side" | "word";

function brandCanvas(brand: BrandKit, assets: BrandAssets, W: number, H: number, bg: string, ink: string, accent: string, layout: Layout) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const rc = new RenderCtx(g, W, H, { ...brand, logoColorMode: "primary" }, assets);
  rc.fill(bg);
  const hasLogo = !!assets.logo;
  const ratio = assets.logo?.ratio ?? 1;
  const mark = (cx: number, cy: number, size: number) => {
    if (hasLogo) rc.drawLogo(cx, cy, Math.min(size, (size * 1) / Math.max(1, ratio)), ink, { knockout: true });
    else {
      const wm = rc.measureWordmark(size * 0.4);
      rc.drawWordmark(cx - wm.w / 2, cy, size * 0.4, ink);
    }
  };
  const word = (cx: number, cy: number, maxW: number, size: number) => {
    let s = size;
    const m = rc.measureWordmark(s);
    if (m.w > maxW) s *= maxW / m.w;
    const wm = rc.measureWordmark(s);
    rc.drawWordmark(cx - wm.w / 2, cy, s, ink);
  };
  if (layout === "wrap") {
    // A cylinder label: u = 0.5 faces the camera. Mark on the front, name on the back, a stripe all round.
    g.fillStyle = accent;
    g.fillRect(0, H * 0.82, W, H * 0.05);
    mark(W * 0.5, H * 0.45, H * 0.38);
    word(0, H * 0.45, W * 0.28, H * 0.12);
    word(W, H * 0.45, W * 0.28, H * 0.12);
    word(W * 0.5, H * 0.72, W * 0.2, H * 0.06);
  } else if (layout === "front") {
    mark(W / 2, H * 0.46, Math.min(W, H) * 0.42);
  } else if (layout === "back") {
    word(W / 2, H / 2, W * 0.7, H * 0.14);
  } else if (layout === "side") {
    g.fillStyle = accent;
    g.fillRect(0, H * 0.86, W, H * 0.04);
    mark(W / 2, H * 0.3, Math.min(W, H) * 0.35);
  } else {
    word(W / 2, H / 2, W * 0.8, H * 0.3);
  }
  return c;
}

function tex(s: Studio, c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  s.textures.push(t);
  return t;
}

/* ---------- objects ---------- */

function clear(s: Studio) {
  s.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  s.root.clear();
  s.textures.forEach((t) => t.dispose());
  s.textures = [];
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function build(s: Studio, brand: BrandKit, assets: BrandAssets, look: StudioLook) {
  clear(s);
  const { body, ink, accent } = look;
  const g = new THREE.Group();
  if (look.object === "can") {
    const r = 0.33, h = 1.22;
    const label = tex(s, brandCanvas(brand, assets, 2048, 1024, body, ink, accent, "wrap"));
    const side = new THREE.MeshPhysicalMaterial({ map: label, metalness: 0.35, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9dce1, metalness: 1, roughness: 0.22 });
    const can = mesh(new THREE.CylinderGeometry(r, r, h, 128, 1, true, Math.PI), side);
    can.position.y = h / 2 + 0.06;
    g.add(can);
    // Necked top and bottom in bare aluminium.
    const top = mesh(new THREE.LatheGeometry([new THREE.Vector2(r, 0), new THREE.Vector2(r * 0.86, 0.07), new THREE.Vector2(r * 0.86, 0.085), new THREE.Vector2(r * 0.8, 0.08), new THREE.Vector2(0, 0.07)], 96), metal);
    top.position.y = h + 0.06;
    g.add(top);
    const bottom = mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0.012), new THREE.Vector2(r * 0.7, 0), new THREE.Vector2(r * 0.9, 0.02), new THREE.Vector2(r, 0.06)], 96), metal);
    g.add(bottom);
    s.size = h + 0.15;
  } else if (look.object === "cup") {
    const pts: THREE.Vector2[] = [];
    const h = 1.05, r0 = 0.27, r1 = 0.36;
    for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector2(r0 + (r1 - r0) * (i / 20), (h * i) / 20));
    const label = tex(s, brandCanvas(brand, assets, 2048, 1024, body, ink, accent, "wrap"));
    const paper = new THREE.MeshStandardMaterial({ map: label, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
    g.add(mesh(new THREE.LatheGeometry(pts, 128, Math.PI), paper));
    const base = mesh(new THREE.CircleGeometry(r0, 64), new THREE.MeshStandardMaterial({ color: body, roughness: 0.8 }));
    base.rotation.x = Math.PI / 2;
    base.position.y = 0.002;
    g.add(base);
    // Lid.
    const lidCol = mix("#FFFFFF", accent, 0.08);
    const lid = mesh(
      new THREE.LatheGeometry(
        [new THREE.Vector2(r1 + 0.012, 0), new THREE.Vector2(r1 + 0.02, 0.04), new THREE.Vector2(r1 - 0.01, 0.07), new THREE.Vector2(r1 - 0.04, 0.1), new THREE.Vector2(r1 * 0.6, 0.12), new THREE.Vector2(0, 0.125)],
        96,
      ),
      new THREE.MeshPhysicalMaterial({ color: lidCol, roughness: 0.35, clearcoat: 0.4 }),
    );
    lid.position.y = h - 0.01;
    g.add(lid);
    s.size = h + 0.15;
  } else if (look.object === "box") {
    const W = 0.85, H = 1.15, D = 0.38;
    const front = tex(s, brandCanvas(brand, assets, 1024, 1386, body, ink, accent, "front"));
    const back = tex(s, brandCanvas(brand, assets, 1024, 1386, body, ink, accent, "back"));
    const side = tex(s, brandCanvas(brand, assets, 512, 1550, body, ink, accent, "side"));
    const top = tex(s, brandCanvas(brand, assets, 1024, 458, accent, body, accent, "word"));
    const m = (map: THREE.Texture) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
    const box = mesh(new THREE.BoxGeometry(W, H, D), [m(side), m(side), m(top), m(top), m(front), m(back)]);
    box.position.y = H / 2;
    g.add(box);
    s.size = H;
  } else {
    // Two business cards: the front in the brand colour, one behind in the accent.
    const cw = 0.9, ch = 0.52, t = 0.014;
    const front = tex(s, brandCanvas(brand, assets, 1400, 808, body, ink, accent, "front"));
    const back = tex(s, brandCanvas(brand, assets, 1400, 808, accent, body, accent, "back"));
    const edge = new THREE.MeshStandardMaterial({ color: mix(body, "#FFFFFF", 0.2), roughness: 0.8 });
    const face = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
    const c1 = mesh(new THREE.BoxGeometry(cw, ch, t), [edge, edge, edge, edge, face(front), face(back)]);
    c1.position.set(0, ch / 2 + 0.2, 0.06);
    c1.rotation.x = -0.12;
    const c2 = mesh(new THREE.BoxGeometry(cw, ch, t), [edge, edge, edge, edge, face(back), face(front)]);
    c2.position.set(0.16, ch / 2 + 0.3, -0.12);
    c2.rotation.set(-0.1, 0.12, 0.08);
    g.add(c2, c1);
    s.size = ch + 0.35;
  }
  s.root.add(g);
}

/* ---------- render ---------- */

export function renderStudio(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  brand: BrandKit,
  assets: BrandAssets,
  look: StudioLook,
  cam: StudioCamera,
  pose: StudioPose,
): HTMLCanvasElement | null {
  const s = init();
  if (!s) return null;
  const key = [look.object, look.body, look.ink, look.accent, assets.logo?.id ?? 0, brand.name, brand.font.family, brand.font.weight, brand.useLettermark, assets.lettermark?.id ?? 0].join("|");
  if (s.builtKey !== key) {
    build(s, brand, assets, look);
    s.builtKey = key;
  }
  const { renderer, scene, camera, root } = s;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) renderer.setSize(w, h, false);

  const bg = new THREE.Color(look.backdrop);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 6, 16);
  s.floorMat.color.copy(bg);

  root.rotation.set(pose.tilt * 0.5, pose.spin, pose.tilt);
  root.position.y = pose.lift;
  const sc = Math.max(0.001, pose.scale);
  root.scale.setScalar(sc);
  s.shadowFloor.visible = true;

  // Frame the object: distance so its height fills ~72% of the frame (or width, in tall formats).
  const aspect = w / h;
  camera.fov = cam.fov;
  camera.aspect = aspect;
  const vfov = (cam.fov * Math.PI) / 180;
  const fill = s.size / 0.72;
  const needH = fill / (2 * Math.tan(vfov / 2));
  const needW = (fill * 0.9) / (2 * Math.tan(vfov / 2) * aspect);
  const D = Math.max(needH, needW) * cam.distance;
  const ty = s.size * 0.5 + cam.targetY * s.size + pose.lift;
  const ce = Math.cos(cam.elevation);
  camera.position.set(Math.sin(cam.azimuth) * ce * D, ty + Math.sin(cam.elevation) * D, Math.cos(cam.azimuth) * ce * D);
  camera.up.set(Math.sin(cam.roll), Math.cos(cam.roll), 0);
  camera.lookAt(0, ty, 0);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
  return renderer.domElement;
}
