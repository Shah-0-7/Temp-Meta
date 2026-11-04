/**
 * Live check for Meta Muse Image. Run it once with a real key:
 *
 *   META_API_KEY=LLM_... pnpm check:meta person.jpg garment.png
 *
 * Runs ONE real try-on through the same code the server uses and writes tryon-out.png.
 * It costs one image (Meta lists $0.01 per image). It answers the things the documentation
 * does not: whether your key and model id work, how long a render takes, and how good the
 * result is on a real photo of a person.
 */

import { loadEnv } from '../src/loadEnv.js';
import { readFile, writeFile } from 'node:fs/promises';
import { MuseImageBackend, redactKey } from '../src/services/museImage.js';
import { BackendError } from '../src/services/backendError.js';

loadEnv();
const key = process.env.META_API_KEY || process.env.MODEL_API_KEY || '';
const base = process.env.META_API_BASE_URL || 'https://api.meta.ai/v1';
const model = process.env.META_MODEL_MUSE_IMAGE || 'muse-image-1.0';
const [personPath, garmentPath, type = 'top'] = process.argv.slice(2);

async function main(): Promise<void> {
  console.log(`Base URL: ${base}`);
  console.log(`Model:    ${model}`);
  console.log(`Key:      ${key ? 'set' : 'NOT SET'}\n`);
  if (!key) {
    console.error('FAIL  Set META_API_KEY (create one in the Model API dashboard at https://dev.meta.ai/ , API keys tab).');
    process.exit(1);
  }
  if (!personPath || !garmentPath) {
    console.log('Pass a person photo and a garment image: pnpm check:meta person.jpg garment.png [top|outerwear]');
    return;
  }
  if (type !== 'top' && type !== 'outerwear') {
    console.error('FAIL  The garment type must be top or outerwear.');
    process.exit(1);
  }

  const backend = new MuseImageBackend({ apiKey: key, baseUrl: base, model, timeoutMs: 180_000 });
  console.log('Running one try-on...');
  const started = Date.now();
  const out = await backend.run({
    person: new Blob([new Uint8Array(await readFile(personPath))]),
    garment: new Blob([new Uint8Array(await readFile(garmentPath))]),
    garmentType: type,
  });
  await writeFile('tryon-out.png', out.bytes);
  console.log(`OK    ${out.contentType}, ${out.bytes.length} bytes in ${((Date.now() - started) / 1000).toFixed(1)} s -> tryon-out.png`);
  console.log('Open tryon-out.png and check: is it the same person, is the garment right, is the framing kept?');
}

main().catch((e: Error) => {
  const kind = e instanceof BackendError ? ` (${e.kind}${e.status ? `, HTTP ${e.status}` : ''})` : '';
  console.error(`FAIL  ${e.name}${kind}: ${redactKey(e.message)}`);
  if (e instanceof BackendError && e.kind === 'auth') console.error('      The key was rejected. Check META_API_KEY and that the account has access to Muse Image.');
  if (e instanceof BackendError && e.kind === 'quota') console.error('      Rate limited or out of credit. Check billing in the dashboard.');
  process.exit(1);
});
