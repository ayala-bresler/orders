import { useEffect, useRef } from 'react';

export default function AutoGrowTextarea({
  value,
  onChange,
  className = '',
  dir = 'rtl',
  placeholder = '',
  id,
  name,
}) {
  const ref = useRef(null);

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
      dir={dir}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}
