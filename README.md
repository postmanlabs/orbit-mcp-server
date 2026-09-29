# Orbit MCP Server

The **Orbit MCP Server** connects AI agents and coding assistants (Cursor, Claude, VS Code Copilot, Codex, and others) to public APIs via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). [Orbit](https://buildwithorbit.ai) is a free API discovery service by Postman that helps agents find, evaluate, and integrate public APIs.

Use it when your agent needs to **discover public APIs or MCPs** and get a concrete brief for calling them. No API keys or login required.

---

## What you can do

1. **Search**: Ask in natural language (e.g. `"PayPal create invoice"`) and get matching public API endpoints and MCPs.
2. **Evaluate**: Each result includes an `evaluateGuide` that explains what it does, when to use it, and its limits.
3. **Integrate**: Pass your goal plus the chosen results to get a task brief covering auth, base URLs, request steps, parameters, and responses.

Typical agent flow: `search` → review `evaluateGuide` → `integrate`.

---

## Quick start

The fastest way to use Orbit is the **hosted remote MCP server**, with no install or credentials required. Point your client at:

```
https://mcp.buildwithorbit.ai/mcp
```

### Claude Code

```bash
claude mcp add --transport http orbit https://mcp.buildwithorbit.ai/mcp
```

### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "servers": {
    "orbit": {
      "url": "https://mcp.buildwithorbit.ai/mcp"
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/mcp.json` or your user MCP settings:

```json
{
  "servers": {
    "orbit": {
      "type": "http",
      "url": "https://mcp.buildwithorbit.ai/mcp"
    }
  }
}
```

### Codex / ChatGPT

```bash
codex mcp add orbit --url https://mcp.buildwithorbit.ai/mcp
```

Prefer to run it yourself? See [Run from source](#run-from-source) below.

---

## Tools

| Tool        | What it does                                                                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`    | Finds public API endpoints and MCPs for a query. Returns `id`, `resourceType` (`endpoint` or `mcp`), `name`, and usually `description`, `method`/`transport`, `url`, and `evaluateGuide`. Paginate with `cursor` from `meta.nextCursor` (up to 40 results total). |
| `integrate` | Takes a `task` plus up to 10 resources from `search` (`id` + `type`) and returns a natural-language brief for calling them.                                                                                                                                       |

**Search tips:** Prefer focused queries that name the product and the action (`"Twilio send SMS"`). Avoid stuffing many unrelated keywords or OR-chains into one query; make separate calls instead.

---

## Authentication

None. The server never asks for, stores, or forwards credentials. Upstream calls go to Orbit's public gateway only.

---

## Run from source

The server supports two transports: **stdio** (default) for local MCP clients, and **Streamable HTTP** for self-hosting or local testing.

```bash
pnpm install
pnpm build
node dist/index.js                          # stdio (default)
ORBIT_MCP_TRANSPORT=http node dist/index.js # Streamable HTTP
```

In HTTP mode the MCP endpoint is `POST http://127.0.0.1:8080/mcp` and a health check is available at `GET http://127.0.0.1:8080/knockknock`. `GET` and `DELETE` on `/mcp` return `405`; the transport is stateless and does not use SSE sessions.

All configuration is optional and set via environment variables. See [`.env.example`](./.env.example).

Development:

```bash
pnpm install
pnpm dev            # stdio, hot reload
pnpm dev:http       # http, hot reload
pnpm test
pnpm run check
```

### Docker

```bash
docker build -t orbit-mcp-server .
docker run -p 8080:8080 -e ORBIT_MCP_TRANSPORT=http orbit-mcp-server
```

---

## Contributing

Bug reports and documentation fixes are welcome. Implementation changes under `src/` are synced from Postman's internal repository. See [CONTRIBUTING.md](./CONTRIBUTING.md).

- [Report a bug](https://github.com/postmanlabs/orbit-mcp-server/issues/new)
- [Request a feature](https://github.com/postmanlabs/orbit-mcp-server/issues/new)

---

## License

Apache-2.0
