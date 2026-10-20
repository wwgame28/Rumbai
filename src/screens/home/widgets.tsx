import { Bot, Check, Cloud, Cpu, Database, FilePlus2, HardDrive, ListPlus, NotebookPen, ShieldCheck, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCloudHealth } from '../../ai/health.ts';
import { findModelById } from '../../ai/models.ts';
import { useCapabilities } from '../../ai/useCapabilities.ts';
import { useLocalStatus } from '../../ai/useLocalStatus.ts';
import { useOnline } from '../../app/useEnvironment.ts';
import { useCollection, usePrefs } from '../../data/hooks.ts';
import { audit, docs, getStorageInfo, notes, tasks } from '../../data/store.ts';
import type { Task } from '../../data/types.ts';
import { formatRelative, todayISO } from '../../lib/date.ts';
import { formatBytes } from '../../lib/format.ts';
import { navigate } from '../../lib/router.ts';
import { useSwState } from '../../pwa/register.ts';
import { Orb } from '../../ui/Orb.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { TaskRow } from '../tasks/TaskRow.tsx';
import { prettyClaude } from '../../ai/cloud.ts';

export function QuickActions() {
  const items = [
    { label: 'Новая задача', icon: ListPlus, go: () => navigate('tasks', 'new') },
    { label: 'Новая заметка', icon: NotebookPen, go: () => navigate('notes', 'new') },
    { label: 'Спросить RUMBAI', icon: Bot, go: () => navigate('assistant') },
    { label: 'Импорт файла', icon: FilePlus2, go: () => navigate('files') },
  ];
  return (
    <section className="quick-grid" aria-label="Быстрые действия">
      {items.map((i) => (
        <button key={i.label} type="button" className="quick" onClick={i.go}>
          <span className="quick-icon">
            <i.icon size={20} aria-hidden />
          </span>
          <span>{i.label}</span>
        </button>
      ))}
    </section>
  );
}

