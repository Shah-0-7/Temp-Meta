/**
 * @module server/routes/generate
 *
 * Tier B — Realistic Photo generation route handler.
 * Accepts person frame + garment image, invokes the configured TryOnGenerator,
 * and returns the synthesized photorealistic result.
 *
 * Privacy:
 * - Images are processed strictly in-memory.
 * - Discarded immediately after response generation.
 * - Zero disk persistence and zero payload logging.
 */

import type { Context } from 'hono';
import {
  MockTryOnGenerator,
  type TryOnRequest,
  type TryOnGenerator,
  type GarmentType,
  SUPPORTED_GARMENT_TYPES,
} from '@tryanywhere/engine';
import { MetaMuseImageGenerator } from '../providers/meta/muse-image.js';
import { safeFetch, SSRFError } from '../services/ssrfGuard.js';
import type { ServerConfig } from '../config.js';

// In-memory rate limiting per client IP: timestamp array
const ipRequests = new Map<string, number[]>();

function checkRateLimit(ip: string, maxRPM: number): { allowed: boolean; remaining: number; resetSec: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const cutoff = now - windowMs;

  const timestamps = (ipRequests.get(ip) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= maxRPM) {
    const oldest = timestamps[0];
    const resetSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    ipRequests.set(ip, timestamps);
    return { allowed: false, remaining: 0, resetSec };
  }

  timestamps.push(now);
  ipRequests.set(ip, timestamps);
  return { allowed: true, remaining: maxRPM - timestamps.length, resetSec: 60 };
}

/**
 * Helper to convert base64 (data URL or raw) to a Blob.
 */
function base64ToBlob(input: string, fallbackType = 'image/png'): Blob {
  let mimeType = fallbackType;
  let rawBase64 = input;

  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    rawBase64 = match[2];
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  return new Blob([buffer], { type: mimeType });
}

