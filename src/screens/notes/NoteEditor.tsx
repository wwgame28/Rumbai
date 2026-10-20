import { Download, Eye, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '../../data/ids.ts';
import { logAudit, notes } from '../../data/store.ts';
import type { Note } from '../../data/types.ts';
import { formatRelative } from '../../lib/date.ts';
import { downloadText, safeFilename } from '../../lib/download.ts';
import { renderMarkdown } from '../../lib/markdown.ts';
import { useConfirm } from '../../ui/Dialog.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'error'; message: string };

export function noteToMarkdown(n: Pick<Note, 'title' | 'body' | 'category' | 'tags'>) {
  const meta = [n.category && `Категория: ${n.category}`, n.tags.length && `Теги: ${n.tags.join(', ')}`].filter(Boolean).join(' · ');
  return `# ${n.title || 'Без названия'}\n\n${meta ? `_${meta}_\n\n` : ''}${n.body}\n`;
}

export function NoteEditor({ open, note, categories, onClose }: { open: boolean; note: Note | null; categories: string[]; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={note ? 'Заметка' : 'Новая заметка'} full>
      {open && <NoteForm key={note?.id ?? 'new'} note={note} categories={categories} onClose={onClose} />}
    </Sheet>
  );
}

function parseTags(s: string) {
  return [...new Set(s.split(',').map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
}

function NoteForm({ note, categories, onClose }: { note: Note | null; categories: string[]; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const idRef = useRef(note?.id ?? newId());
  const [createdAt] = useState(() => note?.createdAt ?? Date.now());
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [category, setCategory] = useState(note?.category ?? '');
  const [tags, setTags] = useState(note?.tags.join(', ') ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [preview, setPreview] = useState(false);
  const [save, setSave] = useState<SaveState>(note ? { kind: 'saved', at: note.updatedAt } : { kind: 'idle' });
  const dirty = useRef(false);
  const latest = useRef({ title, body, category, tags, pinned });
  useEffect(() => {
    latest.current = { title, body, category, tags, pinned };
  });

  const persist = useCallback(async () => {
    const v = latest.current;
    const exists = Boolean(notes.get(idRef.current));
    // Do not create empty notes.
    if (!exists && !v.title.trim() && !v.body.trim()) return;
    dirty.current = false;
    setSave({ kind: 'saving' });
    try {
      await notes.put({
        id: idRef.current,
        title: v.title.slice(0, 200),
        body: v.body,
        category: v.category.trim().slice(0, 40),
        tags: parseTags(v.tags),
        pinned: v.pinned,
        createdAt,
        updatedAt: Date.now(),
      });
      setSave({ kind: 'saved', at: Date.now() });
    } catch (err) {
      // The text stays in this editor; the user can retry or export it.
      dirty.current = true;
      setSave({ kind: 'error', message: (err as Error).message });
    }
  }, [createdAt]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(persist, 600);
    return () => clearTimeout(t);
  }, [title, body, category, tags, pinned, persist]);

  // Flush pending edits when the editor closes.
  useEffect(
    () => () => {
      if (dirty.current) void persist();
    },
    [persist],
  );

  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      dirty.current = true;
      setter(v);
    };

  const remove = async () => {
    if (!notes.get(idRef.current)) return onClose();
    const ok = await confirm({ title: 'Удалить заметку?', body: 'Заметка будет удалена без возможности восстановления.', confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      dirty.current = false;
      await notes.remove(idRef.current);
      await logAudit({ actor: 'user', action: 'note.delete', detail: idRef.current, outcome: 'ok' });
      toast.success('Заметка удалена');
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const exportMd = () => {
    downloadText(`${safeFilename(title, 'заметка')}.md`, noteToMarkdown({ title, body, category, tags: parseTags(tags) }), 'text/markdown;charset=utf-8');
  };

  return (
    <div className="stack note-editor">
      <div className="row-between">
        <span className={`save-state save-${save.kind}`} role="status" aria-live="polite">
          {save.kind === 'saving' && 'Сохранение…'}
          {save.kind === 'saved' && `Сохранено ${formatRelative(save.at)}`}
          {save.kind === 'idle' && 'Черновик — сохранится автоматически'}
          {save.kind === 'error' && 'Не сохранено'}
        </span>
        <div className="row">
          <button type="button" className="icon-btn" aria-pressed={pinned} onClick={() => edit(setPinned)(!pinned)} aria-label={pinned ? 'Открепить' : 'Закрепить'}>
            {pinned ? <PinOff size={19} /> : <Pin size={19} />}
          </button>
          <button type="button" className="icon-btn" aria-pressed={preview} onClick={() => setPreview(!preview)} aria-label={preview ? 'Редактировать' : 'Предпросмотр'}>
            {preview ? <Pencil size={19} /> : <Eye size={19} />}
          </button>
          <button type="button" className="icon-btn" onClick={exportMd} aria-label="Экспорт в Markdown">
            <Download size={19} />
          </button>
          <button type="button" className="icon-btn" onClick={remove} aria-label="Удалить заметку">
            <Trash2 size={19} />
          </button>
        </div>
      </div>
      {save.kind === 'error' && (
        <div className="callout callout-danger" role="alert">
          <div className="stack" style={{ gap: 8 }}>
            <span>{save.message} Текст остаётся в редакторе.</span>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={persist}>
                Повторить
              </button>
              <button type="button" className="btn btn-sm" onClick={exportMd}>
                Скачать копию
              </button>
            </div>
          </div>
        </div>
      )}
      <input className="input note-title" value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="Заголовок" aria-label="Заголовок" maxLength={200} data-autofocus={!note || undefined} />
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Категория</span>
          <input className="input" list="note-categories" value={category} onChange={(e) => edit(setCategory)(e.target.value)} maxLength={40} placeholder="Без категории" />
          <datalist id="note-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">Теги</span>
          <input className="input" value={tags} onChange={(e) => edit(setTags)(e.target.value)} placeholder="через запятую" />
        </label>
      </div>
      {preview ? (
        <div className="md note-preview card" dangerouslySetInnerHTML={{ __html: renderMarkdown(body || '_Пусто_') }} />
      ) : (
        <textarea className="textarea note-body" value={body} onChange={(e) => edit(setBody)(e.target.value)} placeholder="Текст заметки. Поддерживается Markdown." aria-label="Текст заметки" />
      )}
    </div>
  );
}
