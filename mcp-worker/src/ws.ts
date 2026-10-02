// Minimal MCP-over-WebSocket server lane.
// The official TypeScript MCP SDK (v2) only ships Streamable HTTP, so clients that only
// speak ws/wss are served here by speaking the MCP JSON-RPC protocol directly over a
// WebSocketPair. Protocol shapes follow the MCP specification (JSON-RPC 2.0 frames).
import { callTool, TOOLS, BackendError } from './tools';
import type { BackendCtx } from './backend';

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'fdao-mcp', version: '1.0.0' };

type RpcId = number | string | null;

/** Serialize a JSON-RPC success response using the caller's request ID. */
function rpcResult(id: RpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

/** Serialize a JSON-RPC error response with its request ID, code, and message. */
function rpcError(id: RpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Return public tool metadata for tools/list, omitting handlers and auth flags. */
function toolDescriptors() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/**
 * Execute a tools/call request and serialize its MCP text result as JSON-RPC.
 * Tool failures become results with isError set; backend failures include status and body.
 */
async function handleCall(ctx: BackendCtx, id: RpcId, params: any): Promise<string> {
  const name = params && typeof params.name === 'string' ? params.name : '';
  const args =
    params && typeof params.arguments === 'object' && params.arguments !== null
      ? params.arguments
      : {};
  try {
    const result = await callTool(name, args, ctx);
    return rpcResult(id, {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    });
  } catch (err: any) {
    if (err instanceof BackendError) {
      return rpcResult(id, {
        content: [{ type: 'text', text: 'Backend error ' + err.status + ': ' + err.body }],
        isError: true,
      });
    }
    return rpcResult(id, {
      content: [{ type: 'text', text: err && err.message ? err.message : String(err) }],
      isError: true,
    });
  }
}

/**
 * Process newline-delimited JSON-RPC frames and return serialized replies in order.
 * Handles initialization, ping, and tool requests; skips notifications and response frames.
 * Invalid JSON receives a parse error, and unknown methods with IDs receive a method error.
 */
async function handleMessage(ctx: BackendCtx, raw: string): Promise<string[]> {
  const out: string[] = [];
  // Newline-delimited JSON-RPC frames (matches the reference ws transport behavior).
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      out.push(rpcError(null, -32700, 'Parse error'));
      continue;
    }
    const method: string | undefined = msg.method;
    const id: RpcId = msg.id === undefined ? null : msg.id;
    if (!method) continue; // response frame from the client; nothing to answer
    if (method.startsWith('notifications/')) continue;
    if (method === 'initialize') {
      const requested =
        msg.params && typeof msg.params.protocolVersion === 'string'
          ? msg.params.protocolVersion
          : DEFAULT_PROTOCOL_VERSION;
      out.push(
        rpcResult(id, {
          protocolVersion: requested,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Front Desk AI Orchestrator MCP gateway. Tools proxy the orchestrator backend. ' +
            'A Bearer token (orchestrator JWT) is required for all tools except health_check.',
        })
      );
      continue;
    }
    if (method === 'ping') {
      out.push(rpcResult(id, {}));
      continue;
    }
    if (method === 'tools/list') {
      out.push(rpcResult(id, { tools: toolDescriptors() }));
      continue;
    }
    if (method === 'tools/call') {
      out.push(await handleCall(ctx, id, msg.params));
      continue;
    }
    if (id !== null) out.push(rpcError(id, -32601, 'Method not found: ' + method));
  }
  return out;
}

/**
 * Upgrade a WebSocket request and bind incoming messages to the backend context.
 * @returns A 101 response carrying the client socket, or 426 when the upgrade header is missing or invalid.
 */
export function handleWsUpgrade(request: Request, backendCtx: BackendCtx): Response {
  const upgrade = request.headers.get('Upgrade');
  if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  server.accept();
  server.addEventListener('message', async (event: any) => {
    const raw = typeof event.data === 'string' ? event.data : '';
    try {
      const replies = await handleMessage(backendCtx, raw);
      if (replies.length) server.send(replies.join('\n'));
    } catch (err: any) {
      try {
        server.send(
          rpcError(
            null,
            -32603,
            'Internal error: ' + (err && err.message ? err.message : String(err))
          )
        );
      } catch {
        // socket already closed
      }
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}
