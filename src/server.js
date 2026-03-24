/**
 * @module server
 *
 * GuardedServer — wraps openclaw-mcp's MCP server with runtime type validation,
 * capability discovery, and permission enforcement.
 *
 * Architecture: Wrap, Don't Fork
 * We extend createServer from @effectorhq/skill-mcp by intercepting handleRequest.
 * All JSON-RPC 2.0 plumbing is reused. Zero code duplication.
 *
 * Three runtime layers:
 *   1. Typed    → Runtime I/O validation via createGuard (every tools/call)
 *   2. Composable → Built-in discover/compose/inspect MCP tools
 *   3. Verifiable → Permission enforcement + telemetry tracking
 */

import { createServer as createInnerServer } from '@effectorhq/skill-mcp';
import { createGuard, EffectorError, VALIDATION_ERROR } from '@effectorhq/core';
import { createTelemetry } from './telemetry.js';
import { createPermissionEnforcer } from './permission-enforcer.js';
import { DISCOVER_TOOL, handleDiscover } from './tools/discover.js';
import { COMPOSE_TOOL, handleCompose } from './tools/compose.js';
import { INSPECT_TOOL, handleInspect } from './tools/inspect.js';

/**
 * @typedef {Object} ServeOptions
 * @property {boolean} [strict=false] - Reject on validation errors (vs warn)
 * @property {boolean} [allowNetwork=false]
 * @property {boolean} [allowSubprocess=false]
 * @property {boolean} [telemetry=true]
 */

/**
 * Create a guarded MCP server.
 *
 * @param {string} skillsDirectory - Path to skills
 * @param {ServeOptions} [options={}]
 * @returns {Promise<Object>} Guarded server instance
 */
