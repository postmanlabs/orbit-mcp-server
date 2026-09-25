import { describe, expect, it, vi } from 'vitest';

import { GatewayError, OrbitGateway } from '../src/gateway.js';
import { SERVER_NAME, VERSION } from '../src/version.js';
import { jsonResponse, PROBLEM_JSON, SEARCH_URL } from './helpers.js';

const TIMEOUT_SECONDS = 60;

function fetchReturning(impl: () => Promise<Response>): ReturnType<typeof vi.fn> {
  return vi.fn(impl);
}

function gatewayWith(fetchMock: ReturnType<typeof vi.fn>): OrbitGateway {
  return new OrbitGateway({ fetchImpl: fetchMock as unknown as typeof fetch });
}

describe('OrbitGateway.postJson', () => {
  it('POSTs the JSON body to the URL and returns the parsed response', async () => {
    const fetchMock = fetchReturning(async () =>
      jsonResponse(200, { data: [{ id: 'req-1' }], meta: { total: 1 } }),
    );
    const gateway = gatewayWith(fetchMock);

    const result = await gateway.postJson(SEARCH_URL, { q: 'payments' }, TIMEOUT_SECONDS);

    expect(result).toEqual({ data: [{ id: 'req-1' }], meta: { total: 1 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SEARCH_URL);
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ q: 'payments' });
  });

  it('sends JSON headers and never sends auth', async () => {
    const fetchMock = fetchReturning(async () => jsonResponse(200, {}));
    const gateway = gatewayWith(fetchMock);

    await gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS);

    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    const lowerKeys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(lowerKeys).not.toContain('authorization');
    expect(lowerKeys).not.toContain('x-api-key');
    expect(lowerKeys).not.toContain('x-pstmn-req-service');
    expect(headers['content-type']).toBe('application/json');
    expect(headers['user-agent']).toBe(`${SERVER_NAME}/${VERSION}`);
  });

  it('merges extra headers over the default JSON headers', async () => {
    const fetchMock = fetchReturning(async () => jsonResponse(200, {}));
    const gateway = gatewayWith(fetchMock);

    await gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS, { 'orbit-client-name': 'cursor' });

    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['orbit-client-name']).toBe('cursor');
    expect(headers['content-type']).toBe('application/json');
    expect(headers['user-agent']).toBe(`${SERVER_NAME}/${VERSION}`);
  });

  it('surfaces an upstream 400 verbatim as a non-transient GatewayError with a status', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: "body must NOT have additional properties: 'query'",
    };
    const fetchMock = fetchReturning(async () =>
      jsonResponse(400, problem, {
        statusText: 'Bad Request',
        headers: { 'content-type': PROBLEM_JSON },
      }),
    );
    const gateway = gatewayWith(fetchMock);

    await expect(
      gateway.postJson(SEARCH_URL, { q: 'oops' }, TIMEOUT_SECONDS),
    ).rejects.toMatchObject({ status: 400, isTransient: false });
    await expect(gateway.postJson(SEARCH_URL, { q: 'oops' }, TIMEOUT_SECONDS)).rejects.toThrow(
      /400.*additional properties: 'query'/s,
    );
  });

  it('maps a non-JSON success body to a GatewayError', async () => {
    const fetchMock = fetchReturning(
      async () => new Response('<html>nope</html>', { status: 200 }),
    );
    const gateway = gatewayWith(fetchMock);

    await expect(gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS)).rejects.toThrow(/non-JSON/);
  });

  it('maps a timeout to a transient GatewayError', async () => {
    const fetchMock = fetchReturning(async () => {
      const err = new Error('The operation timed out');
      err.name = 'TimeoutError';
      throw err;
    });
    const gateway = gatewayWith(fetchMock);

    await expect(gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS)).rejects.toMatchObject({
      isTransient: true,
    });
    await expect(gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS)).rejects.toThrow(/timed out/);
  });

  it('maps a generic network failure to a transient GatewayError', async () => {
    const fetchMock = fetchReturning(async () => {
      throw new TypeError('fetch failed');
    });
    const gateway = gatewayWith(fetchMock);

    await expect(gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS)).rejects.toBeInstanceOf(
      GatewayError,
    );
    await expect(gateway.postJson(SEARCH_URL, {}, TIMEOUT_SECONDS)).rejects.toMatchObject({
      isTransient: true,
    });
  });
});
