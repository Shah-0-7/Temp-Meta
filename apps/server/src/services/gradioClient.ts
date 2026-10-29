/**
 * @module server/services/gradioClient
 *
 * A minimal client for the HTTP API every Gradio app (including Hugging Face Spaces)
 * exposes. It exists so the free try-on model can be called with no new dependency
 * (the lockfile stays valid) and so the whole flow is testable with a fake `fetch`.
 *
 * Verified against the Hugging Face docs ("Spaces as API endpoints"):
 *   POST {base}/gradio_api/call/{api_name}      body {"data":[...]}  -> {"event_id":"..."}
 *   GET  {base}/gradio_api/call/{api_name}/{id} -> Server-Sent Events: `event: complete` /
 *        `event: error` / `event: heartbeat`, each followed by a `data:` line (a JSON list of outputs).
 *   `Authorization: Bearer <token>` is optional and gives better limits on public Spaces.
 *
 * NOT verified from documentation (written from Gradio's own client behaviour; confirm with
 * `pnpm check:free-tryon`): the file upload step, `POST {base}/gradio_api/upload` with a multipart
 * `files` field returning a JSON list of server-side paths, which are then passed as
 * `{"path": <server path>, "meta": {"_type": "gradio.FileData"}}`.
 */

export type GradioErrorKind = 'quota' | 'timeout' | 'upstream' | 'bad-response';

export class GradioError extends Error {
  constructor(
    public readonly kind: GradioErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GradioError';
  }
}

export interface GradioClientOptions {
  /** e.g. https://franciszzj-leffa.hf.space (no trailing slash needed). */
  baseUrl: string;
  /** Gradio 5 uses "/gradio_api"; Gradio 4 used "". */
  apiPrefix?: string;
  /** Optional Hugging Face token. Only ever sent to `baseUrl`'s origin. */
  token?: string;
  fetchFn?: typeof fetch;
  /** Budget for the whole call, queue wait included. */
  timeoutMs?: number;
  /** Largest file this client will download back. */
  maxDownloadBytes?: number;
}

export interface GradioFile {
  path?: string;
  url?: string;
}

export interface Downloaded {
  bytes: Uint8Array;
  contentType: string;
}

const QUOTA_RE = /quota|zerogpu|gpu\s*limit|exceeded your/i;

/** Splits an SSE body into `{event, data}` records. */
export function parseSse(body: string): Array<{ event: string; data: string }> {
  const out: Array<{ event: string; data: string }> = [];
  for (const block of body.replace(/\r\n/g, '\n').split('\n\n')) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length || event !== 'message') out.push({ event, data: data.join('\n') });
  }
  return out;
}

export class GradioClient {
  private readonly _base: URL;
  private readonly _prefix: string;
  private readonly _token: string;
  private readonly _fetch: typeof fetch;
  private readonly _timeoutMs: number;
  private readonly _maxDownload: number;

