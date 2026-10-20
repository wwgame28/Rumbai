import type { Priority, Task } from '../../data/types.ts';

export type TaskFilter = 'open' | 'today' | 'upcoming' | 'overdue' | 'done';
export type TaskSort = 'due' | 'priority' | 'created';

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function filterTasks(list: Task[], filter: TaskFilter, today: string): Task[] {
  return list.filter((t) => {
    switch (filter) {
      case 'done':
        return t.done;
      case 'today':
        return !t.done && t.due !== null && t.due <= today;
      case 'upcoming':
        return !t.done && t.due !== null && t.due > today;
      case 'overdue':
        return !t.done && t.due !== null && t.due < today;
      default:
        return !t.done;
    }
  });
}

export function sortTasks(list: Task[], sort: TaskSort): Task[] {
  const byDue = (a: Task, b: Task) => (a.due ?? '9999').localeCompare(b.due ?? '9999');
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
    if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDue(a, b);
    if (sort === 'created') return b.createdAt - a.createdAt;
    return byDue(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

export interface DaySummary {
  dueToday: number;
  overdue: number;
  doneToday: number;
  open: number;
}

export function summarize(list: Task[], today: string, dayStart: number): DaySummary {
  let dueToday = 0;
  let overdue = 0;
  let doneToday = 0;
  let open = 0;
  for (const t of list) {
    if (t.done) {
      if ((t.doneAt ?? 0) >= dayStart) doneToday++;
      continue;
    }
    open++;
    if (t.due === today) dueToday++;
    else if (t.due !== null && t.due < today) overdue++;
  }
  return { dueToday, overdue, doneToday, open };
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
