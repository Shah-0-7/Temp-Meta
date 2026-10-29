/**
 * @module server/config
 *
 * Centralized server configuration from environment variables.
 */

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  isDev: boolean;
  /** Shorthand for proxy.hmacSecret — used by route handlers directly. */
  proxySecret: string;

  // Meta Model API
  meta: {
    baseUrl: string;
    apiKey: string;
    modelSam: string;
    modelSpark: string;
    modelMuseImage: string;
  };

  // Decart (optional)
  decart: {
    apiKey: string;
    featureEnabled: boolean;
    model: string;
    /** Hard cap on one live session. */
    maxSessionSeconds: number;
  };

  // Free hosted try-on model (Leffa on a Hugging Face Space). On when PROVIDER_GENERATOR=leffa-space.
  freeTryOn: {
    enabled: boolean;
    spaceUrl: string;
    /** Gradio endpoint name; the Space sets none, so this is the function name by default. */
    apiName: string;
    /** Optional Hugging Face token: raises limits. Server-side only. */
    hfToken: string;
    timeoutMs: number;
    maxConcurrent: number;
  };

  /** Browser origins allowed to call the API (also restricts Decart tokens in production). */
  allowedOrigins: string[];

  // Provider selection
  providers: {
    segmenter: string;
    understanding: string;
    normalizer: string;
    generator: string;
    realtime: string;
  };

  // Image proxy
  proxy: {
    hmacSecret: string;
    maxSizeMB: number;
  };

  // Rate limiting
  rateLimit: {
    resolveRPM: number;
    generateRPM: number;
    /** Live-session token requests per minute per client. */
    tokenRPM: number;
  };
}

export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    isDev: (process.env.NODE_ENV ?? 'development') === 'development',
    proxySecret: process.env.PROXY_HMAC_SECRET ?? 'dev-secret-change-in-production',

    meta: {
      baseUrl: process.env.META_API_BASE_URL ?? 'https://api.meta.ai/v1',
      apiKey: process.env.META_API_KEY ?? '',
      modelSam: process.env.META_MODEL_SAM ?? 'sam-3.1',
      modelSpark: process.env.META_MODEL_SPARK ?? 'muse-spark-1.3',
      modelMuseImage: process.env.META_MODEL_MUSE_IMAGE ?? 'muse-image-1.0',
    },

    decart: {
      apiKey: process.env.DECART_API_KEY ?? '',
      featureEnabled: process.env.FEATURE_REALTIME_TRYON === 'true',
      model: process.env.DECART_MODEL || 'lucy-vton-latest',
      maxSessionSeconds: parseInt(process.env.REALTIME_MAX_SESSION_SECONDS ?? '300', 10),
    },

    freeTryOn: {
      enabled: (process.env.PROVIDER_GENERATOR ?? '') === 'leffa-space',
      spaceUrl: process.env.FREE_TRYON_SPACE_URL || 'https://franciszzj-leffa.hf.space',
      apiName: process.env.FREE_TRYON_API_NAME || 'leffa_predict_vt',
      hfToken: process.env.HF_TOKEN ?? '',
      timeoutMs: parseInt(process.env.FREE_TRYON_TIMEOUT_MS ?? '150000', 10),
      maxConcurrent: parseInt(process.env.FREE_TRYON_MAX_CONCURRENT ?? '2', 10),
    },

    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),

    providers: {
      segmenter: process.env.PROVIDER_SEGMENTER ?? 'browser-sam',
      understanding: process.env.PROVIDER_UNDERSTANDING ?? 'heuristic',
      normalizer: process.env.PROVIDER_NORMALIZER ?? 'cutout-only',
      generator: process.env.PROVIDER_GENERATOR ?? 'mock',
      realtime: process.env.PROVIDER_REALTIME ?? 'null',
    },

    proxy: {
      hmacSecret: process.env.PROXY_HMAC_SECRET ?? 'dev-secret-change-in-production',
      maxSizeMB: parseInt(process.env.PROXY_MAX_SIZE_MB ?? '10', 10),
    },

    rateLimit: {
      resolveRPM: parseInt(process.env.RATE_LIMIT_RESOLVE_RPM ?? '30', 10),
      generateRPM: parseInt(process.env.RATE_LIMIT_GENERATE_RPM ?? '10', 10),
      tokenRPM: parseInt(process.env.RATE_LIMIT_TOKEN_RPM ?? '6', 10),
    },
  };
}
