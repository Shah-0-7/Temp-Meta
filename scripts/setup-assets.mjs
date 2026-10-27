#!/usr/bin/env node
/**
 * Puts MediaPipe's WASM runtime and the body-tracking models next to the web app
 * (apps/web/public), so tracking starts instantly, works offline, and makes no
 * third-party requests at runtime.
 *
 *   pnpm setup:assets
 *
 * Safe to run any time; skips files that already exist; NEVER fails the install
 * (the app falls back to the public CDN when these files are missing).
 */
import { cp, mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'apps/web/public');

const MODELS = {
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  'selfie_multiclass_256x256.tflite':
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};

const exists = (p) => stat(p).then(() => true, () => false);

async function copyWasm() {
  const dest = path.join(publicDir, 'mediapipe/wasm');
  if (await exists(path.join(dest, 'vision_wasm_internal.wasm'))) {
    console.log('✓ MediaPipe WASM already in place');
    return;
  }
  try {
    const require = createRequire(path.join(root, 'packages/engine/package.json'));
    const pkgJson = require.resolve('@mediapipe/tasks-vision/package.json');
    const src = path.join(path.dirname(pkgJson), 'wasm');
    await mkdir(dest, { recursive: true });
    await cp(src, dest, { recursive: true });
    const { version } = JSON.parse(await readFile(pkgJson, 'utf8'));
    await writeFile(path.join(dest, 'VERSION'), `${version}\n`);
    console.log(`✓ Copied MediaPipe WASM (${version})`);
  } catch (err) {
    console.warn(`! Could not copy the MediaPipe WASM (${err.message}). Run "pnpm install" first; the app will use the CDN.`);
  }
}

async function downloadModels() {
  const dir = path.join(publicDir, 'models');
  await mkdir(dir, { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const file = path.join(dir, name);
    if (await exists(file)) {
      console.log(`✓ ${name} already downloaded`);
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      console.log(`✓ Downloaded ${name}`);
    } catch (err) {
      console.warn(`! Could not download ${name} (${err.message}); the app will fetch it from the CDN at runtime.`);
    }
  }
}

await copyWasm();
await downloadModels();
