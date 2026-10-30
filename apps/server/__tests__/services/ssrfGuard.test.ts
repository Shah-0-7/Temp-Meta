/**
 * @module __tests__/services/ssrfGuard.test
 *
 * The guard that protects the server from being used to reach private networks. Uses real
 * local HTTP servers (no external network) and a guard instance with a relaxed address policy.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import {
  createSafeFetch,
  isPrivateIP,
  safeFetch,
  SSRFError,
  ResponseTooLargeError,
} from '../../src/services/ssrfGuard';

describe('isPrivateIP', () => {
  const blocked = [
    '127.0.0.1', '127.255.255.254', '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255',
    '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    '::', '::1', '[::1]', 'fe80::1', 'fe80::abcd%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1',
    '2002:7f00:1::1', '2001:db8::1', '2001::1', '::127.0.0.1', 'fec0::1',
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => expect(isPrivateIP(ip)).toBe(true));
  }

  const allowed = [
    '8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255',
    '100.128.0.1', '192.0.3.1', '198.17.255.255', '198.20.0.1', '223.255.255.255',
    '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1',
  ];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => expect(isPrivateIP(ip)).toBe(false));
  }

  it('treats plain hostnames as "not an IP literal" (they are checked at connect time)', () => {
    expect(isPrivateIP('example.com')).toBe(false);
    expect(isPrivateIP('localhost')).toBe(false);
  });
});

describe('safeFetch (production policy)', () => {
  const cases: Array<[string, string]> = [
    ['loopback', 'http://127.0.0.1/'],
    ['decimal loopback', 'http://2130706433/'],
    ['hex loopback', 'http://0x7f.1/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['IPv4-mapped IPv6', 'http://[::ffff:127.0.0.1]/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['private range', 'http://192.168.0.10/'],
    ['file scheme', 'file:///etc/passwd'],
    ['ftp scheme', 'ftp://example.com/'],
    ['embedded credentials', 'http://user:pass@example.com/'],
    ['unusual port', 'http://example.com:22/'],
    ['localhost by name', 'http://localhost/'],
  ];
  for (const [name, url] of cases) {
    it(`refuses ${name}`, async () => {
      await expect(safeFetch(url, { timeoutMs: 3000 })).rejects.toBeInstanceOf(SSRFError);
    });
  }
});

describe('guarded fetch against a local server', () => {
  let server: http.Server;
  let base: string;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url ?? '');
      const url = req.url ?? '/';
      if (url === '/ok') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hello');
      } else if (url === '/redirect-ok') {
        res.writeHead(302, { Location: '/ok' });
        res.end();
      } else if (url === '/redirect-private') {
        res.writeHead(302, { Location: 'http://127.0.0.2:' + port + '/ok' });
        res.end();
      } else if (url === '/loop') {
        res.writeHead(302, { Location: '/loop' });
        res.end();
      } else if (url === '/big-declared') {
        res.writeHead(200, { 'Content-Length': String(5_000_000) });
        res.end(Buffer.alloc(10));
      } else if (url === '/big-undeclared') {
        // Chunked, so there is no Content-Length to trust.
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        const chunk = Buffer.alloc(64 * 1024, 1);
        let sent = 0;
        const tick = () => {
          if (res.destroyed || sent > 4 * 1024 * 1024) return res.end();
          sent += chunk.length;
          if (res.write(chunk)) setImmediate(tick);
          else res.once('drain', tick);
        };
        tick();
      } else if (url === '/gzip-ok') {
        res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'text/plain' });
        res.end(gzipSync('compressed hello'));
      } else if (url === '/gzip-bomb') {
        // ~5 MB of zeros compresses to a few KB.
        res.writeHead(200, { 'Content-Encoding': 'gzip' });
        res.end(gzipSync(Buffer.alloc(5 * 1024 * 1024)));
      } else if (url === '/slow') {
        res.writeHead(200);
        res.write('start');
        // never ends
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  });

  // Loopback is allowed for the local server, but 127.0.0.2 stands in for "a private address".
  const guard = () =>
    createSafeFetch({ isBlocked: (ip) => ip === '127.0.0.2', allowedPorts: new Set([port]) });

  it('fetches a page', async () => {
    const res = await guard()(`${base}/ok`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('follows a safe redirect and reports the final address', async () => {
    const res = await guard()(`${base}/redirect-ok`);
    expect(await res.text()).toBe('hello');
    expect(res.url).toBe(`${base}/ok`);
  });

  it('re-checks every redirect hop and refuses one that lands on a private address', async () => {
    hits.length = 0;
    await expect(guard()(`${base}/redirect-private`)).rejects.toBeInstanceOf(SSRFError);
    expect(hits.includes('/ok')).toBe(false);
  });

  it('stops redirect loops', async () => {
    await expect(guard()(`${base}/loop`, { maxRedirects: 2 })).rejects.toThrow('Too many redirects');
  });

  it('rejects a declared size over the cap before reading the body', async () => {
    await expect(guard()(`${base}/big-declared`, { maxBytes: 1000 })).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('caps a body that has no Content-Length while it streams', async () => {
    const res = await guard()(`${base}/big-undeclared`, { maxBytes: 100_000 });
    await expect(res.arrayBuffer()).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('decodes gzip responses', async () => {
    const res = await guard()(`${base}/gzip-ok`);
    expect(await res.text()).toBe('compressed hello');
    expect(res.headers.get('content-encoding')).toBeNull();
  });

  it('applies the cap to decompressed bytes (gzip bomb)', async () => {
    const res = await guard()(`${base}/gzip-bomb`, { maxBytes: 200_000 });
    await expect(res.arrayBuffer()).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('puts the deadline over the whole body, not only the headers', async () => {
    const res = await guard()(`${base}/slow`, { timeoutMs: 300 });
    await expect(res.text()).rejects.toThrow();
  });

  it('honours the caller abort signal', async () => {
    const controller = new AbortController();
    const pending = guard()(`${base}/ok`, { signal: controller.signal });
    controller.abort();
    // Either the request was aborted or it finished first; it must never hang.
    await Promise.race([pending.catch(() => 'aborted'), new Promise((r) => setTimeout(r, 2000, 'hung'))]).then((v) =>
      expect(v === 'hung').toBe(false),
    );
  });
});

describe('connect-time address validation (DNS rebinding)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('reached'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  });

  type Answer = Array<{ address: string; family: number }>;
  const fakeDns = (answers: Record<string, Answer>, calls: string[]) =>
    ((hostname: string, _opts: unknown, cb: (err: Error | null, addrs?: Answer) => void) => {
      calls.push(hostname);
      const a = answers[hostname];
      if (!a) return cb(new Error('ENOTFOUND'));
      return cb(null, a);
    }) as never;

  it('connects to the very address it validated, with one lookup per connection', async () => {
    const calls: string[] = [];
    const fetcher = createSafeFetch({
      isBlocked: () => false,
      allowedPorts: new Set([port]),
      dnsLookup: fakeDns({ 'shop.test': [{ address: '127.0.0.1', family: 4 }] }, calls),
    });
    const res = await fetcher(`http://shop.test:${port}/`);
    expect(await res.text()).toBe('reached');
    expect(calls).toEqual(['shop.test']);
  });

  it('refuses a name that resolves to a private address', async () => {
    const fetcher = createSafeFetch({
      isBlocked: (ip) => ip === '10.0.0.5',
      allowedPorts: new Set([port]),
      dnsLookup: fakeDns({ 'evil.test': [{ address: '10.0.0.5', family: 4 }] }, []),
    });
    await expect(fetcher(`http://evil.test:${port}/`)).rejects.toBeInstanceOf(SSRFError);
  });

  it('refuses a name when ANY of its answers is private', async () => {
    const fetcher = createSafeFetch({
      isBlocked: (ip) => ip === '10.0.0.5',
      allowedPorts: new Set([port]),
      dnsLookup: fakeDns(
        { 'mixed.test': [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }] },
        [],
      ),
    });
    await expect(fetcher(`http://mixed.test:${port}/`)).rejects.toBeInstanceOf(SSRFError);
  });

  it('refuses a name that does not resolve', async () => {
    const fetcher = createSafeFetch({ isBlocked: () => false, allowedPorts: new Set([port]), dnsLookup: fakeDns({}, []) });
    await expect(fetcher(`http://nowhere.test:${port}/`)).rejects.toBeInstanceOf(SSRFError);
  });
});
