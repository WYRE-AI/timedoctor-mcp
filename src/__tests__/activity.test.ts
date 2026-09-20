import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleActivityTool } from '../tools/activity.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleActivityTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function freshLogin() {
    return jsonResponse({ data: { token: 'jwt-activity', expires: new Date(Date.now() + 600_000).toISOString() } });
  }

  it('timedoctor_get_worklog requires company', async () => {
    const creds = { email: 'a1@example.com', password: 'p1' };
    const result = await runWithCredentials(creds, () => handleActivityTool('timedoctor_get_worklog', {}));
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_get_worklog calls GET /api/1.0/activity/worklog with company, user, and date range', async () => {
    const creds = { email: 'a2@example.com', password: 'p2' };
    fetchMock
      .mockResolvedValueOnce(freshLogin())
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ taskId: 't1', projectId: 'p1', time: 3600, userId: 'u1' }] })
      );

    const result = await runWithCredentials(creds, () =>
      handleActivityTool('timedoctor_get_worklog', {
        company: 'c1',
        user: 'u1',
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-08T00:00:00Z',
        taskProjectNames: true,
      })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('"time": 3600');
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/activity/worklog');
    expect(url.searchParams.get('company')).toBe('c1');
    expect(url.searchParams.get('user')).toBe('u1');
    expect(url.searchParams.get('from')).toBe('2026-09-01T00:00:00Z');
    expect(url.searchParams.get('to')).toBe('2026-09-08T00:00:00Z');
    expect(url.searchParams.get('task-project-names')).toBe('true');
  });

  it('timedoctor_get_timeuse_stats requires company', async () => {
    const creds = { email: 'a3@example.com', password: 'p3' };
    const result = await runWithCredentials(creds, () => handleActivityTool('timedoctor_get_timeuse_stats', {}));
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_get_timeuse_stats calls GET /api/1.0/activity/timeuse/stats with company, user, range, and category', async () => {
    const creds = { email: 'a4@example.com', password: 'p4' };
    fetchMock
      .mockResolvedValueOnce(freshLogin())
      .mockResolvedValueOnce(jsonResponse({ data: [{ userId: 'u1', category: 'productive', time: 7200 }] }));

    const result = await runWithCredentials(creds, () =>
      handleActivityTool('timedoctor_get_timeuse_stats', {
        company: 'c1',
        user: 'u1',
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-08T00:00:00Z',
        category: 'productive',
      })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('productive');
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/activity/timeuse/stats');
    expect(url.searchParams.get('company')).toBe('c1');
    expect(url.searchParams.get('user')).toBe('u1');
    expect(url.searchParams.get('category')).toBe('productive');
  });

  it('propagates an upstream error as an isError result rather than throwing', async () => {
    const creds = { email: 'a5@example.com', password: 'p5' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({}, 500));

    const result = await runWithCredentials(creds, () =>
      handleActivityTool('timedoctor_get_worklog', { company: 'c1' })
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('HTTP 500');
  });
});
