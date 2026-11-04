/**
 * @module server/services/museImage
 *
 * Tier B realistic photo through Meta's Muse Image on the Meta Model API.
 *
 * Verified against Meta's documentation (dev.meta.ai/docs/image-generation, /docs/pricing-rate-limits,
 * /docs/error-handling, read 2026-11):
 *   POST https://api.meta.ai/v1/images/edits    Authorization: Bearer <key>   JSON body
 *   { model: "muse-image-1.0", prompt, images: [{ image_url: "data:<mime>;base64,..." }, ...1 to 10],
 *     n, size: "WxH" (aspect ratio only), response_format: "b64_json" | "url", output_format }
 *   200 -> { data: [{ b64_json }], output_format, usage }
 *   400 invalid_request_error / content_policy_violation, 401/402/403, 413, 415,
 *   429 (Retry-After), 500, 503 (Retry-After, retry with backoff), 504 (do not just retry).
 *   Rate limit for muse-image-1.0: 150 requests per minute per team. Price: $0.01 per image.
 *
 * NOT verified (the docs do not say): the largest accepted input image, how well the model keeps
 * a person's identity on a try-on prompt, and typical latency. `pnpm check:meta` runs one real
 * render so those can be judged.
 */

import { BackendError, withDeadline } from './backendError.js';
import { imageSize, sizeStringLike } from './imageSize.js';
import { sniffImage, type TryOnBackend, type TryOnBackendInput, type TryOnBackendOutput, type TryOnGarmentType } from './freeTryOn.js';
import { buildTryOnPrompt } from '../prompts/tryon-v1.js';

export interface MuseImageOptions {
  apiKey: string;
  /** Default https://api.meta.ai/v1 */
  baseUrl?: string;
  /** Default muse-image-1.0 */
  model?: string;
  /** Budget for the whole render, retries included. Default 120 s. */
  timeoutMs?: number;
  /** Extra attempts after a 429, 500 or 503. Default 2. */
  maxRetries?: number;
  /** Longest side asked for; the API treats `size` as an aspect ratio. Default 1536 (the blog says output is high quality up to 1600 px). */
  longSide?: number;
  fetchFn?: typeof fetch;
  /** Replaceable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
/** A Retry-After longer than this is reported as "busy" instead of holding the person's request open. */
const MAX_WAIT_MS = 10_000;
const MAX_RESULT_BYTES = 25 * 1024 * 1024;

/** Replaces anything shaped like a Meta key so it can never reach a log. */
export function redactKey(text: string): string {
  return text.replace(/LLM_[A-Za-z0-9_.\-~]+/g, 'LLM_[redacted]');
}

export class MuseImageBackend implements TryOnBackend {
  readonly label = 'Meta Muse Image';
  private readonly _base: URL;
  private readonly _o: Required<Omit<MuseImageOptions, 'baseUrl' | 'fetchFn' | 'sleep'>> & {
    fetchFn: typeof fetch;
    sleep: (ms: number) => Promise<void>;
  };

