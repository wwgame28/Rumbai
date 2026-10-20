import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fade, spring } from '../motion/presets.ts';
import { useFocusTrap } from './useFocusTrap.ts';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** The user must type this exact text to enable the confirm button. */
  requireText?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm outside ConfirmProvider');
  return fn;
}

interface Pending extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise((resolve) => setPending({ ...opts, resolve })), []);
  const finish = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {createPortal(<AnimatePresence>{pending && <ConfirmDialog key="confirm" opts={pending} onDone={finish} />}</AnimatePresence>, document.body)}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ opts, onDone }: { opts: ConfirmOptions; onDone: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState('');
  useFocusTrap(ref, true, () => onDone(false));
  const blocked = Boolean(opts.requireText) && typed.trim() !== opts.requireText;

  return (
    <>
      <motion.div className="overlay overlay-dialog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} onClick={() => onDone(false)} />
      <motion.div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.body ? bodyId : undefined}
        className="dialog"
        style={{ x: '-50%', y: '-50%' }}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
        transition={spring.snappy}
      >
        <h2 id={titleId}>{opts.title}</h2>
        {opts.body && (
          <div id={bodyId} className="muted stack" style={{ fontSize: 'var(--fs-sm)' }}>
            {opts.body}
          </div>
        )}
        {opts.requireText && (
          <label className="field" style={{ marginTop: 'var(--sp-4)' }}>
            <span className="field-label">Введите «{opts.requireText}» для подтверждения</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => onDone(false)} data-autofocus={opts.requireText ? undefined : true}>
            {opts.cancelLabel ?? 'Отмена'}
          </button>
          <button type="button" className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} disabled={blocked} onClick={() => onDone(true)}>
            {opts.confirmLabel ?? 'Подтвердить'}
          </button>
        </div>
      </motion.div>
    </>
  );
}
