const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3450;
const DB_PATH = path.join(__dirname, 'db', 'apartments.db');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const DEFAULT_GROUP_NAME = 'התסקיר שלנו';
const DEFAULT_CATEGORIES = [
  'מיקום',
  'בעל הבית',
  'סביבת הבניין',
  'ערך תמורה למחיר (Value for Money)',
  'מצב הדירה ותחזוקה',
  'אור טבעי ואוורור',
  'מטבח ואחסון',
  'רעש ושכנים',
  'קרבה לתחבורה/עבודה',
  'מרפסת / חוץ'
];

function newBoardToken() {
  return crypto.randomBytes(9).toString('base64url'); // 12 url-safe chars
}

// ---------- Schema (fresh installs get board_id columns from the start) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apartments (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  rooms REAL,
  price INTEGER,
  arnona INTEGER,
  vaad_bayit INTEGER,
  contact_name TEXT,
  contact_phone TEXT,
  pros TEXT DEFAULT '',
  cons TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'בבדיקה',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ratings (
  apartment_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  rater TEXT NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (apartment_id, category_id, rater),
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  apartment_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS raters (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  board_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (board_id, key)
);
`);

function ensureColumn(table, column, ddlType) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
    return true; // column was missing before this call
  }
  return false;
}

// Pre-existing databases predate the rooms field. Add it once without touching saved rows.
ensureColumn('apartments', 'rooms', 'REAL');

// ---------- Multi-tenant migration ----------
// Any of these being newly-added means this database predates boards entirely
// (a single shared apartment list) and needs everything folded into one legacy board.
const apartmentsWereBoardless = ensureColumn('apartments', 'board_id', 'TEXT');
const categoriesWereBoardless = ensureColumn('categories', 'board_id', 'TEXT');
const ratersWereBoardless = ensureColumn('raters', 'board_id', 'TEXT');

const settingsCols = db.prepare('PRAGMA table_info(settings)').all();
const settingsWereLegacy = settingsCols.length > 0 && !settingsCols.some(c => c.name === 'board_id');
let legacySettingsRows = [];
if (settingsWereLegacy) {
  legacySettingsRows = db.prepare('SELECT key, value FROM settings').all();
  db.exec('ALTER TABLE settings RENAME TO settings_legacy');
  db.exec(`CREATE TABLE settings (
    board_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (board_id, key)
  )`);
  db.exec('DROP TABLE settings_legacy');
}

function ensureBoardDefaults(boardId, opts = {}) {
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE board_id = ?').get(boardId).c;
  if (catCount === 0) {
    const insert = db.prepare('INSERT INTO categories (id, board_id, name, sort_order) VALUES (?, ?, ?, ?)');
    DEFAULT_CATEGORIES.forEach((name, i) => insert.run(crypto.randomUUID(), boardId, name, i));
  }
  const raterCount = db.prepare('SELECT COUNT(*) AS c FROM raters WHERE board_id = ?').get(boardId).c;
  if (raterCount === 0) {
    const names = opts.raterNames || ['מדרג/ת 1', 'מדרג/ת 2'];
    const insert = db.prepare('INSERT INTO raters (id, board_id, name, sort_order) VALUES (?, ?, ?, ?)');
    names.forEach((name, i) => insert.run(crypto.randomUUID(), boardId, name, i));
  }
  const hasGroupName = db.prepare('SELECT 1 FROM settings WHERE board_id = ? AND key = ?').get(boardId, 'group_name');
  if (!hasGroupName) {
    db.prepare('INSERT INTO settings (board_id, key, value) VALUES (?, ?, ?)')
      .run(boardId, 'group_name', opts.groupName || DEFAULT_GROUP_NAME);
  }
}

if (apartmentsWereBoardless || categoriesWereBoardless || ratersWereBoardless || settingsWereLegacy) {
  const legacyBoardId = newBoardToken();
  db.prepare('INSERT INTO boards (id, created_at) VALUES (?, ?)').run(legacyBoardId, new Date().toISOString());
  db.prepare('UPDATE apartments SET board_id = ? WHERE board_id IS NULL').run(legacyBoardId);
  db.prepare('UPDATE categories SET board_id = ? WHERE board_id IS NULL').run(legacyBoardId);
  db.prepare('UPDATE raters SET board_id = ? WHERE board_id IS NULL').run(legacyBoardId);
  if (legacySettingsRows.length) {
    const insertSetting = db.prepare(`INSERT INTO settings (board_id, key, value) VALUES (?, ?, ?)
      ON CONFLICT(board_id, key) DO UPDATE SET value = excluded.value`);
    legacySettingsRows.forEach(row => insertSetting.run(legacyBoardId, row.key, row.value));
  }
  // Older installs had no `raters` table at all — rater names lived only as free-text
  // values on each rating row (e.g. the old hardcoded 'שחר'/'ענבל'). Recover them so the
  // legacy board keeps its real people instead of falling back to generic placeholders.
  const legacyRaterNames = db.prepare(`SELECT DISTINCT rater FROM ratings WHERE apartment_id IN
    (SELECT id FROM apartments WHERE board_id = ?) ORDER BY rater`).all(legacyBoardId).map(r => r.rater);
  ensureBoardDefaults(legacyBoardId, { raterNames: legacyRaterNames.length ? legacyRaterNames : undefined });
  console.log('='.repeat(64));
  console.log('הנתונים הקיימים הפכו לתסקיר משלהם. הכתובת לגישה אליהם:');
  console.log(`  http://localhost:${PORT}/b/${legacyBoardId}`);
  console.log('שמרו את הקישור הזה — הוא הדרך היחידה לחזור לנתונים האלה.');
  console.log('='.repeat(64));
}

