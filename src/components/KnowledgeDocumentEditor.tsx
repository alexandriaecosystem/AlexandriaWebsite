import { useEffect, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react';
import { getKnowledgeDocumentForEditing, updateKnowledgeDocumentContent, type EditableKnowledgeDocument } from '../services/knowledge-editor';
import { getSupabaseClient } from '../services/supabase';
import { LoadingState, RetryableErrorState } from './AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import '../document-editor.css';

interface KnowledgeDocumentEditorProps {
  documentId: string;
  onClose: () => void;
  onSaved: () => void;
}

const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const allowedTags = new Set(['P', 'BR', 'H1', 'H2', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'DIV']);
const dropEntirely = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'META', 'LINK']);

function plainTextToHtml(value: string) {
  return value.split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`).join('');
}

function sanitizeRichHtml(value: string) {
  const template = window.document.createElement('template');
  template.innerHTML = value;

  function clean(parent: ParentNode) {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      const tag = node.tagName.toUpperCase();
      if (dropEntirely.has(tag)) {
        node.remove();
        return;
      }
      clean(node);
      if (!allowedTags.has(tag)) {
        node.replaceWith(...Array.from(node.childNodes));
        return;
      }

      const textAlign = ['left', 'right', 'center', 'justify'].includes(node.style.textAlign) ? node.style.textAlign : '';
      const dir = ['ltr', 'rtl', 'auto'].includes(node.getAttribute('dir') ?? '') ? node.getAttribute('dir') : null;
      Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
      if (textAlign) node.style.textAlign = textAlign;
      if (dir) node.setAttribute('dir', dir);
    });
  }

  clean(template.content);
  return template.innerHTML;
}

export function KnowledgeDocumentEditor({ documentId, onClose, onSaved }: KnowledgeDocumentEditorProps) {
  const { tr } = useLanguage();
  const editorRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<EditableKnowledgeDocument>();
  const [title, setTitle] = useState('');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    setError(false);
    getKnowledgeDocumentForEditing(getSupabaseClient(), documentId)
      .then((value) => {
        if (!current) return;
        setDoc(value);
        setTitle(value.title);
        const fallbackText = value.content?.trim() || [...value.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex).map((chunk) => chunk.content).join('\n\n');
        const html = sanitizeRichHtml(value.editorHtml?.trim() || plainTextToHtml(fallbackText));
        requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = html; });
      })
      .catch(() => setError(true));
    return () => { current = false; };
  }, [documentId, reload]);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    window.document.execCommand(command, false, value);
    setDirty(true);
  }

  function toolbarMouseDown(event: MouseEvent<HTMLButtonElement>) { event.preventDefault(); }

  function pastePlainText(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    window.document.execCommand('insertText', false, text);
    setDirty(true);
  }

  async function save() {
    if (!doc || !editorRef.current || saving) return;
    const sanitizedHtml = sanitizeRichHtml(editorRef.current.innerHTML);
    editorRef.current.innerHTML = sanitizedHtml;
    const content = editorRef.current.innerText.replace(/\n{3,}/g, '\n\n').trim();
    if (!content) {
      setMessage(tr('The document cannot be empty.', 'لا يمكن أن يكون المستند فارغاً.'));
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const result = await updateKnowledgeDocumentContent(getSupabaseClient(), {
        documentId: doc.id,
        title: title.trim() || doc.title,
        content,
        editorHtml: sanitizedHtml,
        expectedVersion: doc.version,
      });
      setDirty(false);
      setDoc((current) => current ? { ...current, title: title.trim() || current.title, version: result.version, processingStatus: 'PENDING', isApproved: false, chunkCount: 0, content, editorHtml: sanitizedHtml } : current);
      setMessage(tr('Saved. The document is queued for reprocessing and must be approved again after processing.', 'تم الحفظ. تمت جدولة المستند لإعادة المعالجة ويجب اعتماده من جديد بعد اكتمال المعالجة.'));
      onSaved();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr('Could not save the document.', 'تعذر حفظ المستند.'));
    } finally { setSaving(false); }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (error) return <div className="document-editor-overlay"><div className="document-editor-shell editor-error-shell"><RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /><button type="button" className="compact-button" onClick={onClose}>{tr('Close', 'إغلاق')}</button></div></div>;

  return (
    <div className="document-editor-overlay" role="dialog" aria-modal="true" aria-label={tr('Knowledge document editor', 'محرر مستند قاعدة المعرفة')}>
      <div className="document-editor-shell">
        <header className="document-editor-header">
          <div className="document-editor-title-group"><span className="document-editor-icon" aria-hidden="true">W</span><div><input className="document-editor-title" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} aria-label={tr('Document title', 'عنوان المستند')} disabled={!doc} /><small>{doc ? `${doc.language.toUpperCase()} · v${doc.version}` : tr('Loading document…', 'جارٍ تحميل المستند…')}</small></div></div>
          <div className="document-editor-header-actions">{dirty && <span className="unsaved-indicator">{tr('Unsaved changes', 'تغييرات غير محفوظة')}</span>}<button type="button" className="compact-button" onClick={onClose}>{tr('Close', 'إغلاق')}</button><button type="button" className="primary" disabled={!doc || saving || !dirty} onClick={() => void save()}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save', 'حفظ')}</button></div>
        </header>
        <div className="document-editor-ribbon" aria-label={tr('Formatting toolbar', 'شريط التنسيق')}>
          <div className="ribbon-group"><button type="button" title={tr('Undo', 'تراجع')} onMouseDown={toolbarMouseDown} onClick={() => runCommand('undo')}>↶</button><button type="button" title={tr('Redo', 'إعادة')} onMouseDown={toolbarMouseDown} onClick={() => runCommand('redo')}>↷</button></div>
          <div className="ribbon-group"><button type="button" className="ribbon-text-button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('formatBlock', 'p')}>{tr('Normal', 'عادي')}</button><button type="button" className="ribbon-text-button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('formatBlock', 'h1')}>{tr('Title', 'عنوان')}</button><button type="button" className="ribbon-text-button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('formatBlock', 'h2')}>{tr('Heading', 'رأس')}</button></div>
          <div className="ribbon-group"><button type="button" className="format-bold" onMouseDown={toolbarMouseDown} onClick={() => runCommand('bold')}>B</button><button type="button" className="format-italic" onMouseDown={toolbarMouseDown} onClick={() => runCommand('italic')}>I</button><button type="button" className="format-underline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('underline')}>U</button></div>
          <div className="ribbon-group"><button type="button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('insertUnorderedList')}>• List</button><button type="button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('insertOrderedList')}>1. List</button></div>
          <div className="ribbon-group"><button type="button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('justifyLeft')}>≡</button><button type="button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('justifyCenter')}>≣</button><button type="button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('justifyRight')}>≡</button></div>
          <div className="ribbon-group"><button type="button" className="ribbon-text-button" onMouseDown={toolbarMouseDown} onClick={() => runCommand('removeFormat')}>{tr('Clear formatting', 'مسح التنسيق')}</button></div>
        </div>
        <main className="document-editor-workspace">{!doc ? <div className="document-editor-loading"><LoadingState label={tr('Opening document', 'جارٍ فتح المستند')} /></div> : <div className="document-page-wrap"><div ref={editorRef} className="document-page" contentEditable suppressContentEditableWarning spellCheck dir={doc.language.toLowerCase().startsWith('ar') ? 'rtl' : 'auto'} onInput={() => setDirty(true)} onPaste={pastePlainText} aria-label={tr('Editable document content', 'محتوى المستند القابل للتحرير')} /></div>}</main>
        <footer className="document-editor-statusbar"><span>{doc?.chunkCount ? tr('Indexed source', 'مصدر مفهرس') : ''}</span><span>{message || tr('Ctrl/Cmd + S to save', 'Ctrl/Cmd + S للحفظ')}</span></footer>
      </div>
    </div>
  );
}
