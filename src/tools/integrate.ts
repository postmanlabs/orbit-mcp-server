import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { GatewayError } from '../gateway.js';
import {
  clientNameSchema,
  isPlainObject,
  toolError,
  upstreamHeaders,
  type ToolDeps,
} from './shared.js';

const INTEGRATE_DESCRIPTION =
  'Get integration details for public endpoints and MCPs from `search` results. Provide a `task` ' +
  'describing what you want to accomplish and up to 10 `resources` — each with an `id` ' +
  "and `type` taken from the matching search result's `resourceType`. Returns a task " +
  'brief covering authentication, base URLs, request steps, parameters, expected ' +
  'responses, dependencies between steps, and other important considerations.';

const integrateResourceSchema = z.object({
  id: z.string().min(1).max(256).describe("Resource id from a search result's `id` field."),
  type: z
    .string()
    .min(1)
    .max(64)
    .describe("Resource type from a search result's `resourceType` field (`endpoint` or `mcp`)."),
});

const integrateInputSchema = {
  task: z
    .string()
    .min(1)
    .max(512)
    .describe('What you want to accomplish with the selected resources (max 512 characters).'),
  resources: z
    .array(integrateResourceSchema)
    .min(1)
    .max(10)
    .describe(
      'Up to 10 endpoints or MCPs to integrate. Each entry needs an `id` and `type` from a search ' +
        "result (`type` is the result's `resourceType`).",
    ),
  clientName: clientNameSchema,
};

interface IntegrateResource {
  readonly id: string;
  readonly type: string;
}

interface IntegrateArgs {
  readonly task: string;
  readonly resources: readonly IntegrateResource[];
  readonly clientName?: string | undefined;
}

type BriefResult = { ok: true; brief: string } | { ok: false; reason: 'no-data' | 'no-brief' };

function extractTaskBrief(result: unknown): BriefResult {
  const data = isPlainObject(result) ? result.data : undefined;
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, reason: 'no-data' };
  }

  const briefs = data
    .map((entry) => (isPlainObject(entry) ? entry.taskBrief : undefined))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (briefs.length === 0) {
    return { ok: false, reason: 'no-brief' };
  }
  return { ok: true, brief: briefs.join('\n\n') };
}

function sendIntegrate(
  { config, gateway, requestContext }: ToolDeps,
  args: IntegrateArgs,
): Promise<unknown> {
  const body = {
    task: args.task,
    resources: args.resources.map((resource) => ({ id: resource.id, type: resource.type })),
  };
  return gateway.postJson(
    config.integrateUrl,
    body,
    config.integrateTimeoutSeconds,
    upstreamHeaders(args.clientName, requestContext),
  );
}

export function registerIntegrateTool(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'integrate',
    {
      title: 'Integrate',
      description: INTEGRATE_DESCRIPTION,
      inputSchema: integrateInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ task, resources, clientName }): Promise<CallToolResult> => {
      let result: unknown;
      try {
        result = await sendIntegrate(deps, { task, resources, clientName });
      } catch (error) {
        if (error instanceof GatewayError) {
          deps.logger.warn({ tool: 'integrate', status: error.status }, 'integrate request failed');
          if (error.status === 404) {
            return toolError(
              'No resource could be resolved for one or more of the provided ids ' +
                '(unknown and private ids are indistinguishable).',
            );
          }
          return toolError(error.message);
        }
        throw error;
      }

      const brief = extractTaskBrief(result);
      if (!brief.ok) {
        if (brief.reason === 'no-data') {
          return toolError(
            'No task brief was returned for the provided resources ' +
              '(they may be private or nonexistent).',
          );
        }
        return toolError("Upstream integrate response did not include a 'taskBrief'.");
      }
      return { content: [{ type: 'text', text: brief.brief }] };
    },
  );
}
