import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Config } from './config.js';
import type { OrbitGateway } from './gateway.js';
import type { Logger } from './logger.js';
import { registerIntegrateTool } from './tools/integrate.js';
import { registerSearchTool } from './tools/search.js';
import { SERVER_NAME, VERSION } from './version.js';

const INSTRUCTIONS =
  'Authless proxy to the public Orbit APIs. Typical flow: search → evaluate → integrate. ' +
  "Use `search` to find public API endpoints and MCPs matching a goal and evaluate each result's " +
  "`evaluateGuide`; then pass your `task` plus the chosen results (each result's `id` and " +
  '`resourceType`) to `integrate` for a natural-language task brief describing how to call ' +
  'them. Only public content is available (no auth is sent).';

export interface CreateServerDeps {
  readonly config: Config;
  readonly gateway: OrbitGateway;
  readonly logger: Logger;
}

/**
 * Build a fresh {@link McpServer} with the Orbit tools registered.
 *
 * Both `search` and `integrate` are always registered.
 */
export function createMcpServer({ config, gateway, logger }: CreateServerDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerSearchTool(server, { config, gateway, logger });
  registerIntegrateTool(server, { config, gateway, logger });

  return server;
}
