import type { ReactNode } from 'react';

interface StateProps { title: string; children?: ReactNode; action?: ReactNode }
function State({ title, children, action }: StateProps) {
  return <section role="status" aria-live="polite"><h2>{title}</h2>{children}{action}</section>;
}
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <State title={label}><p>Please wait.</p></State>;
}
export function EmptyState({ title = 'Nothing here', message }: { title?: string; message?: string }) {
  return <State title={title}>{message && <p>{message}</p>}</State>;
}
export function ForbiddenState() {
  return <State title="Access denied"><p>An active administrator account is required.</p></State>;
}
export function ConflictState({ onReload }: { onReload: () => void }) {
  return <State title="This record changed" action={<button onClick={onReload}>Reload</button>}><p>Reload before trying again.</p></State>;
}
export function RetryableErrorState({ onRetry, message = 'The request could not be completed.' }: { onRetry: () => void; message?: string }) {
  return <State title="Temporary error" action={<button onClick={onRetry}>Try again</button>}><p>{message}</p></State>;
}
export function TerminalErrorState({ message, correlationId }: { message: string; correlationId?: string }) {
  return <State title="Unable to continue"><p>{message}</p>{correlationId && <p>Reference: {correlationId}</p>}</State>;
}
