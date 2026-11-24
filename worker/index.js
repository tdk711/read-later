/**
 * Read-It-Later sync API.
 *
 * Routes (all require `Authorization: Bearer <derived-token>`):
 *   GET  /api/auth/verify            Validate the token.
 *   GET  /api/bookmarks?updated_after=<ms>
 *                                    Incremental pull (includes tombstones).
 *   POST /api/bookmarks/sync         Batch outbox push with last-write-wins.
 *
 * Non-API requests are served from the static asset binding configured in
 * wrangler.toml.
 */

const MAX_BATCH_SIZE = 100;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_TITLE_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const MAX_ID_LENGTH = 128;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      if (!env.ASSETS) {
        return new Response('Not found', { status: 404 });
      }
      return env.ASSETS.fetch(request);
    }

    const cors = corsHeaders(request, env);

    // CORS preflight cannot carry the Authorization header, so answer it
    // before the token check. It is only enabled when ALLOWED_ORIGIN is set.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (!(await isAuthorized(request, env))) {
      return json({ error: 'Unauthorized' }, 401, cors);
    }

    try {
      if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === '/api/bookmarks' && request.method === 'GET') {
        return await pullBookmarks(url, env, cors);
      }

      if (url.pathname === '/api/bookmarks/sync' && request.method === 'POST') {
        return await pushBookmarks(request, env, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (error) {
      console.error('Sync API error', error);
      return json({ error: 'Internal server error' }, 500, cors);
    }
  },
};

/**
 * Compare the bearer token with env.SYNC_SECRET in constant time.
 *
 * Cloudflare Workers expose the non-standard `crypto.subtle.timingSafeEqual`.
 * The manual fallback keeps the function usable in plain Node test runners.
 */
async function isAuthorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !env.SYNC_SECRET) return false;

  const presented = match[1].trim().toLowerCase();
  const expected = String(env.SYNC_SECRET).trim().toLowerCase();
  if (!presented || !expected) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(presented);
  const b = encoder.encode(expected);
  if (a.byteLength !== b.byteLength) return false;

  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(a, b);
  }

  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pullBookmarks(url, env, cors) {
  const raw = url.searchParams.get('updated_after') ?? '0';
  const since = Number(raw);

  if (!Number.isFinite(since) || since < 0) {
    return json({ error: 'updated_after must be a positive number' }, 400, cors);
  }

  const { results } = await env.bookmarks_db
    .prepare(
      `SELECT id, url, title, status, createdAt, updatedAt, deleted
         FROM articles
        WHERE updatedAt > ?
        ORDER BY updatedAt ASC`
    )
    .bind(Math.floor(since))
    .all();

  return json(
    {
      bookmarks: results ?? [],
      serverTime: Date.now(),
    },
    200,
    cors
  );
}

async function pushBookmarks(request, env, cors) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: 'Could not read request body' }, 400, cors);
  }

  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'Request body too large' }, 413, cors);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }

  const items = body?.bookmarks;
  if (items == null) {
    return json({ error: 'bookmarks must be an array' }, 400, cors);
  }
  if (!Array.isArray(items)) {
    return json({ error: 'bookmarks must be an array' }, 400, cors);
  }
  if (items.length > MAX_BATCH_SIZE) {
    return json({ error: `Batch too large (max ${MAX_BATCH_SIZE})` }, 413, cors);
  }
  if (items.length === 0) {
    return json({ bookmarks: [], synced: 0, rejected: [], serverTime: Date.now() }, 200, cors);
  }

  const valid = [];
  const rejected = [];

  for (const item of items) {
    const row = normalizeIncoming(item);
    if (row) valid.push(row);
    else rejected.push({ id: typeof item?.id === 'string' ? item.id : null, error: 'Invalid bookmark' });
  }

  if (valid.length) {
    const statements = valid.map((row) =>
      env.bookmarks_db
        .prepare(
          `INSERT INTO articles (id, url, title, status, createdAt, updatedAt, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             url = excluded.url,
             title = excluded.title,
             status = excluded.status,
             createdAt = excluded.createdAt,
             updatedAt = excluded.updatedAt,
             deleted = excluded.deleted
           WHERE excluded.updatedAt > articles.updatedAt`
        )
        .bind(
          row.id,
          row.url,
          row.title,
          row.status,
          row.createdAt,
          row.updatedAt,
          row.deleted
        )
    );

    await env.bookmarks_db.batch(statements);
  }

  // Return the authoritative row for every accepted id. This covers both the
  // row we just wrote and the case where an existing row with a newer
  // `updatedAt` won the conflict, so the client can converge immediately.
  let bookmarks = [];
  if (valid.length) {
    const placeholders = valid.map(() => '?').join(', ');
    const { results } = await env.bookmarks_db
      .prepare(
        `SELECT id, url, title, status, createdAt, updatedAt, deleted
           FROM articles
          WHERE id IN (${placeholders})`
      )
      .bind(...valid.map((row) => row.id))
      .all();
    bookmarks = results ?? [];
  }

  return json(
    {
      bookmarks,
      synced: valid.length,
      rejected,
      serverTime: Date.now(),
    },
    200,
    cors
  );
}

/** Validate and normalise one bookmark from a push request. */
function normalizeIncoming(value) {
  if (!value || typeof value !== 'object') return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id || id.length > MAX_ID_LENGTH) return null;

  const url = typeof value.url === 'string' ? value.url.trim() : '';
  if (!url || url.length > MAX_URL_LENGTH) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const title = typeof value.title === 'string' ? value.title.slice(0, MAX_TITLE_LENGTH) : '';
  const status = value.status === 'read' ? 'read' : 'unread';

  const createdAt = Math.floor(Number(value.createdAt));
  const updatedAt = Math.floor(Number(value.updatedAt));
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  if (createdAt < 0 || updatedAt < 0) return null;

  return {
    id,
    url,
    title,
    status,
    createdAt,
    updatedAt,
    deleted: value.deleted ? 1 : 0,
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !env.ALLOWED_ORIGIN) return {};

  const allowed = String(env.ALLOWED_ORIGIN)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!allowed.includes(origin)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}
