// Typed client for the orchestrator Express backend (see backend/src/routes/*).

export interface BackendCtx {
  baseUrl: string;
  token: string | null;
}

export class BackendError extends Error {
  status: number;
  body: string;
  /** Preserve a failed backend response's HTTP status and raw response body. */
  constructor(status: number, body: string) {
    super('Backend request failed with status ' + status);
    this.status = status;
    this.body = body;
  }
}

/** Remove one trailing slash so a base URL can be joined to a route path. */
function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Send a JSON request to the backend using the context's optional Bearer token.
 *
 * @param ctx - Backend base URL and credential to forward.
 * @param method - HTTP method to send.
 * @param path - Backend route beginning with a slash.
 * @param body - Optional payload to JSON-encode.
 * @returns The raw response body, without JSON parsing.
 * @throws {BackendError} When the backend returns a non-OK HTTP status.
 */
export async function backendRequest(
  ctx: BackendCtx,
  method: string,
  path: string,
  body?: unknown
): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (ctx.token) headers['authorization'] = 'Bearer ' + ctx.token;
  const res = await fetch(trimSlash(ctx.baseUrl) + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new BackendError(res.status, text);
  return text;
}
