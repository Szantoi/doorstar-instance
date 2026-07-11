-- Telegram Conversation History Database Schema
-- Created: 2026-07-03
-- Purpose: Track Telegram message history for conversation context

CREATE TABLE IF NOT EXISTS telegram_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  conversation_id INTEGER,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  from_type TEXT NOT NULL CHECK(from_type IN ('user', 'bot')),
  terminal TEXT,
  chat_type TEXT DEFAULT 'private' CHECK(chat_type IN ('private', 'group')),
  group_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for fast conversation lookups
CREATE INDEX IF NOT EXISTS idx_chat_conv ON telegram_messages(chat_id, conversation_id);

-- Index for timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_timestamp ON telegram_messages(timestamp DESC);

-- Index for terminal-based queries
CREATE INDEX IF NOT EXISTS idx_terminal ON telegram_messages(terminal);
