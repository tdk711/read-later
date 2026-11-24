import Dexie from 'dexie';
import { liveQuery } from 'dexie';
import { readable, writable } from 'svelte/store';
import { getToken } from './auth.js';
import { pullBookmarks, pushBookmarks, UnauthorizedError } from './api.js';

/**
 * Local-first storage + Cloudflare D1 sync.
 *
 * IndexedDB stays the source of truth for reads and writes. Every mutation
 * updates the local table and a small `outbox` row in one transaction, then a
 * debounced background sync pushes the outbox to the Worker and pulls anything
 * changed since the last cursor.
 */

const OUTBOX_BATCH_SIZE = 100;
const MAX_PUSH_ROUNDS = 10;
const PULL_CURSOR_KEY = 'lastPulledAt';
const SERVER_TIME_KEY = 'lastServerTime';

export const db = new Dexie('read-it-later');

// ---------------------------------------------------------------------------
// Schema history
// ---------------------------------------------------------------------------

// Version 1 was the original, pre-cloud schema with numeric primary keys.
db.version(1).stores({
  articles: '++id, status, createdAt, url',
});

// Version 2 staged pre-cloud rows so the primary key could become a string.
db.version(2)
  .stores({
    articles: null,
    legacyArticles: '++id, url, title, status, createdAt',
  })
  .upgrade(async (tx) => {
    try {
      const legacy = await tx.table('articles').toArray();
      if (legacy.length) {
        await tx.table('legacyArticles').bulkAdd(
          legacy.map(({ id, ...article }) => article)
        );
      }
    } catch (error) {
      // On a fresh install the old table does not exist.
      console.warn('Could not stage local articles for migration', error);
    }
  });

// Version 3 re-created `articles` with the string `id` key used by Dexie Cloud.
// The cloud addon translated the old `@id` declaration to a plain `id` key
// path, so this declaration matches databases created by the previous app.
db.version(3).stores({
  articles: 'id, status, createdAt, url',
});

// Version 4 removes Dexie Cloud's tables and adds the fields needed for D1
// sync: `updatedAt` for last-write-wins and `deleted` for tombstones.
db.version(4)
  .stores({
    articles: 'id, status, createdAt, updatedAt, url, deleted',
    outbox: 'id, updatedAt',
    meta: 'key',
    legacyArticles: '++id, url, title, status, createdAt',
  })
  .upgrade(async (tx) => {
    const now = Date.now();
    const articlesTable = tx.table('articles');
    const outbox = tx.table('outbox');
    const rows = await articlesTable.toArray();

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;

      const id = typeof row.id === 'string' && row.id ? row.id : newId();
      const url = typeof row.url === 'string' ? row.url : '';
      if (!url) {
        await articlesTable.delete(row.id);
        continue;
      }

      const createdAt = Number.isFinite(row.createdAt) ? row.createdAt : now;
      const article = {
        id,
        url,
        title: typeof row.title === 'string' ? row.title : '',
        status: row.status === 'read' ? 'read' : 'unread',
        createdAt,
        updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : createdAt,
        deleted: row.deleted ? 1 : 0,
      };

      await articlesTable.put(article);
      // Seed the outbox so data saved before this refactor is uploaded to D1
      // the first time the app is unlocked.
      await outbox.put(toOutbox(article));
    }
  });

// ---------------------------------------------------------------------------
// Local stores
// ---------------------------------------------------------------------------

/** Live list of every visible (not tombstoned) article, newest first. */
export const articles = readable([], (set) => {
  const subscription = liveQuery(() =>
    db.articles
      .orderBy('createdAt')
      .reverse()
      .filter((article) => !article.deleted)
      .toArray()
  ).subscribe({
    next: set,
    error: (error) => console.error('Could not read saved articles', error),
  });

  return () => subscription.unsubscribe();
});

/** Background sync status for the UI. */
export const syncState = writable({
  syncing: false,
  lastSyncAt: null,
  error: '',
  unauthorized: false,
});

// ---------------------------------------------------------------------------
// Mutations (local write + outbox)
// ---------------------------------------------------------------------------

let lastTimestamp = 0;

/**
 * Monotonic millisecond timestamp. Using `max(now, previous + 1)` prevents two
 * rapid local edits from sharing an `updatedAt`, which keeps LWW deterministic.
 */
function nextTimestamp() {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return lastTimestamp;
}

/**
 * Seed the local clock from the last server time we saw. This keeps writes made
 * offline on a device with a slow clock from losing LWW conflicts later.
 */
