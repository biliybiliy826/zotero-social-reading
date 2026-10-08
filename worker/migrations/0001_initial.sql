CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  doi TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'admin')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  page_index INTEGER NOT NULL CHECK (page_index >= 0),
  rects_json TEXT NOT NULL,
  quote TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES users(id),
  author_kind TEXT NOT NULL CHECK (author_kind IN ('human', 'ai')),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS marks_by_document_page
  ON marks(document_id, page_index, created_at);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  mark_id TEXT NOT NULL REFERENCES marks(id),
  body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS replies_by_mark ON replies(mark_id, created_at);

-- A guide is shared only after its creator explicitly publishes the preview.
-- Exact PDF SHA-256 plus tier and prompt version prevent accidental reuse across editions.
CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  tier TEXT NOT NULL CHECK (tier IN ('beginner', 'standard', 'concise')),
  prompt_version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(document_id, tier, prompt_version)
);
