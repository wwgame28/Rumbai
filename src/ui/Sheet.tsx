import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fade, spring } from '../motion/presets.ts';
import { useFocusTrap } from './useFocusTrap.ts';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  full?: boolean;
  /** Prevent closing via swipe/backdrop (e.g. while saving). */
  locked?: boolean;
}

export function Sheet(props: SheetProps) {
  return createPortal(<AnimatePresence>{props.open && <SheetInner {...props} />}</AnimatePresence>, document.body);
}

function SheetInner({ onClose, title, children, actions, full, locked }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const close = () => !locked && onClose();
  useFocusTrap(ref, true, close);

  return (
    <>
      <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} onClick={close} />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sheet${full ? ' sheet-full' : ''}`}
        initial={reduce ? { opacity: 0 } : { y: '100%' }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: '100%' }}
        transition={spring.sheet}
        drag={reduce || locked ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragListener={false}
        dragControls={drag}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) close();
        }}
      >
        {/* Only the top bar starts a swipe-down, so scrolling the content never dismisses the sheet. */}
        <div className="sheet-drag" onPointerDown={(e) => !reduce && !locked && drag.start(e)}>
          <SheetGrabber />
          <div className="sheet-header">
            <h2 id={titleId} className="grow truncate">
              {title}
            </h2>
            {actions}
            <button type="button" className="icon-btn" onClick={close} aria-label="Закрыть" disabled={locked}>
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </motion.div>
    </>
  );
}

function SheetGrabber() {
  return <div className="sheet-grabber" aria-hidden="true" />;
}