export async function primeClock() {
  lastTimestamp = Math.max(lastTimestamp, await metaNumber(SERVER_TIME_KEY, 0));
  return lastTimestamp;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toOutbox(article) {
  return {
    id: article.id,
    url: article.url,
    title: article.title ?? '',
    status: article.status === 'read' ? 'read' : 'unread',
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    deleted: article.deleted ? 1 : 0,
  };
}

async function saveArticle(article, { schedule = true } = {}) {
  await db.transaction('rw', db.articles, db.outbox, async () => {
    await db.articles.put(article);
    await db.outbox.put(toOutbox(article));
  });

  if (schedule) scheduleSync();
}

export async function addArticle(url, title = '') {
  const timestamp = nextTimestamp();
  const article = {
    id: newId(),
    url,
    title,
    status: 'unread',
    createdAt: timestamp,
    updatedAt: timestamp,
    deleted: 0,
  };

  await saveArticle(article);
  return article.id;
}

export async function setArticleStatus(id, status) {
  const existing = await db.articles.get(id);
  if (!existing || existing.deleted) return;
  if (existing.status === status) return;

  await saveArticle({
    ...existing,
    status: status === 'read' ? 'read' : 'unread',
    updatedAt: nextTimestamp(),
  });
}

export async function updateArticleTitle(id, title) {
  const existing = await db.articles.get(id);
  if (!existing || existing.deleted) return;

  const clean = String(title ?? '').trim().slice(0, 500);
  if (!clean || existing.title === clean) return;

  await saveArticle({
    ...existing,
    title: clean,
    updatedAt: nextTimestamp(),
  });
}

/**
 * Tombstone instead of a hard delete. Tombstones are pushed to D1 so other
 * devices learn about the deletion, and are hidden from the live list.
 */
export async function deleteArticle(id) {
  const existing = await db.articles.get(id);
  if (!existing || existing.deleted) return;

  await saveArticle({
    ...existing,
    deleted: 1,
    updatedAt: nextTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Legacy migration
// ---------------------------------------------------------------------------

let legacyMigrated = false;

/**
 * Move rows staged by database version 2 into the synced `articles` table.
 * Runs at most once per page load.
 */
export async function migrateLegacyArticles() {
  if (legacyMigrated) return 0;

  let legacy;
  try {
    legacy = await db.legacyArticles.toArray();
  } catch {
    legacyMigrated = true;
    return 0;
  }

  if (!legacy.length) {
    legacyMigrated = true;
    return 0;
  }

  let migrated = 0;

  for (const row of legacy) {
    try {
      const existing = await db.articles.where('url').equals(row.url).first();
      if (!existing || existing.deleted) {
        const timestamp = Number.isFinite(row.createdAt) ? row.createdAt : nextTimestamp();
        await saveArticle(
          {
            id: newId(),
            url: row.url,
            title: row.title ?? '',
            status: row.status === 'read' ? 'read' : 'unread',
            createdAt: timestamp,
            updatedAt: timestamp,
            deleted: 0,
          },
          { schedule: false }
        );
        migrated += 1;
      }

      await db.legacyArticles.delete(row.id);
    } catch (error) {
      console.error('Could not migrate a locally saved article', error);
      return migrated;
    }
  }

  legacyMigrated = true;
  if (migrated) scheduleSync(0);
  return migrated;
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

async function metaNumber(key, fallback = 0) {
  try {
    const record = await db.meta.get(key);
    return Number.isFinite(record?.value) ? record.value : fallback;
  } catch {
    return fallback;
  }
}

function normalizeServerRow(row) {
  if (!row || typeof row !== 'object') return null;

  const id = typeof row.id === 'string' ? row.id : '';
  const url = typeof row.url === 'string' ? row.url : '';
  if (!id || !url) return null;

  const createdAt = Math.floor(Number(row.createdAt));
  const updatedAt = Math.floor(Number(row.updatedAt));
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;

  return {
    id,
    url,
    title: typeof row.title === 'string' ? row.title : '',
    status: row.status === 'read' ? 'read' : 'unread',
    createdAt,
    updatedAt,
    deleted: row.deleted ? 1 : 0,
  };
}

async function applyServerRow(row) {
  const article = normalizeServerRow(row);
  if (!article) return false;

  const local = await db.articles.get(article.id);
  if (local && local.updatedAt > article.updatedAt) {
    // Local change is newer; the outbox will push it on the next round.
    return false;
  }

  if (article.deleted) await db.articles.delete(article.id);
  else await db.articles.put(article);

  await db.outbox.delete(article.id);
  return true;
}

async function pushOutbox() {
  const token = getToken();
  if (!token) throw new UnauthorizedError('Locked');

  let pushed = 0;

  for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
    const batch = await db.outbox.orderBy('updatedAt').limit(OUTBOX_BATCH_SIZE).toArray();
    if (!batch.length) break;

    const response = await pushBookmarks(
      token,
      batch.map((row) => toOutbox(row))
    );

    const authoritative = Array.isArray(response?.bookmarks) ? response.bookmarks : [];
    const rejected = new Set((response?.rejected ?? []).map((entry) => entry.id));
    const authoritativeIds = new Set(authoritative.map((row) => row.id));

    await db.transaction('rw', db.articles, db.outbox, async () => {
      for (const sent of batch) {
        if (rejected.has(sent.id)) {
          // Invalid rows would otherwise block every future sync round.
          console.warn('Dropping invalid bookmark from outbox', sent.id);
          await db.outbox.delete(sent.id);
          continue;
        }

        if (!authoritativeIds.has(sent.id)) continue;

        const current = await db.outbox.get(sent.id);
        // Keep a newer local edit that happened while the request was in flight.
        if (current && current.updatedAt > sent.updatedAt) continue;
        await db.outbox.delete(sent.id);
      }

      for (const row of authoritative) {
        await applyServerRow(row);
      }
    });

    pushed += batch.length;
    if (batch.length < OUTBOX_BATCH_SIZE) break;
  }

  return pushed;
}

async function pullChanges() {
  const token = getToken();
  if (!token) throw new UnauthorizedError('Locked');

  const since = await metaNumber(PULL_CURSOR_KEY, 0);
  const response = await pullBookmarks(token, since);
  const rows = Array.isArray(response?.bookmarks) ? response.bookmarks : [];
  const serverTime = Number(response?.serverTime) || Date.now();

  // Rebase the local clock on the server's clock so this device's next write
  // is newer than everything the server has already seen.
  lastTimestamp = Math.max(lastTimestamp, serverTime);

  let cursor = since;

  await db.transaction('rw', db.articles, db.outbox, db.meta, async () => {
    for (const row of rows) {
      const article = normalizeServerRow(row);
      if (!article) continue;

      cursor = Math.max(cursor, article.updatedAt);
      await applyServerRow(article);
    }

    await db.meta.put({ key: PULL_CURSOR_KEY, value: cursor });
    await db.meta.put({ key: SERVER_TIME_KEY, value: serverTime });
  });

  return rows.length;
}

let syncInFlight = null;

/**
 * Push local changes, then pull remote ones. Returns true when the round
 * completed, false when the app is locked.
 */
export function syncNow() {
  if (!getToken()) return Promise.resolve(false);
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    syncState.update((state) => ({
      ...state,
      syncing: true,
      error: '',
      unauthorized: false,
    }));

    try {
      await migrateLegacyArticles();
      await pushOutbox();
      await pullChanges();

      syncState.update((state) => ({
        ...state,
        syncing: false,
        lastSyncAt: Date.now(),
        error: '',
      }));

      return true;
    } catch (error) {
      const unauthorized = error instanceof UnauthorizedError;
      syncState.update((state) => ({
        ...state,
        syncing: false,
        unauthorized,
        error: unauthorized
          ? 'The sync server rejected this PIN.'
          : error?.message || 'Sync failed.',
      }));
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Best-effort push used when locking so queued edits are not left behind. */
export async function flushPendingChanges() {
  try {
    await pushOutbox();
  } catch (error) {
    console.warn('Could not flush pending changes before locking', error);
  }
}

// ---------------------------------------------------------------------------
// Background scheduling
// ---------------------------------------------------------------------------

let syncTimer = null;
let syncLoopStarted = false;
let syncInterval = null;

export function scheduleSync(delay = 1200) {
  if (!getToken() || typeof window === 'undefined') return;

  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow().catch(() => {
      // syncState already carries the error for the UI.
    });
  }, delay);
}

export function startSyncLoop() {
  if (syncLoopStarted || typeof window === 'undefined') return;
  syncLoopStarted = true;

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  syncInterval = setInterval(() => {
    if (getToken()) syncNow().catch(() => {});
  }, 60_000);
}

export function stopSyncLoop() {
  if (!syncLoopStarted) return;
  syncLoopStarted = false;

  window.removeEventListener('online', handleOnline);
  document.removeEventListener('visibilitychange', handleVisibility);
  clearInterval(syncInterval);
  clearTimeout(syncTimer);
}

function handleOnline() {
  syncNow().catch(() => {});
}

function handleVisibility() {
  if (document.visibilityState === 'visible' && getToken()) {
    syncNow().catch(() => {});
  }
}
