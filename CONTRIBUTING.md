# Contributing to @effectorhq/server

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/effectorHQ/effector-server.git
cd effector-server
npm install
npm test
```

Note: this package depends on sibling repos via `file:../` links. Make sure you have the full workspace cloned:

```bash
# Required siblings
ls ../effector-core ../openclaw-mcp ../effector-compose ../effector-types
```

## Guidelines

- **Zero external dependencies.** Only `@effectorhq/*` packages and Node.js built-ins.
- **ES Modules only.** All files use `import`/`export`.
- **Node 18+.** We use `import.meta.url`, `node:test`, etc.
- **Tests required.** Every new function needs tests. Run `node --test tests/*.test.js`.

## Project Structure

```
src/
  index.js                Public API exports
  server.js               GuardedServer — wraps openclaw-mcp with runtime validation
  telemetry.js            In-memory ring buffer for events
  permission-enforcer.js  Runtime permission gating
  tools/
    discover.js           effector_discover — find skills by type
    compose.js            effector_compose — suggest skill chains
    inspect.js            effector_inspect — view typed interface
bin/
  effector-serve.js       CLI entry point
```

## Architecture

```
                    ┌──────────────────────┐
                    │   effector-serve     │  ← GuardedServer
                    │  (this package)      │
                    └──────────┬───────────┘
                               │ wraps
                    ┌──────────▼───────────┐
                    │    openclaw-mcp      │  ← Inner MCP server
                    │  (JSON-RPC 2.0)      │
                    └──────────┬───────────┘
                               │ uses
        ┌──────────┬───────────┼───────────┐
        │          │           │           │
   ┌────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼─────┐
   │ guard  │ │ types  │ │compose │ │ compile │
   │  .js   │ │checker │ │suggest │ │ targets │
   └────────┘ └────────┘ └────────┘ └─────────┘
        └──────────┴───────────┴───────────┘
                    @effectorhq/core
```

## Pull Request Process

1. Fork and create a branch
2. Write code + tests
3. Run `npm test` — all tests must pass
4. Submit PR with a clear description

## Code Style

- 2-space indentation
- Single quotes for strings
- Semicolons required
- JSDoc for all exported functions
- Descriptive variable names

See the [effectorHQ Contributing Guide](https://github.com/effectorHQ/.github/blob/main/CONTRIBUTING.md) for the full contribution process, code standards, and PR checklist.
