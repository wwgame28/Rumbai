import { AnimatePresence, motion } from 'motion/react';
import { FileText, FileUp, Lock, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useCollection } from '../../data/hooks.ts';
import { docs } from '../../data/store.ts';
import { ACCEPT, importFile } from '../../files/importer.ts';
import { removeDoc } from '../../files/removeDoc.ts';
import { formatDateTime } from '../../lib/date.ts';
import { countLabel, formatBytes } from '../../lib/format.ts';
import { listItem } from '../../motion/presets.ts';
import { EmptyState, Progress } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { useToast } from '../../ui/Toast.tsx';

interface Job {
  id: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

export default function FilesScreen() {
  const all = useCollection(docs);
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    const newJobs = list.map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size, progress: 0 }));
    setJobs((j) => [...newJobs, ...j]);
    let ok = 0;
    for (const [i, f] of list.entries()) {
      const jobId = newJobs[i]!.id;
      try {
        await importFile(f, (p) => setJobs((j) => j.map((x) => (x.id === jobId ? { ...x, progress: p } : x))));
        ok++;
        setJobs((j) => j.filter((x) => x.id !== jobId));
      } catch (err) {
        setJobs((j) => j.map((x) => (x.id === jobId ? { ...x, error: (err as Error).message } : x)));
      }
    }
    if (ok) toast.success(`Импортировано: ${countLabel(ok, ['файл', 'файла', 'файлов'])}`);
    if (input.current) input.current.value = '';
  };

  const remove = async (id: string, name: string) => {
    const ok = await confirm({ title: 'Удалить файл?', body: `«${name}», его сохранённые фрагменты и использование в разговорах будут удалены с устройства.`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await removeDoc(id);
      toast.success('Файл удалён');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const recent = [...all].sort((a, b) => b.importedAt - a.importedAt);
  const total = all.reduce((s, d) => s + d.size, 0);

  return (
    <>
      <ScreenHeader title="Файлы" subtitle={`${countLabel(all.length, ['файл', 'файла', 'файлов'])} · ${formatBytes(total)}`} />
      <div className="callout callout-success">
        <Lock size={16} aria-hidden />
        <span>Файлы читаются и хранятся только на этом устройстве. RUMBAI не загружает их в сеть; в облачный режим документ попадает, только если вы сами выберете его как контекст.</span>
      </div>

      <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" id="file-input" onChange={(e) => onFiles(e.target.files)} />
      <label htmlFor="file-input" className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), onFiles(e.dataTransfer.files))}>
        <FileUp size={26} aria-hidden />
        <strong>Выбрать файлы</strong>
        <span className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>
          TXT, Markdown, CSV, JSON, HTML · до 5 МБ
        </span>
      </label>

      {jobs.length > 0 && (
        <section className="stack" aria-label="Импорт">
          {jobs.map((j) => (
            <div key={j.id} className="card import-job">
              <div className="row-between">
                <span className="truncate">{j.name}</span>
                <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                  {formatBytes(j.size)}
                </span>
              </div>
              {j.error ? (
                <div className="row-between">
                  <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }} role="alert">
                    {j.error}
                  </span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setJobs((l) => l.filter((x) => x.id !== j.id))}>
                    Скрыть
                  </button>
                </div>
              ) : (
                <Progress value={j.progress} label={`Импорт ${j.name}`} />
              )}
            </div>
          ))}
        </section>
      )}

      {recent.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title="Файлов пока нет">
          Импортированные документы появятся здесь и в разделе «Знания».
        </EmptyState>
      ) : (
        <ul className="list" aria-label="Импортированные файлы">
          <AnimatePresence initial={false}>
            {recent.map((d) => (
              <motion.li key={d.id} className="list-row" {...listItem}>
                <span className="list-row-icon">
                  <FileText size={16} aria-hidden />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block', fontWeight: 'var(--fw-medium)' }}>
                    {d.name}
                  </span>
                  <span className="subtle file-meta">
                    {(d.ext || 'txt').toUpperCase()} · {formatBytes(d.size)} · {d.lines.toLocaleString('ru-RU')} строк · {formatDateTime(d.importedAt)}
                  </span>
                </span>
                <span className="badge badge-success" title="Хранится только на устройстве">
                  <Lock size={11} aria-hidden /> локально
                </span>
                <button type="button" className="icon-btn" onClick={() => remove(d.id, d.name)} aria-label={`Удалить «${d.name}»`}>
                  <Trash2 size={17} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}
