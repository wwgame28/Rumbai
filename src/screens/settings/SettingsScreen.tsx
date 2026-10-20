import { Cloud, Cpu, Database, Download, FileClock, Globe, Info, Lock, Palette, ShieldCheck, Smartphone, Trash2, User, Workflow } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { prettyClaude } from '../../ai/cloud.ts';
import { refreshHealth, useCloudHealth } from '../../ai/health.ts';
import { localEngine } from '../../ai/local.ts';
import { LOCAL_MODELS } from '../../ai/models.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useCollection, usePrefs } from '../../data/hooks.ts';
import { audit, deleteAllData, exportAll, getStorageInfo, logAudit, prefsStore } from '../../data/store.ts';
import type { Prefs } from '../../data/types.ts';
import { formatDateTime, todayISO } from '../../lib/date.ts';
import { downloadText } from '../../lib/download.ts';
import { formatBytes } from '../../lib/format.ts';
import { navigate } from '../../lib/router.ts';
import { useSwState } from '../../pwa/register.ts';
import { Segmented, Switch } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { actionLabel } from '../home/widgets.tsx';

const APP_VERSION = '1.0.0';

async function readStorage(): Promise<{ est: { usage: number; quota: number } | null; persisted: boolean | null }> {
  try {
    const e = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? null;
    return { est: e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null, persisted };
  } catch {
    return { est: null, persisted: null };
  }
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={title}>
      <h2 className="settings-title">
        {icon}
        {title}
      </h2>
      <div className="list">{children}</div>
    </section>
  );
}

