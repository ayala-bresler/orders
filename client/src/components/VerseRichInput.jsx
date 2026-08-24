import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { detectTextDir } from '../utils/textDirection.js';
import { normalizeVerseText } from '../utils/verseText.js';
import {
  verseHtmlFromState,
  parseVerseEditable,
  getEditableSelectionOffsets,
  setEditableSelectionOffsets,
} from '../utils/verseRichInput.js';

/**
 * Single-line verse editor with visible bold (<b>) runs.
 * Source of truth remains plain text + boldRanges (same as SVG/DXF).
 */
const VerseRichInput = forwardRef(function VerseRichInput(
  {
    id,
    value = '',
    boldRanges = [],
    placeholder = '',
    maxLength,
    ariaLabel,
    onChange,
    onSelectionChange,
    onKeyDown,
  },
  ref
) {
  const elRef = useRef(null);
  const skipSyncRef = useRef(false);
  const lastSigRef = useRef('');

  useImperativeHandle(ref, () => ({
    focus: () => elRef.current?.focus(),
    getSelection: () =>
      elRef.current ? getEditableSelectionOffsets(elRef.current) : { start: 0, end: 0 },
    setSelection: (start, end) => {
      if (elRef.current) setEditableSelectionOffsets(elRef.current, start, end);
    },
    getElement: () => elRef.current,
  }));

  const emitSelection = useCallback(() => {
    const el = elRef.current;
    if (!el || typeof onSelectionChange !== 'function') return;
    onSelectionChange(getEditableSelectionOffsets(el));
  }, [onSelectionChange]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const html = verseHtmlFromState(value, boldRanges);
    const sig = `${value}\0${JSON.stringify(boldRanges || [])}`;
    if (lastSigRef.current === sig) return;
    const sel = getEditableSelectionOffsets(el);
    const focused = document.activeElement === el;
    el.innerHTML = html;
    lastSigRef.current = sig;
    if (focused) {
      setEditableSelectionOffsets(el, sel.start, sel.end);
    }
  }, [value, boldRanges]);

  const commitFromDom = () => {
    const el = elRef.current;
    if (!el) return;
    let { text, boldRanges: ranges } = parseVerseEditable(el);
    if (maxLength != null && text.length > maxLength) {
      text = text.slice(0, maxLength);
      ranges = ranges
        .map((r) => ({
          start: Math.min(r.start, text.length),
          end: Math.min(r.end, text.length),
        }))
        .filter((r) => r.end > r.start);
      el.innerHTML = verseHtmlFromState(text, ranges);
      setEditableSelectionOffsets(el, text.length, text.length);
    }
    text = normalizeVerseText(text);
    skipSyncRef.current = true;
    lastSigRef.current = `${text}\0${JSON.stringify(ranges || [])}`;
    onChange?.(text, ranges);
    emitSelection();
  };

  return (
    <div
      ref={elRef}
      id={id}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      dir={detectTextDir(value)}
      className="bidi-input verse-rich-input"
      data-placeholder={placeholder || undefined}
      data-empty={value ? undefined : true}
      spellCheck={false}
      onInput={commitFromDom}
      onSelect={emitSelection}
      onKeyUp={emitSelection}
      onMouseUp={emitSelection}
      onBlur={emitSelection}
      onPaste={(e) => {
        e.preventDefault();
        const plain = normalizeVerseText(e.clipboardData?.getData('text/plain') || '');
        document.execCommand('insertText', false, plain);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault();
        onKeyDown?.(e);
      }}
    />
  );
});

export default VerseRichInput;
