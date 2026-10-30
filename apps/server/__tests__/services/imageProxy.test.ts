import { describe, it, expect } from 'vitest';
import { signProxyUrl, verifyProxySignature, buildProxyUrl } from '../../src/services/imageProxy';

describe('image proxy signatures', () => {
  const secret = 'test-secret';
  const url = 'https://cdn.example.com/p.jpg?w=800&h=1000';

  it('accepts the signature it issued', () => {
    const sig = signProxyUrl(url, secret);
    expect(verifyProxySignature(url, sig, secret)).toBe(true);
  });

  it('rejects a different URL, a different secret and a malformed signature', () => {
    const sig = signProxyUrl(url, secret);
    expect(verifyProxySignature(url + '&x=1', sig, secret)).toBe(false);
    expect(verifyProxySignature(url, sig, 'other-secret')).toBe(false);
    expect(verifyProxySignature(url, '', secret)).toBe(false);
    expect(verifyProxySignature(url, sig.slice(0, 8), secret)).toBe(false);
  });

  it('builds a URL whose query round-trips', () => {
    const built = new URL(buildProxyUrl(url, secret, 'https://api.example.com'));
    expect(built.pathname).toBe('/api/proxy');
    expect(built.searchParams.get('url')).toBe(url);
    expect(verifyProxySignature(built.searchParams.get('url')!, built.searchParams.get('sig')!, secret)).toBe(true);
  });
});
