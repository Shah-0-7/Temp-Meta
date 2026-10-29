/**
 * Live check for the free try-on model. Run it once on a machine with internet:
 *
 *   pnpm check:free-tryon                       # lists the Space's API endpoints
 *   pnpm check:free-tryon person.jpg garment.png  # also runs one real try-on, writes tryon-out.png
 *
 * Reads FREE_TRYON_SPACE_URL, FREE_TRYON_API_NAME and HF_TOKEN (optional) from the environment.
 * This is what confirms the parts that could not be verified from documentation: the endpoint
 * name and the file-upload step. It uses a lot of free GPU quota per run (about 30 s of GPU).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { GradioClient } from '../src/services/gradioClient.js';
import { LeffaSpaceBackend } from '../src/services/freeTryOn.js';

const base = process.env.FREE_TRYON_SPACE_URL || 'https://franciszzj-leffa.hf.space';
const apiName = process.env.FREE_TRYON_API_NAME || 'leffa_predict_vt';
const token = process.env.HF_TOKEN ?? '';
const [personPath, garmentPath] = process.argv.slice(2);

async function main(): Promise<void> {
  console.log(`Space:    ${base}`);
  console.log(`Endpoint: ${apiName}`);
  console.log(`Token:    ${token ? 'set (quota of your HF account is used)' : 'not set (shared anonymous quota)'}\n`);

  const res = await fetch(`${base}/gradio_api/openapi.json`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30_000),
  }).catch((e: Error) => {
    console.error(`FAIL  could not reach the Space: ${e.message}`);
    return null;
  });
  if (!res) process.exit(1);
  if (!res.ok) {
    console.error(`FAIL  ${base}/gradio_api/openapi.json answered ${res.status}. The Space may be asleep, renamed or private.`);
    process.exit(1);
  }
  const spec = (await res.json()) as { paths?: Record<string, unknown> };
  const calls = Object.keys(spec.paths ?? {}).filter((p) => p.includes('/call/'));
  console.log('Endpoints the Space exposes:');
  for (const p of calls) console.log(`  ${p}`);

  const found = calls.some((p) => p.endsWith(`/call/${apiName}`));
  console.log(found ? `\nOK    "${apiName}" exists.` : `\nFAIL  "${apiName}" is not in that list. Set FREE_TRYON_API_NAME to the right one.`);
  if (!found) process.exit(1);

  if (!personPath || !garmentPath) {
    console.log('\nPass a person photo and a garment image to run one real try-on.');
    return;
  }

  const backend = new LeffaSpaceBackend({
    client: new GradioClient({ baseUrl: base, token, timeoutMs: 180_000 }),
    apiName,
  });
  console.log('\nRunning one try-on (can queue for a minute)...');
  const started = Date.now();
  const out = await backend.run({
    person: new Blob([new Uint8Array(await readFile(personPath))]),
    garment: new Blob([new Uint8Array(await readFile(garmentPath))]),
    garmentType: 'top',
  });
  await writeFile('tryon-out.png', out.bytes);
  console.log(`OK    ${out.contentType}, ${out.bytes.length} bytes in ${((Date.now() - started) / 1000).toFixed(1)} s -> tryon-out.png`);
}

main().catch((e: Error) => {
  console.error(`FAIL  ${e.name}: ${e.message}`);
  process.exit(1);
});
