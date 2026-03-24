# effector-server

HTTP and runtime **server** layer for [effector](https://github.com/effectorHQ/effector-spec) tools: discovery, permission boundaries, and execution against [`@effectorhq/core`](https://github.com/effectorHQ/effector-core).

**Status:** early scaffold — API and transport targets TBD.

## Goals

- Align with `effector.toml` permissions and typed interfaces from the core toolchain.
- Share error semantics with `@effectorhq/core` (including `PERMISSION_DENIED`, `DISCOVERY_NO_MATCH`).

## License

This project is currently licensed under the [Apache License, Version 2.0](LICENSE.md) 。
