/** Plain keyword search (not semantic): case- and ё-insensitive substring matching. */

export function normalize(s: string): string {
  return s.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

export function terms(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 12);
}

/** All terms must appear somewhere in the haystack. */
export function matchesAll(haystack: string, query: string): boolean {
  const t = terms(query);
  if (!t.length) return true;
  const h = normalize(haystack);
  return t.every((term) => h.includes(term));
}

export function score(haystack: string, query: string): number {
  const h = normalize(haystack);
  let s = 0;
  for (const term of terms(query)) {
    let idx = h.indexOf(term);
    while (idx !== -1 && s < 1000) {
      s++;
      idx = h.indexOf(term, idx + term.length);
    }
  }
  return s;
}

export interface Snippet {
  text: string;
  line: number;
}

/** Snippets around matching lines, with 1-based line numbers for source references. */
export function findSnippets(text: string, query: string, max = 3, radius = 90): Snippet[] {
  const t = terms(query);
  if (!t.length) return [];
  const lines = text.split('\n');
  const out: Snippet[] = [];
  for (let i = 0; i < lines.length && out.length < max; i++) {
    const line = lines[i] ?? '';
    const n = normalize(line);
    const hit = t.map((term) => n.indexOf(term)).filter((x) => x >= 0);
    if (!hit.length) continue;
    const pos = Math.min(...hit);
    const start = Math.max(0, pos - radius);
    const end = Math.min(line.length, pos + radius);
    out.push({ text: (start > 0 ? '…' : '') + line.slice(start, end).trim() + (end < line.length ? '…' : ''), line: i + 1 });
  }
  return out;
}

/** Splits text into plain and highlighted parts for rendering <mark> safely (no HTML injection). */
export function highlightParts(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const t = terms(query);
  if (!t.length) return [{ text, hit: false }];
  const n = normalize(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of t) {
    let idx = n.indexOf(term);
    while (idx !== -1) {
      for (let k = idx; k < idx + term.length; k++) marks[k] = true;
      idx = n.indexOf(term, idx + term.length);
    }
  }
  const parts: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const hit = marks[i] ?? false;
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i] ?? '', hit });
  }
  return parts;
}

/** Plain-text preview of Markdown for list snippets (no HTML is produced). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/^\s*-\s\[[ x]\]\s/gim, '')
    .trim();
}
