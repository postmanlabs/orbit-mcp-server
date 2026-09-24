import pino from 'pino';
import type { Logger } from 'pino';

import type { Config } from './config.js';
import { SERVER_NAME, VERSION } from './version.js';

export type { Logger };

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.authorization',
  '*.password',
];

/**
 * Create the application logger.
 *
 * Logs are always written to **stderr** (fd 2). This is essential for the
 * stdio transport, where stdout is reserved for the JSON-RPC protocol stream.
 */
export function createLogger(config: Pick<Config, 'logLevel' | 'logPretty'>): Logger {
  const redact = { paths: REDACT_PATHS, censor: '[redacted]' };

  if (config.logPretty) {
    return pino({
      name: SERVER_NAME,
      level: config.logLevel,
      redact,
      transport: {
        target: 'pino-pretty',
        options: {
          destination: 2,
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(
    {
      name: SERVER_NAME,
      level: config.logLevel,
      redact,
      base: { pid: process.pid, version: VERSION },
    },
    pino.destination({ dest: 2, sync: false }),
  );
}
