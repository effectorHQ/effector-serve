import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleDiscover } from '../src/tools/discover.js';

// Mock toolMap
function createMockToolMap() {
  const map = new Map();
  map.set('code-review', {
    description: 'Review code changes',
    inputSchema: { type: 'object', properties: {} },
    _interface: { input: 'CodeDiff', output: 'ReviewReport', context: [] },
    _permissions: { network: false },
  });
  map.set('summarize', {
    description: 'Summarize text',
    inputSchema: { type: 'object', properties: {} },
    _interface: { input: 'String', output: 'Markdown', context: [] },
    _permissions: {},
  });
  map.set('deploy', {
    description: 'Deploy application',
    inputSchema: { type: 'object', properties: {} },
    _interface: { input: 'JSON', output: 'Notification', context: [] },
    _permissions: { network: true, subprocess: true },
  });
  map.set('no-interface', {
    description: 'Legacy tool without interface',
    inputSchema: { type: 'object', properties: {} },
  });
  return map;
}

describe('handleDiscover', () => {
  it('returns all skills when no filters provided', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({}, toolMap);
    const data = JSON.parse(result.content[0].text);
    // Should include all except the synthetic effector_ tools
    assert.equal(data.matches.length, 4);
  });

  it('filters by input_type', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({ input_type: 'CodeDiff' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.matches.length, 1);
    assert.equal(data.matches[0].name, 'code-review');
  });

  it('filters by output_type', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({ output_type: 'Notification' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.matches.length, 1);
    assert.equal(data.matches[0].name, 'deploy');
  });

  it('filters by name_pattern', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({ name_pattern: 'deploy' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.matches.length, 1);
    assert.equal(data.matches[0].name, 'deploy');
  });

  it('returns empty when no match', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({ input_type: 'ImageRef' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.matches.length, 0);
    assert.ok(data.summary.includes('No skills found'));
  });

  it('includes interface details in matches', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({ input_type: 'CodeDiff' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.matches[0].interface.input, 'CodeDiff');
    assert.equal(data.matches[0].interface.output, 'ReviewReport');
  });

  it('excludes tools without matching interface when input_type filter is set', () => {
    const toolMap = createMockToolMap();
    const result = handleDiscover({ input_type: 'String' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    // Only 'summarize' accepts String input; 'no-interface' has no _interface
    assert.equal(data.matches.length, 1);
    assert.equal(data.matches[0].name, 'summarize');
  });
});
