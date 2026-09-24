# orbit-mcp-server

Authless [MCP](https://modelcontextprotocol.io) server that proxies the **public** Orbit APIs. It exposes two tools — `search` and `integrate` — over **stdio** (for local MCP clients) or **Streamable HTTP** (how the deployed service runs). No credentials are ever sent upstream; only public content is available.

_This service was created using the [Cloud9 Service Initializer](https://c9-initializr.ia.postmanlabs.com/)._

## Tools

| Tool        | Description                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`    | Search Orbit's public network for API endpoints. Returns minimal items (`id`, `resourceType`, `name`, and optionally `description`, `method`, `url`, `evaluateGuide`). Paginate via `meta.nextCursor` (up to 40 total). |
| `integrate` | Given a `task` and one or more `resources` (each an `id` + `type` from `search`), returns a natural-language task brief describing how to call them.                                                                    |

## Run locally as an MCP server (stdio)

```bash
pnpm install
pnpm build
node dist/index.js        # stdio (default)
# or during development, with hot reload:
pnpm dev
```

Point your MCP client at the command:

```json
{
  "mcpServers": {
    "orbit": { "command": "node", "args": ["/absolute/path/to/dist/index.js"] }
  }
}
```

## Run locally over HTTP (Streamable HTTP)

```bash
pnpm dev:http             # or: ORBIT_MCP_TRANSPORT=http pnpm start
```

- MCP endpoint: `POST http://127.0.0.1:8080/mcp` (stateless; `GET`/`DELETE` return `405`)
- Service info: `GET http://127.0.0.1:8080/api/v1/service/info`
- Health: `GET http://127.0.0.1:8080/knockknock` (liveness + readiness probe)

## Endpoints

Everything is served on the single service port (`8080`); there is no separate management/actuator port.

| Method         | Path                   | Purpose                                          |
| -------------- | ---------------------- | ------------------------------------------------ |
| `POST`         | `/mcp`                 | MCP Streamable HTTP endpoint (stateless)         |
| `GET`/`DELETE` | `/mcp`                 | Not supported — returns `405 Method Not Allowed` |
| `GET`          | `/knockknock`          | Kubernetes liveness + readiness probe            |
| `GET`          | `/api/v1/service/info` | Public service metadata                          |

The MCP endpoint is **stateless**: each request is handled independently (no sessions), so it scales behind a plain load balancer. `GET`/`DELETE` are rejected because the server never emits server-initiated messages.

## Configuration

All variables are optional; defaults are shown. See `.env.example`.

| Variable                          | Default                            | Purpose                                                              |
| --------------------------------- |------------------------------------| -------------------------------------------------------------------- |
| `ORBIT_MCP_TRANSPORT`             | `stdio`                            | `stdio` or `http` (`streamable-http` alias). The deploy sets `http`. |
| `ORBIT_MCP_HOST`                  | `127.0.0.1`                        | HTTP bind address (the deploy sets `0.0.0.0`).                       |
| `SERVICE_PORT`                    | `8080`                             | Single service port: MCP + health + info (platform-injected).        |
| `ORBIT_GATEWAY_BASE_URL`          | `https://api.buildwithorbit.ai`    | Upstream Orbit gateway base URL.                                     |
| `ORBIT_SEARCH_PATH`               | `/v1/search`                       | Upstream path for `search` (appended to the gateway base URL).       |
| `ORBIT_INTEGRATE_PATH`            | `/v1/integrate`                    | Upstream path for `integrate` (appended to the gateway base URL).    |
| `ORBIT_SEARCH_TIMEOUT_SECONDS`    | `60`                               | Per-request timeout for `search`.                                    |
| `ORBIT_INTEGRATE_TIMEOUT_SECONDS` | `60`                               | Per-request timeout for `integrate`.                                 |
| `ORBIT_CONNECT_TIMEOUT_SECONDS`   | `10`                               | TCP connect timeout for upstream calls.                              |
| `ORBIT_LOG_LEVEL`                 | `info`                             | pino level (`trace`…`silent`).                                       |
| `ORBIT_LOG_PRETTY`                | `false`                            | Human-friendly pretty logs for local dev.                            |

Logs are structured JSON written to **stderr** (pino), keeping stdout clean for the stdio transport.

## Development

```bash
pnpm install
pnpm dev            # stdio, hot reload
pnpm dev:http       # http, hot reload
pnpm test           # vitest
pnpm run typecheck
pnpm run lint
pnpm run build
```

## Docker

```bash
docker build -t orbit-mcp-server .
docker run -p 8080:8080 -e ORBIT_MCP_TRANSPORT=http orbit-mcp-server
```
