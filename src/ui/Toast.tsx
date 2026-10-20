import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { spring } from '../motion/presets.ts';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
  action?: { label: string; run: () => void };
}
interface ToastApi {
  show: (kind: Kind, text: string, action?: ToastItem['action']) => void;
  success: (text: string) => void;
  error: (text: string, action?: ToastItem['action']) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (kind: Kind, text: string, action?: ToastItem['action']) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-2), { id, kind, text, action }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3200);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ show, success: (t) => show('success', t), error: (t, a) => show('error', t, a), info: (t) => show('info', t) }),
    [show],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-label="Уведомления">
          <AnimatePresence initial={false}>
            {items.map((t) => {
              const Icon = ICONS[t.kind];
              return (
                <motion.div
                  key={t.id}
                  layout
                  className={`toast toast-${t.kind}`}
                  role={t.kind === 'error' ? 'alert' : 'status'}
                  initial={{ opacity: 0, y: -16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={spring.snappy}
                >
                  <Icon size={18} aria-hidden />
                  <span className="grow">{t.text}</span>
                  {t.action && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        t.action!.run();
                        dismiss(t.id);
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                  <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => dismiss(t.id)} aria-label="Скрыть уведомление">
                    <X size={16} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
