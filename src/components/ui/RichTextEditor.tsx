import React, { useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Eraser,
  Heading2,
  Highlighter,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { sanitizeHtml } from '../../utils/sanitize';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
}

// HTML-ээс энгийн текст гаргах (жагсаалтын урьдчилсан харагдацад ашиглана)
export const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  readOnly = false,
  minHeight = 120,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Гаднаас утга өөрчлөгдөхөд л innerHTML-ийг шинэчилнэ (курсор үсрэхээс сэргийлнэ).
  // Ачаалж буй HTML-ийг цэвэрлэж, DOM-д хортой скрипт/handler орохоос сэргийлнэ.
  useEffect(() => {
    const safe = sanitizeHtml(value || '');
    if (editorRef.current && editorRef.current.innerHTML !== safe) {
      editorRef.current.innerHTML = safe;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    if (readOnly) return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    onChange(editorRef.current?.innerHTML || '');
  };

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

  const toolbarButtons: { icon: React.ElementType; title: string; onClick: () => void }[] = [
    { icon: Bold, title: 'Bold (Ctrl+B)', onClick: () => exec('bold') },
    { icon: Italic, title: 'Italic (Ctrl+I)', onClick: () => exec('italic') },
    { icon: Underline, title: 'Underline (Ctrl+U)', onClick: () => exec('underline') },
    { icon: Strikethrough, title: 'Strikethrough', onClick: () => exec('strikeThrough') },
    { icon: Heading2, title: 'Гарчиг', onClick: () => exec('formatBlock', '<h3>') },
    { icon: Highlighter, title: 'Тодруулах', onClick: () => exec('hiliteColor', '#fef08a') },
    { icon: List, title: 'Жагсаалт', onClick: () => exec('insertUnorderedList') },
    { icon: ListOrdered, title: 'Дугаартай жагсаалт', onClick: () => exec('insertOrderedList') },
    { icon: AlignLeft, title: 'Зүүн', onClick: () => exec('justifyLeft') },
    { icon: AlignCenter, title: 'Төв', onClick: () => exec('justifyCenter') },
    { icon: AlignRight, title: 'Баруун', onClick: () => exec('justifyRight') },
    { icon: Undo2, title: 'Буцаах (Ctrl+Z)', onClick: () => exec('undo') },
    { icon: Redo2, title: 'Дахих (Ctrl+Y)', onClick: () => exec('redo') },
    { icon: Eraser, title: 'Формат арилгах', onClick: () => exec('removeFormat') },
  ];

  if (readOnly) {
    return (
      <div
        className="rich-editor-content w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm overflow-y-auto"
        style={{ minHeight, maxHeight: 400 }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) || `<span class="text-slate-400">${placeholder || ''}</span>` }}
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-slate-100 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
        {toolbarButtons.map((btn, i) => (
          <button
            key={i}
            type="button"
            title={btn.title}
            onMouseDown={e => e.preventDefault()}
            onClick={btn.onClick}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-primary transition-colors"
          >
            <btn.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder || ''}
        className={cn(
          'rich-editor-content w-full px-4 py-2 outline-none text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-y-auto',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:empty:before:text-slate-600'
        )}
        style={{ minHeight, maxHeight: 400 }}
      />
    </div>
  );
};
