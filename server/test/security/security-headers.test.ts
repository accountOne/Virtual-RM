// Security headers + CORS allowlist (spec §21/§22) — no login needed, /api/health is public.
import { assert, assertEqual, describe, test } from '../test-runner';
import { getBaseUrl } from './test-server';
import { getMakerClient } from './fixtures';

describe('security headers & CORS', () => {
  test('every response carries the core hardening headers (CSP, nosniff, no framing, HSTS)', async () => {
    const res = await fetch(`${getBaseUrl()}/api/health`);
    const csp = res.headers.get('content-security-policy');
    assert(!!csp, 'expected a Content-Security-Policy header');
    assert(csp!.includes("default-src 'self'"), 'CSP must default-deny everything not explicitly allowed');
    assert(!csp!.includes('unsafe-inline\';script-src') && !/script-src[^;]*unsafe-inline/.test(csp!), 'script-src must never include unsafe-inline');
    assertEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assertEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert(!!res.headers.get('strict-transport-security'), 'expected an HSTS header');
  });

  test('the CSP has no wildcard/unsafe-eval script sources', async () => {
    const res = await fetch(`${getBaseUrl()}/api/health`);
    const csp = res.headers.get('content-security-policy')!;
    assert(!csp.includes('unsafe-eval'), 'CSP must never allow unsafe-eval');
    assert(!/script-src[^;]*\*/.test(csp), 'script-src must never be a wildcard');
  });

  test('a disallowed Origin does not get Access-Control-Allow-Origin echoed back', async () => {
    const res = await fetch(`${getBaseUrl()}/api/health`, { headers: { origin: 'https://evil.example.com' } });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    assert(
      allowOrigin === null || allowOrigin !== 'https://evil.example.com',
      'the CORS allowlist must never echo back an arbitrary Origin, especially with credentials enabled',
    );
  });

  test('.env is never served as a static file (the SPA catch-all route returns index.html for it, not the actual file)', async () => {
    const res = await fetch(`${getBaseUrl()}/.env`);
    const text = await res.text();
    assert(!text.includes('AI_API_KEY') && !text.includes('SESSION_IDLE_TIMEOUT'), 'the response must never be the actual .env file contents');
  });

  test('an unknown /api/* route is rejected before ever reaching routing — unauthenticated callers get a generic 401, not route-existence info', async () => {
    const res = await fetch(`${getBaseUrl()}/api/this-route-does-not-exist`);
    assertEqual(res.status, 401, 'requireSession runs ahead of the router for every /api/* path, so an anonymous caller cannot even learn whether a route exists');
    const body = (await res.json()) as { message: string };
    assert(!!body.message, 'expected a JSON message body');
    assert(!body.message.toLowerCase().includes('stack'), 'must never leak a stack trace');
  });

  test('an authenticated call to an unknown /api/* route gets a plain generic 404 JSON message, not a stack trace or framework banner', async () => {
    const res = await getMakerClient().get<{ message: string }>('/api/this-route-does-not-exist-either');
    assertEqual(res.status, 404);
    assert(!!res.body.message, 'expected a JSON message body');
    assert(!res.body.message.toLowerCase().includes('stack'), 'must never leak a stack trace');
  });
});
