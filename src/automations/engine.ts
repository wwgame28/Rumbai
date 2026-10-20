import { newId } from '../data/ids.ts';
import { automationRuns, automations, exportAll, logAudit, notes, tasks } from '../data/store.ts';
import type { AutomationRun } from '../data/types.ts';
import { formatDue, todayISO } from '../lib/date.ts';
import { downloadText } from '../lib/download.ts';

export type Trigger = 'app-open-daily' | 'app-open' | 'manual';

export interface AutomationTemplate {
  id: string;
  title: string;
  trigger: Trigger;
  triggerLabel: string;
  actionLabel: string;
  /** Consequential templates ask for confirmation on every run and never run automatically. */
  consequential?: boolean;
  /** Set when the template needs an integration that is not configured. */
  unavailable?: string;
  run?: (ctx: { confirm: (text: string) => Promise<boolean> }) => Promise<{ status: AutomationRun['status']; summary: string }>;
}

const DAY = 86_400_000;

export const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'daily-digest',
    title: 'Утренняя сводка',
    trigger: 'app-open-daily',
    triggerLabel: 'При первом открытии RUMBAI за день',
    actionLabel: 'Создаёт заметку со списком задач на сегодня и просроченных',
    async run() {
      const today = todayISO();
      const open = tasks.all().filter((t) => !t.done);
      const due = open.filter((t) => t.due === today);
      const overdue = open.filter((t) => t.due !== null && t.due < today);
      const line = (t: (typeof open)[number]) => `- [ ] ${t.title}${t.due && t.due !== today ? ` (${formatDue(t.due, today)})` : ''}`;
      const body = [
        `## На сегодня (${due.length})`,
        due.length ? due.map(line).join('\n') : '_Задач на сегодня нет._',
        '',
        `## Просрочено (${overdue.length})`,
        overdue.length ? overdue.map(line).join('\n') : '_Просроченных задач нет._',
      ].join('\n');
      const now = Date.now();
      await notes.put({ id: newId(), title: `Сводка на ${today.split('-').reverse().join('.')}`, body, category: 'Сводки', tags: ['автоматизация'], pinned: false, createdAt: now, updatedAt: now });
      return { status: 'success', summary: `Создана сводка: ${due.length} на сегодня, ${overdue.length} просрочено` };
    },
  },
  {
    id: 'overdue-priority',
    title: 'Приоритет просроченным',
    trigger: 'app-open',
    triggerLabel: 'При открытии RUMBAI (не чаще раза в час)',
    actionLabel: 'Ставит высокий приоритет незавершённым задачам с прошедшим сроком',
    async run() {
      const today = todayISO();
      const targets = tasks.all().filter((t) => !t.done && t.due !== null && t.due < today && t.priority !== 'high');
      await tasks.putMany(targets.map((t) => ({ ...t, priority: 'high' as const, updatedAt: Date.now() })));
      return targets.length ? { status: 'success', summary: `Обновлено задач: ${targets.length}` } : { status: 'skipped', summary: 'Просроченных задач без высокого приоритета нет' };
    },
  },
  {
    id: 'cleanup-done',
    title: 'Очистка выполненных',
    trigger: 'manual',
    triggerLabel: 'Вручную',
    actionLabel: 'Удаляет задачи, выполненные больше 7 дней назад',
    consequential: true,
    async run({ confirm }) {
      const cutoff = Date.now() - 7 * DAY;
      const old = tasks.all().filter((t) => t.done && (t.doneAt ?? t.updatedAt) < cutoff);
      if (!old.length) return { status: 'skipped', summary: 'Нет задач, выполненных больше недели назад' };
      if (!(await confirm(`Удалить ${old.length} выполненных задач без возможности восстановления?`))) return { status: 'cancelled', summary: 'Отменено пользователем' };
      await tasks.remove(old.map((t) => t.id));
      return { status: 'success', summary: `Удалено задач: ${old.length}` };
    },
  },
  {
    id: 'backup-export',
    title: 'Резервная копия',
    trigger: 'manual',
    triggerLabel: 'Вручную',
    actionLabel: 'Скачивает все данные RUMBAI одним JSON-файлом на это устройство',
    async run() {
      const data = await exportAll();
      downloadText(`rumbai-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
      return { status: 'success', summary: 'Файл резервной копии сформирован' };
    },
  },
  {
    id: 'telegram-digest',
    title: 'Сводка в Telegram',
    trigger: 'app-open-daily',
    triggerLabel: 'Каждое утро',
    actionLabel: 'Отправляет сводку задач в Telegram',
    unavailable: 'Нужна интеграция с Telegram — она не настроена в этой версии.',
  },
  {
    id: 'calendar-sync',
    title: 'Задачи из календаря',
    trigger: 'app-open',
    triggerLabel: 'При открытии',
    actionLabel: 'Создаёт задачи из событий календаря',
    unavailable: 'Браузер не даёт доступа к календарю iPhone, а облачная интеграция календаря не настроена.',
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

export function isEnabled(id: string) {
  return automations.get(id)?.enabled ?? false;
}

export async function setEnabled(id: string, enabled: boolean) {
  const prev = automations.get(id);
  await automations.put({ id, enabled, lastRunAt: prev?.lastRunAt ?? null });
  await logAudit({ actor: 'user', action: enabled ? 'automation.enable' : 'automation.disable', detail: id, outcome: 'ok' });
}

const RUN_HISTORY_LIMIT = 100;

export async function runAutomation(id: string, actor: 'user' | 'automation', confirm: (text: string) => Promise<boolean>) {
  const tpl = templateById(id);
  if (!tpl?.run || tpl.unavailable) throw new Error('Автоматизация недоступна');
  const startedAt = Date.now();
  let result: { status: AutomationRun['status']; summary: string };
  try {
    result = await tpl.run({ confirm });
  } catch (err) {
    result = { status: 'error', summary: (err as Error).message };
  }
  await automationRuns.put({ id: newId(), automationId: id, startedAt, ...result });
  const prev = automations.get(id);
  if (result.status !== 'cancelled') await automations.put({ id, enabled: prev?.enabled ?? false, lastRunAt: startedAt });
  await logAudit({ actor, action: `automation.run.${id}`, detail: result.summary.slice(0, 200), outcome: result.status === 'error' ? 'error' : 'ok' });
  const runs = automationRuns.all();
  if (runs.length > RUN_HISTORY_LIMIT) {
    const old = [...runs].sort((a, b) => a.startedAt - b.startedAt).slice(0, runs.length - RUN_HISTORY_LIMIT);
    await automationRuns.remove(old.map((r) => r.id));
  }
  return result;
}

/** Runs enabled, non-consequential automations whose trigger is due. Only works while the app is open. */
export async function runStartupAutomations() {
  const now = Date.now();
  const today = todayISO();
  for (const tpl of TEMPLATES) {
    if (!tpl.run || tpl.unavailable || tpl.consequential || !isEnabled(tpl.id)) continue;
    const last = automations.get(tpl.id)?.lastRunAt ?? null;
    const due =
      (tpl.trigger === 'app-open-daily' && (last === null || todayISO(new Date(last)) !== today)) ||
      (tpl.trigger === 'app-open' && (last === null || now - last > 3_600_000));
    if (due) await runAutomation(tpl.id, 'automation', async () => false);
  }
}
