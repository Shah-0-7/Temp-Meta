/**
 * @module server/providers/meta/shared
 *
 * Shared utilities for all Meta Model API providers:
 * - Auth, base URL, model ID from env
 * - Error normalization
 * - Retry with exponential backoff
 * - Rate-limit header parsing
 * - Credit tracking
 */

import { NotConfiguredError, RateLimitError, ProviderTimeoutError } from '@tryanywhere/engine';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MetaConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export function getMetaConfig(modelEnvKey: string): MetaConfig {
  const baseUrl = process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1';
  const apiKey = process.env.META_API_KEY ?? '';
  const modelId = process.env[modelEnvKey] ?? '';

  if (!apiKey) {
    throw new NotConfiguredError(
      `Meta (${modelEnvKey})`,
      `Set META_API_KEY env variable. See https://dev.meta.ai/docs`,
    );
  }

  return { baseUrl, apiKey, modelId };
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

export function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Rate-limit parsing
// ---------------------------------------------------------------------------

export interface RateLimitInfo {
  remaining?: number;
  resetMs?: number;
  limit?: number;
}

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  return {
    remaining: headers.has('x-ratelimit-remaining')
      ? parseInt(headers.get('x-ratelimit-remaining')!, 10)
      : undefined,
    resetMs: headers.has('x-ratelimit-reset')
      ? parseInt(headers.get('x-ratelimit-reset')!, 10) * 1000
      : undefined,
    limit: headers.has('x-ratelimit-limit')
      ? parseInt(headers.get('x-ratelimit-limit')!, 10)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

export async function withRetry<T>(
  providerName: string,
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, timeoutMs = 30_000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ProviderTimeoutError(providerName, timeoutMs)),
            timeoutMs,
          ),
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on NotConfigured
      if (err instanceof NotConfiguredError) throw err;

      // Don't retry past the last attempt
      if (attempt >= maxRetries) break;

      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[${providerName}] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        lastError.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

export class MetaAPIError extends Error {
  public readonly status: number;
  public readonly rateLimitInfo?: RateLimitInfo;

  constructor(message: string, status: number, rateLimitInfo?: RateLimitInfo) {
    super(message);
    this.name = 'MetaAPIError';
    this.status = status;
    this.rateLimitInfo = rateLimitInfo;
  }
}

export async function handleMetaResponse(
  providerName: string,
  response: Response,
): Promise<unknown> {
  const rateLimitInfo = parseRateLimitHeaders(response.headers);

  if (response.status === 429) {
    throw new RateLimitError(providerName, rateLimitInfo.resetMs);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown error');
    throw new MetaAPIError(
      `${providerName} API error (${response.status}): ${body}`,
      response.status,
      rateLimitInfo,
    );
  }

  return response.json();
}
