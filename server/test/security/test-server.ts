// Boots one real `createApp()` instance (on an ephemeral port) shared by the whole security
// test suite — these tests exercise the actual Express middleware chain (cookies, CSRF,
// headers, rate limiting) over real HTTP, not mocked req/res objects, since that's the only way
// to honestly verify what a browser would actually experience.
import type { Server } from 'http';
import { createApp } from '../../src/app';

let server: Server | undefined;
let baseUrl = '';

export async function startServer(): Promise<string> {
  if (server) return baseUrl;
  server = await new Promise<Server>((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected a TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
  return baseUrl;
}

export function getBaseUrl(): string {
  if (!baseUrl) throw new Error('startServer() must run before any test that calls getBaseUrl()');
  return baseUrl;
}

export async function stopServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  baseUrl = '';
}
