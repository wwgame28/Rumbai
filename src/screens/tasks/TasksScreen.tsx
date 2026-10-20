import { AnimatePresence, motion } from 'motion/react';
import { ListTodo, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCollection } from '../../data/hooks.ts';
import { tasks } from '../../data/store.ts';
import type { Task } from '../../data/types.ts';
import { todayISO } from '../../lib/date.ts';
import { countLabel } from '../../lib/format.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { matchesAll } from '../../lib/search.ts';
import { listItem } from '../../motion/presets.ts';
import { EmptyState, SearchField, Segmented } from '../../ui/controls.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { DayRing } from './DayRing.tsx';
import { TaskEditor } from './TaskEditor.tsx';
import { TaskRow } from './TaskRow.tsx';
import { filterTasks, sortTasks, summarize, type TaskFilter, type TaskSort } from './taskLogic.ts';

const FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: 'open', label: 'Открытые' },
  { value: 'today', label: 'Сегодня' },
  { value: 'upcoming', label: 'Позже' },
  { value: 'overdue', label: 'Просрочено' },
  { value: 'done', label: 'Готово' },
];

export default function TasksScreen() {
  const all = useCollection(tasks);
  const toast = useToast();
  const { param } = useRoute();
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [sort, setSort] = useState<TaskSort>('due');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [editorOpen, setEditorOpen] = useState(param === 'new');
  const today = todayISO();
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

  const [seenParam, setSeenParam] = useState(param);
  if (param !== seenParam) {
    setSeenParam(param);
    if (param === 'new') {
      setEditing(null);
      setEditorOpen(true);
    }
  }

  const summary = useMemo(() => summarize(all, today, dayStart), [all, today, dayStart]);
  const visible = useMemo(() => {
    const filtered = filterTasks(all, filter, today).filter((t) => matchesAll(`${t.title}\n${t.notes}`, query));
    return sortTasks(filtered, sort);
  }, [all, filter, sort, query, today]);

  const toggle = async (t: Task) => {
    const done = !t.done;
    try {
      await tasks.put({ ...t, done, doneAt: done ? Date.now() : null, updatedAt: Date.now() });
      if (done && 'vibrate' in navigator) navigator.vibrate?.(10);
      if (done)
        toast.show('success', `Готово: «${t.title}»`, {
          label: 'Отменить',
          run: () => tasks.put({ ...t, updatedAt: Date.now() }).catch((e: Error) => toast.error(e.message)),
        });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openEditor = (t: Task | null) => {
    setEditing(t);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    if (param === 'new') navigate('tasks');
  };

  return (
    <>
      <ScreenHeader title="Задачи" subtitle={`${countLabel(summary.open, ['открытая', 'открытые', 'открытых'])} · ${summary.dueToday} на сегодня`} />

      <section className="card card-glass day-card" aria-label="Обзор дня">
        <DayRing done={summary.doneToday} total={summary.doneToday + summary.dueToday + summary.overdue} />
        <div className="stack" style={{ gap: 4 }}>
          <strong>Сегодня</strong>
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Выполнено {summary.doneToday} · осталось {summary.dueToday}
            {summary.overdue > 0 && <span style={{ color: 'var(--danger)' }}> · просрочено {summary.overdue}</span>}
          </span>
        </div>
      </section>

      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Поиск задач" label="Поиск задач" />
        <Segmented label="Фильтр задач" value={filter} onChange={setFilter} options={FILTERS} />
        <div className="row-between">
          <span className="subtle" style={{ fontSize: 'var(--fs-sm)' }} aria-live="polite">
            {countLabel(visible.length, ['задача', 'задачи', 'задач'])}
          </span>
          <label className="row" style={{ fontSize: 'var(--fs-sm)' }}>
            <span className="muted">Сортировка</span>
            <select className="select" style={{ width: 'auto', minHeight: 36, fontSize: 15 }} value={sort} onChange={(e) => setSort(e.target.value as TaskSort)}>
              <option value="due">По сроку</option>
              <option value="priority">По приоритету</option>
              <option value="created">Сначала новые</option>
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ListTodo size={26} />}
          title={query ? 'Ничего не найдено' : filter === 'done' ? 'Пока ничего не выполнено' : 'Задач нет'}
          action={!query && filter !== 'done' && <button type="button" className="btn btn-primary" onClick={() => openEditor(null)}>Создать задачу</button>}
        >
          {query ? 'Попробуйте другие слова.' : 'Задачи хранятся только на этом устройстве.'}
        </EmptyState>
      ) : (
        <ul className="task-list" aria-label="Список задач">
          <AnimatePresence initial={false}>
            {visible.map((t) => (
              <motion.li key={t.id} layout="position" {...listItem}>
                <TaskRow task={t} today={today} query={query} onToggle={toggle} onOpen={openEditor} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <button type="button" className="fab" onClick={() => openEditor(null)}>
        <Plus size={20} aria-hidden /> Задача
      </button>
      <TaskEditor open={editorOpen} task={editing} onClose={closeEditor} />
    </>
  );
}
