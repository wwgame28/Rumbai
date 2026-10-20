import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useCollection, usePrefs } from '../../data/hooks.ts';
import { prefsStore, tasks } from '../../data/store.ts';
import type { WidgetId } from '../../data/types.ts';
import { greeting, todayISO } from '../../lib/date.ts';
import { itemVariants, pageVariants } from '../../motion/presets.ts';
import { Switch } from '../../ui/controls.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { summarize } from '../tasks/taskLogic.ts';
import { DayRing } from '../tasks/DayRing.tsx';
import { Clock, useNow } from './Clock.tsx';
import { AiStatus, QuickActions, RecentActivity, RecentNotes, StorageStatus, TodayTasks } from './widgets.tsx';

const WIDGET_LABEL: Record<WidgetId, string> = {
  summary: 'Сводка дня',
  quick: 'Быстрые действия',
  tasks: 'Задачи на сегодня',
  notes: 'Недавние заметки',
  ai: 'Статус ассистента',
  storage: 'Хранилище и офлайн',
  activity: 'Последние действия',
};

function DaySummary() {
  const all = useCollection(tasks);
  const today = todayISO();
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const s = useMemo(() => summarize(all, today, dayStart), [all, today, dayStart]);
  return (
    <section className="card summary-card" aria-label="Сводка дня">
      <DayRing done={s.doneToday} total={s.doneToday + s.dueToday + s.overdue} size={64} />
      <dl className="summary-stats">
        <div>
          <dt>На сегодня</dt>
          <dd className="tabular">{s.dueToday}</dd>
        </div>
        <div>
          <dt>Просрочено</dt>
          <dd className="tabular" style={s.overdue ? { color: 'var(--danger)' } : undefined}>
            {s.overdue}
          </dd>
        </div>
        <div>
          <dt>Выполнено</dt>
          <dd className="tabular">{s.doneToday}</dd>
        </div>
      </dl>
    </section>
  );
}

const RENDER: Record<WidgetId, () => ReactNode> = {
  summary: () => <DaySummary />,
  quick: () => <QuickActions />,
  tasks: () => <TodayTasks />,
  notes: () => <RecentNotes />,
  ai: () => <AiStatus />,
  storage: () => <StorageStatus />,
  activity: () => <RecentActivity />,
};

export function HomeScreen() {
  const prefs = usePrefs();
  const now = useNow();
  const [customize, setCustomize] = useState(false);
  const name = prefs.userName.trim();
  return (
    <motion.div className="screen" variants={pageVariants} initial="initial" animate="enter">
      <motion.header className="home-hero" variants={itemVariants}>
        <div className="grow">
          <p className="eyebrow">RUMBAI</p>
          <h1 className="home-greeting">
            {greeting(now)}
            {name ? `, ${name}` : ''}
          </h1>
          <Clock now={now} />
        </div>
        <button type="button" className="icon-btn" onClick={() => setCustomize(true)} aria-label="Настроить главный экран">
          <SlidersHorizontal size={20} />
        </button>
      </motion.header>

      {prefs.widgets
        .filter((w) => w.visible)
        .map((w) => (
          <motion.div key={w.id} variants={itemVariants}>
            {RENDER[w.id]()}
          </motion.div>
        ))}

      <CustomizeSheet open={customize} onClose={() => setCustomize(false)} />
    </motion.div>
  );
}

function CustomizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const toast = useToast();
  const update = (widgets: typeof prefs.widgets) => prefsStore.update({ widgets }).catch((e: Error) => toast.error(e.message));
  const move = (i: number, d: -1 | 1) => {
    const next = [...prefs.widgets];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    update(next);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Главный экран">
      <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>
        Включайте виджеты и меняйте их порядок.
      </p>
      <ul className="list">
        {prefs.widgets.map((w, i) => (
          <li key={w.id} className="list-row">
            <span className="grow">{WIDGET_LABEL[w.id]}</span>
            <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Переместить «${WIDGET_LABEL[w.id]}» выше`}>
              <ArrowUp size={18} />
            </button>
            <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === prefs.widgets.length - 1} aria-label={`Переместить «${WIDGET_LABEL[w.id]}» ниже`}>
              <ArrowDown size={18} />
            </button>
            <Switch checked={w.visible} label={`Показывать «${WIDGET_LABEL[w.id]}»`} onChange={(v) => update(prefs.widgets.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
