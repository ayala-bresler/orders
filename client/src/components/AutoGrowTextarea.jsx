import { useEffect, useRef } from 'react';
import { detectTextDir } from '../utils/textDirection.js';

export default function AutoGrowTextarea({
  value,
  onChange,
  className = '',
  dir,
  placeholder = '',
  id,
  name,
}) {
  const ref = useRef(null);
  const resolvedDir = dir || detectTextDir(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 36)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      name={name}
      dir={resolvedDir}
      rows={1}
      className={['bidi-input', className].filter(Boolean).join(' ')}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}
