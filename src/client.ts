import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import type {
  Company,
  CompanyRole,
  DataEnvelope,
  InvitationExistsResponse,
  LoginResponse,
  Project,
  Task,
  TimeDoctorCredentials,
  TimeuseStatsEntry,
  User,
  WorklogEntry,
} from './types.js';

export const BASE_URL = 'https://api2.timedoctor.com';

// Refresh the JWT this far ahead of its documented expiry so a slow
// downstream call never races a token that expires mid-request. The token
// itself is valid for six months, but the skew stays small (matching the
// other login-exchange connectors in this fleet) rather than scaled to the
// TTL - there's no benefit to a wider skew and it would just mean refreshing
// further from the actual expiry than necessary.
const REFRESH_SKEW_MS = 60_000;

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({email, password}); getCredentials()
// reads from it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<TimeDoctorCredentials>();

export function runWithCredentials<T>(creds: TimeDoctorCredentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): TimeDoctorCredentials | null {
  const scoped = credStore.getStore();
  if (scoped?.email && scoped?.password) return scoped;
  const email = process.env.TIMEDOCTOR_EMAIL;
  const password = process.env.TIMEDOCTOR_PASSWORD;
  if (!email || !password) {
    logger.warn('Missing credentials', { hasEmail: !!email, hasPassword: !!password });
    return null;
  }
  return { email, password };
}

/** Thrown when the vendor API rejects the current JWT - triggers exactly one re-login-and-retry in withToken(). */
export class TimeDoctorAuthError extends Error {}

/** Thrown for any other non-2xx / unexpected vendor response. */
export class TimeDoctorApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface TokenState {
  token: string;
  expireAt: number; // epoch ms
}

// Keyed by JSON.stringify([email, password]) so multiple tenants sharing one
// gateway process (AsyncLocalStorage swaps credentials per request) never
// cross-pollinate cached JWTs - a colon-join (`${email}:${password}`) would
// collapse two distinct tenants onto the same cache key whenever a colon
// appears inside either credential value, which Time Doctor's login spec
// does not rule out for either field.
const tokenCache = new Map<string, TokenState>();

function cacheKeyFor(creds: TimeDoctorCredentials): string {
  return JSON.stringify([creds.email, creds.password]);
}

/**
 * Exchange email/password for a JWT bearer token via POST /api/1.0/login.
 * The response's `data.expires` is an ISO 8601 timestamp roughly six months
 * out; if it's missing or unparseable this falls back to a conservative
 * 10-minute TTL rather than caching a token with an unknown lifetime
 * indefinitely.
 */
export async function login(creds: TimeDoctorCredentials): Promise<TokenState> {
  const res = await fetch(`${BASE_URL}/api/1.0/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 409 || res.status === 422 || res.status === 429) {
      throw new TimeDoctorAuthError(`Time Doctor rejected credentials: HTTP ${res.status}`);
    }
    throw new TimeDoctorApiError(`Time Doctor login failed: HTTP ${res.status}`, res.status);
  }

  const body = (await res.json()) as LoginResponse;
  const token = body.data?.token;
  if (!token) {
    throw new TimeDoctorAuthError('Time Doctor login succeeded but returned no token');
  }

  const expireAt = body.data?.expires ? Date.parse(body.data.expires) : NaN;
  return {
    token,
    expireAt: Number.isFinite(expireAt) ? expireAt : Date.now() + 10 * 60_000,
  };
}

async function getToken(creds: TimeDoctorCredentials, forceRefresh = false): Promise<string> {
  const key = cacheKeyFor(creds);
  const cached = tokenCache.get(key);
  if (!forceRefresh && cached && cached.expireAt - REFRESH_SKEW_MS > Date.now()) {
    return cached.token;
  }
  const fresh = await login(creds);
  tokenCache.set(key, fresh);
  return fresh.token;
}

/**
 * Runs `fn` with a fresh/cached JWT, and retries it exactly once with a
 * forced re-login if `fn` throws TimeDoctorAuthError (the vendor rejected
 * the token - expired or otherwise invalid). Every real API call in this
 * file goes through this wrapper so the refresh logic lives in one place.
 */
async function withToken<T>(creds: TimeDoctorCredentials, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getToken(creds);
  try {
    return await fn(token);
  } catch (err) {
    if (err instanceof TimeDoctorAuthError) {
      logger.warn('JWT rejected mid-call, re-logging in and retrying once');
      const refreshed = await getToken(creds, true);
      return await fn(refreshed);
    }
    throw err;
  }
}

/** Time Doctor's own auth scheme: `Authorization: JWT {token}` (not Bearer). */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}`, Accept: 'application/json' };
}

function buildQuery(params: Record<string, string | undefined>): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, v);
  }
  return qs;
}

async function doGet<T>(path: string, query: URLSearchParams | undefined, token: string): Promise<T> {
  const qs = query && query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    method: 'GET',
    headers: authHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) {
    throw new TimeDoctorAuthError(`Time Doctor rejected the JWT (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new TimeDoctorApiError(`Time Doctor ${path} failed: HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------

/** GET /api/1.0/companies - companies the authenticated user owns or administers. */
export async function listCompanies(creds: TimeDoctorCredentials): Promise<CompanyRole[]> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<CompanyRole[]>>('/api/1.0/companies', undefined, token);
    return body.data ?? [];
  });
}

/** GET /api/1.0/companies/{companyId} - a single company by ID. */
export async function getCompany(creds: TimeDoctorCredentials, companyId: string): Promise<Company> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<Company>>(
      `/api/1.0/companies/${encodeURIComponent(companyId)}`,
      undefined,
      token
    );
    return body.data ?? {};
  });
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

