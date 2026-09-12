// A tiny cookie-jar-aware HTTP client for the security test suite — deliberately built on
// Node's built-in `fetch` rather than adding a `supertest`/`axios` dependency, matching this
// repo's "no new test-framework dependency" convention (test-runner.ts's own doc comment).
import { getBaseUrl } from './test-server';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

/** Mirrors what a real browser (and Angular's `withXsrfConfiguration`) does: stores cookies the
 * server sets, sends them back on every subsequent request, and — unless a test explicitly asks
 * not to — echoes the (non-HttpOnly) CSRF cookie back as the CSRF header on state-changing
 * requests. */
export class TestClient {
  private readonly jar = new Map<string, string>();

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  private applySetCookies(headers: Headers): void {
    const raw = typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = /Expires=Thu, 01 Jan 1970/i.test(line);
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  private cookieHeader(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async get<T = unknown>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(getBaseUrl() + path, {
      method: 'GET',
      headers: this.jar.size ? { cookie: this.cookieHeader() } : {},
    });
    this.applySetCookies(res.headers);
    const body = (await safeJson(res)) as T;
    return { status: res.status, headers: res.headers, body };
  }

  async post<T = unknown>(
    path: string,
    payload?: unknown,
    opts: { csrf?: boolean; csrfOverride?: string } = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>('POST', path, payload, opts);
  }

  async put<T = unknown>(
    path: string,
    payload?: unknown,
    opts: { csrf?: boolean; csrfOverride?: string } = {},
  ): Promise<ApiResponse<T>> {
    return this.send<T>('PUT', path, payload, opts);
  }

  private async send<T = unknown>(
    method: 'POST' | 'PUT',
    path: string,
    payload?: unknown,
    opts: { csrf?: boolean; csrfOverride?: string } = {},
  ): Promise<ApiResponse<T>> {
    const sendCsrf = opts.csrf ?? true;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.jar.size) headers['cookie'] = this.cookieHeader();
    if (opts.csrfOverride !== undefined) headers[CSRF_HEADER] = opts.csrfOverride;
    else if (sendCsrf && this.jar.has(CSRF_COOKIE)) headers[CSRF_HEADER] = this.jar.get(CSRF_COOKIE)!;
    const res = await fetch(getBaseUrl() + path, {
      method,
      headers,
      body: JSON.stringify(payload ?? {}),
    });
    this.applySetCookies(res.headers);
    const body = (await safeJson(res)) as T;
    return { status: res.status, headers: res.headers, body };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface LoginBody {
  authenticated: boolean;
  user: { id: string; displayName: string; role: string };
  company: { id: string };
  session: { expiresAt: string; idleExpiresAt: string };
}

/** Logs a fresh `TestClient` in — every call mints a brand-new session (spec §5, session
 * fixation protection), so callers that need N independent concurrent sessions for the same
 * user just call this N times. */
export async function loginAs(username: string, password: string): Promise<{ client: TestClient; body: LoginBody }> {
  const client = new TestClient();
  const res = await client.post<LoginBody>('/api/auth/login', { username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { client, body: res.body };
}
