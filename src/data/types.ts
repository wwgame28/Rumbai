import { z } from 'zod';

export const prioritySchema = z.enum(['low', 'medium', 'high']);
export type Priority = z.infer<typeof prioritySchema>;

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).default(''),
  priority: prioritySchema.default('medium'),
  /** Local calendar date, YYYY-MM-DD. */
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  done: z.boolean().default(false),
  doneAt: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Task = z.infer<typeof taskSchema>;

export const noteSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  body: z.string().max(200_000),
  category: z.string().max(40).default(''),
  tags: z.array(z.string().max(30)).max(20).default([]),
  pinned: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Note = z.infer<typeof noteSchema>;

export const engineRefSchema = z.object({
  kind: z.enum(['local', 'cloud']),
  model: z.string(),
  label: z.string(),
});
export type EngineRef = z.infer<typeof engineRefSchema>;

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'done', 'denied', 'error']),
  summary: z.string().default(''),
});
export type ToolCallRecord = z.infer<typeof toolCallSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string().max(120),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** IDs of knowledge documents attached as context for this conversation. */
  contextDocIds: z.array(z.string()).default([]),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  /** 'tool' rows carry tool results; they are sent to Claude as user turns and not shown as bubbles. */
  role: z.enum(['user', 'assistant', 'tool']),
  text: z.string(),
  createdAt: z.number(),
  status: z.enum(['done', 'streaming', 'stopped', 'error']).default('done'),
  error: z.string().optional(),
  engine: engineRefSchema.optional(),
  /** Raw content blocks for Claude turns, replayed unchanged on later requests. */
  api: z.array(z.unknown()).optional(),
  toolCalls: z.array(toolCallSchema).optional(),
  sources: z.array(z.object({ docId: z.string(), title: z.string() })).optional(),
});
export type Message = z.infer<typeof messageSchema>;

export const docSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  ext: z.string(),
  size: z.number(),
  importedAt: z.number(),
  text: z.string(),
  chars: z.number(),
  lines: z.number(),
});
export type Doc = z.infer<typeof docSchema>;

export const excerptSchema = z.object({
  id: z.string(),
  docId: z.string(),
  docName: z.string(),
  line: z.number(),
  text: z.string().max(4000),
  createdAt: z.number(),
});
export type Excerpt = z.infer<typeof excerptSchema>;

export const automationStateSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.number().nullable().default(null),
});
export type AutomationState = z.infer<typeof automationStateSchema>;

export const automationRunSchema = z.object({
  id: z.string(),
  automationId: z.string(),
  startedAt: z.number(),
  status: z.enum(['success', 'error', 'skipped', 'cancelled']),
  summary: z.string(),
});
export type AutomationRun = z.infer<typeof automationRunSchema>;

export const auditSchema = z.object({
  id: z.string(),
  at: z.number(),
  actor: z.enum(['user', 'assistant', 'automation', 'system']),
  action: z.string(),
  /** Short, non-sensitive label (e.g. an object id or a count) — never message or document contents. */
  detail: z.string().max(200),
  outcome: z.enum(['ok', 'denied', 'error']),
});
export type AuditEntry = z.infer<typeof auditSchema>;

export const widgetIds = ['summary', 'quick', 'tasks', 'notes', 'ai', 'storage', 'activity'] as const;
export type WidgetId = (typeof widgetIds)[number];

export const prefsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  motion: z.enum(['system', 'reduced', 'full']).default('system'),
  userName: z.string().max(40).default(''),
  widgets: z
    .array(z.object({ id: z.enum(widgetIds), visible: z.boolean() }))
    .default(widgetIds.map((id) => ({ id, visible: true }))),
  engine: z.enum(['local', 'cloud']).default('local'),
  /** The user explicitly agreed that cloud mode sends prompts to Anthropic. */
  cloudConsent: z.boolean().default(false),
  /** Allow the assistant to create/update tasks and notes without asking each time. Deletion always asks. */
  autoApproveWrites: z.boolean().default(false),
  localModelId: z.string().nullable().default(null),
  /** modelId → time of the first successful on-device generation. */
  verifiedModels: z.record(z.string(), z.number()).default({}),
});
export type Prefs = z.infer<typeof prefsSchema>;
