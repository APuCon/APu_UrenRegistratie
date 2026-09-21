import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';

/* ------------------------------ Pagina-opbouw (huisstijl APu) ------------------------------ */
/** Donkere titelband, zoals de hero op de website. `children` = acties/filters rechts. */
export function PageHead({
  eyebrow, title, sub, children,
}: { eyebrow?: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <section className="band">
      <div className="container band-inner">
        <div className="band-text">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {children && <div className="band-actions">{children}</div>}
      </div>
    </section>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <div className="container content">{children}</div>;
}

/* ------------------------------ Modal ------------------------------ */
export function Modal({
  title, children, onClose, footer, wide,
}: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button.primary');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sluiten">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title, children, confirmLabel, danger, busy, onConfirm, onClose,
}: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Annuleren</button>
          <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Bezig…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/* ------------------------------ Formulier ------------------------------ */
export function Field({
  label, children, hint, span, className,
}: { label: string; children: ReactNode; hint?: string; span?: 2; className?: string }) {
  return (
    <label className={`field${span === 2 ? ' span2' : ''}${className ? ` ${className}` : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/* ------------------------------ Status ------------------------------ */
export function Spinner({ label = 'Laden…' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn small" onClick={onRetry}>Opnieuw proberen</button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Pill({ tone, children }: { tone: 'open' | 'gefactureerd' | 'neutraal' | 'actief' | 'inactief'; children: ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  value, onChange, tabs,
}: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          className={value === t.id ? 'active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Toasts ------------------------------ */
interface Toast { id: number; tone: 'ok' | 'error'; text: string }
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 8000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
