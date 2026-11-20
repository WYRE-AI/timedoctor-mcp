# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The HTTP transport no longer exits on a malformed request (WYREAI-741).** The request
  target was parsed against the client-supplied `Host` header, and a value that does not parse
  (or a target such as `//`) threw inside the request listener before authentication. The
  target is now parsed against a fixed base, so `Host` is no longer consulted, and a target
  that still cannot be parsed gets a `400` JSON response while the server keeps running.

### Added
- Initial release: MCP server for Time Doctor's employee time-tracking API.
- Company tools: `timedoctor_list_companies`, `timedoctor_get_company`.
- User tools: `timedoctor_list_users`, `timedoctor_get_user`, `timedoctor_check_invitation`.
- Project tools: `timedoctor_list_projects`, `timedoctor_get_project`.
- Task tools: `timedoctor_list_tasks`, `timedoctor_get_task`.
- Activity/stats tools: `timedoctor_get_worklog`, `timedoctor_get_timeuse_stats`.
- Transparent JWT login exchange and re-login on rejection (`POST /api/1.0/login`) wrapping every tool call.
