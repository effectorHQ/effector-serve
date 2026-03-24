/**
 * @module permission-enforcer
 *
 * Runtime permission gating for effector-serve.
 * Checks tool._permissions against server config before allowing execution.
 * Makes permissions declared in effector.toml enforceable at runtime.
 */

/**
 * @typedef {Object} PermissionConfig
 * @property {boolean} [allowNetwork=false]
 * @property {boolean} [allowSubprocess=false]
 * @property {boolean} [allowFilesystem=true]
 * @property {string[]} [allowedEnvVars=[]]
 */

/** Default: restrictive */
const DEFAULT_CONFIG = {
  allowNetwork: false,
  allowSubprocess: false,
  allowFilesystem: true,
  allowedEnvVars: [],
};

/**
 * Create a permission enforcer.
 * @param {PermissionConfig} [config]
 * @returns {{ check: (toolName, permissions) => PermissionResult }}
 */
export function createPermissionEnforcer(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    /**
     * Check if a tool's permissions are allowed by server config.
     * @param {string} toolName
     * @param {Object} permissions - Tool's _permissions from effector.toml
     * @returns {{ allowed: boolean, denied: Array<{ permission: string, reason: string }> }}
     */
    check(toolName, permissions) {
      if (!permissions) return { allowed: true, denied: [] };

      const denied = [];

      // Network check
      if (permissions.network === true && !cfg.allowNetwork) {
        denied.push({
          permission: 'network',
          reason: `Tool "${toolName}" requires network access. Use --allow-network to permit.`,
        });
      }

      // Subprocess check
      if (permissions.subprocess === true && !cfg.allowSubprocess) {
        denied.push({
          permission: 'subprocess',
          reason: `Tool "${toolName}" requires subprocess execution. Use --allow-subprocess to permit.`,
        });
      }

      // Filesystem check
      if (permissions.filesystem && !cfg.allowFilesystem) {
        denied.push({
          permission: 'filesystem',
          reason: `Tool "${toolName}" requires filesystem access, which is disabled.`,
        });
      }

      // Environment variable check
      if (permissions.envRead && cfg.allowedEnvVars.length > 0) {
        const envVars = Array.isArray(permissions.envRead) ? permissions.envRead : [permissions.envRead];
        for (const envVar of envVars) {
          if (!cfg.allowedEnvVars.includes(envVar) && !cfg.allowedEnvVars.includes('*')) {
            denied.push({
              permission: 'envRead',
              reason: `Tool "${toolName}" reads env var "${envVar}" which is not in the allowed list.`,
            });
          }
        }
      }

      return {
        allowed: denied.length === 0,
        denied,
      };
    },

    /** Get current config */
    getConfig() {
      return { ...cfg };
    },
  };
}
