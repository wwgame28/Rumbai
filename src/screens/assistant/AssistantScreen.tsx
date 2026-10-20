import { History, Plus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { refreshHealth } from '../../ai/health.ts';
import { localEngine } from '../../ai/local.ts';
import { assistant, threadOf, type Engine } from '../../assistant/controller.ts';
import { useCollection, usePrefs } from '../../data/hooks.ts';
import { conversations, logAudit, messages, prefsStore } from '../../data/store.ts';
import { navigate } from '../../lib/router.ts';
import { Segmented } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { Orb } from '../../ui/Orb.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Composer } from './Composer.tsx';
import { ContextSheet } from './ContextSheet.tsx';
import { HistorySheet } from './HistorySheet.tsx';
import { MessageView } from './MessageView.tsx';
import { useEngineReadiness } from './useEngineReadiness.ts';

const SUGGESTIONS = ['Что у меня запланировано на сегодня?', 'Составь план на неделю из моих задач', 'Помоги сформулировать заметку о встрече', 'Объясни простыми словами, что такое WebGPU'];

export default function AssistantScreen({ conversationId }: { conversationId: string | null }) {
  const state = useSyncExternalStore(assistant.subscribe, assistant.getSnapshot);
  const prefs = usePrefs();
  const allMessages = useCollection(messages);
  const convs = useCollection(conversations);
  const toast = useToast();
  const confirm = useConfirm();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const engine: Engine = prefs.engine;
  const readiness = useEngineReadiness(engine);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const conv = convs.find((c) => c.id === conversationId) ?? null;
  // A deleted or unknown conversation id falls back to a fresh chat.
  useEffect(() => {
    if (conversationId && !conv && conversations.loaded) navigate('assistant');
  }, [conversationId, conv]);

  const thread = useMemo(() => (conv ? threadOf(conv.id).filter((m) => m.role !== 'tool') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conv, allMessages]);
  const draft = state.busy && state.conversationId === conv?.id ? state.draft : null;
  const draftIsNew = draft && !thread.some((m) => m.id === draft.messageId);
  const lastAssistantId = [...thread].reverse().find((m) => m.role === 'assistant')?.id;
  const lastUserId = [...thread].reverse().find((m) => m.role === 'user')?.id;

  // Follow the stream only while the user is near the bottom.
  useEffect(() => {
    const onScroll = () => {
      stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    if (stick.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.length, draft?.text]);

  const setEngine = async (e: Engine) => {
    try {
      await prefsStore.update({ engine: e });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  /** Cloud mode needs explicit, informed consent once; it can be revoked in Settings. */
  const ensureCloudConsent = async () => {
    if (prefsStore.get().cloudConsent) return true;
    const ok = await confirm({
      title: 'Включить облачный режим?',
      body: (
        <>
          <p>В облачном режиме ваши сообщения, история этого разговора и выбранные документы отправляются через сервер RUMBAI в Anthropic (Claude).</p>
          <p>Локальный режим ничего не отправляет. Переключиться обратно можно в любой момент.</p>
        </>
      ),
      confirmLabel: 'Разрешить облако',
    });
    if (ok) {
      await prefsStore.update({ cloudConsent: true });
      await logAudit({ actor: 'user', action: 'cloud.consent', detail: 'granted', outcome: 'ok' });
    }
    return ok;
  };

  const send = async (text: string): Promise<boolean> => {
    if (!readiness.ready) {
      toast.error(readiness.detail ?? readiness.label);
      return false;
    }
    if (engine === 'cloud' && !(await ensureCloudConsent())) return false;
    try {
      stick.current = true;
      const id = await assistant.send(conv?.id ?? null, text, engine);
      if (id && id !== conv?.id) navigate('assistant', id);
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    }
  };

  const runAction = async () => {
    const a = readiness.action;
    if (!a) return;
    if (a.kind === 'models') navigate('models');
    else if (a.kind === 'retry-health') refreshHealth();
    else if (a.kind === 'load' && prefs.localModelId) await localEngine.load(prefs.localModelId);
  };

  const retry = async (id: string) => {
    if (!readiness.ready) return toast.error(readiness.detail ?? readiness.label);
    if (engine === 'cloud' && !(await ensureCloudConsent())) return;
    assistant.retry(id, engine).catch((e: Error) => toast.error(e.message));
  };

  const clearConversation = async () => {
    if (!conv) return;
    const ok = await confirm({ title: 'Очистить разговор?', body: 'Все сообщения этого разговора будут удалены.', confirmLabel: 'Очистить', danger: true });
    if (!ok) return;
    await assistant.deleteConversation(conv.id).catch((e: Error) => toast.error(e.message));
    navigate('assistant');
  };

  const phaseLabel =
    state.phase === 'confirm' ? 'Ждёт вашего подтверждения' : state.phase === 'tool' ? 'Работает с вашими данными…' : state.phase === 'waiting' ? 'Думает…' : state.phase === 'streaming' ? 'Отвечает…' : null;

  return (
    <div className="assistant">
      <header className="assistant-top">
        <button type="button" className="icon-btn" onClick={() => setHistoryOpen(true)} aria-label="История разговоров">
          <History size={20} />
        </button>
        <h1 className="assistant-title truncate grow">{conv?.title ?? 'Новый разговор'}</h1>
        {conv && (
          <button type="button" className="icon-btn" onClick={clearConversation} aria-label="Очистить разговор" disabled={state.busy}>
            <Trash2 size={19} />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => navigate('assistant')} aria-label="Новый разговор" disabled={!conv}>
          <Plus size={20} />
        </button>
      </header>

      <div className="engine-bar">
        <Segmented
          label="Где работает ассистент"
          value={engine}
          onChange={setEngine}
          options={[
            { value: 'local', label: 'На устройстве' },
            { value: 'cloud', label: 'Облако Claude' },
          ]}
        />
        <div className={`engine-status status-${readiness.tone}`} role="status" aria-live="polite">
          <span className="dot" aria-hidden />
          <span className="grow">
            <strong>{phaseLabel && state.conversationId === conv?.id ? phaseLabel : readiness.label}</strong>
            {readiness.detail && <span className="engine-detail">{readiness.detail}</span>}
          </span>
          {readiness.action && (
            <button type="button" className="btn btn-sm" onClick={runAction}>
              {readiness.action.label}
            </button>
          )}
        </div>
      </div>

      <section className="thread" aria-label="Сообщения" aria-live="polite">
        {thread.length === 0 && !draft && (
          <div className="assistant-empty">
            <Orb size={72} active={state.busy} />
            <h2>Чем помочь?</h2>
            <p className="muted">
              {engine === 'local' ? 'Ответы генерируются на этом устройстве.' : 'Claude может искать в ваших заметках и документах и создавать задачи — с вашего разрешения.'}
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={!readiness.ready || state.busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {thread.map((m) => (
          <MessageView
            key={m.id}
            message={m}
            draftText={draft?.messageId === m.id ? draft.text : undefined}
            streaming={draft?.messageId === m.id}
            canRetry={!state.busy && m.id === lastAssistantId}
            canEdit={!state.busy && m.id === lastUserId}
            onRetry={() => retry(m.id)}
            onEdit={() => setEditing({ id: m.id, text: m.text })}
          />
        ))}
        {draft && draftIsNew && (
          <MessageView
            message={{ id: draft.messageId, conversationId: conv?.id ?? '', role: 'assistant', text: '', createdAt: 0, status: 'streaming' }}
            draftText={draft.text}
            streaming
            canRetry={false}
            canEdit={false}
            onRetry={() => {}}
            onEdit={() => {}}
          />
        )}
        <div ref={bottomRef} className="thread-end" />
      </section>

      <Composer
        busy={state.busy}
        disabled={!readiness.ready}
        cloud={engine === 'cloud'}
        contextCount={conv?.contextDocIds.length ?? 0}
        onSend={send}
        onStop={() => assistant.stop()}
        onContext={() => setContextOpen(true)}
      />

      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} currentId={conv?.id ?? null} />
      <ContextSheet
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        conversationId={conv?.id ?? null}
        cloud={engine === 'cloud'}
        ensureConversation={async () => {
          const id = await assistant.createConversation();
          navigate('assistant', id);
          return id;
        }}
      />
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Изменить сообщение">
        {editing && (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const target = editing;
              setEditing(null);
              if (!readiness.ready) return toast.error(readiness.detail ?? readiness.label);
              if (engine === 'cloud' && !(await ensureCloudConsent())) return;
              assistant.editAndResend(target.id, target.text, engine).catch((err: Error) => toast.error(err.message));
            }}
          >
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Ответы после этого сообщения будут заменены новым ответом.
            </p>
            <textarea className="textarea" rows={5} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} data-autofocus aria-label="Текст сообщения" />
            <button type="submit" className="btn btn-primary" disabled={!editing.text.trim()}>
              Отправить заново
            </button>
          </form>
        )}
      </Sheet>
    </div>
  );
}
