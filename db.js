import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const db = new Database(join(__dirname, 'thewall.db'))

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL')

// Create tables and indexes
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    body TEXT NOT NULL,
    original_topic TEXT NOT NULL,
    original_body TEXT NOT NULL,
    edit_count INTEGER DEFAULT 0,
    claimed INTEGER DEFAULT 0,
    claim_hash TEXT,
    fingerprint TEXT,
    language TEXT,
    day_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_day ON posts(day_key, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at DESC);
`)

// --- Prepared statements ---

const stmtInsert = db.prepare(`
  INSERT INTO posts (id, topic, body, original_topic, original_body, fingerprint, day_key)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const stmtGetById = db.prepare(
  'SELECT * FROM posts WHERE id = ?'
)

const stmtGetByDay = db.prepare(
  'SELECT * FROM posts WHERE day_key = ? ORDER BY created_at DESC LIMIT 50'
)

const stmtUpdate = db.prepare(`
  UPDATE posts
  SET topic = ?, body = ?, edit_count = edit_count + 1, updated_at = datetime('now')
  WHERE id = ?
`)

const stmtClaim = db.prepare(`
  UPDATE posts
  SET claimed = 1, claim_hash = ?, updated_at = datetime('now')
  WHERE id = ?
`)

const stmtRandomUnclaimed = db.prepare(
  'SELECT * FROM posts WHERE claimed = 0 ORDER BY RANDOM() LIMIT 1'
)

const stmtCountByDay = db.prepare(
  'SELECT COUNT(*) as count FROM posts WHERE day_key = ?'
)

const stmtCountBotByDay = db.prepare(
  'SELECT COUNT(*) as count FROM posts WHERE day_key = ? AND fingerprint IS NULL'
)

const stmtDeleteOld = db.prepare(
  'DELETE FROM posts WHERE day_key < ?'
)

// --- Exported helpers ---

export function todayKey() {
  return new Date().toISOString().split('T')[0]
}

export function createPost({ topic, body, fingerprint, dayKey }) {
  const id = nanoid()
  stmtInsert.run(id, topic, body, topic, body, fingerprint, dayKey)
  return stmtGetById.get(id)
}

export function editPost(id, { topic, body }) {
  stmtUpdate.run(topic, body, id)
  return stmtGetById.get(id)
}

export function claimPost(id, hash) {
  stmtClaim.run(hash, id)
  return stmtGetById.get(id)
}

export function getPost(id) {
  return stmtGetById.get(id)
}

export function getPostsForDay(dayKey) {
  return stmtGetByDay.all(dayKey)
}

export function getRandomUnclaimedPost() {
  return stmtRandomUnclaimed.get()
}

export function getDayPostCount(dayKey) {
  return stmtCountByDay.get(dayKey).count
}

export function getBotPostCount(dayKey) {
  return stmtCountBotByDay.get(dayKey).count
}

export function purgeOldPosts(cutoffKey) {
  return stmtDeleteOld.run(cutoffKey)
}

export default db
