-- Initial schema for the Read-It-Later sync backend.
--
-- Column names intentionally mirror the IndexedDB schema in src/lib/db.js so
-- rows can move between the local database and D1 without any field mapping.
--
-- Timestamps are Unix epoch milliseconds. `deleted` is a tombstone flag: rows
-- are never hard-deleted on the server, which lets every device learn about a
-- deletion during an incremental pull.

CREATE TABLE IF NOT EXISTS articles (
  id        TEXT PRIMARY KEY NOT NULL,
  url       TEXT NOT NULL,
  title     TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deleted   INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);

-- Incremental pulls filter and sort by updatedAt.
CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles (updatedAt);

-- Used for duplicate-URL lookups and future server-side maintenance.
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles (url);
