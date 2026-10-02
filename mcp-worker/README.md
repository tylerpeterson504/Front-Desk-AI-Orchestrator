# fdao-mcp

Cloudflare Worker that exposes the Front-Desk-AI-Orchestrator backend as an MCP server,
so MCP clients (the mobile app, MCP inspector, AI playgrounds) can draft guest responses,
browse templates, and read shift notes through the orchestrator API.

## Endpoints

| Path    | Purpose                                                  |
|---------|----------------------------------------------------------|
| /mcp    | MCP Streamable HTTP (official agents + MCP SDK v2 path)  |
| /ws     | MCP over WebSocket for clients that only speak ws/wss    |
| /health | Worker-level health check (does not touch the backend)   |
| /       | Service info JSON                                        |

## Tools

| Tool                 | Backend route            | Auth |
|----------------------|--------------------------|------|
| health_check         | GET /health              | no   |
| draft_guest_response | POST /api/copilot/draft  | JWT  |
| list_templates       | GET /api/templates        | JWT  |
| get_template         | GET /api/templates/:id   | JWT  |
| list_shift_notes     | GET /api/shift-notes     | JWT  |

The tool surface intentionally mirrors only verified backend routes. Property CRUD is not
exposed because those backend routes are currently unauthenticated (ADR-001).

## Auth

The caller's Bearer token is an orchestrator JWT (from POST /api/auth/login). Token
resolution order:

1. Authorization: Bearer header
2. ?token= query parameter (for WS clients that cannot set headers)
3. BACKEND_TOKEN worker secret (service-token fallback)

Access tokens expire roughly every 15 minutes; the known silent-refresh bug is tracked in PR
#309. Until that lands, expect to re-enter the token after expiry.

## Local development

    cd mcp-worker
    npm install
    # start the backend first (default BACKEND_URL is http://localhost:3001)
    npx wrangler dev

Per-session overrides go in .dev.vars (see .dev.vars.example).

Test with MCP inspector:

    npx @modelcontextprotocol/inspector

Connect to http://127.0.0.1:8787/mcp, add a Bearer token under Authentication, and list
tools. For the WS lane, any websocket client works:

    websocat "ws://127.0.0.1:8787/ws?token=<JWT>"

then send an initialize frame, followed by tools/list and tools/call.

## Deploy

    npx wrangler login
    # point BACKEND_URL at the deployed backend (edit wrangler.jsonc vars,
    # or set it in the Workers dashboard)
    npx wrangler secret put BACKEND_TOKEN   # optional service JWT
    npx wrangler deploy

The worker deploys to https://fdao-mcp.<your-subdomain>.workers.dev

## Connect the mobile app (Add Server screen)

- Display name: Front Desk AI
- Protocol: wss
- Host: https://fdao-mcp.<your-subdomain>.workers.dev/ws
- Bearer token: orchestrator JWT
- Working directory: leave blank (remote server; only relevant for local servers)
- Cloudflare Access section: leave collapsed unless the worker is fronted by Access

If the app supports streamable HTTP instead of ws, use /mcp with https.

## Security notes

- The worker never stores tokens; it forwards the caller JWT to the backend.
- CORS is currently permissive (access-control-allow-origin: *). Restrict it before wide
  production use.
- A WS token passed via query parameter can appear in logs; prefer the header when the
  client supports it.
- Server-to-server calls from the worker to the backend are not subject to browser CORS,
  so no backend CORS_ORIGIN change is required for the worker itself.