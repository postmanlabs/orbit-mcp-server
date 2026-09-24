import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { Config } from '../config.js';
import type { OrbitGateway } from '../gateway.js';
import type { Logger } from '../logger.js';

/** Dependencies shared by all tool handlers. */
export interface ToolDeps {
  /** Endpoint URLs and timeouts each tool needs to build its request. */
  readonly config: Config;
  readonly gateway: OrbitGateway;
  readonly logger: Logger;
}

/** HTTP header used to attribute a request to the calling client for analytics. */
export const CLIENT_NAME_HEADER = 'orbit-client-name';

/**
 * Shared, optional `clientName` tool parameter forwarded to the gateway as the
 * `orbit-client-name` header. Used only for anonymous usage analytics.
 *
 * Line breaks are rejected to prevent header injection.
 */
export const clientNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[^\r\n]+$/, 'clientName must not contain line breaks')
  .optional()
  .describe(
    'Name of the client application or agent invoking this tool (e.g. "cursor/composer-2.5", ' +
      '"claude/sonnet-4.6", "codex/gpt-5.6-sol"). Used for anonymous usage analytics.',
  );

/** Build the optional analytics header block for an upstream request. */
export function clientHeaders(clientName?: string): Record<string, string> | undefined {
  return clientName ? { [CLIENT_NAME_HEADER]: clientName } : undefined;
}

/** Build an MCP tool-error result whose text is surfaced to the calling agent. */
export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/** Narrow an unknown value to a plain JSON object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
