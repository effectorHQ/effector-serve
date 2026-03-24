/**
 * @module tools/compose
 *
 * MCP tool: effector_compose
 * Suggest skill chains that transform one type into another.
 * Uses BFS-based composition suggestion from @effectorhq/compose.
 */

import { suggest } from '@effectorhq/compose';

/** Tool definition for MCP tools/list */
export const COMPOSE_TOOL = {
  name: 'effector_compose',
  description: 'Suggest skill chains that transform one type into another. Given a type you have and a type you want, returns possible multi-step pipelines.',
  inputSchema: {
    type: 'object',
    properties: {
      from_type: {
        type: 'string',
        description: 'The type you currently have (e.g. "CodeDiff")',
      },
      to_type: {
        type: 'string',
        description: 'The type you want to produce (e.g. "Notification")',
      },
      max_depth: {
        type: 'number',
        description: 'Maximum chain length (default: 3)',
      },
    },
    required: ['from_type', 'to_type'],
  },
};

/**
 * Build a registry Map from the server's toolMap.
 * Converts MCP tool entries back into EffectorDef-like objects for suggest().
 *
 * @param {Map<string, Object>} toolMap
 * @returns {Map<string, Object>}
 */
function buildRegistry(toolMap) {
  const registry = new Map();
  for (const [name, tool] of toolMap) {
    if (name.startsWith('effector_')) continue;
    registry.set(name, {
      name,
      version: tool._metadata?.version || '0.0.0',
      interface: tool._interface || {},
      permissions: tool._permissions || {},
    });
  }
  return registry;
}

/**
 * Handle effector_compose tool call.
 *
 * @param {Object} args - { from_type, to_type, max_depth? }
 * @param {Map<string, Object>} toolMap
 * @returns {{ content: Array<{ type: string, text: string }> }}
 */
export function handleCompose(args, toolMap) {
  const { from_type, to_type, max_depth = 3 } = args || {};

  if (!from_type || !to_type) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Both from_type and to_type are required',
          example: { from_type: 'CodeDiff', to_type: 'Notification' },
        }),
      }],
    };
  }

  const registry = buildRegistry(toolMap);
  const result = suggest(registry, from_type, to_type, { maxDepth: max_depth, limit: 5 });

  const summary = result.suggestions.length === 0
    ? `No composition path found from ${from_type} to ${to_type} within ${max_depth} steps`
    : `Found ${result.suggestions.length} composition path${result.suggestions.length > 1 ? 's' : ''} from ${from_type} to ${to_type}`;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ summary, ...result }, null, 2),
    }],
  };
}
