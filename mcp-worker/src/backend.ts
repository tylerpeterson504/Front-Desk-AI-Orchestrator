// Typed client for the orchestrator Express backend (see backend/src/routes/*).

export interface BackendCtx {
  baseUrl: string;
  token: string | null;
}

export class BackendError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super("Backend request failed with status " + status);
    this.status = status;
    this.body = body;
  }
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function backendRequest(
  ctx: BackendCtx,
  method: string,
  path: string,
  body?: unknown
): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ctx.token) headers["authorization"] = "Bearer " + ctx.token;
  const res = await fetch(trimSlash(ctx.baseUrl) + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new BackendError(res.status, text);
  return text;
}