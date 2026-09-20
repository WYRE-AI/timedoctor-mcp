import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTasksTool } from '../tools/tasks.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleTasksTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function freshLogin() {
    return jsonResponse({ data: { token: 'jwt-tasks', expires: new Date(Date.now() + 600_000).toISOString() } });
  }

  it('timedoctor_list_tasks requires company', async () => {
    const creds = { email: 'a1@example.com', password: 'p1' };
    const result = await runWithCredentials(creds, () => handleTasksTool('timedoctor_list_tasks', {}));
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_list_tasks calls GET /api/1.0/tasks with company, projects, and status filters', async () => {
    const creds = { email: 'a2@example.com', password: 'p2' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: [{ id: 't1', name: 'Fix bug', status: 'open' }] }));

    const result = await runWithCredentials(creds, () =>
      handleTasksTool('timedoctor_list_tasks', { company: 'c1', projects: 'p1,p2', status: 'open' })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Fix bug');
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/tasks');
    expect(url.searchParams.get('company')).toBe('c1');
    expect(url.searchParams.get('projects')).toBe('p1,p2');
    expect(url.searchParams.get('filter[status]')).toBe('open');
  });

  it('timedoctor_get_task requires taskId and company', async () => {
    const creds = { email: 'a3@example.com', password: 'p3' };
    const missingTask = await runWithCredentials(creds, () => handleTasksTool('timedoctor_get_task', { company: 'c1' }));
    expect(missingTask.isError).toBe(true);

    const missingCompany = await runWithCredentials(creds, () => handleTasksTool('timedoctor_get_task', { taskId: 't1' }));
    expect(missingCompany.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_get_task calls GET /api/1.0/tasks/{taskId}', async () => {
    const creds = { email: 'a4@example.com', password: 'p4' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: { id: 't1', name: 'Fix bug' } }));

    const result = await runWithCredentials(creds, () =>
      handleTasksTool('timedoctor_get_task', { taskId: 't1', company: 'c1' })
    );

    expect(result.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/tasks/t1');
    expect(url.searchParams.get('company')).toBe('c1');
  });
});