export interface ListUsersOptions {
  company?: string;
  page?: string;
  limit?: string;
  email?: string;
  name?: string;
  includeArchivedUsers?: boolean;
}

/** GET /api/1.0/users - users in a company (or globally, if company is omitted). */
export async function listUsers(creds: TimeDoctorCredentials, opts: ListUsersOptions = {}): Promise<User[]> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<User[]>>(
      '/api/1.0/users',
      buildQuery({
        company: opts.company,
        page: opts.page,
        limit: opts.limit,
        'filter[email]': opts.email,
        'filter[name]': opts.name,
        'include-archived-users': opts.includeArchivedUsers !== undefined ? String(opts.includeArchivedUsers) : undefined,
      }),
      token
    );
    return body.data ?? [];
  });
}

/** GET /api/1.0/users/{userId} - a single user by ID. */
export async function getUser(creds: TimeDoctorCredentials, userId: string, company?: string): Promise<User> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<User>>(
      `/api/1.0/users/${encodeURIComponent(userId)}`,
      buildQuery({ company }),
      token
    );
    return body.data ?? {};
  });
}

/**
 * GET /api/1.0/invitations/exists - whether an invitation exists for an
 * email address in a company. The only read endpoint in Time Doctor's
 * invitations surface; bulk-inviting (POST /api/1.0/invitations/bulk) is a
 * real account-cost mutation and out of scope for this connector.
 */
export async function checkInvitation(
  creds: TimeDoctorCredentials,
  company: string,
  email: string
): Promise<InvitationExistsResponse['data']> {
  return withToken(creds, async (token) => {
    const body = await doGet<InvitationExistsResponse>(
      '/api/1.0/invitations/exists',
      buildQuery({ company, email }),
      token
    );
    return body.data ?? {};
  });
}

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export interface ListProjectsOptions {
  page?: string;
  limit?: string;
  name?: string;
  all?: boolean;
}

/** GET /api/1.0/projects - projects in a company. */
export async function listProjects(
  creds: TimeDoctorCredentials,
  company: string,
  opts: ListProjectsOptions = {}
): Promise<Project[]> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<Project[]>>(
      '/api/1.0/projects',
      buildQuery({
        company,
        page: opts.page,
        limit: opts.limit,
        'filter[name]': opts.name,
        all: opts.all !== undefined ? String(opts.all) : undefined,
      }),
      token
    );
    return body.data ?? [];
  });
}

/** GET /api/1.0/projects/{projectId} - a single project by ID. */
export async function getProject(
  creds: TimeDoctorCredentials,
  projectId: string,
  company: string
): Promise<Project> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<Project>>(
      `/api/1.0/projects/${encodeURIComponent(projectId)}`,
      buildQuery({ company }),
      token
    );
    return body.data ?? {};
  });
}

// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------

export interface ListTasksOptions {
  page?: string;
  limit?: string;
  name?: string;
  projects?: string;
  status?: 'open' | 'closed';
}

/** GET /api/1.0/tasks - tasks in a company. */
export async function listTasks(
  creds: TimeDoctorCredentials,
  company: string,
  opts: ListTasksOptions = {}
): Promise<Task[]> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<Task[]>>(
      '/api/1.0/tasks',
      buildQuery({
        company,
        page: opts.page,
        limit: opts.limit,
        'filter[name]': opts.name,
        projects: opts.projects,
        'filter[status]': opts.status,
      }),
      token
    );
    return body.data ?? [];
  });
}

/** GET /api/1.0/tasks/{taskId} - a single task by ID. */
export async function getTask(creds: TimeDoctorCredentials, taskId: string, company: string): Promise<Task> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<Task>>(
      `/api/1.0/tasks/${encodeURIComponent(taskId)}`,
      buildQuery({ company }),
      token
    );
    return body.data ?? {};
  });
}

// ---------------------------------------------------------------------
// Activity / stats - Time Doctor's core time-tracking value proposition
// ---------------------------------------------------------------------

export interface GetWorklogOptions {
  user?: string;
  from?: string;
  to?: string;
  taskProjectNames?: boolean;
}

/**
 * GET /api/1.0/activity/worklog - detailed work-session log (start/end
 * times, task, project, mode) for a user or the whole company within a time
 * range. Time Doctor's own docs note this is best queried in <=7-day
 * windows for performance.
 */
export async function getWorklog(
  creds: TimeDoctorCredentials,
  company: string,
  opts: GetWorklogOptions = {}
): Promise<WorklogEntry[]> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<WorklogEntry[]>>(
      '/api/1.0/activity/worklog',
      buildQuery({
        company,
        user: opts.user,
        from: opts.from,
        to: opts.to,
        'task-project-names': opts.taskProjectNames !== undefined ? String(opts.taskProjectNames) : undefined,
      }),
      token
    );
    return body.data ?? [];
  });
}

export interface GetTimeuseStatsOptions {
  user?: string;
  from?: string;
  to?: string;
  category?: string;
  page?: string;
  limit?: string;
}

/**
 * GET /api/1.0/activity/timeuse/stats - aggregated productive/unproductive/
 * neutral time-use statistics per application/category for a user or the
 * whole company within a time range.
 */
export async function getTimeuseStats(
  creds: TimeDoctorCredentials,
  company: string,
  opts: GetTimeuseStatsOptions = {}
): Promise<TimeuseStatsEntry[]> {
  return withToken(creds, async (token) => {
    const body = await doGet<DataEnvelope<TimeuseStatsEntry[]>>(
      '/api/1.0/activity/timeuse/stats',
      buildQuery({
        company,
        user: opts.user,
        from: opts.from,
        to: opts.to,
        category: opts.category,
        page: opts.page,
        limit: opts.limit,
      }),
      token
    );
    return body.data ?? [];
  });
}
