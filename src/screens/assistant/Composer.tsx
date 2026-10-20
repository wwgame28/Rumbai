import { ArrowUp, Cloud, Paperclip, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  busy: boolean;
  disabled: boolean;
  cloud: boolean;
  contextCount: number;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  onContext: () => void;
}

export function Composer({ busy, disabled, cloud, contextCount, onSend, onStop, onContext }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a limit; no animation while typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const submit = async () => {
    if (!text.trim() || busy || disabled) return;
    const value = text;
    setText('');
    const ok = await onSend(value);
    if (!ok) setText(value);
  };

  return (
    <div className="composer-wrap">
      {cloud && (
        <p className="cloud-note" role="note">
          <Cloud size={13} aria-hidden /> Облачный режим: сообщение уйдёт в Anthropic
        </p>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <button type="button" className="icon-btn" onClick={onContext} aria-label={`Документы для контекста${contextCount ? `: выбрано ${contextCount}` : ''}`}>
          <Paperclip size={20} />
          {contextCount > 0 && <span className="count-badge">{contextCount}</span>}
        </button>
        <textarea
          ref={ref}
          className="composer-input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover)').matches) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={disabled ? 'Ассистент недоступен' : 'Сообщение RUMBAI'}
          aria-label="Сообщение"
          enterKeyHint="send"
          maxLength={20000}
        />
        {busy ? (
          <button type="button" className="send-btn stop" onClick={onStop} aria-label="Остановить генерацию">
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="send-btn" disabled={!text.trim() || disabled} aria-label="Отправить">
            <ArrowUp size={20} />
          </button>
        )}
      </form>
    </div>
  );
}
