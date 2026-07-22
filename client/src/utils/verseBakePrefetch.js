import { fetchOrderItemVerses, fetchTemplatePreview } from '../api.js';
import { loadVerseDraft } from './verseDraftPersist.js';

function bakeSignature(values, fontScales) {
  return JSON.stringify({ values: values || {}, fontScales: fontScales || {} });
}

/** @type {object | null} */
let cache = null;
/** @type {Promise<object|null> | null} */
let inflight = null;
let inflightKey = '';

function cacheKey(orderId, itemId, templateKey) {
  return `${orderId}:${itemId}:${templateKey || ''}`;
}

/**
 * Warm server-baked SVG (ring centering) while the user is still on details.
 * TemplateEditor consumes this so the first verses screen is faster.
 */
export function prefetchVerseBake({ orderId, itemId, templateKey = '' }) {
  if (orderId == null || itemId == null) return Promise.resolve(null);

  const key = cacheKey(orderId, itemId, templateKey);
  if (inflight && inflightKey === key) return inflight;

  inflightKey = key;
  inflight = (async () => {
    let values = {};
    let fontScales = {};
    try {
      const row = await fetchOrderItemVerses(orderId, itemId);
      values = { ...(row.values || {}) };
      fontScales = { ...(row.fontScales || {}) };
    } catch {
      /* defaults / draft only */
    }

    const draft = loadVerseDraft(orderId, itemId, templateKey);
    if (draft) {
      values = { ...values, ...draft.values };
      fontScales = { ...fontScales, ...draft.fontScales };
    }

    const sig = bakeSignature(values, fontScales);
    if (
      cache &&
      cache.key === key &&
      cache.sig === sig &&
      cache.svg
    ) {
      return cache;
    }

    const res = await fetchTemplatePreview(values, fontScales, {
      orderId,
      orderItemId: itemId,
      bake: true,
    });
    if (!res?.svg) return null;

    cache = {
      key,
      orderId,
      itemId,
      templateKey: String(templateKey || ''),
      sig,
      svg: res.svg,
      values,
      fontScales,
    };
    return cache;
  })()
    .catch((err) => {
      console.warn('[verseBakePrefetch] failed:', err?.message || err);
      return null;
    })
    .finally(() => {
      if (inflightKey === key) {
        inflight = null;
        inflightKey = '';
      }
    });

  return inflight;
}

/** Return cached bake if it matches current editor verses/scales. */
export async function takeVerseBakeCache({
  orderId,
  itemId,
  templateKey = '',
  values,
  fontScales,
}) {
  const key = cacheKey(orderId, itemId, templateKey);

  if (inflight && inflightKey === key) {
    await inflight;
  }

  if (!cache || cache.key !== key || !cache.svg) return null;

  const sig = bakeSignature(values, fontScales);
  if (cache.sig !== sig) return null;

  return { svg: cache.svg, sig: cache.sig };
}

export function clearVerseBakeCache(orderId, itemId) {
  if (
    cache &&
    (orderId == null || cache.orderId === orderId) &&
    (itemId == null || cache.itemId === itemId)
  ) {
    cache = null;
  }
}
