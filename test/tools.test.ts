import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  connectHarness,
  type Harness,
  INTEGRATE_URL,
  jsonResponse,
  PROBLEM_JSON,
  textContent,
} from './helpers.js';

function alwaysFetch(factory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn(async () => factory());
}

const searchPayload = {
  data: [
    {
      id: 'req-1',
      resourceType: 'endpoint',
      name: 'Get weather forecast',
      description: 'Returns a 7-day forecast',
      method: 'GET',
      url: 'https://api.example.com/forecast',
    },
  ],
  meta: { q: 'weather forecast', total: 1, nextCursor: 'abc123' },
};

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('tool registration', () => {
  it('always serves both search and integrate', async () => {
    harness = await connectHarness({
      fetchImpl: alwaysFetch(() => jsonResponse(200, {})) as never,
    });
    const { tools } = await harness.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['integrate', 'search']);
  });
});

describe('search tool', () => {
  it('returns JSON text content plus structured content', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, searchPayload));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({
      name: 'search',
      arguments: { q: 'weather forecast' },
    });

    expect(result.isError).toBeFalsy();

    const text = textContent(result as never);
    expect(JSON.parse(text).data[0].id).toBe('req-1');

    const structured = result.structuredContent as typeof searchPayload;
    expect(structured.data[0]!.id).toBe('req-1');
    expect(structured.data[0]!.resourceType).toBe('endpoint');
    expect(structured.meta.nextCursor).toBe('abc123');

    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(new URL(url as string).searchParams.get('limit')).toBe('10');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ q: 'weather forecast' });
  });

  it('passes an mcp result through verbatim (resourceType mcp, transport instead of method)', async () => {
    const mcpPayload = {
      data: [
        {
          id: 'mcp-1',
          resourceType: 'mcp',
          name: 'Send a message',
          description: 'Sends a message to a channel',
          transport: 'streamable-http',
          url: 'https://mcp.example.com/mcp',
        },
      ],
      meta: { q: 'send message', total: 1 },
    };
    harness = await connectHarness({
      fetchImpl: alwaysFetch(() => jsonResponse(200, mcpPayload)) as never,
    });

    const result = await harness.client.callTool({
      name: 'search',
      arguments: { q: 'send message' },
    });

    expect(result.isError).toBeFalsy();

    const structured = result.structuredContent as typeof mcpPayload;
    expect(structured.data[0]!.resourceType).toBe('mcp');
    expect(structured.data[0]!.transport).toBe('streamable-http');
    expect(structured.data[0]!).not.toHaveProperty('method');
  });

  it('sends limit and cursor as query params, body carries only the query', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [], meta: {} }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    await harness.client.callTool({
      name: 'search',
      arguments: { q: 'payments', limit: 5, cursor: 'cur-9' },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('limit')).toBe('5');
    expect(parsed.searchParams.get('cursor')).toBe('cur-9');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ q: 'payments' });
  });

  it('forwards clientName as the orbit-client-name header when provided', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [], meta: {} }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    await harness.client.callTool({
      name: 'search',
      arguments: { q: 'payments', clientName: 'cursor' },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['orbit-client-name']).toBe('cursor');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ q: 'payments' });
  });

  it('omits the orbit-client-name header when clientName is not provided', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [], meta: {} }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    await harness.client.callTool({ name: 'search', arguments: { q: 'payments' } });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('orbit-client-name');
  });

  it('surfaces an upstream 400 verbatim as a tool error', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: "body must NOT have additional properties: 'query'",
    };
    const fetchMock = alwaysFetch(() =>
      jsonResponse(400, problem, {
        statusText: 'Bad Request',
        headers: { 'content-type': PROBLEM_JSON },
      }),
    );
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({ name: 'search', arguments: { q: 'oops' } });

    expect(result.isError).toBe(true);
    const text = textContent(result as never);
    expect(text).toContain('400');
    expect(text).toContain("additional properties: 'query'");
  });

  it('does not retry a 404', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(404, { title: 'Not Found', detail: 'gone' }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({ name: 'search', arguments: { q: 'x' } });

    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a validation error for input that violates the schema', async () => {
    harness = await connectHarness({
      fetchImpl: alwaysFetch(() => jsonResponse(200, {})) as never,
    });

    const result = await harness.client.callTool({
      name: 'search',
      arguments: { q: 'a'.repeat(513) },
    });

    expect(result.isError).toBe(true);
    expect(textContent(result as never)).toMatch(/validation|512/i);
  });
});

