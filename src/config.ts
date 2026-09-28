/**
 * Runtime configuration for orbit-mcp-server.
 *
 * All settings are read once from the environment at startup. The server is
 * *authless*: no credential-related settings exist or are ever read.
 *
 * Everything (MCP, health probes,
 * service metadata) is served on the single service port.
 */

export const DEFAULT_GATEWAY_BASE_URL = 'https://api.buildwithorbit.ai';
export const DEFAULT_SEARCH_PATH = '/v1/search';
export const DEFAULT_INTEGRATE_PATH = '/v1/integrate';
export const DEFAULT_SEARCH_TIMEOUT_SECONDS = 60;
export const DEFAULT_INTEGRATE_TIMEOUT_SECONDS = 60;
// Connect timeout is shared by both tools; the upstream defines the slow part.
export const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;

export const DEFAULT_TRANSPORT: Transport = 'stdio';
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_SERVICE_PORT = 8080;

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';
export const DEFAULT_LOG_PRETTY = false;

/** Supported MCP transports. `http` is Streamable HTTP served at `/mcp`. */
export type Transport = 'stdio' | 'http';
const VALID_TRANSPORTS: readonly string[] = ['stdio', 'http'];

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
const VALID_LOG_LEVELS: readonly string[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
];

/** Raised when environment configuration is invalid. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Immutable server configuration. */
export interface Config {
  readonly gatewayBaseUrl: string;
  readonly searchTimeoutSeconds: number;
  readonly integrateTimeoutSeconds: number;
  readonly connectTimeoutSeconds: number;
  readonly transport: Transport;
  readonly httpHost: string;
  /** Single service port (MCP + health + service info), from `SERVICE_PORT`. */
  readonly httpPort: number;
  readonly logLevel: LogLevel;
  readonly logPretty: boolean;
  /** Derived: `${gatewayBaseUrl}${ORBIT_SEARCH_PATH}` (default path `/v1/search`). */
  readonly searchUrl: string;
  /** Derived: `${gatewayBaseUrl}${ORBIT_INTEGRATE_PATH}` (default path `/v1/integrate`). */
  readonly integrateUrl: string;
}

type Env = Record<string, string | undefined>;

function readString(env: Env, name: string, fallback: string): string {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = raw.trim();
  return value === '' ? fallback : value;
}

/** Read a URL path, ensuring it has a leading slash. */
function readPath(env: Env, name: string, fallback: string): string {
  const value = readString(env, name, fallback);
  return value.startsWith('/') ? value : `/${value}`;
}

function readBool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new ConfigError(
    `${name} must be a boolean (true/false, 1/0, yes/no, on/off), got ${JSON.stringify(raw)}`,
  );
}

function readPositiveFloat(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be a number, got ${JSON.stringify(raw)}`);
  }
  if (value <= 0) {
    throw new ConfigError(`${name} must be positive, got ${value}`);
  }
  return value;
}

function readPort(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new ConfigError(`${name} must be an integer, got ${JSON.stringify(raw)}`);
  }
  if (value < 1 || value > 65535) {
    throw new ConfigError(`${name} must be between 1 and 65535, got ${value}`);
  }
  return value;
}

function readTransport(env: Env, name: string, fallback: Transport): Transport {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  // `streamable-http` is accepted as an alias for `http` for compatibility.
  const value = raw.trim().toLowerCase() === 'streamable-http' ? 'http' : raw.trim().toLowerCase();
  if (!VALID_TRANSPORTS.includes(value)) {
    throw new ConfigError(
      `${name} must be one of ${VALID_TRANSPORTS.join(', ')} (or the alias 'streamable-http'), got ${JSON.stringify(raw)}`,
    );
  }
  return value as Transport;
}

function readLogLevel(env: Env, name: string, fallback: LogLevel): LogLevel {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (!VALID_LOG_LEVELS.includes(value)) {
    throw new ConfigError(
      `${name} must be one of ${VALID_LOG_LEVELS.join(', ')}, got ${JSON.stringify(raw)}`,
    );
  }
  return value as LogLevel;
}

function validateBaseUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigError(
      `ORBIT_GATEWAY_BASE_URL must be an absolute http(s) URL, got ${JSON.stringify(raw)}`,
    );
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.host === '') {
    throw new ConfigError(
      `ORBIT_GATEWAY_BASE_URL must be an absolute http(s) URL, got ${JSON.stringify(raw)}`,
    );
  }
  return url;
}

/** Load and validate configuration from environment variables. */
export function loadConfig(env: Env = process.env): Config {
  const gatewayBaseUrl = validateBaseUrl(
    readString(env, 'ORBIT_GATEWAY_BASE_URL', DEFAULT_GATEWAY_BASE_URL),
  );

  return {
    gatewayBaseUrl,
    searchTimeoutSeconds: readPositiveFloat(
      env,
      'ORBIT_SEARCH_TIMEOUT_SECONDS',
      DEFAULT_SEARCH_TIMEOUT_SECONDS,
    ),
    integrateTimeoutSeconds: readPositiveFloat(
      env,
      'ORBIT_INTEGRATE_TIMEOUT_SECONDS',
      DEFAULT_INTEGRATE_TIMEOUT_SECONDS,
    ),
    connectTimeoutSeconds: readPositiveFloat(
      env,
      'ORBIT_CONNECT_TIMEOUT_SECONDS',
      DEFAULT_CONNECT_TIMEOUT_SECONDS,
    ),
    transport: readTransport(env, 'ORBIT_MCP_TRANSPORT', DEFAULT_TRANSPORT),
    httpHost: readString(env, 'ORBIT_MCP_HOST', DEFAULT_HTTP_HOST),
    httpPort: readPort(env, 'SERVICE_PORT', DEFAULT_SERVICE_PORT),
    logLevel: readLogLevel(env, 'ORBIT_LOG_LEVEL', DEFAULT_LOG_LEVEL),
    logPretty: readBool(env, 'ORBIT_LOG_PRETTY', DEFAULT_LOG_PRETTY),
    searchUrl: `${gatewayBaseUrl}${readPath(env, 'ORBIT_SEARCH_PATH', DEFAULT_SEARCH_PATH)}`,
    integrateUrl: `${gatewayBaseUrl}${readPath(env, 'ORBIT_INTEGRATE_PATH', DEFAULT_INTEGRATE_PATH)}`,
  };
}
