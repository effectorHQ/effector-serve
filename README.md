# @effectorhq/serve

[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-37%20passing-brightgreen.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Runtime MCP server with typed validation, capability discovery, and composition.**

Source repo: **[effectorHQ/effector-serve](https://github.com/effectorHQ/effector-serve)**. CLI: `effector-serve`.

Wraps any skill directory as an MCP server that validates tool I/O against declared types at runtime, lets agents discover capabilities by type signature, and suggests multi-step skill chains.

Three runtime layers — **Typed**, **Composable**, **Verifiable** — built on the [effectorHQ](https://github.com/effectorHQ) toolchain.

---

## Install

```bash
npm install @effectorhq/serve
```

Or run directly:

```bash
npx @effectorhq/serve ./my-skills
```

## Quick Start

### CLI

```bash
# Start a guarded MCP server (stdin/stdout)
effector-serve ./skills

# Strict mode — reject calls with type validation errors
effector-serve ./skills --strict

# Allow tools that require network access
effector-serve ./skills --allow-network

# Allow both network and subprocess
effector-serve ./skills --allow-network --allow-subprocess
```

### Programmatic

```js
import { createGuardedServer } from '@effectorhq/serve';

const server = await createGuardedServer('./skills', {
  strict: false,        // warn on type errors (default)
  allowNetwork: true,   // permit network-requiring tools
  allowSubprocess: false,
});

// Use handleRequest for testing or embedding
const response = server.handleRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
});

console.log(response.result.tools);
// → [...your skills..., effector_discover, effector_compose, effector_inspect]
```

---

## What It Does

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Your Skills │────▶│  effector-serve   │────▶│  MCP Client    │
│  (SKILL.md + │     │                  │     │  (Claude, etc) │
│  effector.toml)    │  ┌─ Type Guard   │     └────────────────┘
└──────────────┘     │  ├─ Permissions  │
                     │  ├─ Discovery    │
                     │  ├─ Composition  │
                     │  └─ Telemetry    │
                     └──────────────────┘
```

### Without effector-serve

Your MCP server returns skill instructions. The LLM calls tools with whatever arguments it wants. If types don't match, you find out at runtime — or never.

### With effector-serve

Every `tools/call` is validated against the declared `[effector.interface]` types. Permission violations are caught before execution. Agents can query _"what skills accept CodeDiff?"_ and _"how do I get from CodeDiff to Notification?"_ at runtime.

---

## Built-in Tools

effector-serve adds three MCP tools alongside your skills:

### `effector_discover`

Find skills by type signature.

```json
{
  "name": "effector_discover",
  "arguments": {
    "input_type": "CodeDiff",
    "output_type": "ReviewReport"
  }
}
```

Returns matching skills with their interfaces, permissions, and descriptions.

### `effector_compose`

Suggest multi-step skill chains between types.

```json
{
  "name": "effector_compose",
  "arguments": {
    "from_type": "CodeDiff",
    "to_type": "Notification",
    "max_depth": 3
  }
}
```

Uses BFS to find the shortest type-compatible chains. If `code-review` outputs `ReviewReport` and `notify` accepts `Markdown`, and `format-report` bridges them, you get:

```
CodeDiff → [code-review] → ReviewReport → [format-report] → Markdown → [notify] → Notification
```

### `effector_inspect`

View a skill's full typed interface.

```json
{
  "name": "effector_inspect",
  "arguments": { "tool_name": "code-review" }
}
```

Returns `interface`, `permissions`, `metadata`, and `inputSchema`.

---

## Runtime Validation

### Type Guards

Every `tools/call` is checked against the skill's declared `[effector.interface]`:

```toml
# effector.toml
[effector.interface]
input = "CodeDiff"
output = "ReviewReport"
```

If the input is missing required fields for the `CodeDiff` type (e.g., `files`), the server returns a structured error:

```json
{
  "error": {
    "code": -32602,
    "message": "Input validation failed: CodeDiff: missing required field: files",
    "data": {
      "code": "EFFECTOR_VALIDATION_ERROR",
      "direction": "input",
      "typeName": "CodeDiff",
      "missingFields": ["files"]
    }
  }
}
```

In **permissive mode** (default), validation warnings are recorded via telemetry but the call proceeds. In **strict mode** (`--strict`), validation errors reject the call.

### Permission Enforcement

Skills declare permissions in `effector.toml`:

```toml
[effector.permissions]
network = true
subprocess = false
```

By default, the server blocks tools that require `network` or `subprocess`. Use `--allow-network` / `--allow-subprocess` to permit them.

```json
{
  "error": {
    "code": -32600,
    "message": "Permission denied: Tool \"deploy\" requires network access. Use --allow-network to permit.",
    "data": { "code": "EFFECTOR_PERMISSION_DENIED" }
  }
}
```

### Telemetry

All validation results, tool calls, and permission checks are tracked in an in-memory ring buffer:

```js
const stats = server.telemetry.getStats();
// {
//   totalEvents: 142,
//   validationPass: 120,
//   validationFail: 8,
//   callCount: 130,
//   permissionDenied: 2,
//   byTool: {
//     "code-review": { calls: 45, validationPass: 44, validationFail: 1 },
//     ...
//   }
// }
```

---

## API Reference

### `@effectorhq/serve`

| Export | Description |
|--------|-------------|
| `createGuardedServer(dir, options?)` | Create a guarded MCP server |
| `startGuardedServer(dir, options?)` | Create and start on stdin/stdout |
| `createTelemetry(options?)` | Create a standalone telemetry instance |
| `createPermissionEnforcer(config?)` | Create a standalone permission enforcer |
| `handleDiscover(args, toolMap)` | Discovery tool handler (for embedding) |
| `handleCompose(args, toolMap)` | Composition tool handler (for embedding) |
| `handleInspect(args, toolMap)` | Inspection tool handler (for embedding) |

### `ServeOptions`

```js
{
  strict: false,          // Reject on validation errors (default: warn)
  allowNetwork: false,    // Allow tools with network permission
  allowSubprocess: false, // Allow tools with subprocess permission
  telemetry: true,        // Enable telemetry tracking
}
```

---

## CLI

```
effector-serve — Runtime MCP server with typed validation

Usage:
  effector-serve <skills-dir> [options]

Options:
  --strict           Reject tools/call on type validation errors
  --allow-network    Allow tools that declare network permission
  --allow-subprocess Allow tools that declare subprocess permission
  --no-telemetry     Disable telemetry event tracking
```

---

## Architecture

effector-serve wraps `@effectorhq/skill-mcp` (the existing MCP server) and intercepts `handleRequest`:

```
                   ┌─────────────────────────────────────┐
                   │          effector-serve              │
                   │                                     │
   stdin ─────────▶│  handleRequest()                    │
                   │    │                                │
                   │    ├─ initialize → identity + caps  │
                   │    ├─ tools/list → skills + 3 built-in│
                   │    └─ tools/call                    │
                   │         │                           │
                   │         ├─ Permission check         │
                   │         ├─ Type validation (guard)  │
                   │         ├─ Telemetry recording      │
                   │         │                           │
                   │         ├─ Synthetic tool?          │
                   │         │   ├─ effector_discover    │
                   │         │   ├─ effector_compose     │
                   │         │   └─ effector_inspect     │
                   │         │                           │
                   │         └─ Delegate to inner server │
                   │              (instruction passthrough)│
   stdout ◀────────│                                     │
                   └─────────────────────────────────────┘
```

### Dependencies

All `@effectorhq/*` packages, zero external dependencies:

| Package | Used For |
|---------|----------|
| `@effectorhq/core` | Type guards, type checker, error types |
| `@effectorhq/skill-mcp` | Inner MCP server (JSON-RPC 2.0) |
| `@effectorhq/compose` | BFS composition suggestion |
| `@effectorhq/types` | Standard type catalog |

---

## Zero External Dependencies

This package uses only `@effectorhq/*` packages and Node.js built-ins. The `@effectorhq/*` packages themselves have zero external dependencies. The entire dependency tree is:

```
@effectorhq/serve
├── @effectorhq/core        (0 deps)
├── @effectorhq/skill-mcp   (→ @effectorhq/core)
├── @effectorhq/compose      (→ @effectorhq/core, @effectorhq/types)
└── @effectorhq/types        (0 deps)
```

No supply chain risk. No version conflicts. Fast installs.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

This project is currently licensed under the [Apache License, Version 2.0](LICENSE.md).
