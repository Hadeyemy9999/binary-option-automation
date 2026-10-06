const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/signals.db';
const resolvedDbDir = path.dirname(path.resolve(__dirname, '../../', dbPath));

if (!fs.existsSync(resolvedDbDir)) {
  fs.mkdirSync(resolvedDbDir, { recursive: true });
}

const resolvedDbPath = path.resolve(__dirname, '../../', dbPath);
const db = new DatabaseSync(resolvedDbPath);

// Enable WAL mode and foreign keys for performance and data integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'USER' CHECK(role IN ('USER', 'VIP', 'ADMIN')),
    tier TEXT DEFAULT 'FREE' CHECK(tier IN ('FREE', 'PRO', 'VIP_SIGNALS')),
    phone_number TEXT,
    phone_verified INTEGER DEFAULT 0,
    telegram_chat_id TEXT,
    telegram_username TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('PHONE_OTP', 'EMAIL_VERIFY', 'PASSWORD_RESET', 'TELEGRAM_LINK')),
    code TEXT NOT NULL,
    target_value TEXT,
    expires_at DATETIME NOT NULL,
    is_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('CALL', 'PUT')),
    timeframe TEXT NOT NULL,
    expiry_minutes INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACTIVE', 'WIN', 'LOSS', 'TIE', 'CANCELLED')),
    confidence INTEGER DEFAULT 80,
    source TEXT DEFAULT 'ENGINE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );
`);

module.exports = db;
