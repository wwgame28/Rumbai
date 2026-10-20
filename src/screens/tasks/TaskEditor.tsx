import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { newId } from '../../data/ids.ts';
import { logAudit, tasks } from '../../data/store.ts';
import type { Priority, Task } from '../../data/types.ts';
import { addDays, todayISO } from '../../lib/date.ts';
import { Segmented } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { PRIORITY_LABEL } from './taskLogic.ts';

interface Props {
  open: boolean;
  task: Task | null;
  onClose: () => void;
}

export function TaskEditor({ open, task, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Задача' : 'Новая задача'}>
      {open && <TaskForm key={task?.id ?? 'new'} task={task} onDone={onClose} />}
    </Sheet>
  );
}

function TaskForm({ task, onDone }: { task: Task | null; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [due, setDue] = useState<string>(task?.due ?? '');
  const [saving, setSaving] = useState(false);
  const today = todayISO();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const now = Date.now();
    try {
      await tasks.put({
        id: task?.id ?? newId(),
        title: title.trim().slice(0, 200),
        notes: notes.slice(0, 5000),
        priority,
        due: due || null,
        done: task?.done ?? false,
        doneAt: task?.doneAt ?? null,
        createdAt: task?.createdAt ?? now,
        updatedAt: now,
      });
      toast.success(task ? 'Задача сохранена' : 'Задача создана');
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    const ok = await confirm({ title: 'Удалить задачу?', body: `«${task.title}» будет удалена без возможности восстановления.`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await tasks.remove(task.id);
      await logAudit({ actor: 'user', action: 'task.delete', detail: task.id, outcome: 'ok' });
      toast.success('Задача удалена');
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <form className="stack" onSubmit={save}>
      <label className="field">
        <span className="field-label">Название</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required data-autofocus enterKeyHint="done" placeholder="Что нужно сделать?" />
      </label>
      <div className="field">
        <span className="field-label" id="prio-label">
          Приоритет
        </span>
        <Segmented
          label="Приоритет"
          value={priority}
          onChange={setPriority}
          options={(['low', 'medium', 'high'] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="task-due">
          Срок
        </label>
        <div className="chips" role="group" aria-label="Быстрый выбор срока">
          <button type="button" className="chip" aria-pressed={due === today} onClick={() => setDue(today)}>
            Сегодня
          </button>
          <button type="button" className="chip" aria-pressed={due === addDays(today, 1)} onClick={() => setDue(addDays(today, 1))}>
            Завтра
          </button>
          <button type="button" className="chip" aria-pressed={due === addDays(today, 7)} onClick={() => setDue(addDays(today, 7))}>
            Через неделю
          </button>
          <button type="button" className="chip" aria-pressed={!due} onClick={() => setDue('')}>
            Без срока
          </button>
        </div>
        <input id="task-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <label className="field">
        <span className="field-label">Заметки</span>
        <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Детали, ссылки, контекст" />
      </label>
      <div className="row" style={{ marginTop: 'var(--sp-2)' }}>
        {task && (
          <button type="button" className="btn btn-danger" onClick={remove} aria-label="Удалить задачу">
            <Trash2 size={18} aria-hidden />
          </button>
        )}
        <button type="submit" className="btn btn-primary grow" disabled={saving || !title.trim()}>
          {saving ? 'Сохранение…' : task ? 'Сохранить' : 'Создать задачу'}
        </button>
      </div>
    </form>
  );
}
