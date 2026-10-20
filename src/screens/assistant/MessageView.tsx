import { motion } from 'motion/react';
import { AlertTriangle, Check, Copy, FileText, Pencil, RotateCcw, ShieldAlert, Square, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { toolMeta, isToolName } from '../../../shared/tools.ts';
import type { Message } from '../../data/types.ts';
import { copyText } from '../../lib/download.ts';
import { navigate } from '../../lib/router.ts';
import { spring } from '../../motion/presets.ts';
import { useToast } from '../../ui/Toast.tsx';
import { Markdown } from './Markdown.tsx';

interface Props {
  message: Message;
  draftText?: string;
  streaming?: boolean;
  canRetry: boolean;
  canEdit: boolean;
  onRetry: () => void;
  onEdit: () => void;
}

export function MessageView({ message: m, draftText, streaming, canRetry, canEdit, onRetry, onEdit }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const text = draftText ?? m.text;

  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else toast.error('Не удалось скопировать');
  };

  if (m.role === 'user') {
    return (
      <motion.div className="msg msg-user" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.snappy}>
        <div className="bubble">{m.text}</div>
        {canEdit && (
          <div className="msg-actions">
            <button type="button" className="icon-btn" onClick={onEdit} aria-label="Изменить сообщение">
              <Pencil size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={copy} aria-label="Копировать сообщение">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.article className="msg msg-assistant" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} aria-busy={streaming || undefined}>
      <header className="msg-engine">
        {m.engine ? (
          <span className={`engine-tag engine-${m.engine.kind}`}>
            <span className="dot" aria-hidden />
            {m.engine.label}
          </span>
        ) : (
          <span className="engine-tag">RUMBAI</span>
        )}
      </header>
      {text ? <Markdown text={text} /> : streaming ? <TypingDots /> : null}
      {streaming && text && <span className="caret" aria-hidden />}

      {m.toolCalls?.map((c) => (
        <div key={c.id} className={`tool-card tool-${c.status}`}>
          <span className="tool-icon" aria-hidden>
            {c.status === 'done' ? <Wrench size={14} /> : c.status === 'denied' ? <ShieldAlert size={14} /> : c.status === 'error' ? <X size={14} /> : <Wrench size={14} />}
          </span>
          <span className="grow">
            <strong>{isToolName(c.name) ? toolMeta[c.name].label : c.name}</strong>
            <span className="subtle"> · {c.summary || (c.status === 'pending' ? 'выполняется…' : '')}</span>
          </span>
        </div>
      ))}

      {m.status === 'error' && (
        <div className="callout callout-danger" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <span>{m.error ?? 'Ошибка'}</span>
        </div>
      )}
      {m.status === 'stopped' && (
        <p className="subtle row" style={{ fontSize: 'var(--fs-xs)' }}>
          <Square size={12} aria-hidden /> Генерация остановлена
        </p>
      )}
      {m.error && m.status === 'done' && <p className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>{m.error}</p>}

      {m.sources && m.sources.length > 0 && (
        <div className="sources">
          <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
            Источники:
          </span>
          {m.sources.map((s) => (
            <button key={s.docId} type="button" className="chip" onClick={() => navigate('knowledge')}>
              <FileText size={13} aria-hidden /> {s.title}
            </button>
          ))}
        </div>
      )}

      {!streaming && (text || m.status === 'error') && (
        <div className="msg-actions">
          {text && (
            <button type="button" className="icon-btn" onClick={copy} aria-label="Копировать ответ">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          )}
          {canRetry && (
            <button type="button" className="icon-btn" onClick={onRetry} aria-label="Повторить ответ">
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      )}
    </motion.article>
  );
}

function TypingDots() {
  return (
    <span className="typing" role="status" aria-label="Ассистент печатает">
      <span />
      <span />
      <span />
    </span>
  );
}
