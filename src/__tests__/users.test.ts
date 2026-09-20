import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleUsersTool } from '../tools/users.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleUsersTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function freshLogin() {
    return jsonResponse({ data: { token: 'jwt-users', expires: new Date(Date.now() + 600_000).toISOString() } });
  }

  it('timedoctor_list_users passes company and filters through as query params', async () => {
    const creds = { email: 'a1@example.com', password: 'p1' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: [{ id: 'u1', name: 'Jane' }] }));

    const result = await runWithCredentials(creds, () =>
      handleUsersTool('timedoctor_list_users', { company: 'c1', email: 'jane', name: 'Jane', includeArchivedUsers: true })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Jane');
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/users');
    expect(url.searchParams.get('company')).toBe('c1');
    expect(url.searchParams.get('filter[email]')).toBe('jane');
    expect(url.searchParams.get('filter[name]')).toBe('Jane');
    expect(url.searchParams.get('include-archived-users')).toBe('true');
  });

  it('timedoctor_get_user requires a userId', async () => {
    const creds = { email: 'a2@example.com', password: 'p2' };
    const result = await runWithCredentials(creds, () => handleUsersTool('timedoctor_get_user', {}));
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_get_user calls GET /api/1.0/users/{userId}', async () => {
    const creds = { email: 'a3@example.com', password: 'p3' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', name: 'Jane' } }));

    const result = await runWithCredentials(creds, () =>
      handleUsersTool('timedoctor_get_user', { userId: 'u1', company: 'c1' })
    );

    expect(result.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/users/u1');
    expect(url.searchParams.get('company')).toBe('c1');
  });

  it('timedoctor_check_invitation requires company and email', async () => {
    const creds = { email: 'a4@example.com', password: 'p4' };
    const missingCompany = await runWithCredentials(creds, () =>
      handleUsersTool('timedoctor_check_invitation', { email: 'x@example.com' })
    );
    expect(missingCompany.isError).toBe(true);

    const missingEmail = await runWithCredentials(creds, () =>
      handleUsersTool('timedoctor_check_invitation', { company: 'c1' })
    );
    expect(missingEmail.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_check_invitation calls GET /api/1.0/invitations/exists with company and email', async () => {
    const creds = { email: 'a5@example.com', password: 'p5' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: { userId: 'u9' } }));

    const result = await runWithCredentials(creds, () =>
      handleUsersTool('timedoctor_check_invitation', { company: 'c1', email: 'invited@example.com' })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('u9');
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/invitations/exists');
    expect(url.searchParams.get('company')).toBe('c1');
    expect(url.searchParams.get('email')).toBe('invited@example.com');
  });
});