export function TodayTasks() {
  const all = useCollection(tasks);
  const toast = useToast();
  const today = todayISO();
  const list = all
    .filter((t) => !t.done && t.due !== null && t.due <= today)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
    .slice(0, 5);
  const toggle = async (t: Task) => {
    try {
      await tasks.put({ ...t, done: !t.done, doneAt: t.done ? null : Date.now(), updatedAt: Date.now() });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <section className="card" aria-labelledby="w-tasks">
      <div className="row-between widget-head">
        <h2 id="w-tasks" className="card-title">
          Задачи на сегодня
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('tasks')}>
          Все
        </button>
      </div>
      {list.length === 0 ? (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          На сегодня задач нет.
        </p>
      ) : (
        <ul className="task-list compact">
          {list.map((t) => (
            <li key={t.id}>
              <TaskRow task={t} today={today} onToggle={toggle} onOpen={() => navigate('tasks')} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecentNotes() {
  const all = useCollection(notes);
  const recent = [...all].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  return (
    <section className="card" aria-labelledby="w-notes">
      <div className="row-between widget-head">
        <h2 id="w-notes" className="card-title">
          Недавние заметки
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('notes')}>
          Все
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Заметок пока нет.
        </p>
      ) : (
        <div className="stack" style={{ gap: 4 }}>
          {recent.map((n) => (
            <button key={n.id} type="button" className="mini-row" onClick={() => navigate('notes', n.id)}>
              <span className="truncate grow">{n.title || 'Без названия'}</span>
              <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                {formatRelative(n.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function AiStatus() {
  const local = useLocalStatus();
  const cloud = useCloudHealth();
  const prefs = usePrefs();
  const [caps] = useCapabilities();
  const online = useOnline();
  const modelId = local.phase === 'idle' || local.phase === 'error' ? prefs.localModelId : local.modelId;
  const model = modelId ? findModelById(modelId) : undefined;
  const verified = modelId ? prefs.verifiedModels[modelId] : undefined;

  let localText = 'Модель не загружена';
  let localTone: 'ok' | 'warn' | 'off' = 'off';
  if (caps && caps.webgpu !== 'available') {
    localText = 'Недоступно: нет WebGPU';
  } else if (local.phase === 'loading') {
    localText = `Загрузка ${Math.round(local.progress * 100)}%`;
    localTone = 'warn';
  } else if (local.phase === 'ready' || local.phase === 'generating') {
    localText = verified ? `${model?.label ?? modelId} · проверена` : `${model?.label ?? modelId} · загружена, не проверена`;
    localTone = verified ? 'ok' : 'warn';
  } else if (local.phase === 'error') {
    localText = 'Ошибка загрузки модели';
    localTone = 'warn';
  }

  let cloudText = 'Проверка…';
  let cloudTone: 'ok' | 'warn' | 'off' = 'off';
  if (!online) cloudText = 'Нет сети';
  else if (cloud.state === 'static') cloudText = 'Недоступно в версии без сервера';
  else if (cloud.state === 'unreachable') cloudText = 'Сервер недоступен';
  else if (cloud.state === 'ok') {
    cloudText = cloud.configured ? `${prettyClaude(cloud.model ?? '')} · доступен` : 'Не настроен на сервере';
    cloudTone = cloud.configured ? 'ok' : 'off';
  }

  const anyReady = localTone === 'ok' || local.phase === 'ready' || cloudTone === 'ok';
  return (
    <section className="card card-glass ai-card" aria-labelledby="w-ai">
      <div className="row" style={{ gap: 'var(--sp-3)' }}>
        <Orb active={local.phase === 'loading' || local.phase === 'generating'} tone={anyReady ? 'accent' : 'muted'} />
        <div className="grow">
          <h2 id="w-ai" className="section-title">
            Ассистент RUMBAI
          </h2>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            {anyReady ? 'Готов к работе' : 'Нужна локальная модель или облачный доступ'}
          </p>
        </div>
      </div>
      <ul className="status-list">
        <li>
          <Cpu size={16} aria-hidden />
          <span className="grow">На устройстве</span>
          <span className={`status status-${localTone}`}>{localText}</span>
        </li>
        <li>
          <Cloud size={16} aria-hidden />
          <span className="grow">Облако (Claude)</span>
          <span className={`status status-${cloudTone}`}>{cloudText}</span>
        </li>
      </ul>
      <div className="row">
        <button type="button" className="btn btn-primary grow" onClick={() => navigate('assistant')}>
          Открыть ассистента
        </button>
        <button type="button" className="btn" onClick={() => navigate('models')}>
          Модели
        </button>
      </div>
    </section>
  );
}

export function StorageStatus() {
  const info = getStorageInfo();
  const sw = useSwState();
  const allDocs = useCollection(docs);
  const [est, setEst] = useState<{ usage: number; quota: number; persisted: boolean | null } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const e = await navigator.storage?.estimate?.();
        const p = (await navigator.storage?.persisted?.()) ?? null;
        if (e) setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: p });
      } catch {
        // Not available in this browser.
      }
    })();
  }, []);
  return (
    <section className="card" aria-labelledby="w-storage">
      <h2 id="w-storage" className="card-title widget-head">
        Хранилище и офлайн
      </h2>
      <ul className="status-list">
        <li>
          <Database size={16} aria-hidden />
          <span className="grow">Данные</span>
          <span className={`status status-${info.kind === 'indexeddb' ? 'ok' : 'warn'}`}>{info.kind === 'indexeddb' ? 'IndexedDB на устройстве' : 'Только в памяти'}</span>
        </li>
        <li>
          <HardDrive size={16} aria-hidden />
          <span className="grow">Занято</span>
          <span className="status status-off tabular">{est ? `${formatBytes(est.usage)} из ${formatBytes(est.quota)}` : 'нет данных'}</span>
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden />
          <span className="grow">Защита от очистки</span>
          <span className={`status status-${est?.persisted ? 'ok' : 'off'}`}>{est?.persisted ? 'Включена' : 'Не включена'}</span>
        </li>
        <li>
          <WifiOff size={16} aria-hidden />
          <span className="grow">Интерфейс офлайн</span>
          <span className={`status status-${sw.controlled ? 'ok' : 'off'}`}>{sw.controlled ? 'Закэширован' : sw.supported ? 'Ещё не закэширован' : 'Не поддерживается'}</span>
        </li>
        <li>
          <Check size={16} aria-hidden />
          <span className="grow">Документы офлайн</span>
          <span className="status status-off">{allDocs.length ? `${allDocs.length} на устройстве` : 'нет документов'}</span>
        </li>
      </ul>
    </section>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'tool.create_task': 'Ассистент создал задачу',
  'tool.update_task': 'Ассистент изменил задачу',
  'tool.delete_task': 'Ассистент удалил задачу',
  'tool.create_note': 'Ассистент создал заметку',
  'task.delete': 'Удалена задача',
  'note.delete': 'Удалена заметка',
  'doc.import': 'Импортирован файл',
  'doc.delete': 'Удалён файл',
  'data.export': 'Экспорт данных',
  'data.delete': 'Удаление данных',
  'model.download': 'Загрузка модели',
  'model.delete': 'Удалён кэш модели',
  'cloud.consent': 'Разрешён облачный режим',
  'automation.enable': 'Включена автоматизация',
  'automation.disable': 'Выключена автоматизация',
};

export function actionLabel(action: string) {
  if (action.startsWith('automation.run.')) return 'Запуск автоматизации';
  return ACTION_LABEL[action] ?? action;
}

export function RecentActivity() {
  const all = useCollection(audit);
  const recent = [...all].sort((a, b) => b.at - a.at).slice(0, 5);
  return (
    <section className="card" aria-labelledby="w-activity">
      <h2 id="w-activity" className="card-title widget-head">
        Последние действия
      </h2>
      {recent.length === 0 ? (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Здесь появятся действия ассистента, автоматизаций и важные изменения.
        </p>
      ) : (
        <ul className="activity">
          {recent.map((a) => (
            <li key={a.id}>
              <span className={`dot status-${a.outcome === 'ok' ? 'ok' : a.outcome === 'denied' ? 'off' : 'warn'}`} aria-hidden />
              <span className="grow">
                <span>{actionLabel(a.action)}</span>
                {a.outcome !== 'ok' && <span className="subtle"> · {a.outcome === 'denied' ? 'отклонено' : 'ошибка'}</span>}
                <span className="subtle activity-detail truncate">{a.detail}</span>
              </span>
              <span className="subtle" style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>
                {formatRelative(a.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
