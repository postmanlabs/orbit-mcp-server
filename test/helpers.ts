import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import pino from 'pino';

import { loadConfig, type Config } from '../src/config.js';
import { OrbitGateway, type FetchLike } from '../src/gateway.js';
import { createMcpServer } from '../src/server.js';
import type { RequestContext } from '../src/tools/shared.js';

export const BASE_URL = 'https://gateway.test';
export const SEARCH_URL = `${BASE_URL}/v1/search`;
export const INTEGRATE_URL = `${BASE_URL}/v1/integrate`;
export const PROBLEM_JSON = 'application/problem+json';

const silentLogger = pino({ level: 'silent' });

/** Build a test config pointed at the fake gateway. */
export function makeConfig(env: Record<string, string | undefined> = {}): Config {
  return loadConfig({
    ORBIT_GATEWAY_BASE_URL: BASE_URL,
    ORBIT_LOG_LEVEL: 'silent',
    ...env,
  });
}

/** Build a JSON `Response`, mirroring an upstream reply. */
export function jsonResponse(
  status: number,
  body: unknown,
  init: { statusText?: string; headers?: Record<string, string> } = {},
): Response {
  const headers = { 'content-type': 'application/json', ...init.headers };
  const responseInit: ResponseInit = {
    status,
    headers,
    ...(init.statusText !== undefined ? { statusText: init.statusText } : {}),
  };
  return new Response(JSON.stringify(body), responseInit);
}

export interface Harness {
  readonly client: Client;
  readonly config: Config;
  close(): Promise<void>;
}

/**
 * Wire a real {@link OrbitGateway} (with an injected fetch) into a real
 * {@link createMcpServer}, connected to an MCP {@link Client} over an in-memory
 * transport pair. This exercises the full tool registration + call path.
 */
export async function connectHarness(opts: {
  fetchImpl: FetchLike;
  config?: Config;
  requestContext?: RequestContext;
}): Promise<Harness> {
  const config = opts.config ?? makeConfig();
  const gateway = new OrbitGateway({ fetchImpl: opts.fetchImpl });
  const server = createMcpServer({
    config,
    gateway,
    logger: silentLogger,
    requestContext: opts.requestContext,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    config,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

/** Concatenate the text of all text content blocks in a tool result. */
export function textContent(result: {
  content?: ReadonlyArray<{ type: string; text?: string }>;
}): string {
  return (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
}
