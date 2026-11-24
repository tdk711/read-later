/**
 * Thin client for the Cloudflare Worker sync API.
 *
 * Every function receives the derived token explicitly so this module never
 * has to know how the token is stored or unlocked.
 */

const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, options) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Invalid or expired sync token') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  if (!token) throw new UnauthorizedError('Locked');

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ApiError('Could not reach the sync server', 0, { cause });
  }

  if (response.status === 401) throw new UnauthorizedError();

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error || '';
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(detail || `Sync request failed (${response.status})`, response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError('The sync server returned an invalid response', response.status);
  }
}

/** Validate a derived token without changing any client state. */
export function verifyToken(token) {
  return request('/api/auth/verify', { token });
}

/** Fetch every row changed after `since` (epoch milliseconds). */
export function pullBookmarks(token, since = 0) {
  const cursor = Math.max(0, Math.floor(Number(since) || 0));
  return request(`/api/bookmarks?updated_after=${encodeURIComponent(cursor)}`, { token });
}

/** Push a batch of local changes. */
export function pushBookmarks(token, bookmarks) {
  return request('/api/bookmarks/sync', {
    token,
    method: 'POST',
    body: { bookmarks },
  });
}
