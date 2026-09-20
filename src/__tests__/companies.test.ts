import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCompaniesTool } from '../tools/companies.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleCompaniesTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function freshLogin() {
    return jsonResponse({ data: { token: 'jwt-companies', expires: new Date(Date.now() + 600_000).toISOString() } });
  }

  it('timedoctor_list_companies calls GET /api/1.0/companies with the JWT', async () => {
    const creds = { email: 'a1@example.com', password: 'p1' };
    fetchMock
      .mockResolvedValueOnce(freshLogin())
      .mockResolvedValueOnce(jsonResponse({ data: [{ company: { id: 'c1', name: 'Acme' } }] }));

    const result = await runWithCredentials(creds, () => handleCompaniesTool('timedoctor_list_companies', {}));

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Acme');
    const [url] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api2.timedoctor.com/api/1.0/companies');
  });

  it('timedoctor_get_company requires a companyId', async () => {
    const creds = { email: 'a2@example.com', password: 'p2' };
    const result = await runWithCredentials(creds, () => handleCompaniesTool('timedoctor_get_company', {}));
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_get_company calls GET /api/1.0/companies/{companyId}', async () => {
    const creds = { email: 'a3@example.com', password: 'p3' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: { id: 'c1', name: 'Acme' } }));

    const result = await runWithCredentials(creds, () =>
      handleCompaniesTool('timedoctor_get_company', { companyId: 'c1' })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Acme');
    const [url] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api2.timedoctor.com/api/1.0/companies/c1');
  });

  it('returns an error when no credentials are configured', async () => {
    const result = await handleCompaniesTool('timedoctor_list_companies', {});
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
