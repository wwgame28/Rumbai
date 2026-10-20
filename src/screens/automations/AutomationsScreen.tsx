import { AlertTriangle, History, Info, Play, PlugZap, ShieldAlert, Zap } from 'lucide-react';
import { useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { isEnabled, runAutomation, setEnabled, TEMPLATES, templateById, type AutomationTemplate } from '../../automations/engine.ts';
import { useCollection } from '../../data/hooks.ts';
import { automationRuns, automations } from '../../data/store.ts';
import { formatDateTime, formatRelative } from '../../lib/date.ts';
import { Switch } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { useToast } from '../../ui/Toast.tsx';

const STATUS_LABEL = { success: 'Выполнено', error: 'Ошибка', skipped: 'Нечего делать', cancelled: 'Отменено' } as const;

export default function AutomationsScreen() {
  useCollection(automations);
  const runs = useCollection(automationRuns);
  const confirm = useConfirm();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);

  const run = async (tpl: AutomationTemplate) => {
    setRunning(tpl.id);
    try {
      const res = await runAutomation(tpl.id, 'user', (text) => confirm({ title: tpl.title, body: text, confirmLabel: 'Выполнить', danger: true }));
      if (res.status === 'error') toast.error(res.summary);
      else toast.show(res.status === 'success' ? 'success' : 'info', res.summary);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const toggle = async (tpl: AutomationTemplate, v: boolean) => {
    try {
      await setEnabled(tpl.id, v);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const history = [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20);

  return (
    <>
      <ScreenHeader title="Автоматизации" subtitle="Правила, которые выполняются на устройстве" />
      <div className="callout">
        <Info size={16} aria-hidden />
        <span>Браузер не даёт веб-приложениям работать в фоне. Автоматические правила срабатывают, когда RUMBAI открыт. Действия с последствиями всегда требуют подтверждения.</span>
      </div>

      <ul className="stack" aria-label="Шаблоны автоматизаций">
        {TEMPLATES.map((tpl) => {
          const state = automations.get(tpl.id);
          const canAuto = tpl.trigger !== 'manual' && !tpl.consequential && !tpl.unavailable;
          return (
            <li key={tpl.id} className={`card automation${tpl.unavailable ? ' is-unavailable' : ''}`}>
              <div className="row-between">
                <div className="row">
                  <span className="list-row-icon">{tpl.unavailable ? <PlugZap size={16} aria-hidden /> : <Zap size={16} aria-hidden />}</span>
                  <strong>{tpl.title}</strong>
                </div>
                {canAuto && <Switch checked={isEnabled(tpl.id)} label={`Включить «${tpl.title}»`} onChange={(v) => toggle(tpl, v)} />}
              </div>
              <dl className="automation-desc">
                <div>
                  <dt>Когда</dt>
                  <dd>{tpl.triggerLabel}</dd>
                </div>
                <div>
                  <dt>Что делает</dt>
                  <dd>{tpl.actionLabel}</dd>
                </div>
              </dl>
              {tpl.unavailable ? (
                <p className="row subtle" style={{ fontSize: 'var(--fs-sm)' }}>
                  <AlertTriangle size={14} aria-hidden /> Недоступно: {tpl.unavailable}
                </p>
              ) : (
                <div className="row-between wrap">
                  <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                    {tpl.consequential && (
                      <span className="badge badge-warning" style={{ marginRight: 6 }}>
                        <ShieldAlert size={11} aria-hidden /> с подтверждением
                      </span>
                    )}
                    {state?.lastRunAt ? `Последний запуск ${formatRelative(state.lastRunAt)}` : 'Ещё не запускалась'}
                  </span>
                  <button type="button" className="btn btn-sm" onClick={() => run(tpl)} disabled={running !== null}>
                    <Play size={14} aria-hidden /> {running === tpl.id ? 'Выполняется…' : 'Запустить сейчас'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="stack" aria-labelledby="runs-title">
        <h2 id="runs-title" className="section-title row">
          <History size={18} aria-hidden /> История запусков
        </h2>
        {history.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Запусков пока не было.
          </p>
        ) : (
          <ul className="list">
            {history.map((r) => (
              <li key={r.id} className="list-row">
                <span className={`dot status-${r.status === 'success' ? 'ok' : r.status === 'error' ? 'warn' : 'off'}`} aria-hidden />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span style={{ display: 'block' }}>{templateById(r.automationId)?.title ?? r.automationId}</span>
                  <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                    {STATUS_LABEL[r.status]} · {r.summary}
                  </span>
                </span>
                <span className="subtle" style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>
                  {formatDateTime(r.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
