/**
 * Core HTTP client for the public Orbit gateway.
 *
 * Exposes a single generic JSON `POST` with per-request timeout handling and
 * translates upstream HTTP/network failures into {@link GatewayError} instances
 * carrying a human-readable, agent-actionable message. It sends **no** credentials.
 *
 * Tool-specific request shapes (endpoints, query params, bodies, retries) live in
 * the individual tool modules under `src/tools`, not here.
 */

import { Agent } from 'undici';

import type { Config } from './config.js';
import { SERVER_NAME, VERSION } from './version.js';

const JSON_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json',
  accept: 'application/json',
  'user-agent': `${SERVER_NAME}/${VERSION}`,
};

/**
 * A normalized upstream or transport error, safe to surface to the agent.
 *
 * The `message` is already formatted (e.g. `"400 Bad Request: <detail>"`) and is
 * intended to become the MCP tool error text.
 *
 * `isTransient` is true for errors that may resolve on their own (timeout, network
 * failure, 502/504). It is false for structural errors (non-JSON body, 4xx) that
 * will produce the same result if repeated.
 */
export class GatewayError extends Error {
  readonly status: number | undefined;
  readonly isTransient: boolean;

  constructor(message: string, status?: number, isTransient = false) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.isTransient = isTransient;
  }
}

/** Minimal `fetch` signature so tests can inject a fake implementation. */
export type FetchLike = typeof fetch;

export interface OrbitGatewayOptions {
  /** Override the `fetch` implementation (used in tests). */
  readonly fetchImpl?: FetchLike;
}

export function createDispatcher(config: Pick<Config, 'connectTimeoutSeconds'>): Agent {
  return new Agent({
    connect: { timeout: Math.ceil(config.connectTimeoutSeconds * 1000) },
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  });
}

function isAbortOrTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class OrbitGateway {
  private readonly fetchImpl: FetchLike;

  constructor(options: OrbitGatewayOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async postJson(
    url: string,
    body: unknown,
    timeoutSeconds: number,
    extraHeaders?: Record<string, string>,
  ): Promise<unknown> {
    const headers = extraHeaders ? { ...JSON_HEADERS, ...extraHeaders } : JSON_HEADERS;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
      });
    } catch (error) {
      if (isAbortOrTimeout(error)) {
        throw new GatewayError(
          `Request to ${url} timed out; the upstream may be slow, retry shortly.`,
          undefined,
          true,
        );
      }
      throw new GatewayError(`Network error calling ${url}: ${messageOf(error)}`, undefined, true);
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      const prefix = `${response.status} ${response.statusText}`.trim();
      throw new GatewayError(detail ? `${prefix}: ${detail}` : prefix, response.status);
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new GatewayError(`Upstream returned a non-JSON response from ${url}.`);
    }
  }
}
