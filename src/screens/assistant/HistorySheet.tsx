import { MessageSquare, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { assistant } from '../../assistant/controller.ts';
import { useCollection } from '../../data/hooks.ts';
import { conversations, messages } from '../../data/store.ts';
import { formatRelative } from '../../lib/date.ts';
import { navigate } from '../../lib/router.ts';
import { findSnippets, highlightParts, matchesAll } from '../../lib/search.ts';
import { EmptyState, Highlight, SearchField } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';

export function HistorySheet({ open, onClose, currentId }: { open: boolean; onClose: () => void; currentId: string | null }) {
  const convs = useCollection(conversations);
  const msgs = useCollection(messages);
  const confirm = useConfirm();
  const toast = useToast();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const list = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query.trim()) return list.map((c) => ({ c, snippet: '' }));
    return list.flatMap((c) => {
      if (matchesAll(c.title, query)) return [{ c, snippet: '' }];
      const hit = msgs.find((m) => m.conversationId === c.id && m.role !== 'tool' && matchesAll(m.text, query));
      return hit ? [{ c, snippet: findSnippets(hit.text, query, 1)[0]?.text ?? '' }] : [];
    });
  }, [convs, msgs, query]);

  const remove = async (id: string, title: string) => {
    const ok = await confirm({ title: 'Удалить разговор?', body: `«${title}» и все его сообщения будут удалены.`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await assistant.deleteConversation(id);
      if (id === currentId) navigate('assistant');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="История разговоров" full>
      <div className="stack">
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по истории" label="Поиск по истории" />
        {results.length === 0 ? (
          <EmptyState icon={<MessageSquare size={24} />} title={query ? 'Ничего не найдено' : 'Разговоров пока нет'} />
        ) : (
          <ul className="list">
            {results.map(({ c, snippet }) => (
              <li key={c.id} className="list-row" aria-current={c.id === currentId ? 'true' : undefined}>
                <button
                  type="button"
                  className="grow history-item"
                  onClick={() => {
                    onClose();
                    navigate('assistant', c.id);
                  }}
                >
                  <span className="truncate" style={{ fontWeight: 'var(--fw-medium)' }}>
                    <Highlight parts={highlightParts(c.title, query)} />
                  </span>
                  {snippet && (
                    <span className="subtle clamp-2" style={{ fontSize: 'var(--fs-sm)' }}>
                      <Highlight parts={highlightParts(snippet, query)} />
                    </span>
                  )}
                  <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                    {formatRelative(c.updatedAt)}
                  </span>
                </button>
                <button type="button" className="icon-btn" onClick={() => remove(c.id, c.title)} aria-label={`Удалить разговор «${c.title}»`}>
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
