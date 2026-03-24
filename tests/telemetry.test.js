import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetry } from '../src/telemetry.js';

describe('createTelemetry', () => {
  it('records and retrieves events', () => {
    const tel = createTelemetry();
    tel.record({ type: 'call', tool: 'test-tool' });
    const recent = tel.getRecent(1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].tool, 'test-tool');
    assert.ok(recent[0].timestamp);
  });

  it('returns events in reverse chronological order', () => {
    const tel = createTelemetry();
    tel.record({ type: 'call', tool: 'first' });
    tel.record({ type: 'call', tool: 'second' });
    tel.record({ type: 'call', tool: 'third' });
    const recent = tel.getRecent(3);
    assert.equal(recent[0].tool, 'third');
    assert.equal(recent[1].tool, 'second');
    assert.equal(recent[2].tool, 'first');
  });

  it('respects ring buffer capacity', () => {
    const tel = createTelemetry({ capacity: 3 });
    for (let i = 0; i < 5; i++) {
      tel.record({ type: 'call', tool: `tool-${i}` });
    }
    assert.equal(tel.size, 3);
    const recent = tel.getRecent(10);
    assert.equal(recent.length, 3);
    assert.equal(recent[0].tool, 'tool-4'); // most recent
    assert.equal(recent[2].tool, 'tool-2'); // oldest retained
  });

  it('computes stats correctly', () => {
    const tel = createTelemetry();
    tel.record({ type: 'validation', tool: 'a', valid: true });
    tel.record({ type: 'validation', tool: 'a', valid: true });
    tel.record({ type: 'validation', tool: 'a', valid: false });
    tel.record({ type: 'call', tool: 'a' });
    tel.record({ type: 'call', tool: 'b' });
    tel.record({ type: 'permission', tool: 'c', allowed: false });

    const stats = tel.getStats();
    assert.equal(stats.totalEvents, 6);
    assert.equal(stats.validationPass, 2);
    assert.equal(stats.validationFail, 1);
    assert.equal(stats.callCount, 2);
    assert.equal(stats.permissionDenied, 1);
    assert.equal(stats.byTool.a.calls, 1);
    assert.equal(stats.byTool.a.validationPass, 2);
    assert.equal(stats.byTool.b.calls, 1);
  });

  it('clears all events', () => {
    const tel = createTelemetry();
    tel.record({ type: 'call', tool: 'x' });
    tel.record({ type: 'call', tool: 'y' });
    tel.clear();
    assert.equal(tel.size, 0);
    assert.equal(tel.getRecent(10).length, 0);
  });
});
