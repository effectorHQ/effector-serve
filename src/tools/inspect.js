/**
 * @module tools/inspect
 *
 * MCP tool: effector_inspect
 * Return full typed interface, permissions, and metadata for a skill.
 */

/** Tool definition for MCP tools/list */
export const INSPECT_TOOL = {
  name: 'effector_inspect',
  description: 'Inspect a skill\'s typed interface, permissions, and metadata. Use this to understand what a tool expects before calling it.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: {
        type: 'string',
        description: 'Name of the tool to inspect',
      },
    },
    required: ['tool_name'],
  },
};

/**
 * Handle effector_inspect tool call.
 *
 * @param {Object} args - { tool_name }
 * @param {Map<string, Object>} toolMap
 * @returns {{ content: Array<{ type: string, text: string }> }}
 */
export function handleInspect(args, toolMap) {
  const { tool_name } = args || {};

  if (!tool_name) {
    // List all available tools
    const tools = [];
    for (const [name, tool] of toolMap) {
      tools.push({
        name,
        description: (tool.description || '').slice(0, 100),
        hasInterface: !!tool._interface,
      });
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ available_tools: tools }, null, 2),
      }],
    };
  }

  const tool = toolMap.get(tool_name);
  if (!tool) {
    const available = [...toolMap.keys()].filter(n => !n.startsWith('effector_'));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Tool "${tool_name}" not found`,
          available,
        }),
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        name: tool_name,
        description: tool.description || '',
        interface: tool._interface || null,
        permissions: tool._permissions || null,
        metadata: tool._metadata || null,
        inputSchema: tool.inputSchema || null,
      }, null, 2),
    }],
  };
}
