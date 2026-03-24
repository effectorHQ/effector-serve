import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleCompose } from '../src/tools/compose.js';

// Mock toolMap with composable types
function createMockToolMap() {
  const map = new Map();
  map.set('code-review', {
    _interface: { input: 'CodeDiff', output: 'ReviewReport' },
    _metadata: { version: '1.0.0' },
    _permissions: {},
  });
  map.set('format-report', {
    _interface: { input: 'ReviewReport', output: 'Markdown' },
    _metadata: { version: '1.0.0' },
    _permissions: {},
  });
  map.set('notify', {
    _interface: { input: 'Markdown', output: 'Notification' },
    _metadata: { version: '1.0.0' },
    _permissions: {},
  });
  return map;
}

describe('handleCompose', () => {
  it('returns error when missing required args', () => {
    const result = handleCompose({}, new Map());
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.error);
  });

  it('finds direct composition path', () => {
    const toolMap = createMockToolMap();
    const result = handleCompose({ from_type: 'CodeDiff', to_type: 'ReviewReport' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.suggestions.length > 0);
    assert.equal(data.suggestions[0].steps[0].name, 'code-review');
  });

  it('finds multi-step composition path', () => {
    const toolMap = createMockToolMap();
    const result = handleCompose({ from_type: 'CodeDiff', to_type: 'Markdown', max_depth: 3 }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.suggestions.length > 0);
    // Should find: code-review (CodeDiff→ReviewReport) → format-report (ReviewReport→Markdown)
    const chain = data.suggestions[0].steps;
    assert.ok(chain.length >= 2);
  });

  it('returns empty when no path exists', () => {
    const toolMap = createMockToolMap();
    const result = handleCompose({ from_type: 'ImageRef', to_type: 'Notification' }, toolMap);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.suggestions.length, 0);
    assert.ok(data.summary.includes('No composition path'));
  });

  it('respects max_depth', () => {
    const toolMap = createMockToolMap();
    const result = handleCompose({ from_type: 'CodeDiff', to_type: 'Notification', max_depth: 1 }, toolMap);
    const data = JSON.parse(result.content[0].text);
    // No direct path from CodeDiff to Notification in 1 step
    assert.equal(data.suggestions.length, 0);
  });
});
