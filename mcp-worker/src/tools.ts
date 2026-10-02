// Shared tool definitions used by both transport lanes (Streamable HTTP and WebSocket).
// Tool surface intentionally mirrors verified backend routes only:
//   POST /api/copilot/draft, GET /api/templates, GET /api/templates/:id,
//   GET /api/shift-notes, GET /health  (see backend/src/index.ts mounts).
import { backendRequest, BackendError, BackendCtx } from './backend';

export interface JsonSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiresAuth: boolean;
  handler: (args: Record<string, unknown>, ctx: BackendCtx) => Promise<unknown>;
}

const objectSchema = { type: 'object', additionalProperties: true };

export const TOOLS: ToolDef[] = [
  {
    name: 'health_check',
    description: 'Check whether the orchestrator backend is reachable and healthy.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiresAuth: false,
    handler: async (_args, ctx) => JSON.parse(await backendRequest(ctx, 'GET', '/health')),
  },
  {
    name: 'draft_guest_response',
    description:
      'Draft a guest response through the orchestrator copilot. Provide template_ids and/or a chat_context object containing the guest conversation. Returns { draft, meta }.',
    inputSchema: {
      type: 'object',
      properties: {
        property_id: { type: 'number', description: 'Property ID to draft for.' },
        tone: { type: 'string', description: 'Optional tone override (default is professional).' },
        template_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Template IDs to use.',
        },
        guest_info: objectSchema,
        chat_context: objectSchema,
      },
      additionalProperties: false,
    },
    requiresAuth: true,
    handler: async (args, ctx) =>
      JSON.parse(await backendRequest(ctx, 'POST', '/api/copilot/draft', args)),
  },
  {
    name: 'list_templates',
    description:
      "List the authenticated user's message templates. Optional category filter and search text.",
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string' }, search: { type: 'string' } },
      additionalProperties: false,
    },
    requiresAuth: true,
    handler: async (args, ctx) => {
      const params = new URLSearchParams();
      if (typeof args.category === 'string') params.set('category', args.category);
      if (typeof args.search === 'string') params.set('search', args.search);
      const qs = params.toString();
      return JSON.parse(await backendRequest(ctx, 'GET', '/api/templates' + (qs ? '?' + qs : '')));
    },
  },
  {
    name: 'get_template',
    description: 'Fetch a single template by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
      additionalProperties: false,
    },
    requiresAuth: true,
    handler: async (args, ctx) => {
      const id = Number(args.id);
      if (!Number.isInteger(id)) throw new Error('id must be an integer');
      return JSON.parse(await backendRequest(ctx, 'GET', '/api/templates/' + id));
    },
  },
  {
    name: 'list_shift_notes',
    description: "List today's shift notes for the authenticated user.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiresAuth: true,
    handler: async (_args, ctx) => JSON.parse(await backendRequest(ctx, 'GET', '/api/shift-notes')),
  },
];

/** Return a registered tool's description, or an empty string for an unknown name. */
export function toolDescription(name: string): string {
  const t = TOOLS.find((x) => x.name === name);
  return t ? t.description : '';
}

/** Look up a tool by its exact name, returning undefined when none matches. */
export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/**
 * Dispatch arguments to a registered tool using the supplied backend context.
 *
 * @returns The tool handler's result.
 * @throws {Error} If the tool is unknown or requires a token that is absent.
 * Handler errors propagate to the calling transport.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: BackendCtx
): Promise<unknown> {
  const tool = findTool(name);
  if (!tool) throw new Error('Unknown tool: ' + name);
  if (tool.requiresAuth && !ctx.token) {
    throw new Error(
      'This tool requires an orchestrator JWT. Provide it as a Bearer token when connecting.'
    );
  }
  return tool.handler(args, ctx);
}

export { BackendError };