  constructor(options: GradioClientOptions) {
    const base = new URL(options.baseUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === 'localhost')) {
      throw new Error('The Gradio base URL must be https.');
    }
    if (base.username || base.password) throw new Error('The Gradio base URL must not contain credentials.');
    this._base = base;
    this._prefix = (options.apiPrefix ?? '/gradio_api').replace(/\/$/, '');
    this._token = options.token ?? '';
    this._fetch = options.fetchFn ?? fetch;
    this._timeoutMs = options.timeoutMs ?? 120_000;
    this._maxDownload = options.maxDownloadBytes ?? 15 * 1024 * 1024;
  }

  get origin(): string {
    return this._base.origin;
  }

  private _url(path: string): string {
    return `${this._base.origin}${this._prefix}${path}`;
  }

  private _headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}), ...extra };
  }

  /** Uploads one file and returns its server-side path. */
  upload(blob: Blob, filename: string, signal?: AbortSignal): Promise<string> {
    return this._guard(signal, async (sig) => {
      const form = new FormData();
      form.append('files', blob, filename);
      const res = await this._send(this._url('/upload'), { method: 'POST', headers: this._headers(), body: form, signal: sig });
      const json = (await this._json(res)) as unknown;
      const path = Array.isArray(json) ? json[0] : undefined;
      if (typeof path !== 'string' || !path) throw new GradioError('bad-response', 'Unexpected upload response.');
      return path;
    });
  }

  /** Calls a named endpoint and resolves with its output list. */
  call(apiName: string, data: unknown[], signal?: AbortSignal): Promise<unknown[]> {
    return this._guard(signal, async (sig) => {
      const name = encodeURIComponent(apiName.replace(/^\//, ''));
      const submit = await this._send(this._url(`/call/${name}`), {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data }),
        signal: sig,
      });
      const submitted = (await this._json(submit)) as { event_id?: unknown };
      if (typeof submitted?.event_id !== 'string' || !submitted.event_id) {
        throw new GradioError('bad-response', 'The model service did not return an event id.');
      }

      const stream = await this._send(this._url(`/call/${name}/${encodeURIComponent(submitted.event_id)}`), {
        method: 'GET',
        headers: this._headers({ Accept: 'text/event-stream' }),
        signal: sig,
      });
      const events = parseSse(await this._text(stream));

      const failed = events.find((e) => e.event === 'error');
      if (failed) {
        let detail = failed.data;
        try {
          const parsed = JSON.parse(failed.data);
          if (typeof parsed === 'string') detail = parsed;
          else if (parsed && typeof parsed.message === 'string') detail = parsed.message;
        } catch {
          /* keep raw */
        }
        if (QUOTA_RE.test(detail)) throw new GradioError('quota', 'The free GPU quota is used up.');
        throw new GradioError('upstream', 'The model service reported an error.');
      }

      const done = events.find((e) => e.event === 'complete');
      if (!done) throw new GradioError('bad-response', 'The model service ended without a result.');
      try {
        const out = JSON.parse(done.data);
        if (!Array.isArray(out)) throw new Error('not a list');
        return out;
      } catch {
        throw new GradioError('bad-response', 'The model service returned an unreadable result.');
      }
    });
  }

  /** Builds the FileData object Gradio expects for an uploaded path. */
  static fileData(path: string): { path: string; meta: { _type: 'gradio.FileData' } } {
    return { path, meta: { _type: 'gradio.FileData' } };
  }

  /** Downloads a file the app returned. Refuses any host other than the Space's own. */
  download(file: GradioFile, signal?: AbortSignal): Promise<Downloaded> {
    return this._guard(signal, async (sig) => {
      let target: URL;
      try {
        if (file.url) target = new URL(file.url);
        else if (file.path) target = new URL(this._url(`/file=${file.path.replace(/^\//, '')}`));
        else throw new Error('empty');
      } catch {
        throw new GradioError('bad-response', 'The result had no usable file location.');
      }
      if (target.origin !== this._base.origin) {
        // Never follow a result to another host: it would turn this server into an open fetcher.
        throw new GradioError('bad-response', 'The result pointed to a different host.');
      }

      const res = await this._send(target.toString(), { method: 'GET', headers: this._headers(), signal: sig });
      const type = res.headers.get('content-type') ?? '';
      if (!/^image\//i.test(type)) throw new GradioError('bad-response', 'The result was not an image.');
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > this._maxDownload) throw new GradioError('bad-response', 'The result image is too large.');
      const bytes = new Uint8Array(await this._buffer(res));
      if (bytes.byteLength === 0 || bytes.byteLength > this._maxDownload) {
        throw new GradioError('bad-response', 'The result image had an unexpected size.');
      }
      return { bytes, contentType: type.split(';')[0].trim() };
    });
  }

  // -- internals -----------------------------------------------------------

  /**
   * Runs one whole operation (requests AND body reads) under a single deadline and the
   * caller's abort signal, and turns any failure into a GradioError.
   */
  private async _guard<T>(signal: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onCallerAbort, { once: true });
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this._timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      if (err instanceof GradioError) throw err;
      const name = (err as Error)?.name;
      if (timedOut || name === 'TimeoutError' || name === 'AbortError') {
        throw new GradioError('timeout', 'The model service took too long.');
      }
      throw new GradioError('upstream', 'The model service could not be reached.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private async _send(url: string, init: RequestInit): Promise<Response> {
    const res = await this._fetch(url, { ...init, redirect: 'error' });
    if (res.status === 429) throw new GradioError('quota', 'The model service is rate limiting requests.', 429);
    if (!res.ok) throw new GradioError('upstream', `The model service answered ${res.status}.`, res.status);
    return res;
  }

  private async _json(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new GradioError('bad-response', 'The model service returned invalid JSON.');
    }
  }

  private _text(res: Response): Promise<string> {
    return res.text();
  }

  private _buffer(res: Response): Promise<ArrayBuffer> {
    return res.arrayBuffer();
  }
}
