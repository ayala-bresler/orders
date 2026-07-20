const STORAGE_KEY = 'hh_order_ui';

/** Persist wizard UI so refresh restores the same step. */
export function savePersistedUi({
  session,
  step,
  activeItem,
  itemSupportsVerses,
  editorTemplateKey,
}) {
  if (!session?.customer?.phone) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        phone: session.customer.phone,
        email: session.customer.email || undefined,
        step,
        activeItemId: activeItem?.order_item_id ?? null,
        itemSupportsVerses: itemSupportsVerses !== false,
        editorTemplateKey: editorTemplateKey || '',
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadPersistedUi() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.phone) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPersistedUi() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
