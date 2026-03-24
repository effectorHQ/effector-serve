# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · [Semantic Versioning](https://semver.org/)

---

## [0.1.0] — 2026-03-24

First release. Runtime MCP server with typed validation, capability discovery, and composition.

### Added

**GuardedServer** (`src/server.js`)
- Wraps `@effectorhq/skill-mcp` server with runtime type validation
- Intercepts `tools/call` — validates input against declared interface types using `createGuard` from `@effectorhq/core`
- Strict mode (`--strict`): rejects calls with type validation errors; permissive mode (default): warns and continues
- Returns structured `EFFECTOR_VALIDATION_ERROR` with `missingFields`, `typeName`, and `direction` in error data

**Capability Discovery** (`src/tools/discover.js`)
- `effector_discover` MCP tool — find skills by input type, output type, or name pattern
- Filters loaded skills via `checkTypeCompatibility` from `@effectorhq/core`
- Returns matching skills with full interface signatures

**Composition Suggestion** (`src/tools/compose.js`)
- `effector_compose` MCP tool — suggest multi-step skill chains between types
- Uses BFS-based `suggest()` from `@effectorhq/compose`
- Configurable `max_depth` (default: 3)

**Skill Inspection** (`src/tools/inspect.js`)
- `effector_inspect` MCP tool — view full typed interface, permissions, and metadata for any skill
- Returns `inputSchema`, `interface`, `permissions`, `metadata`

**Permission Enforcement** (`src/permission-enforcer.js`)
- Runtime permission gating: checks `_permissions` from `effector.toml` against server config
- Blocks tools requiring `network` or `subprocess` unless explicitly allowed via `--allow-network` / `--allow-subprocess`
- Returns structured `EFFECTOR_PERMISSION_DENIED` errors

**Telemetry** (`src/telemetry.js`)
- In-memory ring buffer (1000 events) tracking validation results, tool calls, and permission checks
- `getStats()` returns per-tool pass/fail rates
- `getRecent(n)` returns latest events in reverse chronological order

**CLI** (`bin/effector-serve.js`)
- `effector-serve <dir>` — start guarded MCP server on stdin/stdout
- `--strict` — reject on type validation errors
- `--allow-network` / `--allow-subprocess` — permit tools with those permissions
- `--no-telemetry` — disable event tracking

**Tests** — 37 passing
- `tests/server.test.js` (12) — initialize, tools/list, synthetic tools, permissions, telemetry
- `tests/integration.test.js` (8) — multi-skill loading, full lifecycle (init → list → discover → compose → call)
- `tests/discover.test.js` (7) — input/output/name filtering, edge cases
- `tests/compose.test.js` (5) — direct paths, multi-step chains, max_depth
- `tests/telemetry.test.js` (5) — ring buffer, stats, capacity limits
