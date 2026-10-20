import { memo, useMemo } from 'react';
import { copyText } from '../../lib/download.ts';
import { renderMarkdown } from '../../lib/markdown.ts';

/** Sanitized Markdown with copy buttons on code blocks (added after sanitization, so they are trusted markup). */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text).replaceAll('<pre>', '<pre><button type="button" class="code-copy">Копировать</button>'), [text]);
  return (
    <div
      className="md"
      onClick={async (e) => {
        const btn = (e.target as HTMLElement).closest('.code-copy');
        if (!btn) return;
        const code = btn.parentElement?.querySelector('code')?.textContent ?? '';
        if (await copyText(code)) {
          btn.textContent = 'Скопировано';
          setTimeout(() => (btn.textContent = 'Копировать'), 1500);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
