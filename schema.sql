-- Cloudflare D1 Database Schema for AI Voice Studio
-- Manages multi-user voice chat sessions, metadata, summaries, and transcripts.

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    provider TEXT DEFAULT 'deepseek',
    model TEXT DEFAULT 'deepseek-chat',
    system_prompt TEXT,
    summary TEXT,
    transcript TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id, created_at DESC);
