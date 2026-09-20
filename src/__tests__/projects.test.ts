import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleProjectsTool } from '../tools/projects.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleProjectsTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function freshLogin() {
    return jsonResponse({ data: { token: 'jwt-projects', expires: new Date(Date.now() + 600_000).toISOString() } });
  }

  it('timedoctor_list_projects requires company', async () => {
    const creds = { email: 'a1@example.com', password: 'p1' };
    const result = await runWithCredentials(creds, () => handleProjectsTool('timedoctor_list_projects', {}));
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_list_projects calls GET /api/1.0/projects with company and filters', async () => {
    const creds = { email: 'a2@example.com', password: 'p2' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: [{ id: 'p1', name: 'Website Redesign' }] }));

    const result = await runWithCredentials(creds, () =>
      handleProjectsTool('timedoctor_list_projects', { company: 'c1', name: 'Website', all: true })
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Website Redesign');
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/projects');
    expect(url.searchParams.get('company')).toBe('c1');
    expect(url.searchParams.get('filter[name]')).toBe('Website');
    expect(url.searchParams.get('all')).toBe('true');
  });

  it('timedoctor_get_project requires projectId and company', async () => {
    const creds = { email: 'a3@example.com', password: 'p3' };
    const missingProject = await runWithCredentials(creds, () =>
      handleProjectsTool('timedoctor_get_project', { company: 'c1' })
    );
    expect(missingProject.isError).toBe(true);

    const missingCompany = await runWithCredentials(creds, () =>
      handleProjectsTool('timedoctor_get_project', { projectId: 'p1' })
    );
    expect(missingCompany.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timedoctor_get_project calls GET /api/1.0/projects/{projectId}', async () => {
    const creds = { email: 'a4@example.com', password: 'p4' };
    fetchMock.mockResolvedValueOnce(freshLogin()).mockResolvedValueOnce(jsonResponse({ data: { id: 'p1', name: 'Website Redesign' } }));

    const result = await runWithCredentials(creds, () =>
      handleProjectsTool('timedoctor_get_project', { projectId: 'p1', company: 'c1' })
    );

    expect(result.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[1][0] as string);
    expect(url.pathname).toBe('/api/1.0/projects/p1');
    expect(url.searchParams.get('company')).toBe('c1');
  });
});