export async function createGuardedServer(skillsDirectory, options = {}) {
  const {
    strict = false,
    allowNetwork = false,
    allowSubprocess = false,
    telemetry: enableTelemetry = true,
  } = options;

  // Create inner server (reuse all openclaw-mcp logic)
  const inner = await createInnerServer(skillsDirectory);

  // Load skills via inner server
  await inner.loadSkills();

  // Build guard map: toolName → Guard instance
  const guardMap = new Map();
  for (const [name, tool] of inner.toolMap) {
    if (tool._interface) {
      const guard = createGuard(tool._interface, {
        onError: strict ? 'throw' : 'return',
      });
      guardMap.set(name, guard);
    }
  }

  // Create telemetry & permission enforcer
  const tel = enableTelemetry ? createTelemetry() : null;
  const enforcer = createPermissionEnforcer({ allowNetwork, allowSubprocess });

  // Synthetic tools
  const syntheticTools = new Map([
    [DISCOVER_TOOL.name, DISCOVER_TOOL],
    [COMPOSE_TOOL.name, COMPOSE_TOOL],
    [INSPECT_TOOL.name, INSPECT_TOOL],
  ]);

  const server = {
    inner,
    guardMap,
    telemetry: tel,
    enforcer,
    options,

    /** Get the inner toolMap (for tools that need it) */
    get toolMap() {
      return inner.toolMap;
    },

    /**
     * Get all tools (inner + synthetic).
     */
    getTools() {
      const innerTools = inner.getTools();
      const synthetic = [...syntheticTools.values()].map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return [...innerTools, ...synthetic];
    },

    /**
     * Handle a JSON-RPC 2.0 request with guards.
     */
    handleRequest(request) {
      const { id, method, params } = request;

      try {
        switch (method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: { listChanged: false },
                  telemetry: enableTelemetry,
                },
                serverInfo: {
                  name: 'effector-serve',
                  version: '0.1.0',
                },
              },
            };

          case 'tools/list':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                tools: this.getTools(),
              },
            };

          case 'tools/call':
            return this._handleToolCall(id, params);

          case 'notifications/initialized':
            return null;

          case 'notifications/shutdown':
            console.error('[effector-serve] Shutdown requested');
            process.exit(0);

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            };
        }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: `Internal error: ${error.message}` },
        };
      }
    },

    /**
     * Handle tools/call with validation, permission check, and telemetry.
     * @private
     */
    _handleToolCall(id, params) {
      const { name: toolName, arguments: toolArgs } = params || {};
      const startTime = Date.now();

      // Handle synthetic tools
      if (syntheticTools.has(toolName)) {
        const result = this._handleSyntheticTool(toolName, toolArgs);
        if (tel) {
          tel.record({ type: 'call', tool: toolName, durationMs: Date.now() - startTime });
        }
        return { jsonrpc: '2.0', id, result };
      }

      // Check tool exists
      const tool = inner.toolMap.get(toolName);
      if (!tool) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `Unknown tool: ${toolName}. Available: ${[...inner.toolMap.keys(), ...syntheticTools.keys()].join(', ')}`,
          },
        };
      }

      // Permission check
      if (tool._permissions) {
        const permResult = enforcer.check(toolName, tool._permissions);
        if (!permResult.allowed) {
          if (tel) {
            for (const d of permResult.denied) {
              tel.record({ type: 'permission', tool: toolName, permission: d.permission, allowed: false });
            }
          }
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32600,
              message: `Permission denied: ${permResult.denied.map(d => d.reason).join('; ')}`,
              data: { code: 'EFFECTOR_PERMISSION_DENIED', denied: permResult.denied },
            },
          };
        }
      }

      // Input validation
      const guard = guardMap.get(toolName);
      if (guard && toolArgs) {
        const validation = guard.validateInput(toolArgs);
        if (tel) {
          tel.record({
            type: 'validation',
            tool: toolName,
            direction: 'input',
            valid: validation.valid,
            typeName: tool._interface?.input,
            missingFields: validation.metadata?.missingFields || [],
          });
        }
        if (!validation.valid && strict) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Input validation failed: ${validation.errors.join('; ')}`,
              data: {
                code: 'EFFECTOR_VALIDATION_ERROR',
                direction: 'input',
                typeName: tool._interface?.input,
                missingFields: validation.metadata?.missingFields || [],
                errors: validation.errors,
              },
            },
          };
        }
      }

      // Delegate to inner server for actual tool execution
      const response = inner.handleRequest({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params,
      });

      // Record call telemetry
      if (tel) {
        tel.record({ type: 'call', tool: toolName, durationMs: Date.now() - startTime });
      }

      return response;
    },

    /**
     * Handle synthetic tool calls.
     * @private
     */
    _handleSyntheticTool(toolName, toolArgs) {
      switch (toolName) {
        case 'effector_discover':
          return handleDiscover(toolArgs, inner.toolMap);
        case 'effector_compose':
          return handleCompose(toolArgs, inner.toolMap);
        case 'effector_inspect':
          return handleInspect(toolArgs, inner.toolMap);
        default:
          return { content: [{ type: 'text', text: `Unknown synthetic tool: ${toolName}` }] };
      }
    },

    /**
     * Start the server on stdin/stdout.
     */
    async start() {
      console.error('[effector-serve] Starting...');
      console.error(`[effector-serve] Loaded ${inner.toolMap.size} skills + ${syntheticTools.size} built-in tools`);
      console.error(`[effector-serve] Mode: ${strict ? 'strict' : 'permissive'} | Network: ${allowNetwork} | Subprocess: ${allowSubprocess}`);

      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin });

      rl.on('line', (line) => {
        try {
          const request = JSON.parse(line);
          const response = this.handleRequest(request);
          if (response && request.id !== undefined) {
            process.stdout.write(JSON.stringify(response) + '\n');
          }
        } catch (err) {
          const errResponse = {
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error: ' + err.message },
            id: null,
          };
          process.stdout.write(JSON.stringify(errResponse) + '\n');
        }
      });

      rl.on('close', () => {
        console.error('[effector-serve] stdin closed, shutting down');
        process.exit(0);
      });

      console.error('[effector-serve] JSON-RPC 2.0 server listening on stdin/stdout');
      await new Promise(() => {}); // Keep alive
    },
  };

  return server;
}

/**
 * Start a guarded server and listen on stdin.
 *
 * @param {string} skillsDirectory
 * @param {ServeOptions} [options]
 */
export async function startGuardedServer(skillsDirectory, options = {}) {
  const server = await createGuardedServer(skillsDirectory, options);
  await server.start();
}
