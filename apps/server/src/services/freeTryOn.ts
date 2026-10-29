/**
 * @module server/services/freeTryOn
 *
 * `POST /api/generate`: Tier B realistic photo through a FREE hosted open model
 * (Leffa, MIT licence, running as a Hugging Face Space). Replaces the Meta Muse Image
 * plan for now; Meta stays parked on the `m6-meta-wip` branch.
 *
 * Framework-agnostic (Web `Request` -> `Response`) so it is testable without Hono.
 * The browser sends two images; this server relays them to the Space, so the optional
 * Hugging Face token never reaches the client, uploads are validated, and the
 * free-tier quota is protected with a rate limit and a concurrency cap.
 *
 * Leffa call shape, from the Space's app.py (franciszzj/Leffa): `leffa_predict_vt(
 *   person_image, garment_image, ref_acceleration, step, scale, seed, model_type,
 *   garment_type, repaint)` returning (generated_image, mask, densepose). The Space
 * sets no explicit `api_name`, so Gradio's default (the function name) is assumed
 * and is configurable. Confirm it live with `pnpm check:free-tryon`.
 */

import { GradioClient, GradioError, type GradioFile } from './gradioClient.js';
import { RateLimiter, clientKey } from './rateLimit.js';

export type TryOnGarmentType = 'top' | 'outerwear' | 'bottom' | 'dress' | 'hat' | 'glasses' | 'shoes';

export interface TryOnBackendInput {
  person: Blob;
  garment: Blob;
  garmentType: TryOnGarmentType;
}

export interface TryOnBackendOutput {
  bytes: Uint8Array;
  contentType: string;
}

export interface TryOnBackend {
  /** Shown to the user, e.g. "Leffa (Hugging Face Space)". */
  readonly label: string;
  supports(type: TryOnGarmentType): boolean;
  run(input: TryOnBackendInput, signal?: AbortSignal): Promise<TryOnBackendOutput>;
}

// ---------------------------------------------------------------------------
// Leffa backend
// ---------------------------------------------------------------------------

export interface LeffaOptions {
  client: GradioClient;
  /** Gradio endpoint name. Default is the function name. */
  apiName?: string;
}

/** Leffa's UI defaults (app.py): step 30, scale 2.5, seed 42, viton_hd, no acceleration, no repaint. */
const LEFFA_DEFAULTS = { acceleration: false, step: 30, scale: 2.5, seed: 42, modelType: 'viton_hd', repaint: false };

export class LeffaSpaceBackend implements TryOnBackend {
  readonly label = 'Leffa (free Hugging Face Space)';
  private readonly _client: GradioClient;
  private readonly _apiName: string;

  constructor(options: LeffaOptions) {
    this._client = options.client;
    this._apiName = options.apiName ?? 'leffa_predict_vt';
  }

  /** Only the upper-body option is confirmed from the Space source, so only tops and jackets. */
  supports(type: TryOnGarmentType): boolean {
    return type === 'top' || type === 'outerwear';
  }