  constructor(options: MuseImageOptions) {
    if (!options.apiKey) throw new Error('A Meta API key is required.');
    const base = new URL(options.baseUrl ?? 'https://api.meta.ai/v1');
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === 'localhost')) {
      throw new Error('The Meta API base URL must be https.');
    }
    if (base.username || base.password) throw new Error('The Meta API base URL must not contain credentials.');
    this._base = base;
    this._o = {
      apiKey: options.apiKey,
      model: options.model ?? 'muse-image-1.0',
      timeoutMs: options.timeoutMs ?? 120_000,
      maxRetries: options.maxRetries ?? 2,
      longSide: options.longSide ?? 1536,
      fetchFn: options.fetchFn ?? fetch,
      sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    };
  }

  /** Same scope as the rest of the product: tops and jackets. */
  supports(type: TryOnGarmentType): boolean {
    return type === 'top' || type === 'outerwear';
  }

  async run(input: TryOnBackendInput, signal?: AbortSignal): Promise<TryOnBackendOutput> {
    const person = new Uint8Array(await input.person.arrayBuffer());
    const garment = new Uint8Array(await input.garment.arrayBuffer());
    const personKind = sniffImage(person);
    const garmentKind = sniffImage(garment);
    if (!personKind || !garmentKind) throw new BackendError('bad-response', 'An input was not a supported image.');

    const size = sizeStringLike(imageSize(person), this._o.longSide);
    const body: Record<string, unknown> = {
      model: this._o.model,
      prompt: buildTryOnPrompt({ garmentType: input.garmentType }),
      // The prompt names the roles: first the garment, then the person.
      images: [
        { image_url: dataUrl(garment, MIME[garmentKind]) },
        { image_url: dataUrl(person, MIME[personKind]) },
      ],
      n: 1,
      response_format: 'b64_json',
      output_format: 'png',
    };
    if (size) body.size = size;

    return withDeadline(signal, this._o.timeoutMs, async (sig) => {
      const json = await this._post('/images/edits', body, sig);
      const first = (json as { data?: Array<{ b64_json?: unknown }> })?.data?.[0];
      const b64 = typeof first?.b64_json === 'string' ? first.b64_json : '';
      if (!b64) throw new BackendError('bad-response', 'The model returned no image.');
      if (b64.length > MAX_RESULT_BYTES * 1.4) throw new BackendError('bad-response', 'The result image is too large.');

      const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
      const kind = sniffImage(bytes);
      if (!kind || bytes.length === 0 || bytes.length > MAX_RESULT_BYTES) {
        throw new BackendError('bad-response', 'The model returned something that is not an image.');
      }
      return { bytes, contentType: MIME[kind], provider: this.label };
    });
  }

  /** POST with retry on 429/500/503. Everything else maps straight to a BackendError. */
  private async _post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    const url = `${this._base.origin}${this._base.pathname.replace(/\/$/, '')}${path}`;
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this._o.fetchFn(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this._o.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: payload,
          signal,
          redirect: 'error',
        });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError') throw err;
        throw new BackendError('upstream', 'The Meta service could not be reached.');
      }

      if (res.ok) {
        try {
          return await res.json();
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err;
          throw new BackendError('bad-response', 'The Meta service returned invalid JSON.');
        }
      }

      const detail = await readError(res);
      const retryable = res.status === 429 || res.status === 500 || res.status === 503;
      if (retryable && attempt < this._o.maxRetries) {
        const wait = waitFor(res, attempt);
        // A long Retry-After means "come back later", which is not worth keeping the person waiting for.
        if (wait <= MAX_WAIT_MS) {
          await this._o.sleep(wait);
          continue;
        }
      }
      throw toBackendError(res.status, detail);
    }
  }
}

function dataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

interface ApiError {
  type?: string;
  code?: string | null;
  message?: string;
  param?: string | null;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text);
    const e = parsed?.error;
    if (e && typeof e === 'object') {
      return { type: e.type, code: e.code, param: e.param, message: typeof e.message === 'string' ? redactKey(e.message) : undefined };
    }
  } catch {
    /* an empty or non-JSON error body */
  }
  return {};
}

/** Retry-After in ms if the header is sensible; otherwise exponential backoff with jitter (0.5 s, 1 s, ...). */
function waitFor(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 500 * 2 ** attempt + Math.floor(Math.random() * 500);
}

export function toBackendError(status: number, e: ApiError): BackendError {
  // Logged on the server; the browser only ever sees a generic message.
  console.error('[muse-image]', status, e.type ?? '', e.code ?? '', e.param ?? '', e.message ?? '');

  if (status === 400 && (e.type === 'content_policy_violation' || e.code === 'content_policy_violation')) {
    return new BackendError('policy', 'The model declined this image.', status);
  }
  if (status === 429 || status === 402) return new BackendError('quota', 'The Meta service is rate limiting or out of credit.', status);
  if (status === 401 || status === 403) return new BackendError('auth', 'The Meta API key was rejected.', status);
  if (status === 504) return new BackendError('timeout', 'The Meta service took too long.', status);
  return new BackendError('upstream', `The Meta service answered ${status}.`, status);
}
