#!/usr/bin/env node
/**
 * First-run self-check. Prints what is ready, what is missing and exactly how to fix it.
 *
 *   pnpm check:setup
 *
 * Exits 1 only for problems that stop the app from starting. Optional things
 * (offline models, Meta, Decart) are reported as notes.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'apps/web/public');
const has = (p) => existsSync(path.join(root, p));

let failed = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const note = (m, fix) => console.log(`  note  ${m}${fix ? `\n        -> ${fix}` : ''}`);
const bad = (m, fix) => {
  failed++;
  console.log(`  FAIL  ${m}${fix ? `\n        -> ${fix}` : ''}`);
};

console.log('\nTryAnywhere setup check\n');

// Node
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} is too old`, 'Install Node 20 or newer.');

// Dependencies
if (has('node_modules') && has('apps/web/node_modules')) ok('Dependencies installed');
else bad('Dependencies are not installed', 'Run: pnpm install');

// Offline tracking assets
const wasm = existsSync(path.join(pub, 'mediapipe/wasm/vision_wasm_internal.wasm'));
const models = ['pose_landmarker_full.task', 'selfie_multiclass_256x256.tflite'].every((f) =>
  existsSync(path.join(pub, 'models', f)),
);
if (wasm && models) ok('Tracking models are bundled locally (works offline)');
else note('Tracking models are not bundled; the app will download them from a public CDN on first use', 'Run: pnpm setup:assets');

// Samples
if (['tee-red-stripes', 'tee-navy-logo', 'tee-green-pocket'].every((n) => existsSync(path.join(pub, 'samples', `${n}.png`)))) {
  ok('Sample garments present');
} else {
  note('Sample garments are missing', 'Restore apps/web/public/samples from git.');
}

// Env
if (has('.env')) {
  ok('.env found');
  const env = Object.fromEntries(
    readFileSync(path.join(root, '.env'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  if (env.FEATURE_REALTIME_TRYON === 'true') {
    if (env.DECART_API_KEY) ok('Live AI try-on is enabled (Decart key set)');
    else bad('FEATURE_REALTIME_TRYON=true but DECART_API_KEY is empty', 'Add the key, or set the flag to false.');
  } else {
    note('Live AI try-on is off (default)');
  }
  if (env.META_API_KEY) note('META_API_KEY is set; the Meta providers are not wired in yet (milestone M6)');
} else {
  note('No .env file. That is fine: everything works without keys', 'Optional: copy .env.example to .env');
}

// Server
try {
  const res = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(1500) });
  if (res.ok) ok('Server is running on :3001');
  else note(`Server answered ${res.status}`);
} catch {
  note('Server is not running. Camera, tracking and sample garments still work; pasting product URLs needs it', 'Run: pnpm dev');
}

console.log(failed ? `\n${failed} problem(s) to fix before starting.\n` : '\nReady. Run: pnpm dev  then open http://localhost:5173\n');
process.exit(failed ? 1 : 0);
