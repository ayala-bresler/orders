const draftKey = (orderId, itemId) =>
  `hh_verse_draft_${orderId}_${itemId}`;

/**
 * Keep unsaved verse edits across navigation (e.g. back to order details)
 * without writing to the database until the user clicks Save.
 */
export function saveVerseDraft(orderId, itemId, payload) {
  if (orderId == null || itemId == null) return;
  try {
    sessionStorage.setItem(
      draftKey(orderId, itemId),
      JSON.stringify({
        values: payload.values || {},
        fontScales: payload.fontScales || {},
        templateKey: payload.templateKey || '',
        updatedAt: Date.now(),
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadVerseDraft(orderId, itemId, templateKey = '') {
  if (orderId == null || itemId == null) return null;
  try {
    const raw = sessionStorage.getItem(draftKey(orderId, itemId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (
      templateKey &&
      data.templateKey &&
      String(data.templateKey) !== String(templateKey)
    ) {
      return null;
    }
    return {
      values: data.values && typeof data.values === 'object' ? data.values : {},
      fontScales:
        data.fontScales && typeof data.fontScales === 'object'
          ? data.fontScales
          : {},
    };
  } catch {
    return null;
  }
}

export function clearVerseDraft(orderId, itemId) {
  if (orderId == null || itemId == null) return;
  try {
    sessionStorage.removeItem(draftKey(orderId, itemId));
  } catch {
    /* ignore */
  }
}
