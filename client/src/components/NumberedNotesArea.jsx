import { useMemo } from 'react';
import { clampOrderNotes, MAX_ORDER_NOTE_LINES } from '../utils/orderNotes.js';

function splitLines(value, maxLines) {
  const lines = String(value || '').split('\n');
  const capped = lines.slice(0, maxLines);
  return capped.length ? capped : [''];
}

export default function NumberedNotesArea({
  value,
  onChange,
  className = '',
  placeholder = '',
  maxLines = MAX_ORDER_NOTE_LINES,
}) {
  const lines = useMemo(() => splitLines(value, maxLines), [value, maxLines]);

  const handleChange = (e) => {
    const clamped = clampOrderNotes(e.target.value, maxLines);
    if (clamped === e.target.value) {
      onChange(e);
      return;
    }
    onChange({
      ...e,
      target: { ...e.target, value: clamped },
      currentTarget: { ...e.currentTarget, value: clamped },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const currentLines = String(value || '').split('\n');
    if (currentLines.length >= maxLines) {
      e.preventDefault();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!pasted.includes('\n')) return;
    e.preventDefault();
    const el = e.target;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const merged = `${String(value || '').slice(0, start)}${pasted}${String(value || '').slice(end)}`;
    const clamped = clampOrderNotes(merged, maxLines);
    onChange({
      ...e,
      target: { ...el, value: clamped },
      currentTarget: { ...el, value: clamped },
    });
  };

  return (
    <div className={`numbered-notes-area${className ? ` ${className}` : ''}`}>
      <div className="numbered-notes-lines" aria-hidden="true">
        {lines.map((_, idx) => (
          <span key={idx} className="numbered-notes-marker">
            {idx + 1}.
          </span>
        ))}
      </div>
      <textarea
        dir="rtl"
        className="numbered-notes-input"
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={maxLines}
        aria-label={`הערות, עד ${maxLines} שורות`}
      />
    </div>
  );
}
