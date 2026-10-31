import type { SceneDef } from "../engine/kit";
import type { SceneInstance, TransitionKind } from "../types";
import { gridScene } from "./grid";
import { revealScene } from "./reveal";
import { iconScene } from "./icon";
import { phoneScene } from "./phone";
import { browserScene } from "./browser";
import { screensScene } from "./screens";
import { typeScene } from "./type";
import { paletteScene } from "./palette";
import { patternScene } from "./pattern";
import { signoffScene } from "./signoff";
import { endcardScene } from "./endcard";
import { bentoScene, slideshowScene } from "./photos";
import { stingScene } from "./sting";
import { assembleScene, blueprintScene, chromeScene, flashScene, marqueeScene, socialScene, stackScene, wordbuildScene } from "./reel";

/** Every scene the studio knows. Adding a scene = one file + one line here. */
export const SCENES: SceneDef[] = [
  gridScene,
  revealScene,
  iconScene,
  phoneScene,
  browserScene,
  screensScene,
  slideshowScene,
  bentoScene,
  typeScene,
  paletteScene,
  patternScene,
  signoffScene,
  endcardScene,
  blueprintScene,
  wordbuildScene,
  assembleScene,
  stackScene,
  socialScene,
  chromeScene,
  marqueeScene,
  flashScene,
  stingScene,
];

const byType = new Map(SCENES.map((s) => [s.type, s]));

export function sceneDef(type: string): SceneDef | undefined {
  return byType.get(type);
}

let uidCounter = 0;
export function newUid() {
  return `s${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
}

export function createScene(type: string, transition: TransitionKind = "fade", enabled = true): SceneInstance {
  const def = byType.get(type)!;
  return {
    uid: newUid(),
    type,
    enabled,
    duration: def.defaultDuration,
    transition,
    params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
  };
}

