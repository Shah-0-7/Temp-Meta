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
  };

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
    },

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
    },
  };
}
