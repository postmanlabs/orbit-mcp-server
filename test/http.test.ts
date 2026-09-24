import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { OrbitGateway } from '../src/gateway.js';
import { createHttpApp } from '../src/http.js';
import { createMcpServer } from '../src/server.js';

const silentLogger = pino({ level: 'silent' });

/** Build the real HTTP app; the gateway fetch is never exercised by these tests. */
function makeApp() {
  const config = loadConfig({ ORBIT_GATEWAY_BASE_URL: 'https://gateway.test' });
  const gateway = new OrbitGateway({
    fetchImpl: () => Promise.reject(new Error('network disabled in http tests')),
  });
  return createHttpApp({
    logger: silentLogger,
    createServer: () => createMcpServer({ config, gateway, logger: silentLogger }),
  });
}

describe('health probe', () => {
  it('knockknock is always ok', async () => {
    const res = await request(makeApp()).get('/knockknock');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('MCP endpoint (stateless)', () => {
  it('rejects GET with 405 and Allow: POST', async () => {
    const res = await request(makeApp()).get('/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('POST');
    expect(res.body.error.code).toBe(-32000);
  });

  it('rejects DELETE with 405 and Allow: POST', async () => {
    const res = await request(makeApp()).delete('/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });

  it('handles a stateless initialize over POST', async () => {
    const res = await request(makeApp())
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'http-test', version: '0.0.0' },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe('orbit-mcp-server');
    // Stateless: no session id is handed back to the client.
    expect(res.headers['mcp-session-id']).toBeUndefined();
  });

  it('returns 406 when the Accept header omits the required media types', async () => {
    const res = await request(makeApp())
      .post('/mcp')
      .set('Accept', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(406);
  });
});

describe('serviceInfo route', () => {
  it('exposes unauthenticated service metadata on the service port', async () => {
    const res = await request(makeApp()).get('/api/v1/service/info');
    expect(res.status).toBe(200);
    expect(res.body.serviceName).toBe('orbit-mcp-server');
    expect(res.body.serviceGroup).toBe('search');
  });
});

describe('unknown route', () => {
  it('returns a 404 pointing at the MCP endpoint', async () => {
    const res = await request(makeApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});
