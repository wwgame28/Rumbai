import { isToolName, toolMeta, toolSchemas, type ToolArgs, type ToolName } from '../../shared/tools.ts';
import { conversations, docs, logAudit, messages, notes, tasks } from '../data/store.ts';
import { newId } from '../data/ids.ts';
import { todayISO } from '../lib/date.ts';
import { findSnippets, matchesAll, score } from '../lib/search.ts';

export interface ToolOutcome {
  ok: boolean;
  /** JSON or text sent back to the model as the tool result. */
  content: string;
  /** One-line, human-readable result for the tool card. */
  summary: string;
  /** Documents the tool read, for source attribution. */
  sources?: Array<{ docId: string; title: string }>;
}

export type Decision = 'allow' | 'deny';
export type AskPermission = (name: ToolName, args: Record<string, unknown>) => Promise<Decision>;

/** Read tools run freely; writes need consent unless auto-approved; destructive tools always ask. */
export function needsConfirmation(name: ToolName, autoApproveWrites: boolean): boolean {
  const risk = toolMeta[name].risk;
  if (risk === 'read') return false;
  if (risk === 'write') return !autoApproveWrites;
  return true;
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  opts: { autoApproveWrites: boolean; ask: AskPermission },
): Promise<ToolOutcome> {
  if (!isToolName(name)) return { ok: false, content: `Unknown tool: ${name}`, summary: 'Неизвестный инструмент' };
  const parsed = toolSchemas[name].safeParse(rawArgs);
  if (!parsed.success) {
    await logAudit({ actor: 'assistant', action: `tool.${name}`, detail: 'invalid arguments', outcome: 'error' });
    return { ok: false, content: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, summary: 'Некорректные аргументы' };
  }
  const args = parsed.data as Record<string, unknown>;
  if (needsConfirmation(name, opts.autoApproveWrites)) {
    const decision = await opts.ask(name, args);
    if (decision === 'deny') {
      await logAudit({ actor: 'assistant', action: `tool.${name}`, detail: 'declined by user', outcome: 'denied' });
      return { ok: false, content: 'The user declined this action. Do not retry it unless they ask.', summary: 'Отклонено пользователем' };
    }
  }
  try {
    const out = await RUNNERS[name](args as never);
    if (toolMeta[name].risk !== 'read') await logAudit({ actor: 'assistant', action: `tool.${name}`, detail: out.summary.slice(0, 200), outcome: 'ok' });
    return out;
  } catch (err) {
    await logAudit({ actor: 'assistant', action: `tool.${name}`, detail: 'failed', outcome: 'error' });
    return { ok: false, content: `Tool failed: ${(err as Error).message}`, summary: `Ошибка: ${(err as Error).message}` };
  }
}

const json = (v: unknown) => JSON.stringify(v);

