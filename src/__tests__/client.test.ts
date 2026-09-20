import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorklog, login, listCompanies, TimeDoctorAuthError, TimeDoctorApiError } from '../client.js';
import { jsonResponse } from './test-helpers.js';

describe('login', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts email/password and returns the token + expiry', async () => {
    const expires = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { token: 'jwt-123', expires } }));

    const result = await login({ email: 'user1@example.com', password: 'pass1' });

    expect(result.token).toBe('jwt-123');
    expect(result.expireAt).toBe(Date.parse(expires));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api2.timedoctor.com/api/1.0/login');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe('user1@example.com');
    expect(body.password).toBe('pass1');
  });

  it('falls back to a 10-minute TTL when expires is missing or unparseable', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { token: 'jwt-no-expiry' } }));
    const before = Date.now();

    const result = await login({ email: 'user1@example.com', password: 'pass1' });

    expect(result.token).toBe('jwt-no-expiry');
    expect(result.expireAt).toBeGreaterThanOrEqual(before + 10 * 60_000 - 1000);
    expect(result.expireAt).toBeLessThanOrEqual(before + 10 * 60_000 + 5000);
  });

  it('throws TimeDoctorAuthError when the vendor returns 2xx with no token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }));

    await expect(login({ email: 'user1@example.com', password: 'pass1' })).rejects.toThrow(/no token/);
  });

  it('throws on a 401 response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(login({ email: 'bad@example.com', password: 'bad' })).rejects.toThrow(/rejected credentials/);
  });

  it('throws TimeDoctorApiError on a non-auth non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(login({ email: 'user1@example.com', password: 'pass1' })).rejects.toThrow(/HTTP 500/);
  });

  it('throws TimeDoctorApiError (not TimeDoctorAuthError) on a 429 rate-limit response', async () => {
    // 429 means Time Doctor is rate-limiting the request, not that the
    // credentials are wrong -- must not be classified as an auth error,
    // both for the caller's error message and because withToken()'s
    // forced-relogin retry only fires on TimeDoctorAuthError (a second
    // login attempt is exactly the wrong reaction to a rate limit).
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));

    await expect(login({ email: 'user1@example.com', password: 'pass1' })).rejects.toThrow(TimeDoctorApiError);
    await expect(login({ email: 'user1@example.com', password: 'pass1' })).rejects.not.toThrow(TimeDoctorAuthError);
  });
});

describe('listCompanies / getWorklog - token caching, isolation, and refresh', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function freshLogin(token: string) {
    return jsonResponse({ data: { token, expires: new Date(Date.now() + 600_000).toISOString() } });
  }

  it('logs in once and embeds the JWT in the Authorization header', async () => {
    const creds = { email: 'user-cache@example.com', password: 'pass-cache' };
    fetchMock
      .mockResolvedValueOnce(freshLogin('jwt-cache-1'))
      .mockResolvedValueOnce(jsonResponse({ data: [{ company: { id: 'c1', name: 'Acme' } }] }));

    const result = await listCompanies(creds);

    expect(result[0].company?.name).toBe('Acme');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [companiesUrl, companiesInit] = fetchMock.mock.calls[1];
    expect(companiesUrl).toBe('https://api2.timedoctor.com/api/1.0/companies');
    expect(companiesInit.headers.Authorization).toBe('JWT jwt-cache-1');

    // A second call with the same credentials must reuse the cached token
    // rather than logging in again.
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await listCompanies(creds);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never shares a cached token between two tenants whose credentials would collide under a naive colon-join', async () => {
    // email="a:b"/password="c" and email="a"/password="b:c" both concatenate
    // to "a:b:c" under a plain `${a}:${b}` join - this guards the actual
    // cache-key encoding (JSON.stringify) against that collision.
    const tenantOne = { email: 'a:b', password: 'c' };
    const tenantTwo = { email: 'a', password: 'b:c' };

    fetchMock.mockResolvedValueOnce(freshLogin('jwt-tenant-one')).mockResolvedValueOnce(jsonResponse({ data: [] }));
    await listCompanies(tenantOne);

    fetchMock.mockResolvedValueOnce(freshLogin('jwt-tenant-two')).mockResolvedValueOnce(jsonResponse({ data: [] }));
    await listCompanies(tenantTwo);

    // 4 total fetches (login+request per tenant) means tenant two did its own
    // login rather than reusing tenant one's cached token - a colon-join
    // collision would collapse this to 3.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, tenantTwoInit] = fetchMock.mock.calls[3];
    expect(tenantTwoInit.headers.Authorization).toBe('JWT jwt-tenant-two');
  });

  it('re-logs-in exactly once when the vendor rejects the token mid-call, then retries', async () => {
    const creds = { email: 'user-refresh@example.com', password: 'pass-refresh' };
    fetchMock
      // Initial login
      .mockResolvedValueOnce(freshLogin('jwt-stale'))
      // First worklog call: vendor says the token is invalid (HTTP 401)
      .mockResolvedValueOnce(jsonResponse({}, 401))
      // Forced re-login
      .mockResolvedValueOnce(freshLogin('jwt-fresh'))
      // Retried worklog call succeeds
      .mockResolvedValueOnce(jsonResponse({ data: [{ taskId: 't1' }] }));

    const result = await getWorklog(creds, 'company-1');

    expect(result[0].taskId).toBe('t1');
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const [, retriedInit] = fetchMock.mock.calls[3];
    expect(retriedInit.headers.Authorization).toBe('JWT jwt-fresh');
  });
});
