import { formatModelLabel } from '../utils/modelSku.js';

export default function ModelSelect({ models, value, onChange, ariaLabel, allowEmpty = false, className = '' }) {
  return (
    <select
      dir="rtl"
      className={className || undefined}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={ariaLabel}
    >
      {allowEmpty && <option value="">—</option>}
      {models.map((m) => (
        <option key={m.model_code} value={m.model_code}>
          {formatModelLabel(m.model_code, m.model_name)}
        </option>
      ))}
    </select>
  );
}
