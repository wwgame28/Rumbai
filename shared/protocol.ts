import { z } from 'zod';
import { toolNames } from './tools.ts';

/** Limits enforced by the server and mirrored by the client. */
export const LIMITS = {
  maxBodyBytes: 512 * 1024,
  maxMessages: 80,
  maxTextChars: 60_000,
  maxSystemContextChars: 40_000,
} as const;

const text = z.string().max(LIMITS.maxTextChars);

const contentBlock = z.union([
  z.object({ type: z.literal('text'), text }).passthrough(),
  z
    .object({
      type: z.literal('tool_use'),
      id: z.string().max(128),
      name: z.string().max(64),
      input: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('tool_result'),
      tool_use_id: z.string().max(128),
      content: text,
      is_error: z.boolean().optional(),
    })
    .strict(),
  // Thinking blocks from the same tool loop are sent back unchanged.
  z.object({ type: z.literal('thinking'), thinking: z.string(), signature: z.string() }).passthrough(),
  z.object({ type: z.literal('redacted_thinking'), data: z.string() }).passthrough(),
]);

export const chatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.union([text, z.array(contentBlock).min(1).max(64)]),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(LIMITS.maxMessages),
    /** Context the user explicitly attached (selected documents). Untrusted. */
    context: z
      .array(z.object({ title: z.string().max(200), text: z.string().max(LIMITS.maxSystemContextChars) }).strict())
      .max(8)
      .optional(),
    tools: z.array(z.enum(toolNames as [string, ...string[]])).max(toolNames.length).optional(),
    /** The user's local date and time zone, so relative dates resolve correctly. */
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeZone: z.string().max(64).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ContentBlock = z.infer<typeof contentBlock>;

/** Server-sent events emitted by POST /api/chat, one JSON object per `data:` line. */
export type StreamEvent =
  | { type: 'start'; model: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'done'; stopReason: string | null; model: string; content: unknown[]; fallbackModel?: string }
  | { type: 'error'; code: ErrorCode; message: string };

export type ErrorCode =
  | 'not_configured'
  | 'bad_request'
  | 'auth'
  | 'rate_limited'
  | 'overloaded'
  | 'too_large'
  | 'forbidden_origin'
  | 'refusal'
  | 'network'
  | 'upstream';

export interface HealthResponse {
  ok: true;
  claude: { configured: boolean; model: string | null };
  version: string;
}
