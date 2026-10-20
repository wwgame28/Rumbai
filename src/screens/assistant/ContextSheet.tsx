import { FileText } from 'lucide-react';
import { useCollection } from '../../data/hooks.ts';
import { conversations, docs } from '../../data/store.ts';
import { formatBytes } from '../../lib/format.ts';
import { navigate } from '../../lib/router.ts';
import { EmptyState, Switch } from '../../ui/controls.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  ensureConversation: () => Promise<string>;
  cloud: boolean;
}

export function ContextSheet({ open, onClose, conversationId, ensureConversation, cloud }: Props) {
  const allDocs = useCollection(docs);
  const convs = useCollection(conversations);
  const toast = useToast();
  const selected = new Set(convs.find((c) => c.id === conversationId)?.contextDocIds ?? []);

  const toggle = async (docId: string, on: boolean) => {
    try {
      const id = conversationId ?? (await ensureConversation());
      const conv = conversations.get(id);
      if (!conv) return;
      const ids = new Set(conv.contextDocIds);
      if (on) ids.add(docId);
      else ids.delete(docId);
      await conversations.put({ ...conv, contextDocIds: [...ids].slice(0, 8) });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Документы для контекста">
      <div className="stack">
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Ассистент увидит только выбранные документы.{' '}
          {cloud ? 'В облачном режиме их текст отправляется в Anthropic вместе с сообщением.' : 'В локальном режиме они не покидают устройство (локальная модель видит только начало каждого документа).'}
        </p>
        {allDocs.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title="Документов нет"
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  navigate('files');
                }}
              >
                Импортировать файл
              </button>
            }
          />
        ) : (
          <ul className="list">
            {allDocs.map((d) => (
              <li key={d.id} className="list-row">
                <span className="list-row-icon">
                  <FileText size={16} aria-hidden />
                </span>
                <span className="grow">
                  <span className="truncate" style={{ display: 'block' }}>
                    {d.name}
                  </span>
                  <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                    {formatBytes(d.size)} · {d.chars.toLocaleString('ru-RU')} символов
                  </span>
                </span>
                <Switch checked={selected.has(d.id)} label={`Использовать «${d.name}» как контекст`} onChange={(v) => toggle(d.id, v)} disabled={!selected.has(d.id) && selected.size >= 8} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