function currentRaterNames(boardId) {
  return db.prepare('SELECT name FROM raters WHERE board_id = ? ORDER BY sort_order').all(boardId).map(r => r.name);
}

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('רק קבצי תמונה מותרים'));
  }
});

function serializeApartment(row) {
  const images = db.prepare('SELECT id, filename FROM images WHERE apartment_id = ? ORDER BY created_at').all(row.id);
  const ratings = db.prepare('SELECT category_id, rater, score FROM ratings WHERE apartment_id = ?').all(row.id);
  return { ...row, images, ratings };
}

// ---------- Pages ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/b/:id', (req, res) => {
  const board = db.prepare('SELECT 1 FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Boards ----------
app.post('/api/boards', (req, res) => {
  const id = newBoardToken();
  db.prepare('INSERT INTO boards (id, created_at) VALUES (?, ?)').run(id, new Date().toISOString());
  const groupName = (req.body && req.body.group_name && req.body.group_name.trim()) || DEFAULT_GROUP_NAME;
  ensureBoardDefaults(id, { groupName });
  res.json({ id });
});

app.param('boardId', (req, res, next, boardId) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
  if (!board) return res.status(404).json({ error: 'התסקיר לא נמצא' });
  req.boardId = boardId;
  next();
});

// ---------- Categories ----------
app.get('/api/boards/:boardId/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE board_id = ? ORDER BY sort_order').all(req.boardId));
});

app.post('/api/boards/:boardId/categories', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'שם קטגוריה חסר' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE board_id = ?').get(req.boardId).m;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO categories (id, board_id, name, sort_order) VALUES (?, ?, ?, ?)').run(id, req.boardId, name.trim(), maxOrder + 1);
  res.json({ id, name: name.trim(), sort_order: maxOrder + 1 });
});

app.put('/api/boards/:boardId/categories/:id', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE categories SET name = ? WHERE id = ? AND board_id = ?').run(name, req.params.id, req.boardId);
  res.json({ ok: true });
});

app.delete('/api/boards/:boardId/categories/:id', (req, res) => {
  db.prepare('DELETE FROM ratings WHERE category_id = ? AND category_id IN (SELECT id FROM categories WHERE board_id = ?)').run(req.params.id, req.boardId);
  db.prepare('DELETE FROM categories WHERE id = ? AND board_id = ?').run(req.params.id, req.boardId);
  res.json({ ok: true });
});

// ---------- Apartments ----------
app.get('/api/boards/:boardId/apartments', (req, res) => {
  const rows = db.prepare('SELECT * FROM apartments WHERE board_id = ? ORDER BY created_at DESC').all(req.boardId);
  res.json(rows.map(serializeApartment));
});

app.get('/api/boards/:boardId/apartments/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM apartments WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (!row) return res.status(404).json({ error: 'לא נמצא' });
  res.json(serializeApartment(row));
});

