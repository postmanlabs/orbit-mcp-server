# orbit-mcp-server
Foo bar
foo bar
Authless [MCP](https://modelcontextprotocol.io) server that proxies the **public** Orbit APIs. It exposes two tools — `search` and `integrate` — over **stdio** (for local MCP clients) or **Streamable HTTP**. No credentials are ever sent upstream; only public content is available.

## Tools

| Tool        | Description                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`    | Search Orbit's public network for API endpoints. Returns minimal items (`id`, `resourceType`, `name`, and optionally `description`, `method`, `url`, `evaluateGuide`). Paginate via `meta.nextCursor` (up to 40 total). |
| `integrate` | Given a `task` and one or more `resources` (each an `id` + `type` from `search`), returns a natural-language task brief describing how to call them. Retries once on a transient 502 / 504 / timeout.                   |

## Quick start (stdio)

```bash
npx @postman/orbit-mcp-server
```

Or clone and run locally:

```bash
pnpm install
pnpm build
node dist/index.js
```

Point your MCP client at the command:

```json
{
  "mcpServers": {
    "orbit": { "command": "node", "args": ["/absolute/path/to/dist/index.js"] }
  }
}
```

## HTTP (Streamable HTTP)

```bash
ORBIT_MCP_TRANSPORT=http node dist/index.js
```

- MCP endpoint: `POST http://127.0.0.1:8080/mcp` (stateless; `GET`/`DELETE` return `405`)
- Health: `GET http://127.0.0.1:8080/knockknock`

## Configuration

All variables are optional. See `.env.example`.

| Variable                          | Default                         | Purpose                             |
| --------------------------------- | ------------------------------- | ----------------------------------- |
| `ORBIT_MCP_TRANSPORT`             | `stdio`                         | `stdio` or `http`                   |
| `ORBIT_GATEWAY_BASE_URL`          | `https://api.buildwithorbit.ai` | Upstream Orbit gateway base URL     |
| `ORBIT_SEARCH_TIMEOUT_SECONDS`    | `60`                            | Per-request timeout for `search`    |
| `ORBIT_INTEGRATE_TIMEOUT_SECONDS` | `60`                            | Per-request timeout for `integrate` |

## Development

```bash
pnpm install
pnpm dev            # stdio, hot reload
pnpm dev:http       # http, hot reload
pnpm test
pnpm run check
```

## Docker

```bash
docker build -t orbit-mcp-server .
docker run -p 8080:8080 -e ORBIT_MCP_TRANSPORT=http orbit-mcp-server
```

## Contributing

Source changes are synced from the internal `postman-eng/orbit-mcp-server` repository. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache-2.0
