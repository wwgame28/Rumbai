import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import type { Task } from '../../data/types.ts';
import { formatDue } from '../../lib/date.ts';
import { spring } from '../../motion/presets.ts';
import { Highlight } from '../../ui/controls.tsx';
import { highlightParts } from '../../lib/search.ts';
import { PRIORITY_LABEL } from './taskLogic.ts';

interface Props {
  task: Task;
  today: string;
  query?: string;
  onToggle: (t: Task) => void;
  onOpen: (t: Task) => void;
}

export function TaskRow({ task, today, query = '', onToggle, onOpen }: Props) {
  const overdue = !task.done && task.due !== null && task.due < today;
  return (
    <div className={`task-row${task.done ? ' is-done' : ''}`} data-testid="task-row">
      <button
        type="button"
        className="task-check"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Вернуть задачу «${task.title}»` : `Выполнить задачу «${task.title}»`}
        onClick={() => onToggle(task)}
      >
        <motion.span className="task-check-box" animate={{ scale: task.done ? [1, 0.82, 1.08, 1] : 1 }} transition={spring.pop}>
          {task.done && (
            <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop} style={{ display: 'grid' }}>
              <Check size={15} strokeWidth={3} aria-hidden />
            </motion.span>
          )}
        </motion.span>
      </button>
      <button type="button" className="task-main" onClick={() => onOpen(task)}>
        <span className="task-title">
          <Highlight parts={highlightParts(task.title, query)} />
        </span>
        <span className="task-meta">
          {task.due && <span className={`badge${overdue ? ' badge-danger' : task.due === today ? ' badge-accent' : ''}`}>{formatDue(task.due, today)}</span>}
          {task.priority !== 'medium' && (
            <span className={`prio prio-${task.priority}`}>
              <span className="dot" aria-hidden />
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {task.notes && <span className="subtle truncate">{task.notes.split('\n')[0]}</span>}
        </span>
      </button>
    </div>
  );
}
