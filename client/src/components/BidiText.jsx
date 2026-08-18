import { detectTextDir } from '../utils/textDirection.js';

/**
 * Renders user-entered free text with correct paragraph direction
 * (Hebrew → RTL, English/numbers → LTR; mixed keeps Unicode BiDi order).
 */
export default function BidiText({
  as: Tag = 'span',
  children,
  value,
  className = '',
  empty = 'rtl',
  ...rest
}) {
  const text = value != null ? value : children;
  const dir = detectTextDir(text, { empty });
  const cls = ['bidi-text', className].filter(Boolean).join(' ');
  return (
    <Tag dir={dir} className={cls} {...rest}>
      {children != null ? children : text}
    </Tag>
  );
}
