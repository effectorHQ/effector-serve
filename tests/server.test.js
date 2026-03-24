import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createGuardedServer } from '../src/server.js';

// Create a temp skill directory with a test skill
function createTempSkill() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effector-serve-test-'));
  const skillDir = path.join(dir, 'test-skill');
  fs.mkdirSync(skillDir);

  // Write effector.toml
  fs.writeFileSync(path.join(skillDir, 'effector.toml'), `
[effector]
name = "test-skill"
version = "1.0.0"
type = "skill"
description = "A test skill for unit tests"

[effector.interface]
input = "CodeDiff"
output = "ReviewReport"

[effector.permissions]
network = true
subprocess = false
`);

  // Write SKILL.md
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: test-skill
description: A test skill
---

Review the code diff and provide feedback.
`);

  return dir;
}

describe('GuardedServer', () => {
  let server;
  let tempDir;

  before(async () => {
    tempDir = createTempSkill();
    server = await createGuardedServer(tempDir, {
      strict: false,
      allowNetwork: false,
      allowSubprocess: false,
    });
  });

  // ─── Initialize ─────────────────────────────────

  it('responds to initialize with effector-serve identity', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    assert.equal(response.result.serverInfo.name, 'effector-serve');
    assert.equal(response.result.serverInfo.version, '0.1.0');
    assert.ok(response.result.capabilities.telemetry);
  });

  // ─── Tools List ─────────────────────────────────

  it('lists inner tools plus synthetic tools', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const toolNames = response.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('effector_discover'));
    assert.ok(toolNames.includes('effector_compose'));
    assert.ok(toolNames.includes('effector_inspect'));
    // Should also include the test-skill
    assert.ok(toolNames.some(n => n === 'test-skill' || n === 'test_skill'));
  });

  // ─── Synthetic Tools ────────────────────────────

  it('handles effector_discover call', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'effector_discover', arguments: {} },
    });
    assert.ok(response.result);
    const data = JSON.parse(response.result.content[0].text);
    assert.ok(data.matches);
  });

  it('handles effector_inspect call', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'effector_inspect', arguments: {} },
    });
    assert.ok(response.result);
    const data = JSON.parse(response.result.content[0].text);
    assert.ok(data.available_tools);
  });

  it('handles effector_compose call', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'effector_compose', arguments: { from_type: 'CodeDiff', to_type: 'ReviewReport' } },
    });
    assert.ok(response.result);
  });

  // ─── Unknown Tool ───────────────────────────────

  it('returns error for unknown tool', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'nonexistent', arguments: {} },
    });
    assert.ok(response.error);
    assert.equal(response.error.code, -32602);
  });

  // ─── Unknown Method ─────────────────────────────

  it('returns method not found for unknown method', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'unknown/method',
    });
    assert.ok(response.error);
    assert.equal(response.error.code, -32601);
  });

  // ─── Notifications ──────────────────────────────

  it('returns null for notifications/initialized', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    assert.equal(response, null);
  });

  // ─── Telemetry ──────────────────────────────────

  it('records telemetry events on tool calls', () => {
    // Make a synthetic tool call to generate telemetry
    server.handleRequest({
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/call',
      params: { name: 'effector_discover', arguments: {} },
    });
    const stats = server.telemetry.getStats();
    assert.ok(stats.callCount > 0);
  });
});

describe('GuardedServer (strict mode)', () => {
  it('creates server in strict mode', async () => {
    const tempDir = createTempSkill();
    const server = await createGuardedServer(tempDir, { strict: true });
    assert.ok(server);
    assert.equal(server.options.strict, true);
  });
});

describe('GuardedServer (permission enforcement)', () => {
  it('blocks tools with network permission when not allowed', async () => {
    const tempDir = createTempSkill();
    const server = await createGuardedServer(tempDir, {
      allowNetwork: false,
    });

    // Find the test-skill name (might be normalized)
    const toolNames = [...server.toolMap.keys()];
    const skillName = toolNames.find(n => n.includes('test'));

    if (skillName) {
      const response = server.handleRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: skillName, arguments: {} },
      });
      // Should be denied because test-skill has network=true but allowNetwork=false
      assert.ok(response.error);
      assert.ok(response.error.data?.code === 'EFFECTOR_PERMISSION_DENIED');
    }
  });

  it('allows tools with network permission when explicitly allowed', async () => {
    const tempDir = createTempSkill();
    const server = await createGuardedServer(tempDir, {
      allowNetwork: true,
    });

    const toolNames = [...server.toolMap.keys()];
    const skillName = toolNames.find(n => n.includes('test'));

    if (skillName) {
      const response = server.handleRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: skillName, arguments: {} },
      });
      // Should succeed — network is allowed
      assert.ok(response.result || !response.error?.data?.code?.includes('PERMISSION'));
    }
  });
});
