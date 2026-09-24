import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({});
    expect(config.gatewayBaseUrl).toBe('https://api.buildwithorbit.ai');
    expect(config.searchTimeoutSeconds).toBe(60);
    expect(config.integrateTimeoutSeconds).toBe(60);
    expect(config.connectTimeoutSeconds).toBe(10);
    expect(config.transport).toBe('stdio');
    expect(config.httpHost).toBe('127.0.0.1');
    expect(config.httpPort).toBe(8080);
    expect(config.logLevel).toBe('info');
    expect(config.logPretty).toBe(false);
  });

  it('derives the upstream URLs from the base URL and strips a trailing slash', () => {
    const config = loadConfig({ ORBIT_GATEWAY_BASE_URL: 'https://example.com/' });
    expect(config.gatewayBaseUrl).toBe('https://example.com');
    expect(config.searchUrl).toBe('https://example.com/v1/search');
    expect(config.integrateUrl).toBe('https://example.com/v1/integrate');
  });

  it('allows overriding the upstream paths and ensures a leading slash', () => {
    const config = loadConfig({
      ORBIT_GATEWAY_BASE_URL: 'https://example.com',
      ORBIT_SEARCH_PATH: 'search',
      ORBIT_INTEGRATE_PATH: '/integrate',
    });
    expect(config.searchUrl).toBe('https://example.com/search');
    expect(config.integrateUrl).toBe('https://example.com/integrate');
  });

  it('rejects a non-absolute base URL', () => {
    expect(() => loadConfig({ ORBIT_GATEWAY_BASE_URL: 'not-a-url' })).toThrow(ConfigError);
    expect(() => loadConfig({ ORBIT_GATEWAY_BASE_URL: 'ftp://host' })).toThrow(ConfigError);
  });

  describe('ORBIT_LOG_PRETTY (boolean parsing)', () => {
    it('defaults to false', () => {
      expect(loadConfig({}).logPretty).toBe(false);
    });

    it.each([
      ['true', true],
      ['1', true],
      ['on', true],
      ['yes', true],
      ['false', false],
      ['0', false],
      ['no', false],
      ['off', false],
    ])('parses %s as %s', (raw, expected) => {
      expect(loadConfig({ ORBIT_LOG_PRETTY: raw }).logPretty).toBe(expected);
    });

    it('throws on an invalid value', () => {
      expect(() => loadConfig({ ORBIT_LOG_PRETTY: 'maybe' })).toThrow(ConfigError);
    });
  });

  describe('ORBIT_MCP_TRANSPORT', () => {
    it('accepts stdio and http', () => {
      expect(loadConfig({ ORBIT_MCP_TRANSPORT: 'stdio' }).transport).toBe('stdio');
      expect(loadConfig({ ORBIT_MCP_TRANSPORT: 'http' }).transport).toBe('http');
    });

    it('accepts streamable-http as an alias for http', () => {
      expect(loadConfig({ ORBIT_MCP_TRANSPORT: 'streamable-http' }).transport).toBe('http');
    });

    it('rejects sse and unknown transports', () => {
      expect(() => loadConfig({ ORBIT_MCP_TRANSPORT: 'sse' })).toThrow(ConfigError);
      expect(() => loadConfig({ ORBIT_MCP_TRANSPORT: 'bogus' })).toThrow(ConfigError);
    });
  });

  describe('SERVICE_PORT', () => {
    it('parses a valid port', () => {
      const config = loadConfig({ SERVICE_PORT: '9137' });
      expect(config.httpPort).toBe(9137);
    });

    it.each(['0', '70000', 'abc', '80.5'])('rejects SERVICE_PORT %s', (raw) => {
      expect(() => loadConfig({ SERVICE_PORT: raw })).toThrow(ConfigError);
    });
  });

  describe('timeouts', () => {
    it('parses positive floats', () => {
      const config = loadConfig({ ORBIT_SEARCH_TIMEOUT_SECONDS: '1.5' });
      expect(config.searchTimeoutSeconds).toBe(1.5);
    });

    it.each(['0', '-1', 'abc'])('rejects %s', (raw) => {
      expect(() => loadConfig({ ORBIT_SEARCH_TIMEOUT_SECONDS: raw })).toThrow(ConfigError);
    });
  });

  describe('ORBIT_LOG_LEVEL', () => {
    it('accepts a known level', () => {
      expect(loadConfig({ ORBIT_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
    });

    it('rejects an unknown level', () => {
      expect(() => loadConfig({ ORBIT_LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
    });
  });
});
