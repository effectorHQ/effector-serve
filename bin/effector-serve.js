#!/usr/bin/env node

/**
 * effector-serve CLI
 *
 * Usage:
 *   effector-serve <skills-dir> [options]
 *
 * Options:
 *   --strict           Reject tools/call on validation errors (default: warn)
 *   --allow-network    Allow tools with network permission
 *   --allow-subprocess Allow tools with subprocess permission
 *   --no-telemetry     Disable telemetry tracking
 */

import { startGuardedServer } from '../src/server.js';

const args = process.argv.slice(2);

// Parse arguments
const flags = new Set();
let skillsDir = null;

for (const arg of args) {
  if (arg.startsWith('--')) {
    flags.add(arg);
  } else if (!skillsDir) {
    skillsDir = arg;
  }
}

if (!skillsDir || flags.has('--help') || flags.has('-h')) {
  console.error(`
effector-serve — Runtime MCP server with typed validation

Usage:
  effector-serve <skills-dir> [options]

Options:
  --strict           Reject tools/call on type validation errors (default: warn and continue)
  --allow-network    Allow tools that declare network permission
  --allow-subprocess Allow tools that declare subprocess permission
  --no-telemetry     Disable telemetry event tracking

Examples:
  effector-serve ./skills                         # Serve all skills in directory
  effector-serve ./my-skill --strict              # Strict mode: reject invalid I/O
  effector-serve ./skills --allow-network         # Allow network-requiring tools
`);
  process.exit(flags.has('--help') || flags.has('-h') ? 0 : 1);
}

import { resolve } from 'node:path';

const options = {
  strict: flags.has('--strict'),
  allowNetwork: flags.has('--allow-network'),
  allowSubprocess: flags.has('--allow-subprocess'),
  telemetry: !flags.has('--no-telemetry'),
};

startGuardedServer(resolve(skillsDir), options).catch((err) => {
  console.error(`[effector-serve] Fatal: ${err.message}`);
  process.exit(1);
});
