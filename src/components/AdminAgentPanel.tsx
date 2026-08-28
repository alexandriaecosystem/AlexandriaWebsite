import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  sendAdminAgentRequest,
  type AdminAgentRequest,
  type AdminAgentResponse,
} from '../agent/agent-client';
import { buildAdminPageContext } from '../agent/page-context';
import { resolveVoiceNavigation } from '../agent/voice-commands';
import { useLanguage } from '../i18n/LanguageContext';
import '../admin-agent.css';

type AgentMessage = { id: string; role: 'admin' | 'assistant'; text: string };
type AgentStatus = 'idle' | 'listening' | 'thinking' | 'executing';

type RecognitionEventLike = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type RecognitionErrorLike = { error?: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type PendingConfirmation = {
  response: Extract<AdminAgentResponse, { kind: 'confirmation_required' }>;
  instruction: string;
};

export type AdminAgentPanelProps = {
  requestAgent?: (request: AdminAgentRequest) => Promise<AdminAgentResponse>;
};

const allowedAgentPaths = new Set([
  '/', '/analytics', '/knowledge', '/users', '/messages', '/reviews', '/community',
  '/announcements', '/token-monitor', '/account', '/knowledge-gaps',
]);

function canNavigateTo(path: string): boolean {
  if (allowedAgentPaths.has(path)) return true;
  return /^\/users\/[^/]+$/.test(path) || /^\/reviews\/[^/]+$/.test(path);
}

function messageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function AdminAgentPanel({ requestAgent = sendAdminAgentRequest }: AdminAgentPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const addMessage = (role: AgentMessage['role'], text: string) => {
    setMessages((current) => [...current, { id: messageId(), role, text }]);
  };

  async function runAgent(instruction: string, confirmation?: AdminAgentRequest['confirmation']) {
    setError(null);
    setStatus(confirmation ? 'executing' : 'thinking');
    try {
      const response = await requestAgent({
        instruction,
        context: buildAdminPageContext(location.pathname, language),
        ...(confirmation ? { confirmation } : {}),
      });

      if (response.kind === 'confirmation_required') {
        setPendingConfirmation({ response, instruction });
        addMessage('assistant', response.message);
      } else if (response.kind === 'navigate') {
        if (!canNavigateTo(response.path)) throw new Error('The agent requested an unsupported admin route.');
        navigate(response.path);
        addMessage('assistant', response.message);
      } else {
        addMessage('assistant', response.message);
        if (response.kind === 'error') setError(response.message);
        setPendingConfirmation(null);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : tr('AI admin assistant request failed.', 'فشل طلب مساعد الإدارة بالذكاء الاصطناعي.');
      setError(message);
      addMessage('assistant', message);
    } finally {
      setStatus('idle');
    }
  }

  async function handleInstruction(rawInstruction: string) {
    const instruction = rawInstruction.trim();
    if (!instruction || status === 'thinking' || status === 'executing') return;
    setInput('');
    addMessage('admin', instruction);

    const route = resolveVoiceNavigation(instruction);
    if (route) {
      navigate(route);
      addMessage('assistant', tr('Done. I opened that admin page.', 'تم. فتحت صفحة الإدارة المطلوبة.'));
      return;
    }
    await runAgent(instruction);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void handleInstruction(input);
  }

  function startListening() {
    setError(null);
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError(tr('Voice commands are not supported by this browser.', 'الأوامر الصوتية غير مدعومة في هذا المتصفح.'));
      return;
    }

    try {
      recognitionRef.current?.stop();
      const recognition = new Recognition();
      recognition.lang = language === 'ar' ? 'ar-LB' : 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const result = event.results[0];
        const transcript = result?.[0]?.transcript?.trim() ?? '';
        if (result?.isFinal && transcript) {
          setInput(transcript);
          void handleInstruction(transcript);
        }
      };
      recognition.onerror = (event) => {
        const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
        setError(denied
          ? tr('Microphone permission was denied. Allow microphone access and try again.', 'تم رفض إذن الميكروفون. اسمح بالوصول إلى الميكروفون وحاول مرة أخرى.')
          : tr('I could not transcribe that voice command.', 'تعذر تحويل الأمر الصوتي إلى نص.'));
        setStatus('idle');
      };
      recognition.onend = () => setStatus((current) => current === 'listening' ? 'idle' : current);
      recognitionRef.current = recognition;
      setStatus('listening');
      recognition.start();
    } catch (caught) {
      setStatus('idle');
      setError(caught instanceof Error ? caught.message : tr('Unable to start the microphone.', 'تعذر تشغيل الميكروفون.'));
    }
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation) return;
    const { response, instruction } = pendingConfirmation;
    await runAgent(instruction, { token: response.confirmationToken, tool: response.tool });
  }

  function cancelPendingAction() {
    setPendingConfirmation(null);
    addMessage('assistant', tr('Action cancelled. Nothing was changed.', 'تم إلغاء الإجراء. لم يتم تغيير أي شيء.'));
  }

  return (
    <div className={`admin-agent ${open ? 'open' : ''}`}>
      {!open ? (
        <button
          type="button"
          className="admin-agent-launcher"
          aria-label={tr('Open AI admin assistant', 'فتح مساعد الإدارة بالذكاء الاصطناعي')}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">✦</span>
        </button>
      ) : (
        <section className="admin-agent-panel" aria-label={tr('AI admin assistant', 'مساعد الإدارة بالذكاء الاصطناعي')}>
          <header className="admin-agent-header">
            <div>
              <small>{tr('Global assistant', 'المساعد العام')}</small>
              <strong>{tr('AI admin', 'مساعد الإدارة')}</strong>
            </div>
            <button type="button" className="admin-agent-close" aria-label={tr('Close AI admin assistant', 'إغلاق مساعد الإدارة')} onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="admin-agent-context">
            <span>{buildAdminPageContext(location.pathname, language).pageLabel}</span>
            <span className={`admin-agent-status ${status}`}>{
              status === 'listening' ? tr('Listening…', 'جارٍ الاستماع…')
                : status === 'thinking' ? tr('Thinking…', 'جارٍ التفكير…')
                  : status === 'executing' ? tr('Executing tool…', 'جارٍ تنفيذ الأداة…')
                    : tr('Ready', 'جاهز')
            }</span>
          </div>

          <div className="admin-agent-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="admin-agent-empty">
                <strong>{tr('Ask or speak an admin task', 'اكتب أو انطق مهمة إدارية')}</strong>
                <span>{tr('Try “Go to analytics” or ask about Telegram VIP members.', 'جرّب «افتح التحليلات» أو اسأل عن أعضاء Telegram VIP.')}</span>
              </div>
            ) : messages.map((message) => (
              <div className={`admin-agent-message ${message.role}`} key={message.id}>
                <span>{message.role === 'admin' ? tr('You', 'أنت') : tr('AI admin', 'مساعد الإدارة')}</span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          {error && <div className="admin-agent-error" role="alert">{error}</div>}

          <form className="admin-agent-compose" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="admin-agent-input">{tr('Message AI admin assistant', 'مراسلة مساعد الإدارة')}</label>
            <textarea
              id="admin-agent-input"
              aria-label={tr('Message AI admin assistant', 'مراسلة مساعد الإدارة')}
              value={input}
              rows={2}
              maxLength={4000}
              onChange={(event) => setInput(event.target.value)}
              placeholder={tr('Ask a question or give an admin instruction…', 'اكتب سؤالاً أو أمراً إدارياً…')}
              disabled={status === 'thinking' || status === 'executing'}
            />
            <div className="admin-agent-actions">
              <button
                type="button"
                className={`admin-agent-mic ${status === 'listening' ? 'listening' : ''}`}
                aria-label={status === 'listening' ? tr('Listening for voice command', 'جارٍ الاستماع للأمر الصوتي') : tr('Start voice command', 'بدء أمر صوتي')}
                onClick={startListening}
                disabled={status === 'thinking' || status === 'executing'}
              >
                <span aria-hidden="true">◉</span>
                <span>{status === 'listening' ? tr('Listening', 'استماع') : tr('Voice', 'صوت')}</span>
              </button>
              <button type="submit" className="primary-button" aria-label={tr('Send message', 'إرسال الرسالة')} disabled={!input.trim() || status === 'thinking' || status === 'executing'}>
                {tr('Send', 'إرسال')}
              </button>
            </div>
          </form>
        </section>
      )}

      {pendingConfirmation && (
        <div className="admin-agent-confirmation-backdrop" role="presentation">
          <section className="admin-agent-confirmation" role="dialog" aria-modal="true" aria-label={tr('Confirm admin action', 'تأكيد الإجراء الإداري')}>
            <p className="eyebrow">{tr('Confirmation required', 'التأكيد مطلوب')}</p>
            <h2>{tr('Review before changing data', 'راجع قبل تغيير البيانات')}</h2>
            <p>{pendingConfirmation.response.message}</p>
            <dl>
              {Object.entries(pendingConfirmation.response.preview).map(([key, value]) => (
                <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value ?? '—')}</dd></div>
              ))}
            </dl>
            <div className="admin-agent-confirmation-actions">
              <button type="button" className="secondary-button" onClick={cancelPendingAction}>{tr('Cancel', 'إلغاء')}</button>
              <button type="button" className="primary-button" aria-label={tr('Confirm action', 'تأكيد الإجراء')} onClick={() => void confirmPendingAction()} disabled={status === 'executing'}>
                {status === 'executing' ? tr('Executing…', 'جارٍ التنفيذ…') : tr('Confirm action', 'تأكيد الإجراء')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
