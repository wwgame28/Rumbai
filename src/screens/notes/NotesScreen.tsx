import { AnimatePresence, motion } from 'motion/react';
import { Download, NotebookPen, Pin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useCollection } from '../../data/hooks.ts';
import { notes } from '../../data/store.ts';
import type { Note } from '../../data/types.ts';
import { formatRelative, todayISO } from '../../lib/date.ts';
import { downloadText } from '../../lib/download.ts';
import { countLabel } from '../../lib/format.ts';
import { navigate } from '../../lib/router.ts';
import { findSnippets, highlightParts, matchesAll, stripMarkdown } from '../../lib/search.ts';
import { listItem } from '../../motion/presets.ts';
import { EmptyState, Highlight, SearchField } from '../../ui/controls.tsx';
import { NoteEditor, noteToMarkdown } from './NoteEditor.tsx';

function noteFromParam(noteId: string | null): { open: boolean; note: Note | null } {
  if (noteId === 'new') return { open: true, note: null };
  const n = noteId ? notes.get(noteId) : undefined;
  return n ? { open: true, note: n } : { open: false, note: null };
}

export default function NotesScreen({ noteId }: { noteId: string | null }) {
  const all = useCollection(notes);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const initial = noteFromParam(noteId);
  const [open, setOpen] = useState(initial.open);
  const [current, setCurrent] = useState<Note | null>(initial.note);
  // Opening a note via the URL (e.g. from the dashboard) adjusts state during render, not in an effect.
  const [seenParam, setSeenParam] = useState(noteId);
  if (noteId !== seenParam) {
    setSeenParam(noteId);
    const next = noteFromParam(noteId);
    if (next.open) {
      setCurrent(next.note);
      setOpen(true);
    }
  }

  const categories = useMemo(() => [...new Set(all.map((n) => n.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [all]);
  const tags = useMemo(() => [...new Set(all.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b, 'ru')).slice(0, 30), [all]);
  const visible = useMemo(
    () =>
      all
        .filter((n) => (cat === null ? true : cat === '★' ? n.pinned : n.category === cat))
        .filter((n) => (tag ? n.tags.includes(tag) : true))
        .filter((n) => matchesAll(`${n.title}\n${n.body}\n${n.tags.join(' ')}\n${n.category}`, query))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [all, cat, tag, query],
  );

  const openNote = (n: Note | null) => {
    setCurrent(n);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    if (noteId) navigate('notes');
  };
  const exportAll = () => {
    const md = [...all].sort((a, b) => b.updatedAt - a.updatedAt).map(noteToMarkdown).join('\n---\n\n');
    downloadText(`rumbai-notes-${todayISO()}.md`, md, 'text/markdown;charset=utf-8');
  };

  return (
    <>
      <ScreenHeader
        title="Заметки"
        subtitle={countLabel(all.length, ['заметка', 'заметки', 'заметок'])}
        actions={
          <button type="button" className="icon-btn" onClick={exportAll} disabled={!all.length} aria-label="Экспортировать все заметки в Markdown">
            <Download size={20} />
          </button>
        }
      />
      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по заметкам" label="Поиск по заметкам" />
        {(categories.length > 0 || all.some((n) => n.pinned)) && (
          <div className="chips" role="group" aria-label="Категории">
            <button type="button" className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>
              Все
            </button>
            <button type="button" className="chip" aria-pressed={cat === '★'} onClick={() => setCat(cat === '★' ? null : '★')}>
              <Pin size={14} aria-hidden /> Закреплённые
            </button>
            {categories.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="chips" role="group" aria-label="Теги">
            {tags.map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={26} />}
          title={query || cat || tag ? 'Ничего не найдено' : 'Заметок пока нет'}
          action={!query && <button type="button" className="btn btn-primary" onClick={() => openNote(null)}>Новая заметка</button>}
        >
          {query ? 'Попробуйте другие слова.' : 'Заметки сохраняются автоматически и только на этом устройстве.'}
        </EmptyState>
      ) : (
        <ul className="note-grid" aria-label="Заметки">
          <AnimatePresence initial={false}>
            {visible.map((n) => {
              const plain = stripMarkdown(n.body);
              const snippet = query ? (findSnippets(plain, query, 1)[0]?.text ?? plain) : plain;
              return (
                <motion.li key={n.id} layout="position" {...listItem}>
                  <button type="button" className="card card-interactive note-card" onClick={() => openNote(n)} data-testid="note-card">
                    <span className="row-between">
                      <strong className="truncate">
                        <Highlight parts={highlightParts(n.title || 'Без названия', query)} />
                      </strong>
                      {n.pinned && <Pin size={14} className="note-pin" aria-label="Закреплена" />}
                    </span>
                    <span className="note-snippet clamp-2">
                      <Highlight parts={highlightParts(snippet.slice(0, 220), query)} />
                    </span>
                    <span className="row wrap" style={{ gap: 6 }}>
                      {n.category && <span className="badge badge-accent">{n.category}</span>}
                      {n.tags.slice(0, 3).map((t) => (
                        <span key={t} className="badge">
                          #{t}
                        </span>
                      ))}
                      <span className="subtle" style={{ fontSize: 'var(--fs-xs)', marginLeft: 'auto' }}>
                        {formatRelative(n.updatedAt)}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <button type="button" className="fab" onClick={() => openNote(null)}>
        <Plus size={20} aria-hidden /> Заметка
      </button>
      <NoteEditor open={open} note={current} categories={categories} onClose={close} />
    </>
  );
}
