import type { Server } from 'node:http';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';

import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { serviceInfoRouter } from './routes/serviceInfo.js';

const MCP_ENDPOINT = '/mcp';
const KNOCKKNOCK_PATH = '/knockknock';
const MAX_BODY_SIZE = '64kb';
const MAX_BATCH_SIZE = 10;

export interface HttpAppDeps {
  readonly logger: Logger;
  /** Factory that builds a fresh {@link McpServer} for each request. */
  readonly createServer: () => McpServer;
}

export interface HttpServerDeps extends HttpAppDeps {
  readonly config: Config;
}

export interface RunningHttpServer {
  /** Stop the HTTP listener. */
  close(): Promise<void>;
}

function jsonRpcError(code: number, message: string): object {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

/**
 * Build the service Express app (without binding a port) so it can be driven
 * directly in tests.
 *
 * The MCP endpoint is **stateless**: every POST spins up a fresh
 * {@link McpServer} + transport, serves that one request, and tears both down
 * when the response closes. There are no sessions, so `GET`/`DELETE` are not
 * supported and return `405` — this server never emits server-initiated
 * messages (nothing to stream on a standalone SSE channel).
 *
 * The health probe (`/knockknock`) and the public service metadata
 * (`/api/v1/service/info`) are served on this same port.
 */
export function createHttpApp(deps: HttpAppDeps): Express {
  const { logger, createServer } = deps;

  const app = express();
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      // The probe fires constantly; keep it out of the request log.
      autoLogging: { ignore: (req) => req.url === KNOCKKNOCK_PATH },
    }),
  );
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  app.get(KNOCKKNOCK_PATH, (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/service', serviceInfoRouter);

  app.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
    if (Array.isArray(req.body)) {
      if (req.body.length === 0) {
        res.status(400).json(jsonRpcError(-32600, 'Invalid Request: empty JSON-RPC batch.'));
        return;
      }
      if (req.body.length > MAX_BATCH_SIZE) {
        res
          .status(400)
          .json(
            jsonRpcError(
              -32600,
              `Invalid Request: JSON-RPC batch of ${req.body.length} exceeds the limit of ${MAX_BATCH_SIZE}.`,
            ),
          );
        return;
      }
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error({ err: error }, 'error handling MCP POST request');
      if (!res.headersSent) {
        res.status(500).json(jsonRpcError(-32603, 'Internal server error'));
      }
    }
  });

  const methodNotAllowed = (_req: Request, res: Response): void => {
    res.setHeader('Allow', 'POST');
    res
      .status(405)
      .json(jsonRpcError(-32000, 'Method Not Allowed: this MCP server is stateless; use POST.'));
  };
  app.get(MCP_ENDPOINT, methodNotAllowed);
  app.delete(MCP_ENDPOINT, methodNotAllowed);

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `No route for ${req.method} ${req.path}. The MCP endpoint is ${MCP_ENDPOINT}.`,
    });
  });

  return app;
}

export function startHttpServer(deps: HttpServerDeps): Promise<RunningHttpServer> {
  const { config, logger } = deps;
  const app = createHttpApp(deps);

  return new Promise<RunningHttpServer>((resolve, reject) => {
    const httpServer: Server = app.listen(config.httpPort, config.httpHost);

    const onError = (error: Error): void => reject(error);
    httpServer.once('error', onError);

    httpServer.once('listening', () => {
      httpServer.removeListener('error', onError);
      logger.info(
        {
          transport: 'streamable-http',
          host: config.httpHost,
          port: config.httpPort,
          endpoint: MCP_ENDPOINT,
        },
        'orbit-mcp-server ready (streamable-http)',
      );
      resolve({
        close: async () => {
          await new Promise<void>((res, rej) => {
            httpServer.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });
  });
}
