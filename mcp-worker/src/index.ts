// fdao-mcp: Cloudflare Worker exposing the Front-Desk-AI-Orchestrator backend over MCP.
// Two transport lanes:
//   /mcp - MCP Streamable HTTP (official agents + MCP SDK v2 path)
//   /ws  - MCP over WebSocket (for clients that only speak ws/wss)
//   /health - worker-level health, does not touch the backend
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { callTool, toolDescription } from "./tools";
import { handleWsUpgrade } from "./ws";
import type { BackendCtx } from "./backend";

export interface Env {
  BACKEND_URL: string;
  BACKEND_TOKEN?: string;
}

// Token precedence: Authorization: Bearer header > ?token= query param (for WS clients
// that cannot set headers) > BACKEND_TOKEN worker secret (service-token fallback).
function resolveToken(request: Request, env: Env): string | null {
  const header = request.headers.get("Authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const q = new URL(request.url).searchParams.get("token");
  if (q) return q;
  return env.BACKEND_TOKEN || null;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function createServer(bctx: BackendCtx): McpServer {
  const server = new McpServer({ name: "fdao-mcp", version: "1.0.0" });
  const zObject = z.record(z.string(), z.unknown());

  server.registerTool(
    "health_check",
    { description: toolDescription("health_check"), inputSchema: {} },
    async () => textResult(JSON.stringify(await callTool("health_check", {}, bctx)))
  );

  server.registerTool(
    "draft_guest_response",
    {
      description: toolDescription("draft_guest_response"),
      inputSchema: {
        property_id: z.number().optional(),
        tone: z.string().optional(),
        template_ids: z.array(z.number()).optional(),
        guest_info: zObject.optional(),
        chat_context: zObject.optional(),
      },
    },
    async (args: any) =>
      textResult(JSON.stringify(await callTool("draft_guest_response", args, bctx), null, 2))
  );

  server.registerTool(
    "list_templates",
    {
      description: toolDescription("list_templates"),
      inputSchema: { category: z.string().optional(), search: z.string().optional() },
    },
    async (args: any) => textResult(JSON.stringify(await callTool("list_templates", args, bctx)))
  );

  server.registerTool(
    "get_template",
    { description: toolDescription("get_template"), inputSchema: { id: z.number() } },
    async (args: any) => textResult(JSON.stringify(await callTool("get_template", args, bctx)))
  );

  server.registerTool(
    "list_shift_notes",
    { description: toolDescription("list_shift_notes"), inputSchema: {} },
    async () => textResult(JSON.stringify(await callTool("list_shift_notes", {}, bctx)))
  );

  return server;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "access-control-expose-headers": "Mcp-Session-Id",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const key of Object.keys(CORS_HEADERS)) headers.set(key, CORS_HEADERS[key]);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return withCors(
        jsonResponse({
          name: "fdao-mcp",
          endpoints: { streamable_http: "/mcp", websocket: "/ws", health: "/health" },
        })
      );
    }

    if (url.pathname === "/health") {
      return withCors(jsonResponse({ status: "ok", service: "fdao-mcp" }));
    }

    if (url.pathname === "/ws" || url.pathname === "/ws/") {
      return handleWsUpgrade(request, { baseUrl: env.BACKEND_URL, token: resolveToken(request, env) });
    }

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
      const bctx: BackendCtx = { baseUrl: env.BACKEND_URL, token: resolveToken(request, env) };
      // Build the handler per request so the factory can close over the live
      // Authorization header without module-level mutable state (no cross-request bleed).
      const handler = createMcpHandler((factoryCtx: any) => {
        const headers =
          factoryCtx && factoryCtx.requestInfo && factoryCtx.requestInfo.headers
            ? factoryCtx.requestInfo.headers
            : undefined;
        if (headers) {
          const h = headers.get("Authorization");
          if (h && h.toLowerCase().startsWith("bearer ")) {
            return createServer({ baseUrl: env.BACKEND_URL, token: h.slice(7).trim() });
          }
        }
        return createServer(bctx);
      });
      const res = await handler(request, env, ctx);
      return withCors(res);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;