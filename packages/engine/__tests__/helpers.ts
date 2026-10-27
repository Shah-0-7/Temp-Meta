import type { Landmark } from '../src/tracking/types.js';
import { PoseIndex } from '../src/tracking/types.js';
import type { RgbaImage } from '../src/garment/cutout.js';

/** Synthetic flat-lay tee on a white background (sleeves out, collar notch, white graphic). */
export function makeTee(w = 400, h = 500, bg: [number, number, number] = [255, 255, 255]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255;
  }
  const fill = (x1: number, y1: number, x2: number, y2: number, c: [number, number, number]) => {
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    }
  };
  const red: [number, number, number] = [200, 40, 40];
  fill(120, 80, 280, 480, red);        // torso
  fill(40, 80, 120, 160, red);         // left sleeve
  fill(280, 80, 360, 160, red);        // right sleeve
  fill(180, 80, 220, 100, bg);         // collar notch
  fill(170, 250, 230, 320, [255, 255, 255]); // white graphic (interior, must stay)
  return { data, width: w, height: h };
}

/** Standing, facing the camera, RAW (un-mirrored) camera coordinates. Person's LEFT is on the image right. */
export function makePose(overrides: Partial<Record<keyof typeof PoseIndex, Partial<Landmark>>> = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const set = (k: keyof typeof PoseIndex, x: number, y: number) => { lm[PoseIndex[k]] = { x, y, z: 0, visibility: 0.99 }; };
  set('NOSE', 0.5, 0.18);
  set('LEFT_SHOULDER', 0.57, 0.3);  set('RIGHT_SHOULDER', 0.43, 0.3);
  set('LEFT_ELBOW', 0.6, 0.45);     set('RIGHT_ELBOW', 0.4, 0.45);
  set('LEFT_WRIST', 0.61, 0.58);    set('RIGHT_WRIST', 0.39, 0.58);
  set('LEFT_INDEX', 0.61, 0.62);    set('RIGHT_INDEX', 0.39, 0.62);
  set('LEFT_PINKY', 0.6, 0.61);     set('RIGHT_PINKY', 0.4, 0.61);
  set('LEFT_THUMB', 0.62, 0.6);     set('RIGHT_THUMB', 0.38, 0.6);
  set('LEFT_HIP', 0.54, 0.62);      set('RIGHT_HIP', 0.46, 0.62);
  for (const [k, v] of Object.entries(overrides)) {
    lm[PoseIndex[k as keyof typeof PoseIndex]] = { ...lm[PoseIndex[k as keyof typeof PoseIndex]], ...v };
  }
  return lm;
}
