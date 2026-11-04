/**
 * @module server/services/backendError
 *
 * The one error type every try-on backend throws, so the route can answer the browser the
 * same way whichever model is behind it, and so a chain of backends knows when to move on.
 */

export type BackendErrorKind =
  /** Out of free quota, credits, or rate limited: try another backend or later. */
  | 'quota'
  /** Took too long. */
  | 'timeout'
  /** The service failed or could not be reached. */
  | 'upstream'
  /** The service answered with something unusable. */
  | 'bad-response'
  /** The model refused the content. Never retried elsewhere: another model would just be sent the same photo. */
  | 'policy'
  /** Our credentials were rejected. A configuration problem, logged on the server and never shown to the browser. */
  | 'auth';

export class BackendError extends Error {
  constructor(
    public readonly kind: BackendErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

/**
 * Runs one whole operation under a single deadline and the caller's abort signal, and turns
 * an abort or timeout into a `timeout` BackendError. Other errors pass through unchanged.
 */
export async function withDeadline<T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
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
  }, timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (err instanceof BackendError) throw err;
    const name = (err as Error)?.name;
    if (timedOut || name === 'TimeoutError' || name === 'AbortError') {
      throw new BackendError('timeout', 'The model service took too long.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
