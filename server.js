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

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS apartments (
  id TEXT PRIMARY KEY,
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
`);

// Existing databases predate the rooms field. Add it once without touching saved rows.
const apartmentColumns = db.prepare('PRAGMA table_info(apartments)').all();
if (!apartmentColumns.some(column => column.name === 'rooms')) {
  db.exec('ALTER TABLE apartments ADD COLUMN rooms REAL');
}

// Seed default categories if none exist
const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
if (catCount === 0) {
  const defaults = [
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
  const insert = db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)');
  defaults.forEach((name, i) => insert.run(crypto.randomUUID(), name, i));
}

const RATERS = ['שחר', 'ענבל'];

// ---------- App ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// ---------- Categories ----------
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order').all());
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'שם קטגוריה חסר' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories').get().m;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)').run(id, name.trim(), maxOrder + 1);
  res.json({ id, name: name.trim(), sort_order: maxOrder + 1 });
});

app.put('/api/categories/:id', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/categories/:id', (req, res) => {
  db.prepare('DELETE FROM ratings WHERE category_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Apartments ----------
app.get('/api/apartments', (req, res) => {
  const rows = db.prepare('SELECT * FROM apartments ORDER BY created_at DESC').all();
  res.json(rows.map(serializeApartment));
});

app.get('/api/apartments/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM apartments WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'לא נמצא' });
  res.json(serializeApartment(row));
});

app.post('/api/apartments', (req, res) => {
  const id = crypto.randomUUID();
  const b = req.body || {};
  db.prepare(`INSERT INTO apartments
    (id, title, address, rooms, price, arnona, vaad_bayit, contact_name, contact_phone, pros, cons, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id,
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

app.put('/api/apartments/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM apartments WHERE id = ?').get(req.params.id);
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

app.delete('/api/apartments/:id', (req, res) => {
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
app.put('/api/apartments/:id/ratings', (req, res) => {
  const { rater, category_id, score } = req.body;
  if (!RATERS.includes(rater)) return res.status(400).json({ error: 'מדרג לא מוכר' });
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
app.post('/api/apartments/:id/images', upload.array('images', 20), (req, res) => {
  const apt = db.prepare('SELECT id FROM apartments WHERE id = ?').get(req.params.id);
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

app.delete('/api/images/:id', (req, res) => {
  const img = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (img) {
    const p = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

app.get('/api/raters', (req, res) => res.json(RATERS));

app.listen(PORT, () => {
  console.log(`Apartment rater running on http://localhost:${PORT}`);
});
