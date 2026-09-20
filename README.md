# Time Doctor MCP Server

MCP server for [Time Doctor](https://www.timedoctor.com/)'s employee time-tracking / productivity-monitoring API - companies, users, projects, tasks, and time-use statistics, for AI assistants and the WYRE Conduit gateway.

## Authentication

Time Doctor's current, officially documented API (https://timedoctor.redoc.ly, API Version 1.0.0) authenticates with the same email/password a user logs into `app.timedoctor.com` with - there is no separate client-ID/secret application-registration flow. `POST /api/1.0/login` exchanges the email/password for a JWT bearer token valid for six months (`Authorization: JWT {token}` on every subsequent call). This server handles that exchange (and re-login on rejection) internally - callers only ever need to supply the email/password.

Some Time Doctor accounts require a TOTP (2FA) code at login; accounts with 2FA enabled are not currently supported by this connector.

## Configuration

| Env var | Description |
|---|---|
| `TIMEDOCTOR_EMAIL` | Time Doctor account email address. |
| `TIMEDOCTOR_PASSWORD` | Time Doctor account password. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the vars above) or `gateway` (credentials arrive per-request via `X-TimeDoctor-Email` / `X-TimeDoctor-Password` headers, injected by the Conduit gateway). |
| `CONDUIT_S2S_SECRET` | When set, the HTTP transport requires a valid `X-Gateway-S2S` header (Conduit sidecar auth) on every `/mcp` request. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

## Tools

### Companies
- `timedoctor_list_companies` - companies (workspaces) the authenticated user owns or administers.
- `timedoctor_get_company` - a single company by ID.

### Users
- `timedoctor_list_users` - users, optionally scoped to a company and filtered by email/name.
- `timedoctor_get_user` - a single user by ID.
- `timedoctor_check_invitation` - whether a company invitation exists for an email address (read-only).

### Projects
- `timedoctor_list_projects` - projects in a company.
- `timedoctor_get_project` - a single project by ID.

### Tasks
- `timedoctor_list_tasks` - tasks in a company, filterable by project, name, or open/closed status.
- `timedoctor_get_task` - a single task by ID.

### Activity / Stats
- `timedoctor_get_worklog` - detailed work-session log (start time, duration, task/project, mode) for a user or company within a time range.
- `timedoctor_get_timeuse_stats` - aggregated productivity statistics (time per application/category, productive vs. unproductive) for a user or company within a time range.

## Scope

This is a v1 / MVP surface covering the core MSP time-tracking-oversight workflow: who's tracked where, and how their time breaks down. Explicitly out of scope for now: Files (screencasts/screenshots), Categories, Work Schedules (lower-value admin config), any user invitation/creation/deletion mutation, and the "login as" user-impersonation endpoint (a real security-sensitive feature). They can be added as a follow-up if there's demand.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

```bash
docker build -t timedoctor-mcp .
docker run -p 8080:8080 -e TIMEDOCTOR_EMAIL=... -e TIMEDOCTOR_PASSWORD=... timedoctor-mcp
```
