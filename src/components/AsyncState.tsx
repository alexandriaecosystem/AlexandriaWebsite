import type { ReactNode } from 'react';
import { useOptionalLanguage } from '../i18n/LanguageContext';

interface StateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function State({ title, children, action, className }: StateProps) {
  return <section className={className} role="status" aria-live="polite"><h2>{title}</h2>{children}{action}</section>;
}

export function LoadingState({ label }: { label?: string }) {
  const { tr } = useOptionalLanguage();
  return <State title={label ?? tr('Loading', 'جارٍ التحميل')} className="loading-card"><div className="loading-state"><span className="spinner" aria-hidden="true" /><p>{tr('Please wait while the latest data is loaded.', 'يرجى الانتظار بينما يتم تحميل أحدث البيانات.')}</p></div></State>;
}

export function EmptyState({ title, message }: { title?: string; message?: string }) {
  const { tr } = useOptionalLanguage();
  return <State title={title ?? tr('Nothing here', 'لا توجد بيانات')}>{message && <p>{message}</p>}</State>;
}

export function ForbiddenState() {
  const { tr } = useOptionalLanguage();
  return <State title={tr('Access denied', 'تم رفض الوصول')}><p>{tr('An active administrator account is required. Sign out if you need to use a different account.', 'يلزم حساب مسؤول نشط. سجّل الخروج إذا كنت تريد استخدام حساب مختلف.')}</p></State>;
}

export function ConflictState({ onReload }: { onReload: () => void }) {
  const { tr } = useOptionalLanguage();
  return <State title={tr('This record changed', 'تم تحديث هذا السجل')} action={<button onClick={onReload}>{tr('Reload', 'إعادة التحميل')}</button>}><p>{tr('Another operation updated this record. Reload the current state before making a decision.', 'قامت عملية أخرى بتحديث هذا السجل. أعد تحميل الحالة الحالية قبل اتخاذ قرار.')}</p></State>;
}

export function RetryableErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { tr } = useOptionalLanguage();
  return <State title={tr('Temporary error', 'خطأ مؤقت')} action={<button onClick={onRetry}>{tr('Try again', 'حاول مرة أخرى')}</button>}><p>{message ?? tr('The request could not be completed.', 'تعذر إكمال الطلب.')}</p></State>;
}

export function TerminalErrorState({ message, correlationId }: { message: string; correlationId?: string }) {
  const { tr } = useOptionalLanguage();
  return <State title={tr('Unable to continue', 'تعذر المتابعة')}><p>{message}</p>{correlationId && <p className="mono">{tr('Reference', 'المرجع')}: {correlationId}</p>}</State>;
}
