import { useEffect, useRef } from 'react';

const HISTORY_KEY = 'hetzWizard';
const HISTORY_VERSION = 1;

function snapshot(step, activeItemId) {
  return {
    [HISTORY_KEY]: true,
    v: HISTORY_VERSION,
    step: step || 'identify',
    activeItemId:
      activeItemId == null || activeItemId === ''
        ? null
        : Number(activeItemId),
  };
}

function readSnapshot(state) {
  if (!state || state[HISTORY_KEY] !== true || state.v !== HISTORY_VERSION) {
    return null;
  }
  return {
    step: state.step || 'identify',
    activeItemId: Number.isFinite(state.activeItemId)
      ? state.activeItemId
      : null,
  };
}

function sameSnapshot(a, b) {
  if (!a || !b) return false;
  return a.step === b.step && a.activeItemId === b.activeItemId;
}

/**
 * Sync wizard step navigation with the browser History API so Chrome's
 * back/forward arrows move one app step (e.g. details → product picker).
 *
 * @param {{
 *   enabled: boolean,
 *   step: string,
 *   activeItemId: number|null|undefined,
 *   onRestore: (next: { step: string, activeItemId: number|null }) => void,
 * }} opts
 */
export function useWizardHistory({ enabled, step, activeItemId, onRestore }) {
  const skipPushRef = useRef(true);
  const applyingPopRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Seed / push history entries when the wizard step changes.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const next = snapshot(step, activeItemId);

    if (skipPushRef.current) {
      window.history.replaceState(next, '', window.location.href);
      skipPushRef.current = false;
      return;
    }

    if (applyingPopRef.current) {
      applyingPopRef.current = false;
      window.history.replaceState(next, '', window.location.href);
      return;
    }

    const current = readSnapshot(window.history.state);
    if (sameSnapshot(current, next)) return;

    window.history.pushState(next, '', window.location.href);
  }, [enabled, step, activeItemId]);

  // Browser back / forward.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const onPopState = (event) => {
      const restored = readSnapshot(event.state);
      if (!restored) {
        // Left the wizard stack — keep UI; next in-app nav will re-seed.
        skipPushRef.current = true;
        return;
      }
      applyingPopRef.current = true;
      onRestoreRef.current(restored);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [enabled]);

  /** Call after logout / hard reset so the next step replaceState's cleanly. */
  const resetHistory = () => {
    skipPushRef.current = true;
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        snapshot('identify', null),
        '',
        window.location.href
      );
    }
  };

  return { resetHistory };
}