const RUNNERS: { [N in ToolName]: (args: ToolArgs<N>) => Promise<ToolOutcome> } = {
  async search_notes({ query, limit = 5 }) {
    const hits = notes
      .all()
      .filter((n) => matchesAll(`${n.title}\n${n.body}\n${n.tags.join(' ')}\n${n.category}`, query))
      .sort((a, b) => score(`${b.title} ${b.body}`, query) - score(`${a.title} ${a.body}`, query))
      .slice(0, limit)
      .map((n) => ({ id: n.id, title: n.title || 'Без названия', category: n.category, tags: n.tags, snippet: findSnippets(n.body, query, 1)[0]?.text ?? n.body.slice(0, 160) }));
    return { ok: true, content: json({ results: hits }), summary: `Найдено заметок: ${hits.length}` };
  },

  async search_documents({ query, limit = 5 }) {
    const hits = docs
      .all()
      .filter((d) => matchesAll(`${d.name}\n${d.text}`, query))
      .sort((a, b) => score(b.text, query) - score(a.text, query))
      .slice(0, limit)
      .map((d) => ({ id: d.id, file: d.name, matches: findSnippets(d.text, query, 2) }));
    return {
      ok: true,
      content: json({ search: 'keyword', results: hits }),
      summary: `Найдено документов: ${hits.length}`,
      sources: hits.map((h) => ({ docId: h.id, title: h.file })),
    };
  },

  async search_conversations({ query, limit = 5 }) {
    const hits = messages
      .all()
      .filter((m) => m.role !== 'tool' && matchesAll(m.text, query))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((m) => ({
        conversation: conversations.get(m.conversationId)?.title ?? '',
        role: m.role,
        date: new Date(m.createdAt).toISOString().slice(0, 10),
        snippet: findSnippets(m.text, query, 1)[0]?.text ?? '',
      }));
    return { ok: true, content: json({ results: hits }), summary: `Найдено сообщений: ${hits.length}` };
  },

  async list_tasks({ filter }) {
    const today = todayISO();
    const list = tasks.all().filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'done') return t.done;
      if (t.done) return false;
      if (filter === 'today') return t.due === today;
      if (filter === 'overdue') return t.due !== null && t.due < today;
      return true;
    });
    const out = list.slice(0, 50).map((t) => ({ id: t.id, title: t.title, priority: t.priority, due: t.due, done: t.done }));
    return { ok: true, content: json({ today, tasks: out, truncated: list.length > 50 }), summary: `Задач: ${list.length}` };
  },

  async create_task({ title, notes: body, priority, due }) {
    const now = Date.now();
    const t = await tasks.put({ id: newId(), title, notes: body ?? '', priority: priority ?? 'medium', due: due ?? null, done: false, doneAt: null, createdAt: now, updatedAt: now });
    return { ok: true, content: json({ created: { id: t.id, title: t.title, due: t.due } }), summary: `Создана задача «${t.title}»` };
  },

  async update_task({ id, ...patch }) {
    const t = tasks.get(id);
    if (!t) return { ok: false, content: `No task with id ${id}`, summary: 'Задача не найдена' };
    const done = patch.done ?? t.done;
    const next = await tasks.put({
      ...t,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.due !== undefined && { due: patch.due }),
      done,
      doneAt: done ? (t.doneAt ?? Date.now()) : null,
      updatedAt: Date.now(),
    });
    return { ok: true, content: json({ updated: { id: next.id, title: next.title, done: next.done, due: next.due } }), summary: `Обновлена задача «${next.title}»` };
  },

  async delete_task({ id }) {
    const t = tasks.get(id);
    if (!t) return { ok: false, content: `No task with id ${id}`, summary: 'Задача не найдена' };
    await tasks.remove(id);
    return { ok: true, content: json({ deleted: id }), summary: `Удалена задача «${t.title}»` };
  },

  async create_note({ title, body, category, tags }) {
    const now = Date.now();
    const n = await notes.put({ id: newId(), title, body, category: category ?? '', tags: tags ?? [], pinned: false, createdAt: now, updatedAt: now });
    return { ok: true, content: json({ created: { id: n.id, title: n.title } }), summary: `Создана заметка «${n.title}»` };
  },

  async read_document({ id, maxChars = 6000 }) {
    const d = docs.get(id);
    if (!d) return { ok: false, content: `No document with id ${id}`, summary: 'Документ не найден' };
    const text = d.text.slice(0, maxChars);
    return {
      ok: true,
      content: json({ file: d.name, truncated: d.text.length > maxChars, text }),
      summary: `Прочитан документ «${d.name}»`,
      sources: [{ docId: d.id, title: d.name }],
    };
  },
};

/** Human-readable description of a pending action for the confirmation dialog. */
export function describeAction(name: ToolName, args: Record<string, unknown>): string {
  const a = args as Record<string, string | boolean | string[] | undefined>;
  switch (name) {
    case 'create_task':
      return `Создать задачу «${a.title}»${a.due ? ` со сроком ${a.due}` : ''}.`;
    case 'update_task': {
      const t = tasks.get(String(a.id));
      return `Изменить задачу «${t?.title ?? a.id}»${a.done === true ? ' — отметить выполненной' : ''}.`;
    }
    case 'delete_task': {
      const t = tasks.get(String(a.id));
      return `Удалить задачу «${t?.title ?? a.id}» без возможности восстановления.`;
    }
    case 'create_note':
      return `Создать заметку «${a.title}».`;
    default:
      return toolMeta[name].label;
  }
}

