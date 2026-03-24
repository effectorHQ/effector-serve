/**
 * @module telemetry
 *
 * In-memory ring buffer for runtime events.
 * Tracks validation results, tool calls, and permission checks.
 * No persistence, no external deps — diagnostic only.
 */

const DEFAULT_CAPACITY = 1000;

/**
 * Create a telemetry ring buffer.
 * @param {{ capacity?: number }} [options]
 * @returns {Telemetry}
 */
export function createTelemetry(options = {}) {
  const capacity = options.capacity || DEFAULT_CAPACITY;
  const buffer = new Array(capacity);
  let head = 0;
  let count = 0;

  return {
    /**
     * Record an event.
     * @param {Object} event - { type, tool, ... }
     */
    record(event) {
      buffer[head] = { ...event, timestamp: Date.now() };
      head = (head + 1) % capacity;
      if (count < capacity) count++;
    },

    /**
     * Get the N most recent events.
     * @param {number} [n=50]
     * @returns {Object[]}
     */
    getRecent(n = 50) {
      const limit = Math.min(n, count);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const idx = (head - 1 - i + capacity) % capacity;
        result.push(buffer[idx]);
      }
      return result;
    },

    /**
     * Get aggregate stats.
     * @returns {{ totalEvents, validationPass, validationFail, callCount, permissionDenied, byTool }}
     */
    getStats() {
      const stats = {
        totalEvents: count,
        validationPass: 0,
        validationFail: 0,
        callCount: 0,
        permissionDenied: 0,
        byTool: {},
      };

      for (let i = 0; i < count; i++) {
        const idx = (head - 1 - i + capacity) % capacity;
        const event = buffer[idx];
        if (!event) continue;

        // Per-tool tracking
        if (event.tool) {
          if (!stats.byTool[event.tool]) {
            stats.byTool[event.tool] = { calls: 0, validationPass: 0, validationFail: 0 };
          }
          const toolStats = stats.byTool[event.tool];

          if (event.type === 'validation') {
            if (event.valid) {
              stats.validationPass++;
              toolStats.validationPass++;
            } else {
              stats.validationFail++;
              toolStats.validationFail++;
            }
          } else if (event.type === 'call') {
            stats.callCount++;
            toolStats.calls++;
          } else if (event.type === 'permission' && !event.allowed) {
            stats.permissionDenied++;
          }
        }
      }

      return stats;
    },

    /** Get total event count */
    get size() {
      return count;
    },

    /** Clear all events */
    clear() {
      head = 0;
      count = 0;
    },
  };
}