function Row({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children?: ReactNode; htmlFor?: string }) {
  return (
    <div className="list-row settings-row">
      <div className="grow" style={{ minWidth: 0 }}>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsScreen() {
  const prefs = usePrefs();
  const cloud = useCloudHealth();
  const sw = useSwState();
  const auditLog = useCollection(audit);
  const confirm = useConfirm();
  const toast = useToast();
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [name, setName] = useState(prefs.userName);

  const loadStorage = () =>
    readStorage().then((s) => {
      setEst(s.est);
      setPersisted(s.persisted);
    });
  useEffect(() => {
    let alive = true;
    readStorage().then((s) => {
      if (!alive) return;
      setEst(s.est);
      setPersisted(s.persisted);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = (patch: Partial<Prefs>) => prefsStore.update(patch).catch((e: Error) => toast.error(e.message));

  const requestPersist = async () => {
    if (!navigator.storage?.persist) return toast.error('Браузер не поддерживает защиту хранилища.');
    const ok = await navigator.storage.persist();
    setPersisted(ok);
    if (ok) toast.success('Хранилище защищено от автоматической очистки');
    else toast.info('Браузер отклонил запрос. На iPhone это обычно разрешается после установки на экран «Домой».');
  };

  const exportData = async () => {
    const data = await exportAll();
    downloadText(`rumbai-export-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    await logAudit({ actor: 'user', action: 'data.export', detail: 'json', outcome: 'ok' });
  };

  const deleteData = async () => {
    const ok = await confirm({
      title: 'Удалить все данные RUMBAI?',
      body: 'Задачи, заметки, разговоры, документы, автоматизации, журнал и настройки будут удалены с этого устройства. Это необратимо. Скачанные модели удаляются отдельно.',
      confirmLabel: 'Удалить всё',
      danger: true,
      requireText: 'УДАЛИТЬ',
    });
    if (!ok) return;
    try {
      await deleteAllData();
      await logAudit({ actor: 'user', action: 'data.delete', detail: 'all stores', outcome: 'ok' });
      toast.success('Все данные удалены');
      navigate('home');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteModels = async () => {
    const ok = await confirm({ title: 'Удалить все скачанные модели?', body: 'Освободит место; модели можно будет скачать снова.', confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await localEngine.unload();
      for (const m of LOCAL_MODELS) for (const id of [m.ids.f16, m.ids.f32]) if (id && (await localEngine.isCached(id))) await localEngine.deleteCache(id);
      await logAudit({ actor: 'user', action: 'model.delete', detail: 'all', outcome: 'ok' });
      toast.success('Кэш моделей очищен');
      loadStorage();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const revokeCloud = async (on: boolean) => {
    if (on) {
      const ok = await confirm({
        title: 'Разрешить облачный режим?',
        body: 'Сообщения, история разговора и выбранные документы будут отправляться через сервер RUMBAI в Anthropic, когда вы выбираете облачный режим.',
        confirmLabel: 'Разрешить',
      });
      if (!ok) return;
      await logAudit({ actor: 'user', action: 'cloud.consent', detail: 'granted', outcome: 'ok' });
    }
    update({ cloudConsent: on, ...(on ? {} : { engine: 'local' as const }) });
  };

  const storage = getStorageInfo();
  const cloudStatus =
    cloud.state === 'ok' ? (cloud.configured ? `Доступен · ${prettyClaude(cloud.model ?? '')}` : 'Не настроен на сервере') : cloud.state === 'unreachable' ? 'Сервер недоступен' : cloud.state === 'static' ? 'Нет сервера (GitHub Pages)' : 'Проверка…';

  return (
    <>
      <ScreenHeader title="Настройки" />

      <Section icon={<User size={16} aria-hidden />} title="Профиль">
        <Row label="Имя для приветствия" htmlFor="user-name">
          <input
            id="user-name"
            className="input"
            style={{ maxWidth: 180 }}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== prefs.userName && update({ userName: name.trim() })}
            placeholder="Не указано"
          />
        </Row>
      </Section>

      <Section icon={<Palette size={16} aria-hidden />} title="Внешний вид">
        <div className="list-row settings-stack">
          <span>Тема</span>
          <Segmented
            label="Тема"
            value={prefs.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'dark', label: 'Тёмная' },
              { value: 'light', label: 'Светлая' },
              { value: 'system', label: 'Как в системе' },
            ]}
          />
        </div>
        <div className="list-row settings-stack">
          <span>Анимации</span>
          <Segmented
            label="Анимации"
            value={prefs.motion}
            onChange={(motion) => update({ motion })}
            options={[
              { value: 'system', label: 'Как в системе' },
              { value: 'reduced', label: 'Минимум' },
              { value: 'full', label: 'Полные' },
            ]}
          />
        </div>
      </Section>

      <Section icon={<Globe size={16} aria-hidden />} title="Язык">
        <Row label="Язык интерфейса" hint="Пока доступен только русский. Ассистент отвечает на языке вопроса.">
          <span className="badge">Русский</span>
        </Row>
      </Section>

      <Section icon={<Cpu size={16} aria-hidden />} title="Локальный ИИ">
        <Row label="Модели на устройстве" hint="Скачивание, запуск, проверка и удаление моделей">
          <button type="button" className="btn btn-sm" onClick={() => navigate('models')}>
            Открыть
          </button>
        </Row>
        <Row label="Удалить все модели" hint="Освобождает место в хранилище браузера">
          <button type="button" className="btn btn-sm btn-danger" onClick={deleteModels}>
            Удалить
          </button>
        </Row>
      </Section>

      <Section icon={<Cloud size={16} aria-hidden />} title="Облачный ИИ (Claude)">
        <Row label="Статус сервера" hint="Ключ API хранится только на сервере и никогда не попадает в браузер.">
          <span className={`status status-${cloud.state === 'ok' && cloud.configured ? 'ok' : 'off'}`}>{cloudStatus}</span>
        </Row>
        <Row label="Разрешить облачный режим" hint="Без разрешения RUMBAI ничего не отправляет в облако." htmlFor="cloud-consent">
          <Switch id="cloud-consent" checked={prefs.cloudConsent} label="Разрешить облачный режим" onChange={revokeCloud} />
        </Row>
        <Row label="Проверить подключение">
          <button type="button" className="btn btn-sm" onClick={() => refreshHealth()}>
            Проверить
          </button>
        </Row>
      </Section>

      <Section icon={<Workflow size={16} aria-hidden />} title="Права ассистента">
        <Row
          label="Создавать и изменять без вопросов"
          hint="Задачи и заметки. Удаление всегда требует подтверждения; поиск и чтение не требуют."
          htmlFor="auto-writes"
        >
          <Switch id="auto-writes" checked={prefs.autoApproveWrites} label="Создавать и изменять без вопросов" onChange={(v) => update({ autoApproveWrites: v })} />
        </Row>
        <Row label="Журнал действий" hint={`${auditLog.length} записей · без содержимого сообщений и документов`}>
          <button type="button" className="btn btn-sm" onClick={() => setAuditOpen(true)}>
            <FileClock size={14} aria-hidden /> Открыть
          </button>
        </Row>
      </Section>

      <Section icon={<Database size={16} aria-hidden />} title="Хранилище">
        <Row label="Где хранятся данные" hint={storage.kind === 'indexeddb' ? 'IndexedDB этого браузера на этом устройстве' : 'Только в памяти — после перезагрузки данные пропадут'}>
          <span className={`status status-${storage.kind === 'indexeddb' ? 'ok' : 'warn'}`}>{storage.kind === 'indexeddb' ? 'Локально' : 'Память'}</span>
        </Row>
        <Row label="Использовано" hint="Включая кэш моделей и приложения">
          <span className="tabular">{est ? `${formatBytes(est.usage)} / ${formatBytes(est.quota)}` : '—'}</span>
        </Row>
        <Row
          label="Защита от очистки"
          hint="Браузер (особенно Safari) может удалить данные сайта при нехватке места или долгом неиспользовании. Регулярно делайте экспорт."
        >
          {persisted ? (
            <span className="badge badge-success">Включена</span>
          ) : (
            <button type="button" className="btn btn-sm" onClick={requestPersist}>
              Запросить
            </button>
          )}
        </Row>
      </Section>

      <Section icon={<Download size={16} aria-hidden />} title="Данные">
        <Row label="Экспорт всех данных" hint="JSON-файл со всеми задачами, заметками, разговорами и документами">
          <button type="button" className="btn btn-sm" onClick={exportData}>
            Скачать
          </button>
        </Row>
        <Row label="Удалить все данные" hint="Необратимо, требует подтверждения">
          <button type="button" className="btn btn-sm btn-danger" onClick={deleteData}>
            <Trash2 size={14} aria-hidden /> Удалить
          </button>
        </Row>
      </Section>

      <Section icon={<Lock size={16} aria-hidden />} title="Конфиденциальность">
        <div className="list-row privacy">
          <ul>
            <li>Аккаунт не нужен. Все данные хранятся на этом устройстве.</li>
            <li>Локальный режим: ответы генерирует модель на устройстве, ничего не отправляется в сеть.</li>
            <li>Облачный режим включается только с вашего разрешения и отмечен на экране ассистента.</li>
            <li>Файлы не загружаются в сеть. В облако попадают только документы, выбранные как контекст.</li>
            <li>Сеть используется для скачивания моделей (Hugging Face, GitHub) только после подтверждения.</li>
          </ul>
        </div>
      </Section>

      <Section icon={<ShieldCheck size={16} aria-hidden />} title="Интеграции">
        <Row label="Claude (Anthropic)" hint="Через серверный адаптер RUMBAI">
          <span className={`status status-${cloud.state === 'ok' && cloud.configured ? 'ok' : 'off'}`}>{cloud.state === 'ok' && cloud.configured ? 'Подключено' : 'Не подключено'}</span>
        </Row>
        <Row label="Синхронизация (Supabase)" hint="Не реализована в этой версии: данные не синхронизируются между устройствами.">
          <span className="status status-off">Нет</span>
        </Row>
        <Row label="Telegram, календарь, почта" hint="Не настроены. Связанные автоматизации помечены как недоступные.">
          <span className="status status-off">Нет</span>
        </Row>
      </Section>

      <Section icon={<Smartphone size={16} aria-hidden />} title="Установка на iPhone">
        <div className="list-row privacy">
          <ol>
            <li>Откройте RUMBAI по HTTPS в Safari.</li>
            <li>Нажмите «Поделиться».</li>
            <li>Выберите «На экран Домой».</li>
            <li>Подтвердите название и нажмите «Добавить».</li>
          </ol>
        </div>
      </Section>

      <Section icon={<Info size={16} aria-hidden />} title="О приложении">
        <Row label="Версия">
          <span className="tabular">RUMBAI {APP_VERSION}</span>
        </Row>
        <Row label="Офлайн-оболочка">
          <span className={`status status-${sw.controlled ? 'ok' : 'off'}`}>{sw.controlled ? 'Активна' : sw.supported ? 'Не активна' : 'Не поддерживается'}</span>
        </Row>
      </Section>

      <Sheet open={auditOpen} onClose={() => setAuditOpen(false)} title="Журнал действий" full>
        {auditLog.length === 0 ? (
          <p className="muted">Записей нет.</p>
        ) : (
          <div className="stack">
            <ul className="list">
              {[...auditLog]
                .sort((a, b) => b.at - a.at)
                .slice(0, 200)
                .map((a) => (
                  <li key={a.id} className="list-row">
                    <span className={`dot status-${a.outcome === 'ok' ? 'ok' : a.outcome === 'denied' ? 'off' : 'warn'}`} aria-hidden />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span style={{ display: 'block' }}>
                        {actionLabel(a.action)} <span className="subtle">· {{ user: 'вы', assistant: 'ассистент', automation: 'автоматизация', system: 'система' }[a.actor]}</span>
                      </span>
                      <span className="subtle truncate" style={{ display: 'block', fontSize: 'var(--fs-xs)' }}>
                        {a.detail}
                      </span>
                    </span>
                    <span className="subtle" style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(a.at)}
                    </span>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                if (await confirm({ title: 'Очистить журнал?', confirmLabel: 'Очистить', danger: true })) await audit.clear().catch((e: Error) => toast.error(e.message));
              }}
            >
              Очистить журнал
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
