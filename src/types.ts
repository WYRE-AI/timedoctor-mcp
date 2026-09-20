/**
 * Credentials a Conduit customer enters for the Time Doctor connector: the
 * email/password they use to log into Time Doctor. Exchanged for a
 * short-lived (6-month) JWT bearer token at request time (POST
 * /api/1.0/login) - see client.ts. Time Doctor's API has no separate
 * client-ID/secret application-registration flow; this is the only
 * documented auth path (https://timedoctor.redoc.ly, API Version 1.0.0).
 */
export interface TimeDoctorCredentials {
  email: string;
  password: string;
}

/** Response body of POST /api/1.0/login. */
export interface LoginResponse {
  data?: {
    token?: string;
    expires?: string;
    createdAt?: string;
  };
}

/** A company/workspace the authenticated user administers (GET /api/1.0/companies list item). */
export interface CompanyRole {
  role?: string;
  hiredAt?: string;
  name?: string;
  company?: {
    id?: string;
    name?: string;
    createdAt?: string;
    timezone?: string;
    locked?: boolean;
    userCount?: number;
  };
}

/** GET /api/1.0/companies/{companyId} response (the `company` object, unwrapped). */
export interface Company {
  id?: string;
  name?: string;
  createdAt?: string;
  timezone?: string;
  locked?: boolean;
  userCount?: number;
  [key: string]: unknown;
}

/** GET /api/1.0/users list item / GET /api/1.0/users/{userId} response. */
export interface User {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  hiredAt?: string;
  createdAt?: string;
  emailConfirmed?: boolean;
  [key: string]: unknown;
}

/** GET /api/1.0/invitations/exists response. */
export interface InvitationExistsResponse {
  data?: {
    userId?: string;
    [key: string]: unknown;
  };
}

/** GET /api/1.0/projects list item / GET /api/1.0/projects/{projectId} response. */
export interface Project {
  id?: string;
  name?: string;
  description?: string;
  deleted?: boolean;
  weight?: number;
  [key: string]: unknown;
}

/** GET /api/1.0/tasks list item / GET /api/1.0/tasks/{taskId} response. */
export interface Task {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  reporterId?: string;
  deleted?: boolean;
  project?: { id?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** GET /api/1.0/activity/worklog list item. */
export interface WorklogEntry {
  taskId?: string;
  projectId?: string;
  mode?: string;
  date?: string;
  start?: string;
  time?: number;
  userId?: string;
  taskName?: string;
  projectName?: string;
  deviceId?: string;
  [key: string]: unknown;
}

/**
 * GET /api/1.0/activity/timeuse/stats list item. Time Doctor's own spec
 * documents this as an aggregated per-category-per-user row; the exact
 * field set beyond what's shown in its response sample is not published,
 * so extra fields pass through untyped.
 */
export interface TimeuseStatsEntry {
  userId?: string;
  category?: string;
  time?: number;
  score?: number;
  [key: string]: unknown;
}

/** Generic `{ data: T[] }` / `{ data: T }` envelope every Time Doctor 1.0 endpoint returns. */
export interface DataEnvelope<T> {
  data?: T;
  paging?: { cur?: string; next?: string; [key: string]: unknown };
}
