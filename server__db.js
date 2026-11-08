const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'game.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT UNIQUE COLLATE NOCASE NOT NULL, password_hash TEXT NOT NULL, isAdmin INTEGER DEFAULT 0, starter_pack_claimed INTEGER DEFAULT 0, scrap INTEGER DEFAULT 1000, banned INTEGER DEFAULT 0, ban_reason TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS players(user_id INTEGER PRIMARY KEY, x REAL, y REAL, z REAL, rotation REAL DEFAULT 0, hp REAL DEFAULT 70, hunger REAL DEFAULT 100, thirst REAL DEFAULT 100, kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0, playtime INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory(user_id INTEGER, slot INTEGER, item_id TEXT, count INTEGER, durability REAL, skin TEXT, PRIMARY KEY(user_id,slot));
CREATE TABLE IF NOT EXISTS equipment(user_id INTEGER, slot TEXT, item_id TEXT, durability REAL, PRIMARY KEY(user_id,slot));
CREATE TABLE IF NOT EXISTS buildings(id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER, type TEXT, x REAL, y REAL, z REAL, rotation REAL, hp REAL, tier INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS doors(id INTEGER PRIMARY KEY, x REAL, y REAL, z REAL, owner_id INTEGER, hp REAL, lock_type TEXT DEFAULT 'none', code TEXT);
CREATE TABLE IF NOT EXISTS cupboards(id INTEGER PRIMARY KEY, owner_id INTEGER, x REAL, y REAL, z REAL, hp REAL);
CREATE TABLE IF NOT EXISTS cupboard_members(cupboard_id INTEGER, user_id INTEGER, PRIMARY KEY(cupboard_id,user_id));
CREATE TABLE IF NOT EXISTS chests(id INTEGER PRIMARY KEY, x REAL, y REAL, z REAL, contents_json TEXT);
CREATE TABLE IF NOT EXISTS loot_bags(id INTEGER PRIMARY KEY AUTOINCREMENT, x REAL, y REAL, z REAL, contents_json TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS world_resources(id INTEGER PRIMARY KEY, type TEXT, x REAL, y REAL, z REAL, respawn_at INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, from_user_id INTEGER, to_user_id INTEGER, theme TEXT, text TEXT, screenshot_path TEXT, status TEXT DEFAULT 'open', created_at INTEGER);
CREATE TABLE IF NOT EXISTS admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT, target_id INTEGER, timestamp INTEGER);
CREATE TABLE IF NOT EXISTS user_skins(user_id INTEGER, skin_id TEXT, active INTEGER DEFAULT 0, PRIMARY KEY(user_id,skin_id));
CREATE TABLE IF NOT EXISTS user_cases(user_id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS shop_items(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, skin_id TEXT, price INTEGER);
CREATE TABLE IF NOT EXISTS pending_items(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, item_id TEXT, count INTEGER);
CREATE TABLE IF NOT EXISTS ip_bans(ip TEXT PRIMARY KEY, reason TEXT);
`);

// ===== Фиксированный админ-аккаунт (захардкожен). Создаётся только если его ещё нет. =====
const ADMIN_LOGIN = 'ADAM';
const ADMIN_PASSWORD = 'Denis120';
function ensureAdmin() {
  const row = db.prepare('SELECT id FROM users WHERE login = ?').get(ADMIN_LOGIN);
  if (row) return;
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const r = db.prepare('INSERT INTO users(login,password_hash,isAdmin,created_at) VALUES(?,?,1,?)').run(ADMIN_LOGIN, hash, Date.now());
  db.prepare('INSERT OR IGNORE INTO players(user_id) VALUES(?)').run(r.lastInsertRowid);
  console.log('[db] Создан админ-аккаунт ADAM');
}
ensureAdmin();
module.exports = db;
