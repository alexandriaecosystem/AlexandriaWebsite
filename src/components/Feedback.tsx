import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import './Feedback.css';

type ToastTone = 'success' | 'error' | 'info';
type ToastInput = { title: string; message?: string; tone?: ToastTone; duration?: number };
type ToastItem = ToastInput & { id: string };

type ToastContextValue = {
  notify: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { ...toast, id, tone: toast.tone ?? 'info' }]);
    window.setTimeout(() => dismiss(id), toast.duration ?? 4500);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.tone ?? 'info'}`} role={toast.tone === 'error' ? 'alert' : 'status'} key={toast.id}>
            <span className="toast-icon" aria-hidden="true">{toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}</span>
            <div className="toast-copy"><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, tone = 'primary', busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={`confirm-symbol ${tone}`} aria-hidden="true">{tone === 'danger' ? '!' : '✓'}</div>
        <div className="confirm-copy">
          <h2 id="confirm-title">{title}</h2>
          {message && <div className="confirm-message">{message}</div>}
        </div>
        <div className="confirm-actions">
          <button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={tone === 'danger' ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