app.post('/api/boards/:boardId/apartments', (req, res) => {
  const id = crypto.randomUUID();
  const b = req.body || {};
  db.prepare(`INSERT INTO apartments
    (id, board_id, title, address, rooms, price, arnona, vaad_bayit, contact_name, contact_phone, pros, cons, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
      req.boardId,
      b.title || '',
      b.address || '',
      b.rooms ?? null,
      b.price || null,
      b.arnona || null,
      b.vaad_bayit || null,
      b.contact_name || '',
      b.contact_phone || '',
      b.pros || '',
      b.cons || '',
      b.status || 'בבדיקה',
      new Date().toISOString()
    );
  res.json(serializeApartment(db.prepare('SELECT * FROM apartments WHERE id = ?').get(id)));
});

app.put('/api/boards/:boardId/apartments/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM apartments WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (!existing) return res.status(404).json({ error: 'לא נמצא' });
  const b = req.body || {};
  const merged = { ...existing, ...b };
  db.prepare(`UPDATE apartments SET
      title = ?, address = ?, rooms = ?, price = ?, arnona = ?, vaad_bayit = ?,
      contact_name = ?, contact_phone = ?, pros = ?, cons = ?, status = ?
      WHERE id = ?`)
    .run(
      merged.title, merged.address, merged.rooms ?? null, merged.price || null, merged.arnona || null, merged.vaad_bayit || null,
      merged.contact_name, merged.contact_phone, merged.pros, merged.cons, merged.status,
      req.params.id
    );
  res.json(serializeApartment(db.prepare('SELECT * FROM apartments WHERE id = ?').get(req.params.id)));
});

app.delete('/api/boards/:boardId/apartments/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM apartments WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (!existing) return res.status(404).json({ error: 'לא נמצא' });
  const imgs = db.prepare('SELECT filename FROM images WHERE apartment_id = ?').all(req.params.id);
  imgs.forEach(img => {
    const p = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  db.prepare('DELETE FROM images WHERE apartment_id = ?').run(req.params.id);
  db.prepare('DELETE FROM ratings WHERE apartment_id = ?').run(req.params.id);
  db.prepare('DELETE FROM apartments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Ratings ----------
app.put('/api/boards/:boardId/apartments/:id/ratings', (req, res) => {
  const apt = db.prepare('SELECT id FROM apartments WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (!apt) return res.status(404).json({ error: 'לא נמצא' });
  const { rater, category_id, score } = req.body;
  if (!currentRaterNames(req.boardId).includes(rater)) return res.status(400).json({ error: 'מדרג לא מוכר' });
  if (score === null || score === undefined || score === '') {
    db.prepare('DELETE FROM ratings WHERE apartment_id = ? AND category_id = ? AND rater = ?')
      .run(req.params.id, category_id, rater);
    return res.json({ ok: true, deleted: true });
  }
  db.prepare(`INSERT INTO ratings (apartment_id, category_id, rater, score)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(apartment_id, category_id, rater) DO UPDATE SET score = excluded.score`)
    .run(req.params.id, category_id, rater, Number(score));
  res.json({ ok: true });
});

// ---------- Images ----------
app.post('/api/boards/:boardId/apartments/:id/images', upload.array('images', 20), (req, res) => {
  const apt = db.prepare('SELECT id FROM apartments WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (!apt) return res.status(404).json({ error: 'לא נמצא' });
  const insert = db.prepare('INSERT INTO images (id, apartment_id, filename, created_at) VALUES (?, ?, ?, ?)');
  const created = [];
  (req.files || []).forEach(f => {
    const id = crypto.randomUUID();
    insert.run(id, req.params.id, f.filename, new Date().toISOString());
    created.push({ id, filename: f.filename });
  });
  res.json(created);
});

app.delete('/api/boards/:boardId/images/:id', (req, res) => {
  const img = db.prepare(`SELECT images.* FROM images
    JOIN apartments ON apartments.id = images.apartment_id
    WHERE images.id = ? AND apartments.board_id = ?`).get(req.params.id, req.boardId);
  if (img) {
    const p = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// ---------- Raters ----------
app.get('/api/boards/:boardId/raters', (req, res) => {
  res.json(db.prepare('SELECT * FROM raters WHERE board_id = ? ORDER BY sort_order').all(req.boardId));
});

app.post('/api/boards/:boardId/raters', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'שם חסר' });
  const trimmed = name.trim();
  if (currentRaterNames(req.boardId).includes(trimmed)) return res.status(400).json({ error: 'כבר קיים מדרג בשם הזה' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM raters WHERE board_id = ?').get(req.boardId).m;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO raters (id, board_id, name, sort_order) VALUES (?, ?, ?, ?)').run(id, req.boardId, trimmed, maxOrder + 1);
  res.json({ id, name: trimmed, sort_order: maxOrder + 1 });
});

app.put('/api/boards/:boardId/raters/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'שם חסר' });
  const existing = db.prepare('SELECT * FROM raters WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (!existing) return res.status(404).json({ error: 'לא נמצא' });
  const trimmed = name.trim();
  db.prepare('UPDATE raters SET name = ? WHERE id = ?').run(trimmed, req.params.id);
  if (trimmed !== existing.name) {
    db.prepare(`UPDATE ratings SET rater = ? WHERE rater = ? AND apartment_id IN
      (SELECT id FROM apartments WHERE board_id = ?)`).run(trimmed, existing.name, req.boardId);
  }
  res.json({ ok: true });
});

app.delete('/api/boards/:boardId/raters/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM raters WHERE id = ? AND board_id = ?').get(req.params.id, req.boardId);
  if (existing) {
    db.prepare(`DELETE FROM ratings WHERE rater = ? AND apartment_id IN
      (SELECT id FROM apartments WHERE board_id = ?)`).run(existing.name, req.boardId);
    db.prepare('DELETE FROM raters WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// ---------- Settings ----------
app.get('/api/boards/:boardId/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE board_id = ?').all(req.boardId);
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  res.json(out);
});

app.put('/api/boards/:boardId/settings', (req, res) => {
  const { group_name } = req.body || {};
  if (group_name !== undefined) {
    const trimmed = (group_name || '').trim() || DEFAULT_GROUP_NAME;
    db.prepare(`INSERT INTO settings (board_id, key, value) VALUES (?, 'group_name', ?)
      ON CONFLICT(board_id, key) DO UPDATE SET value = excluded.value`).run(req.boardId, trimmed);
  }
  const rows = db.prepare('SELECT key, value FROM settings WHERE board_id = ?').all(req.boardId);
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  res.json(out);
});

app.listen(PORT, () => {
  console.log(`Apartment rater running on http://localhost:${PORT}`);
});
