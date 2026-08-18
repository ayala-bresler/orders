import { formatModelLabel } from '../utils/modelSku.js';
import {
  isSpecialTextModel,
  SPECIAL_MODEL_DISPLAY_NAME,
} from '../utils/modelScopes.js';

export default function ModelSelect({
  models,
  value,
  onChange,
  ariaLabel,
  allowEmpty = false,
  nameOnly = false,
  className = '',
  disabled = false,
}) {
  return (
    <select
      dir="rtl"
      className={className || undefined}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {allowEmpty && <option value="">—</option>}
      {models.map((m) => {
        const label = nameOnly
          ? (String(m.model_name || '').trim()
            || (isSpecialTextModel(m.model_code) ? SPECIAL_MODEL_DISPLAY_NAME : '')
            || m.model_code)
          : formatModelLabel(m.model_code, m.model_name);
        return (
          <option key={m.model_code} value={m.model_code}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
