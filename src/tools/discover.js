/**
 * @module tools/discover
 *
 * MCP tool: effector_discover
 * Find available skills by input/output type signature.
 * Agents call this to discover what capabilities are available.
 */

import { checkTypeCompatibility } from '@effectorhq/core';

/** Tool definition for MCP tools/list */
export const DISCOVER_TOOL = {
  name: 'effector_discover',
  description: 'Find available skills by input/output type. Use this to discover what capabilities are available before composing a pipeline.',
  inputSchema: {
    type: 'object',
    properties: {
      input_type: {
        type: 'string',
        description: 'Find skills that accept this input type (e.g. "CodeDiff", "FilePath", "String")',
      },
      output_type: {
        type: 'string',
        description: 'Find skills that produce this output type (e.g. "ReviewReport", "Markdown", "JSON")',
      },
      name_pattern: {
        type: 'string',
        description: 'Optional regex pattern to filter by skill name',
      },
    },
  },
};

/**
 * Handle effector_discover tool call.
 *
 * @param {Object} args - { input_type?, output_type?, name_pattern? }
 * @param {Map<string, Object>} toolMap - Loaded tools from inner server
 * @returns {{ content: Array<{ type: string, text: string }> }}
 */
export function handleDiscover(args, toolMap) {
  const { input_type, output_type, name_pattern } = args || {};
  const matches = [];

  for (const [name, tool] of toolMap) {
    // Skip synthetic effector_ tools
    if (name.startsWith('effector_')) continue;

    const iface = tool._interface || {};

    // Filter by input type compatibility
    if (input_type && iface.input) {
      const compat = checkTypeCompatibility(input_type, iface.input);
      if (!compat.compatible) continue;
    } else if (input_type && !iface.input) {
      continue; // Has filter but tool has no declared input
    }

    // Filter by output type compatibility
    if (output_type && iface.output) {
      const compat = checkTypeCompatibility(iface.output, output_type);
      if (!compat.compatible) continue;
    } else if (output_type && !iface.output) {
      continue;
    }

    // Filter by name pattern
    if (name_pattern) {
      try {
        const re = new RegExp(name_pattern, 'i');
        if (!re.test(name)) continue;
      } catch {
        // Invalid regex — skip filter
      }
    }

    matches.push({
      name,
      description: tool.description || '',
      interface: {
        input: iface.input || null,
        output: iface.output || null,
        context: iface.context || [],
      },
      permissions: tool._permissions || {},
    });
  }

  const summary = matches.length === 0
    ? `No skills found matching: ${[input_type && `input=${input_type}`, output_type && `output=${output_type}`, name_pattern && `name=/${name_pattern}/`].filter(Boolean).join(', ')}`
    : `Found ${matches.length} matching skill${matches.length > 1 ? 's' : ''}`;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ summary, matches, query: { input_type, output_type, name_pattern } }, null, 2),
    }],
  };
}
