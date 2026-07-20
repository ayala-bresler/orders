import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DEFAULT_SESSION_MAX_AGE_MS,
  DEFAULT_WARNING_BEFORE_MS,
  getSessionMaxAgeMs,
} from './sessionAuth.js';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
  'pointerdown',
];

/**
 * Client-side inactivity monitor.
 * - Resets on user activity (while warning modal is closed)
 * - Warns `warningBeforeMs` before timeout
 * - Calls onTimeout when idle exceeds maxAgeMs
 */
export function useInactivityTimeout({
  enabled,
  maxAgeMs,
  warningBeforeMs = DEFAULT_WARNING_BEFORE_MS,
  onWarn,
  onTimeout,
  onActivity,
} = {}) {
  const [warningOpen, setWarningOpen] = useState(false);
  const warnTimerRef = useRef(null);
  const expireTimerRef = useRef(null);
  const warningOpenRef = useRef(false);
  const onWarnRef = useRef(onWarn);
  const onTimeoutRef = useRef(onTimeout);
  const onActivityRef = useRef(onActivity);
  const maxAgeRef = useRef(maxAgeMs);
  const warnBeforeRef = useRef(warningBeforeMs);

  onWarnRef.current = onWarn;
  onTimeoutRef.current = onTimeout;
  onActivityRef.current = onActivity;
  maxAgeRef.current = maxAgeMs;
  warnBeforeRef.current = warningBeforeMs;
  warningOpenRef.current = warningOpen;

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
  }, []);

  const armTimers = useCallback(() => {
    clearTimers();
    const ttl = Math.max(
      5_000,
      Number(maxAgeRef.current) || getSessionMaxAgeMs() || DEFAULT_SESSION_MAX_AGE_MS
    );
    const warnLead = Math.min(
      Math.max(5_000, Number(warnBeforeRef.current) || DEFAULT_WARNING_BEFORE_MS),
      ttl - 1_000
    );
    const warnIn = Math.max(0, ttl - warnLead);

    warnTimerRef.current = setTimeout(() => {
      warningOpenRef.current = true;
      setWarningOpen(true);
      onWarnRef.current?.();
    }, warnIn);

    expireTimerRef.current = setTimeout(() => {
      warningOpenRef.current = false;
      setWarningOpen(false);
      onTimeoutRef.current?.();
    }, ttl);
  }, [clearTimers]);

  const reset = useCallback(() => {
    warningOpenRef.current = false;
    setWarningOpen(false);
    if (!enabled) {
      clearTimers();
      return;
    }
    armTimers();
    onActivityRef.current?.();
  }, [enabled, armTimers, clearTimers]);

  const dismissWarning = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      warningOpenRef.current = false;
      setWarningOpen(false);
      return undefined;
    }

    armTimers();

    let throttleUntil = 0;
    const onEvent = () => {
      if (warningOpenRef.current) return;
      const now = Date.now();
      if (now < throttleUntil) return;
      throttleUntil = now + 1_000;
      reset();
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onEvent, { passive: true });
    }
    document.addEventListener('visibilitychange', onEvent);

    return () => {
      clearTimers();
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onEvent);
      }
      document.removeEventListener('visibilitychange', onEvent);
    };
  }, [enabled, armTimers, clearTimers, reset]);

  return {
    warningOpen,
    dismissWarning,
    reset,
  };
}
