const TOKEN_KEY = 'hh_session_token';
const EXPIRES_KEY = 'hh_session_expires_at';
const MAX_AGE_KEY = 'hh_session_max_age_ms';

/** Default inactivity window — keep in sync with server SESSION_TTL_MS. */
export const DEFAULT_SESSION_MAX_AGE_MS = 15 * 60 * 1000;
export const DEFAULT_WARNING_BEFORE_MS = 60 * 1000;

export function getSessionToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function getSessionExpiresAt() {
  try {
    return sessionStorage.getItem(EXPIRES_KEY) || '';
  } catch {
    return '';
  }
}

export function getSessionMaxAgeMs() {
  try {
    const n = Number(sessionStorage.getItem(MAX_AGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_SESSION_MAX_AGE_MS;
  } catch {
    return DEFAULT_SESSION_MAX_AGE_MS;
  }
}

export function saveSessionAuth({
  sessionToken,
  sessionExpiresAt,
  sessionExpiresInMs,
  sessionMaxAgeMs,
} = {}) {
  if (!sessionToken) return;
  try {
    sessionStorage.setItem(TOKEN_KEY, sessionToken);
    if (sessionExpiresAt) sessionStorage.setItem(EXPIRES_KEY, sessionExpiresAt);
    const maxAge = sessionMaxAgeMs || sessionExpiresInMs || DEFAULT_SESSION_MAX_AGE_MS;
    sessionStorage.setItem(MAX_AGE_KEY, String(maxAge));
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionAuth() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
    sessionStorage.removeItem(MAX_AGE_KEY);
  } catch {
    /* ignore */
  }
}

export function applySessionFromIdentifyResult(result) {
  if (result?.sessionToken) {
    saveSessionAuth(result);
  }
  return result;
}
