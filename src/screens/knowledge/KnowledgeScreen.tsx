import { BookOpen, Bookmark, Bot, FileText, Info, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { assistant } from '../../assistant/controller.ts';
import { useCollection } from '../../data/hooks.ts';
import { newId } from '../../data/ids.ts';
import { conversations, docs, excerpts } from '../../data/store.ts';
import type { Doc } from '../../data/types.ts';
import { formatRelative } from '../../lib/date.ts';
import { countLabel, formatBytes } from '../../lib/format.ts';
import { navigate } from '../../lib/router.ts';
import { findSnippets, highlightParts, matchesAll, score } from '../../lib/search.ts';
import { EmptyState, Highlight, SearchField, Segmented } from '../../ui/controls.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useToast } from '../../ui/Toast.tsx';

type Tab = 'docs' | 'excerpts';

function addExcerpt(doc: Doc, line: number, text: string) {
  return excerpts.put({ id: newId(), docId: doc.id, docName: doc.name, line, text: text.slice(0, 4000), createdAt: Date.now() });
}
const DOC_VIEW_LIMIT = 60_000;

export default function KnowledgeScreen() {
  const allDocs = useCollection(docs);
  const allExcerpts = useCollection(excerpts);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('docs');
  const [viewing, setViewing] = useState<Doc | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return null;
    return allDocs
      .filter((d) => matchesAll(`${d.name}\n${d.text}`, query))
      .map((d) => ({ doc: d, snippets: findSnippets(d.text, query, 4), score: score(d.text, query) }))
      .sort((a, b) => b.score - a.score);
  }, [allDocs, query]);

  const saveExcerpt = async (doc: Doc, line: number, text: string) => {
    try {
      await addExcerpt(doc, line, text);
      toast.success('Фрагмент сохранён');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const askAbout = async (doc: Doc) => {
    try {
      const id = await assistant.createConversation(`О документе «${doc.name}»`.slice(0, 60));
      const conv = conversations.get(id)!;
      await conversations.put({ ...conv, contextDocIds: [doc.id] });
      navigate('assistant', id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <ScreenHeader title="Знания" subtitle={`${countLabel(allDocs.length, ['документ', 'документа', 'документов'])} · ${countLabel(allExcerpts.length, ['фрагмент', 'фрагмента', 'фрагментов'])}`} />
      <SearchField value={query} onChange={setQuery} placeholder="Поиск по документам" label="Поиск по документам" />
      <p className="search-kind subtle">
        <Info size={13} aria-hidden /> Текстовый поиск по словам. Семантический поиск (по смыслу) не реализован.
      </p>

      {results ? (
        results.length === 0 ? (
          <EmptyState icon={<BookOpen size={24} />} title="Ничего не найдено">
            Поиск ищет точные слова (без учёта регистра и «ё»).
          </EmptyState>
        ) : (
          <section className="stack" aria-label="Результаты поиска">
            <p className="subtle" style={{ fontSize: 'var(--fs-sm)' }} aria-live="polite">
              Найдено в {countLabel(results.length, ['документе', 'документах', 'документах'])}
            </p>
            {results.map(({ doc, snippets }) => (
              <article key={doc.id} className="card result-card">
                <button type="button" className="row result-title" onClick={() => setViewing(doc)}>
                  <FileText size={16} aria-hidden />
                  <strong className="truncate">{doc.name}</strong>
                </button>
                <ul className="snippets">
                  {snippets.map((s) => (
                    <li key={s.line}>
                      <span className="line-ref" title="Номер строки в документе">
                        стр. {s.line}
                      </span>
                      <span className="grow">
                        <Highlight parts={highlightParts(s.text, query)} />
                      </span>
                      <button type="button" className="icon-btn" onClick={() => saveExcerpt(doc, s.line, s.text)} aria-label={`Сохранить фрагмент со строки ${s.line}`}>
                        <Bookmark size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        )
      ) : (
        <>
          <Segmented
            label="Раздел"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'docs', label: 'Документы' },
              { value: 'excerpts', label: 'Фрагменты' },
            ]}
          />
          {tab === 'docs' ? (
            allDocs.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={26} />}
                title="База знаний пуста"
                action={
                  <button type="button" className="btn btn-primary" onClick={() => navigate('files')}>
                    Импортировать файлы
                  </button>
                }
              >
                Импортируйте текстовые файлы, чтобы искать по ним и давать их ассистенту как контекст.
              </EmptyState>
            ) : (
              <ul className="stack" aria-label="Документы">
                {[...allDocs]
                  .sort((a, b) => b.importedAt - a.importedAt)
                  .map((d) => (
                    <li key={d.id} className="card doc-card">
                      <button type="button" className="doc-open" onClick={() => setViewing(d)}>
                        <strong className="truncate">{d.name}</strong>
                        <span className="subtle clamp-2" style={{ fontSize: 'var(--fs-sm)' }}>
                          {d.text.slice(0, 200)}
                        </span>
                        <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                          {formatBytes(d.size)} · {d.lines.toLocaleString('ru-RU')} строк
                        </span>
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => askAbout(d)}>
                        <Bot size={15} aria-hidden /> Спросить
                      </button>
                    </li>
                  ))}
              </ul>
            )
          ) : allExcerpts.length === 0 ? (
            <EmptyState icon={<Bookmark size={24} />} title="Фрагментов нет">
              Найдите текст в документах и сохраните нужные строки.
            </EmptyState>
          ) : (
            <ul className="stack" aria-label="Сохранённые фрагменты">
              {[...allExcerpts]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((e) => (
                  <li key={e.id} className="card excerpt">
                    <p>{e.text}</p>
                    <div className="row-between">
                      <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                        {e.docName}, стр. {e.line} · {formatRelative(e.createdAt)}
                      </span>
                      <button type="button" className="icon-btn" onClick={() => excerpts.remove(e.id).catch((err: Error) => toast.error(err.message))} aria-label="Удалить фрагмент">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name ?? ''} full>
        {viewing && (
          <div className="stack">
            <div className="row wrap">
              <span className="badge">{formatBytes(viewing.size)}</span>
              <span className="badge">{viewing.chars.toLocaleString('ru-RU')} символов</span>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => askAbout(viewing)} style={{ marginLeft: 'auto' }}>
                <Bot size={15} aria-hidden /> Спросить ассистента
              </button>
            </div>
            {/* Rendered as plain text: imported content is never interpreted as HTML. */}
            <pre className="doc-text">
              {viewing.text.slice(0, DOC_VIEW_LIMIT)}
              {viewing.text.length > DOC_VIEW_LIMIT && '\n\n… (показано начало документа)'}
            </pre>
          </div>
        )}
      </Sheet>
    </>
  );
}