export function createGenerateHandler(config: ServerConfig) {
  return async (c: Context) => {
    // 1. Rate limiting
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const rate = checkRateLimit(clientIp, config.rateLimit.generateRPM);

    c.header('X-RateLimit-Limit', String(config.rateLimit.generateRPM));
    c.header('X-RateLimit-Remaining', String(rate.remaining));
    c.header('X-RateLimit-Reset', String(rate.resetSec));

    if (!rate.allowed) {
      c.header('Retry-After', String(rate.resetSec));
      return c.json({ error: 'Rate limit exceeded for photo generation. Please try again later.' }, 429);
    }

    const contentType = c.req.header('content-type') || '';
    let personFrameBlob: Blob | null = null;
    let garmentBlobs: Blob[] = [];
    let garmentType: GarmentType = 'top';
    let prompt: string | undefined;
    let options: Record<string, unknown> | undefined;

    try {
      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.parseBody({ all: true });

        // Person frame
        const personField = formData['personFrame'];
        if (personField instanceof Blob) {
          personFrameBlob = personField;
        } else if (typeof personField === 'string' && personField.length > 0) {
          personFrameBlob = base64ToBlob(personField);
        }

        // Garment images
        const garmentField = formData['garment'] ?? formData['garmentImage'];
        if (garmentField instanceof Blob) {
          garmentBlobs.push(garmentField);
        } else if (Array.isArray(garmentField)) {
          for (const item of garmentField) {
            if (item instanceof Blob) garmentBlobs.push(item);
          }
        } else if (typeof garmentField === 'string' && garmentField.length > 0) {
          garmentBlobs.push(base64ToBlob(garmentField));
        }

        // Garment URL fallback
        const garmentUrl = formData['garmentUrl'];
        if (garmentBlobs.length === 0 && typeof garmentUrl === 'string' && garmentUrl.length > 0) {
          const fetched = await safeFetch(garmentUrl, { timeoutMs: 8000, maxBytes: 10 * 1024 * 1024 });
          if (!fetched.ok) {
            return c.json({ error: `Failed to fetch garment image: HTTP ${fetched.status}` }, 422);
          }
          const buf = await fetched.arrayBuffer();
          const mime = fetched.headers.get('content-type') || 'image/png';
          garmentBlobs.push(new Blob([buf], { type: mime }));
        }

        // Garment type
        const typeField = formData['garmentType'];
        if (typeof typeField === 'string' && (SUPPORTED_GARMENT_TYPES as readonly string[]).includes(typeField)) {
          garmentType = typeField as GarmentType;
        }

        // Prompt & options
        if (typeof formData['prompt'] === 'string') {
          prompt = formData['prompt'];
        }
        if (typeof formData['options'] === 'string') {
          try {
            options = JSON.parse(formData['options']);
          } catch {
            // ignore malformed options json
          }
        }
      } else {
        // Assume JSON
        let json: any;
        try {
          json = await c.req.json();
        } catch {
          return c.json({ error: 'Invalid JSON request body' }, 400);
        }

        if (json.personFrame && typeof json.personFrame === 'string') {
          personFrameBlob = base64ToBlob(json.personFrame);
        }

        if (json.garmentImage && typeof json.garmentImage === 'string') {
          garmentBlobs.push(base64ToBlob(json.garmentImage));
        } else if (Array.isArray(json.garmentImages)) {
          for (const g of json.garmentImages) {
            if (typeof g === 'string') garmentBlobs.push(base64ToBlob(g));
          }
        } else if (json.garmentUrl && typeof json.garmentUrl === 'string') {
          const fetched = await safeFetch(json.garmentUrl, { timeoutMs: 8000, maxBytes: 10 * 1024 * 1024 });
          if (!fetched.ok) {
            return c.json({ error: `Failed to fetch garment image from URL: HTTP ${fetched.status}` }, 422);
          }
          const buf = await fetched.arrayBuffer();
          const mime = fetched.headers.get('content-type') || 'image/png';
          garmentBlobs.push(new Blob([buf], { type: mime }));
        }

        if (typeof json.garmentType === 'string' && (SUPPORTED_GARMENT_TYPES as readonly string[]).includes(json.garmentType)) {
          garmentType = json.garmentType as GarmentType;
        }

        if (typeof json.prompt === 'string') prompt = json.prompt;
        if (json.options && typeof json.options === 'object') options = json.options;
      }
    } catch (err) {
      if (err instanceof SSRFError) {
        return c.json({ error: `Garment URL blocked: ${err.message}` }, 422);
      }
      return c.json({ error: `Failed to parse request: ${(err as Error).message}` }, 400);
    }

    // Validation
    if (!personFrameBlob || personFrameBlob.size === 0) {
      return c.json({ error: 'Missing or empty "personFrame" (camera image is required)' }, 400);
    }

    if (garmentBlobs.length === 0) {
      return c.json({ error: 'Missing garment image (either garment, garmentImage, or garmentUrl is required)' }, 400);
    }

    // Select provider
    let generator: TryOnGenerator;
    if (config.providers.generator === 'meta-muse-image' && config.meta.apiKey) {
      try {
        generator = new MetaMuseImageGenerator();
        await generator.initialize();
      } catch (err) {
        console.warn('[generate] Meta Muse Image unavailable, falling back to mock:', err);
        generator = new MockTryOnGenerator();
        await generator.initialize();
      }
    } else {
      generator = new MockTryOnGenerator();
      await generator.initialize();
    }

    const startTime = Date.now();

    try {
      const request: TryOnRequest = {
        personFrame: personFrameBlob,
        garmentImages: garmentBlobs,
        garmentType,
        prompt,
        options,
      };

      const result = await generator.generate(request);
      const processingTime = Date.now() - startTime;

      // Convert result image Blob to Base64 Data URL
      const arrayBuffer = await result.image.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = result.image.type || 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64}`;

      c.header('X-Provider', generator.name);
      c.header('X-Processing-Time-Ms', String(processingTime));

      return c.json({
        success: true,
        image: dataUrl,
        editHandle: result.editHandle,
        metadata: {
          provider: generator.name,
          processingTimeMs: processingTime,
          creditsRemaining: rate.remaining,
          ...(result.metadata ?? {}),
        },
      });
    } catch (err) {
      console.error('[generate] Generation failed:', (err as Error).message);
      return c.json({ error: `Generation failed: ${(err as Error).message}` }, 500);
    } finally {
      // Discard in-memory references
      personFrameBlob = null;
      garmentBlobs = [];
    }
  };
}
