import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";

const databasePath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "data.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS wiki_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'internal',
    author TEXT NOT NULL DEFAULT 'agent',
    word_count INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    last_checked TEXT,
    last_commit_sha TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    poll_interval_minutes INTEGER NOT NULL DEFAULT 10,
    visibility TEXT NOT NULL DEFAULT 'private'
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    action TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS build_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id TEXT NOT NULL UNIQUE,
    audience TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    reason TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notebook_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id TEXT NOT NULL,
    source_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    summary TEXT,
    last_synced TEXT
  );
`);
