/**
 * @module __tests__/routes/generate.test
 *
 * Tests for POST /api/generate route handler.
 */

import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';

describe('POST /api/generate', () => {
  it('returns 400 when personFrame is missing', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garmentImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        garmentType: 'top',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('personFrame');
  });

  it('returns 400 when garment is missing', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personFrame: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        garmentType: 'top',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing garment image');
  });

  it('successfully generates realistic photo with JSON payload', async () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personFrame: tinyPng,
        garmentImage: tinyPng,
        garmentType: 'top',
        options: { mockDelay: 10 },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Provider')).toBe('mock');
    expect(res.headers.get('X-RateLimit-Limit')).toBeDefined();

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.image).toMatch(/^data:image\/png;base64,/);
    expect(data.metadata).toBeDefined();
    expect(data.metadata.provider).toBe('mock');
  });

  it('successfully generates realistic photo with multipart FormData', async () => {
    const formData = new FormData();
    const frameBlob = new Blob(['mock-camera-frame'], { type: 'image/png' });
    const garmentBlob = new Blob(['mock-garment-image'], { type: 'image/png' });

    formData.append('personFrame', frameBlob, 'frame.png');
    formData.append('garment', garmentBlob, 'garment.png');
    formData.append('garmentType', 'top');
    formData.append('options', JSON.stringify({ mockDelay: 10 }));

    const res = await app.request('/api/generate', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.image).toMatch(/^data:image\/png;base64,/);
  });
});
