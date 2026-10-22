# Time Doctor MCP Server

MCP server for [Time Doctor](https://www.timedoctor.com/)'s employee time-tracking / productivity-monitoring API - companies, users, projects, tasks, and time-use statistics, for AI assistants and the WYRE Conduit gateway.

## Authentication

Time Doctor's current, officially documented API (https://timedoctor.redoc.ly, API Version 1.0.0) authenticates with the same email/password a user logs into `app.timedoctor.com` with - there is no separate client-ID/secret application-registration flow. `POST /api/1.0/login` exchanges the email/password for a JWT bearer token valid for six months (`Authorization: JWT {token}` on every subsequent call). This server handles that exchange (and re-login on rejection) internally - callers only ever need to supply the email/password.

Some Time Doctor accounts require a TOTP (2FA) code at login; accounts with 2FA enabled are not currently supported by this connector.

## Configuration

Copy [`.env.example`](.env.example) and set the variables below.

| Env var | Required | Description |
|---|---|---|
| `TIMEDOCTOR_EMAIL` | For stdio and `AUTH_MODE=env` | Time Doctor account email address. |
| `TIMEDOCTOR_PASSWORD` | For stdio and `AUTH_MODE=env` | Time Doctor account password. |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http`. |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose) or `env`. Gateway mode requires `X-TimeDoctor-Email` and `X-TimeDoctor-Password` on each `/mcp` request and never falls back to `TIMEDOCTOR_*`. `env` uses those variables only after S2S auth succeeds. Unset means `env` (stdio and single-tenant HTTP). |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `secret`, `replace-me`, `replace-with-a-real-secret`, and the other example values). Generate one with `openssl rand -hex 32`. Compose will not start without it. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` refuses to start. A known placeholder secret still refuses to start. |
| `MCP_HTTP_HOST` | No | Bind address when a real `CONDUIT_S2S_SECRET` is set. Unset keeps `0.0.0.0`, the historical bind. The image and Compose set `0.0.0.0` inside the container. With no secret, `MCP_ALLOW_INSECURE_DEV=1` forces `127.0.0.1`. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | No | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` and `/healthz` stay unauthenticated and do not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The check is `verifyS2sHeader` in [`src/s2s-verify.ts`](src/s2s-verify.ts): the header value is `t=<unix seconds>,v1=<hex>`, where the hex is HMAC-SHA256 of the literal string `t=<unix seconds>` keyed with `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header is HTTP 401, before vendor credentials are read.

```bash
TS=$(date +%s)
SIG=$(printf 't=%s' "$TS" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Gateway-S2S: t=${TS},v1=${SIG}" \
  -H "X-TimeDoctor-Email: $TIMEDOCTOR_EMAIL" \
  -H "X-TimeDoctor-Password: $TIMEDOCTOR_PASSWORD" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-TimeDoctor-Email` and `X-TimeDoctor-Password`. Those headers are the only credential source for that request. `AUTH_MODE=env` still requires the signed `X-Gateway-S2S` header, then uses `TIMEDOCTOR_EMAIL` and `TIMEDOCTOR_PASSWORD` from the environment.

### Request limits

- HTTP request bodies are capped at 256 KiB (262144 bytes). After the `X-Gateway-S2S` check (and, in gateway mode, the credential header check) passes, a `Content-Length` above the cap returns 413 with a JSON-RPC error; bodies without `Content-Length` are capped by the MCP SDK transport. Unauthenticated requests still get 401 first.
- `tools/call` arguments are capped at 10,000 elements (every array item and object key at any depth). Larger inputs return an `isError` tool result with the fixed message "Tool input exceeds the maximum of 10000 elements" and are never dispatched.

These limits address CVE-2026-111768 / GHSA-46jr-4wx8-v453 (memory exhaustion during validation) and GHSA-f897-62hf-6gxq (no request body / batch cap).

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

# HTTP refuses to start until CONDUIT_S2S_SECRET is set
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" npm run start:http

# Local HTTP only, without a service-to-service secret (binds 127.0.0.1)
MCP_ALLOW_INSECURE_DEV=1 MCP_HTTP_HOST=127.0.0.1 npm run start:http
```

## Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass a real S2S secret. In gateway mode, Time Doctor credentials arrive on each request as headers; they are not read from the environment.

```bash
docker build -t timedoctor-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  timedoctor-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset. The gateway service sets `AUTH_MODE=gateway`, does not inject `TIMEDOCTOR_EMAIL` or `TIMEDOCTOR_PASSWORD`, and publishes `127.0.0.1:8080:8080`:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `TIMEDOCTOR_EMAIL` and `TIMEDOCTOR_PASSWORD`. It is separate from the gateway Compose service above.

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e TIMEDOCTOR_EMAIL=you@example.com \
  -e TIMEDOCTOR_PASSWORD=your-password \
  -p 127.0.0.1:8080:8080 \
  timedoctor-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` and logs a warning. A non-loopback `MCP_HTTP_HOST` (including the image default `0.0.0.0`) makes startup exit:

```bash
MCP_TRANSPORT=http MCP_HTTP_HOST=127.0.0.1 MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```
