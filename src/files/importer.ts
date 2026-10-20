import { newId } from '../data/ids.ts';
import { docs, logAudit } from '../data/store.ts';
import type { Doc } from '../data/types.ts';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.json,.log,.html,.htm,.xml,.yaml,.yml,text/plain,text/markdown,text/csv,application/json,text/html';

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yaml', 'yml']);
const HTML_EXT = new Set(['html', 'htm']);
const KNOWN_UNSUPPORTED: Record<string, string> = {
  pdf: 'Извлечение текста из PDF пока не реализовано.',
  docx: 'Извлечение текста из DOCX пока не реализовано.',
  doc: 'Формат DOC не поддерживается.',
  pages: 'Формат Pages не поддерживается.',
  rtf: 'Формат RTF не поддерживается.',
};

export function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : '';
}

export function checkSupported(file: File): string | null {
  const ext = extOf(file.name);
  if (file.size > MAX_FILE_BYTES) return `Файл больше ${MAX_FILE_BYTES / 1024 / 1024} МБ.`;
  if (TEXT_EXT.has(ext) || HTML_EXT.has(ext)) return null;
  if (file.type.startsWith('text/')) return null;
  return KNOWN_UNSUPPORTED[ext] ?? `Формат «${ext || file.type || 'неизвестный'}» не поддерживается. Поддерживаются текстовые файлы, Markdown, CSV, JSON и HTML.`;
}

function readWithProgress(file: File, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Не удалось прочитать файл'));
    r.readAsText(file);
  });
}

/** Extracts readable text. HTML is parsed inertly (no scripts run, no resources load) and reduced to text. */
export function extractText(raw: string, ext: string): string {
  if (HTML_EXT.has(ext)) {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
    // The parsed document is never rendered, so innerText has no layout: add line breaks after blocks ourselves.
    doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,h5,h6,section,article,header,footer,blockquote,pre,table').forEach((n) => n.append('\n'));
    return (doc.body?.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Strip NUL bytes, which some exporters leave in text files.
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
}

export async function importFile(file: File, onProgress: (p: number) => void): Promise<Doc> {
  const problem = checkSupported(file);
  if (problem) throw new Error(problem);
  const ext = extOf(file.name);
  const raw = await readWithProgress(file, onProgress);
  const text = extractText(raw, ext);
  if (!text.trim()) throw new Error('В файле не найден текст.');
  const doc: Doc = {
    id: newId(),
    name: file.name.slice(0, 200),
    mime: file.type || 'text/plain',
    ext,
    size: file.size,
    importedAt: Date.now(),
    text,
    chars: text.length,
    lines: text.split('\n').length,
  };
  await docs.put(doc);
  await logAudit({ actor: 'user', action: 'doc.import', detail: `${ext || 'txt'} · ${file.size} B`, outcome: 'ok' });
  onProgress(1);
  return doc;
}
