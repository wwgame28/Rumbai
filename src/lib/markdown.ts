import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const marked = new Marked({ gfm: true, breaks: true, async: false });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

/**
 * Renders untrusted Markdown (model output, notes) to sanitized HTML.
 * Images are dropped so rendering never triggers network requests.
 */
export function renderMarkdown(src: string): string {
  const html = marked.parse(src) as string;
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['img', 'style', 'iframe', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
  });
}
