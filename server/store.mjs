import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class SocialStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS marks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, page_index INTEGER NOT NULL,
        rects TEXT NOT NULL, quote TEXT NOT NULL, comment TEXT NOT NULL,
        author_name TEXT NOT NULL, author_kind TEXT NOT NULL,
        owner_id TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(document_id) REFERENCES documents(id)
      );
      CREATE INDEX IF NOT EXISTS marks_by_page ON marks(document_id, page_index);
      CREATE TABLE IF NOT EXISTS replies (
        id TEXT PRIMARY KEY, mark_id TEXT NOT NULL, body TEXT NOT NULL,
        author_name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(mark_id) REFERENCES marks(id)
      );
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, owner_id TEXT NOT NULL,
        page_index INTEGER NOT NULL, quote TEXT NOT NULL, comment TEXT NOT NULL,
        kind TEXT NOT NULL, created_at TEXT NOT NULL, published_mark_id TEXT,
        FOREIGN KEY(document_id) REFERENCES documents(id)
      );
    `);
    this.queries = {
      insertDocument: this.db.prepare('INSERT OR IGNORE INTO documents VALUES (?, ?, ?)'),
      getDocument: this.db.prepare('SELECT * FROM documents WHERE id = ?'),
      insertMark: this.db.prepare('INSERT INTO marks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      getMark: this.db.prepare('SELECT * FROM marks WHERE id = ?'),
      listMarks: this.db.prepare('SELECT * FROM marks WHERE document_id = ? AND page_index = ? ORDER BY created_at, id'),
      listAllMarks: this.db.prepare('SELECT * FROM marks WHERE document_id = ? ORDER BY page_index, created_at, id'),
      insertReply: this.db.prepare('INSERT INTO replies VALUES (?, ?, ?, ?, ?, ?)'),
      listReplies: this.db.prepare('SELECT * FROM replies WHERE mark_id = ? ORDER BY created_at, id'),
      insertDraft: this.db.prepare('INSERT INTO drafts VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'),
      getDraft: this.db.prepare('SELECT * FROM drafts WHERE id = ?'),
      listDrafts: this.db.prepare('SELECT * FROM drafts WHERE document_id = ? AND owner_id = ? AND published_mark_id IS NULL ORDER BY page_index, created_at'),
      publishDraft: this.db.prepare('UPDATE drafts SET published_mark_id = ? WHERE id = ? AND published_mark_id IS NULL'),
    };
  }

  ensureDocument(id, title) {
    this.queries.insertDocument.run(id, title, new Date().toISOString());
    return this.queries.getDocument.get(id);
  }

  getDocument(id) { return this.queries.getDocument.get(id); }

  addMark(value) {
    const mark = {
      id: randomUUID(), documentId: value.documentId, pageIndex: value.pageIndex,
      rects: value.rects, quote: value.quote, comment: value.comment,
      authorName: value.authorName, authorKind: value.authorKind,
      ownerId: value.ownerId, createdAt: new Date().toISOString(),
    };
    this.queries.insertMark.run(
      mark.id, mark.documentId, mark.pageIndex, JSON.stringify(mark.rects),
      mark.quote, mark.comment, mark.authorName, mark.authorKind,
      mark.ownerId, mark.createdAt,
    );
    return mark;
  }

  getMark(id) { return hydrateMark(this.queries.getMark.get(id)); }

  listMarks(documentId, pageIndex = null) {
    const rows = pageIndex === null
      ? this.queries.listAllMarks.all(documentId)
      : this.queries.listMarks.all(documentId, pageIndex);
    return rows.map(hydrateMark);
  }

  addReply(value) {
    const reply = {
      id: randomUUID(), markId: value.markId, body: value.body,
      authorName: value.authorName, ownerId: value.ownerId,
      createdAt: new Date().toISOString(),
    };
    this.queries.insertReply.run(...Object.values(reply));
    return reply;
  }

  listReplies(markId) {
    return this.queries.listReplies.all(markId).map(row => ({
      id: row.id, markId: row.mark_id, body: row.body,
      authorName: row.author_name, ownerId: row.owner_id, createdAt: row.created_at,
    }));
  }

  addDrafts(documentId, ownerId, drafts) {
    return drafts.map(value => {
      const draft = {
        id: randomUUID(), documentId, ownerId, pageIndex: value.pageIndex,
        quote: value.quote, comment: value.comment, kind: value.kind,
        createdAt: new Date().toISOString(),
      };
      this.queries.insertDraft.run(...Object.values(draft));
      return draft;
    });
  }

  getDraft(id) { return hydrateDraft(this.queries.getDraft.get(id)); }

  listDrafts(documentId, ownerId) {
    return this.queries.listDrafts.all(documentId, ownerId).map(hydrateDraft);
  }

  publishDraft(id, markId) {
    return this.queries.publishDraft.run(markId, id).changes === 1;
  }

  close() { this.db.close(); }
}

function hydrateMark(row) {
  if (!row) return null;
  return {
    id: row.id, documentId: row.document_id, pageIndex: row.page_index,
    rects: JSON.parse(row.rects), quote: row.quote, comment: row.comment,
    authorName: row.author_name, authorKind: row.author_kind,
    ownerId: row.owner_id, createdAt: row.created_at,
  };
}

function hydrateDraft(row) {
  if (!row) return null;
  return {
    id: row.id, documentId: row.document_id, ownerId: row.owner_id,
    pageIndex: row.page_index, quote: row.quote, comment: row.comment,
    kind: row.kind, createdAt: row.created_at,
    publishedMarkId: row.published_mark_id,
  };
}