describe('integrate tool', () => {
  const brief = 'TASK BRIEF:\nDo the thing\nAUTH: none\nBASE URL: x\nSTEPS:\n1\nGOTCHAS:\n-';
  const args = {
    task: 'get the weather',
    resources: [{ id: 'req-1', type: 'endpoint' }],
  };

  it('returns the task brief text and sends task + resources in the body', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [{ taskBrief: brief }] }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({ name: 'integrate', arguments: args });

    expect(result.isError).toBeFalsy();
    expect(textContent(result as never)).toBe(brief);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(INTEGRATE_URL);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      task: 'get the weather',
      resources: [{ id: 'req-1', type: 'endpoint' }],
    });
  });

  it('forwards an mcp resource type in the request body', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [{ taskBrief: brief }] }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    await harness.client.callTool({
      name: 'integrate',
      arguments: { task: 'send a message', resources: [{ id: 'mcp-1', type: 'mcp' }] },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      task: 'send a message',
      resources: [{ id: 'mcp-1', type: 'mcp' }],
    });
  });

  it('forwards clientName as the orbit-client-name header', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [{ taskBrief: brief }] }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    await harness.client.callTool({
      name: 'integrate',
      arguments: { ...args, clientName: 'claude-desktop' },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['orbit-client-name']).toBe('claude-desktop');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      task: 'get the weather',
      resources: [{ id: 'req-1', type: 'endpoint' }],
    });
  });

  it('sends every provided resource in the request body', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [{ taskBrief: brief }] }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    await harness.client.callTool({
      name: 'integrate',
      arguments: {
        task: 'track a shipment and get live scores',
        resources: [
          { id: 'req-1', type: 'endpoint' },
          { id: 'req-2', type: 'endpoint' },
        ],
      },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      task: 'track a shipment and get live scores',
      resources: [
        { id: 'req-1', type: 'endpoint' },
        { id: 'req-2', type: 'endpoint' },
      ],
    });
  });

  it('fails on a 502 without retrying, surfacing the upstream detail', async () => {
    const problem = { title: 'Bad Gateway', status: 502, detail: 'AI generation failed' };
    const fetchMock = alwaysFetch(() =>
      jsonResponse(502, problem, {
        statusText: 'Bad Gateway',
        headers: { 'content-type': PROBLEM_JSON },
      }),
    );
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({ name: 'integrate', arguments: args });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    const text = textContent(result as never);
    expect(text).toContain('502');
    expect(text).toContain('AI generation failed');
  });

  it('surfaces a 404 as a not-found error', async () => {
    const problem = {
      title: 'Not Found',
      status: 404,
      detail: 'No resource could be resolved for one or more of the provided ids',
    };
    const fetchMock = alwaysFetch(() =>
      jsonResponse(404, problem, {
        statusText: 'Not Found',
        headers: { 'content-type': PROBLEM_JSON },
      }),
    );
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({
      name: 'integrate',
      arguments: { task: 'x', resources: [{ id: 'missing', type: 'endpoint' }] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(textContent(result as never)).toContain('No resource could be resolved');
  });

  it('reports when no task brief is returned', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [] }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({ name: 'integrate', arguments: args });

    expect(result.isError).toBe(true);
    expect(textContent(result as never)).toContain('No task brief');
  });

  it('reports when the payload lacks a taskBrief field', async () => {
    const fetchMock = alwaysFetch(() => jsonResponse(200, { data: [{ somethingElse: true }] }));
    harness = await connectHarness({ fetchImpl: fetchMock as never });

    const result = await harness.client.callTool({ name: 'integrate', arguments: args });

    expect(result.isError).toBe(true);
    expect(textContent(result as never)).toContain("did not include a 'taskBrief'");
  });

  it('returns a validation error when resources is empty', async () => {
    harness = await connectHarness({
      fetchImpl: alwaysFetch(() => jsonResponse(200, {})) as never,
    });

    const result = await harness.client.callTool({
      name: 'integrate',
      arguments: { task: 'do it', resources: [] },
    });

    expect(result.isError).toBe(true);
  });
});
