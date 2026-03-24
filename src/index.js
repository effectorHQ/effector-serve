/**
 * @effectorhq/server — Runtime MCP server with typed validation.
 *
 * Three layers:
 *   Typed      → Runtime I/O validation via guards
 *   Composable → Built-in discover/compose/inspect tools
 *   Verifiable → Permission enforcement + telemetry
 */

export { createGuardedServer, startGuardedServer } from './server.js';
export { createTelemetry } from './telemetry.js';
export { createPermissionEnforcer } from './permission-enforcer.js';
export { DISCOVER_TOOL, handleDiscover } from './tools/discover.js';
export { COMPOSE_TOOL, handleCompose } from './tools/compose.js';
export { INSPECT_TOOL, handleInspect } from './tools/inspect.js';
