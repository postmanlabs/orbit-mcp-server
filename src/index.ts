#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setGlobalDispatcher } from 'undici';

import { ConfigError, loadConfig, type Config } from './config.js';
import { createDispatcher, OrbitGateway } from './gateway.js';
import { startHttpServer } from './http.js';
import { createLogger, type Logger } from './logger.js';
import { createMcpServer } from './server.js';

const EXIT_CONFIG_ERROR = 78; // EX_CONFIG (sysexits.h)
const SHUTDOWN_TIMEOUT_MS = 10_000;

type Cleanup = () => Promise<void>;

function setupFatalHandlers(logger: Logger): void {
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });
}

function setupProcessHandlers(logger: Logger, cleanup: Cleanup): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'received shutdown signal');

    const timer = setTimeout(() => {
      logger.error('graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    cleanup()
      .then(() => {
        clearTimeout(timer);
        logger.info('shutdown complete');
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        logger.error({ err: error }, 'error during shutdown');
        process.exit(1);
      });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

async function run(config: Config, logger: Logger): Promise<void> {
  // Enforce the connect timeout and enable keep-alive for outbound gateway calls.
  const dispatcher = createDispatcher(config);
  setGlobalDispatcher(dispatcher);

  const gateway = new OrbitGateway();

  if (config.transport === 'stdio') {
    const server = createMcpServer({ config, gateway, logger });
    await server.connect(new StdioServerTransport());
    logger.info({ transport: 'stdio' }, 'orbit-mcp-server ready (stdio)');
    setupProcessHandlers(logger, async () => {
      await server.close();
      await dispatcher.close();
    });
    return;
  }

  const http = await startHttpServer({
    config,
    logger,
    createServer: (requestContext) => createMcpServer({ config, gateway, logger, requestContext }),
  });

  setupProcessHandlers(logger, async () => {
    await http.close();
    await dispatcher.close();
  });
}

function main(): void {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`orbit-mcp-server configuration error: ${error.message}\n`);
      process.exit(EXIT_CONFIG_ERROR);
    }
    throw error;
  }

  const logger = createLogger(config);
  setupFatalHandlers(logger);
  run(config, logger).catch((error: unknown) => {
    logger.fatal({ err: error }, 'failed to start orbit-mcp-server');
    process.exit(1);
  });
}

main();