  async run(input: TryOnBackendInput, signal?: AbortSignal): Promise<TryOnBackendOutput> {
    const [personPath, garmentPath] = [
      await this._client.upload(input.person, 'person.jpg', signal),
      await this._client.upload(input.garment, 'garment.png', signal),
    ];
    const out = await this._client.call(
      this._apiName,
      [
        GradioClient.fileData(personPath),
        GradioClient.fileData(garmentPath),
        LEFFA_DEFAULTS.acceleration,
        LEFFA_DEFAULTS.step,
        LEFFA_DEFAULTS.scale,
        LEFFA_DEFAULTS.seed,
        LEFFA_DEFAULTS.modelType,
        'upper_body',
        LEFFA_DEFAULTS.repaint,
      ],
      signal,
    );
    // Outputs are [generated image, mask, densepose]; only the first is used.
    const first = out[0] as GradioFile | null | undefined;
    if (!first || typeof first !== 'object') throw new GradioError('bad-response', 'The model returned no image.');
    return this._client.download(first, signal);
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface GenerateRouteDeps {
  /** False when no free model is configured. */
  enabled: boolean;
  backend: TryOnBackend | null;
  limiter: RateLimiter;
  /** Parallel upstream jobs allowed, to protect the small free quota. */
  maxConcurrent?: number;
  /** Largest accepted upload (each image). Default 8 MB. */
  maxImageBytes?: number;
}

const GARMENT_TYPES: readonly string[] = ['top', 'outerwear', 'bottom', 'dress', 'hat', 'glasses', 'shoes'];

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

const fail = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  json(status, { error: { code, message } }, headers);

/** Confirms the bytes really are PNG, JPEG or WebP instead of trusting the declared type. */
export function sniffImage(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

let inFlight = 0;

export async function handleGenerate(req: Request, deps: GenerateRouteDeps): Promise<Response> {
  if (!deps.enabled || !deps.backend) {
    return fail(404, 'feature_disabled', 'AI try-on is not enabled on this server.');
  }
  const backend = deps.backend;
  const maxBytes = deps.maxImageBytes ?? 8 * 1024 * 1024;
  const maxConcurrent = deps.maxConcurrent ?? 2;

  const rate = deps.limiter.check(clientKey(req));
  if (!rate.allowed) {
    return fail(429, 'rate_limited', 'Too many AI renders. Wait a moment and try again.', {
      'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)),
    });
  }

  // Reject oversized bodies before parsing them. A missing length is refused too, so the limit cannot be skipped.
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, 'length_required', 'Content-Length is required.');
  if (declared > maxBytes * 2 + 64 * 1024) return fail(413, 'too_large', 'The images are too large.');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'bad_request', 'Send the images as multipart form data.');
  }

  const person = form.get('person');
  const garment = form.get('garment');
  const type = String(form.get('garmentType') ?? 'top');
  if (!(person instanceof Blob) || !(garment instanceof Blob)) {
    return fail(400, 'bad_request', 'Both a "person" and a "garment" image are required.');
  }
  if (!GARMENT_TYPES.includes(type)) return fail(400, 'bad_request', 'Unknown garment type.');
  if (!backend.supports(type as TryOnGarmentType)) {
    return fail(422, 'unsupported_garment', 'The AI model cannot render this kind of garment yet.');
  }
  if (person.size > maxBytes || garment.size > maxBytes || person.size === 0 || garment.size === 0) {
    return fail(413, 'too_large', 'Each image must be under 8 MB.');
  }
  for (const blob of [person, garment]) {
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (!sniffImage(head)) return fail(415, 'bad_image', 'Only PNG, JPEG or WebP images are accepted.');
  }

  if (inFlight >= maxConcurrent) {
    return fail(503, 'busy', 'The AI model is busy. Try again in a few seconds.', { 'Retry-After': '10' });
  }

  inFlight++;
  try {
    const result = await backend.run({ person, garment, garmentType: type as TryOnGarmentType }, req.signal);
    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Provider': backend.label,
        'Access-Control-Expose-Headers': 'X-Provider',
      },
    });
  } catch (err) {
    // The reason is logged server-side only; the browser gets a generic, safe message.
    console.error('[generate]', (err as Error).name, String((err as Error).message).replace(/hf_\w+/g, 'hf_[redacted]'));
    if (err instanceof GradioError) {
      if (err.kind === 'quota') {
        return fail(429, 'quota_exhausted', 'The free AI model has hit its usage limit for now.', { 'Retry-After': '300' });
      }
      if (err.kind === 'timeout') return fail(504, 'timeout', 'The AI model took too long to answer.');
    }
    return fail(502, 'upstream_failed', 'The AI model could not produce a result.');
  } finally {
    inFlight--;
  }
}

/** Test hook: the in-flight counter is module state. */
export function _resetInFlightForTests(): void {
  inFlight = 0;
}
