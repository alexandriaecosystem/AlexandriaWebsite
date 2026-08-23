import type { ReactNode } from 'react';

interface StateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function State({ title, children, action, className }: StateProps) {
  return <section className={className} role="status" aria-live="polite"><h2>{title}</h2>{children}{action}</section>;
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <State title={label} className="loading-card"><div className="loading-state"><span className="spinner" aria-hidden="true" /><p>Please wait while the latest data is loaded.</p></div></State>;
}

export function EmptyState({ title = 'Nothing here', message }: { title?: string; message?: string }) {
  return <State title={title}>{message && <p>{message}</p>}</State>;
}

export function ForbiddenState() {
  return <State title="Access denied"><p>An active administrator account is required. Sign out if you need to use a different account.</p></State>;
}

export function ConflictState({ onReload }: { onReload: () => void }) {
  return <State title="This record changed" action={<button onClick={onReload}>Reload</button>}><p>Another operation updated this record. Reload the current state before making a decision.</p></State>;
}

export function RetryableErrorState({ onRetry, message = 'The request could not be completed.' }: { onRetry: () => void; message?: string }) {
  return <State title="Temporary error" action={<button onClick={onRetry}>Try again</button>}><p>{message}</p></State>;
}

export function TerminalErrorState({ message, correlationId }: { message: string; correlationId?: string }) {
  return <State title="Unable to continue"><p>{message}</p>{correlationId && <p className="mono">Reference: {correlationId}</p>}</State>;
}
