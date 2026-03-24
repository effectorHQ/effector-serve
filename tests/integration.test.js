/**
 * Integration tests — full flow from skill loading to guarded execution.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createGuardedServer } from '../src/server.js';

function createMultiSkillDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'effector-serve-int-'));

  // Skill 1: code-review
  const skill1 = path.join(dir, 'code-review');
  fs.mkdirSync(skill1);
  fs.writeFileSync(path.join(skill1, 'effector.toml'), `
[effector]
name = "code-review"
version = "1.0.0"
type = "skill"
description = "Review code changes"

[effector.interface]
input = "CodeDiff"
output = "ReviewReport"
`);
  fs.writeFileSync(path.join(skill1, 'SKILL.md'), `---
name: code-review
description: Review code
---

Review the provided code diff.
`);

  // Skill 2: format-report
  const skill2 = path.join(dir, 'format-report');
  fs.mkdirSync(skill2);
  fs.writeFileSync(path.join(skill2, 'effector.toml'), `
[effector]
name = "format-report"
version = "1.0.0"
type = "skill"
description = "Format a review report as markdown"

[effector.interface]
input = "ReviewReport"
output = "Markdown"
`);
  fs.writeFileSync(path.join(skill2, 'SKILL.md'), `---
name: format-report
description: Format report
---

Format the review report as clean markdown.
`);

  return dir;
}

describe('Integration: Multi-skill server', () => {
  let server;

  before(async () => {
    const dir = createMultiSkillDir();
    server = await createGuardedServer(dir, {
      strict: false,
      allowNetwork: true,
      allowSubprocess: true,
    });
  });

  it('loads multiple skills', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    });
    const toolNames = response.result.tools.map(t => t.name);
    // Should have both skills + 3 synthetic
    assert.ok(toolNames.length >= 5);
    assert.ok(toolNames.includes('effector_discover'));
    assert.ok(toolNames.includes('effector_compose'));
    assert.ok(toolNames.includes('effector_inspect'));
  });

  it('discovers skills by input type', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0', id: 2,
      method: 'tools/call',
      params: { name: 'effector_discover', arguments: { input_type: 'CodeDiff' } },
    });
    const data = JSON.parse(response.result.content[0].text);
    assert.ok(data.matches.length > 0);
    assert.ok(data.matches.some(m => m.name.includes('code-review') || m.name.includes('code_review')));
  });

  it('discovers skills by output type', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0', id: 3,
      method: 'tools/call',
      params: { name: 'effector_discover', arguments: { output_type: 'Markdown' } },
    });
    const data = JSON.parse(response.result.content[0].text);
    assert.ok(data.matches.length > 0);
  });

  it('suggests composition chain from CodeDiff to Markdown', () => {
    const response = server.handleRequest({
      jsonrpc: '2.0', id: 4,
      method: 'tools/call',
      params: { name: 'effector_compose', arguments: { from_type: 'CodeDiff', to_type: 'Markdown' } },
    });
    const data = JSON.parse(response.result.content[0].text);
    // Should find: code-review (CodeDiff→ReviewReport) → format-report (ReviewReport→Markdown)
    assert.ok(data.suggestions.length > 0, 'Should find at least one composition path');
    const chain = data.suggestions[0].steps;
    assert.ok(chain.length >= 2, 'Chain should have at least 2 steps');
  });

  it('inspects a specific skill', () => {
    // Find a tool name
    const listResp = server.handleRequest({
      jsonrpc: '2.0', id: 5, method: 'tools/list',
    });
    const skillTool = listResp.result.tools.find(t => !t.name.startsWith('effector_'));
    assert.ok(skillTool, 'Should have at least one non-synthetic tool');

    const response = server.handleRequest({
      jsonrpc: '2.0', id: 6,
      method: 'tools/call',
      params: { name: 'effector_inspect', arguments: { tool_name: skillTool.name } },
    });
    const data = JSON.parse(response.result.content[0].text);
    assert.equal(data.name, skillTool.name);
    assert.ok(data.interface);
  });

  it('calls a skill and returns instruction passthrough content', () => {
    const listResp = server.handleRequest({
      jsonrpc: '2.0', id: 7, method: 'tools/list',
    });
    const skillTool = listResp.result.tools.find(t => !t.name.startsWith('effector_'));

    const response = server.handleRequest({
      jsonrpc: '2.0', id: 8,
      method: 'tools/call',
      params: { name: skillTool.name, arguments: { files: [{ path: 'test.js' }] } },
    });
    assert.ok(response.result);
    assert.ok(response.result.content.length > 0);
    assert.equal(response.result.content[0].type, 'text');
  });

  it('tracks telemetry across multiple calls', () => {
    // Make several calls
    for (let i = 0; i < 5; i++) {
      server.handleRequest({
        jsonrpc: '2.0', id: 100 + i,
        method: 'tools/call',
        params: { name: 'effector_discover', arguments: {} },
      });
    }
    const stats = server.telemetry.getStats();
    assert.ok(stats.callCount >= 5);
  });

  it('full lifecycle: initialize → list → discover → compose → call', () => {
    // 1. Initialize
    const init = server.handleRequest({ jsonrpc: '2.0', id: 200, method: 'initialize' });
    assert.equal(init.result.serverInfo.name, 'effector-serve');

    // 2. List tools
    const list = server.handleRequest({ jsonrpc: '2.0', id: 201, method: 'tools/list' });
    assert.ok(list.result.tools.length > 3);

    // 3. Discover by type
    const discover = server.handleRequest({
      jsonrpc: '2.0', id: 202,
      method: 'tools/call',
      params: { name: 'effector_discover', arguments: { input_type: 'CodeDiff' } },
    });
    const discovered = JSON.parse(discover.result.content[0].text);
    assert.ok(discovered.matches.length > 0);

    // 4. Compose a chain
    const compose = server.handleRequest({
      jsonrpc: '2.0', id: 203,
      method: 'tools/call',
      params: { name: 'effector_compose', arguments: { from_type: 'CodeDiff', to_type: 'Markdown' } },
    });
    const composed = JSON.parse(compose.result.content[0].text);
    assert.ok(composed.suggestions.length > 0);

    // 5. Call the first skill in the chain
    const firstSkill = composed.suggestions[0].steps[0].name;
    const call = server.handleRequest({
      jsonrpc: '2.0', id: 204,
      method: 'tools/call',
      params: { name: firstSkill, arguments: { files: [{ path: 'src/main.js', diff: '+new code' }] } },
    });
    assert.ok(call.result);
  });
});
