import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { GatewayError } from '../gateway.js';
import {
  clientHeaders,
  clientNameSchema,
  isPlainObject,
  toolError,
  type ToolDeps,
} from './shared.js';

const SEARCH_DESCRIPTION =
  'Find and evaluate public API endpoints and MCPs that match your query. Set `q` to a natural ' +
  'language query, keywords, an API name, or a question — results are matched by meaning ' +
  'and keyword; each result includes `id`, `resourceType` (`endpoint` or `mcp`), `name`, ' +
  '`description`, `method` (for an `endpoint`) or `transport` (for an `mcp`), `url`, and ' +
  '`evaluateGuide` — an evaluation of what the endpoint or MCP does, when to use it, and its ' +
  "limitations. Review `evaluateGuide` to pick the best fit, then pass each chosen result's " +
  '`id` and `resourceType` (as `type`) to `integrate`. Paginate with `cursor` from ' +
  '`meta.nextCursor` (`limit` defaults to 10, max 25; pagination stops at 40 results total). ' +
  'No authentication required.\n\nBest practices for querying:\n' +
  '- Use focused keyword queries that include the product or provider name along with the endpoint details, for example "PayPal create invoice".\n' +
  '- Alternatively, use natural language queries such as "PayPal API to create an invoice".\n' +
  '- Avoid jumbled queries that cram many unrelated keywords into a single query, for example "paypal invoice payment delivery payments ordering".\n' +
  '- Avoid OR-separated queries such as "paypal invoice OR paypal create invoice OR paypal OR invoice creation".\n' +
  '- If you need to explore multiple intents, try each as a separate call.';

const searchInputSchema = {
  q: z
    .string()
    .min(1)
    .max(512)
    .describe(
      'Free-text search: a natural language query, keywords, an API name, or a question ' +
        '(e.g. "weather forecast", "twilio", "Add tracking details for an existing paypal order"). ' +
        'Matched by meaning and keyword.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe('Results per page (default 10, max 25).'),
  cursor: z
    .string()
    .optional()
    .describe(
      "Pagination cursor from a prior response's `meta.nextCursor`. Omit for the first page.",
    ),
  clientName: clientNameSchema,
};

interface SearchArgs {
  readonly q: string;
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly clientName?: string | undefined;
}

/**
 * Build the Orbit search request and delegate the HTTP call to the gateway:
 * `limit`/`cursor` go on the query string, only `q` goes in the JSON body.
 */
function runSearch({ config, gateway }: ToolDeps, args: SearchArgs): Promise<unknown> {
  const url = new URL(config.searchUrl);
  url.searchParams.set('limit', String(args.limit));
  if (args.cursor !== undefined) {
    url.searchParams.set('cursor', args.cursor);
  }
  return gateway.postJson(
    url.toString(),
    { q: args.q },
    config.searchTimeoutSeconds,
    clientHeaders(args.clientName),
  );
}

export function registerSearchTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: SEARCH_DESCRIPTION,
      inputSchema: searchInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ q, limit, cursor, clientName }): Promise<CallToolResult> => {
      try {
        const result = await runSearch(deps, { q, limit, cursor, clientName });
        if (!isPlainObject(result)) {
          return toolError('Upstream search returned an unexpected (non-object) payload.');
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        if (error instanceof GatewayError) {
          deps.logger.warn({ tool: 'search', status: error.status }, 'search request failed');
          return toolError(error.message);
        }
        throw error;
      }
    },
  );
}
