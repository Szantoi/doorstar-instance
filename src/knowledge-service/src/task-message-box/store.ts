/**
 * TaskMessageBox Store
 *
 * SQLite-backed message store with automatic .md file rendering.
 * Single source of truth for all task/message operations.
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Message,
  MessageNote,
  TerminalStatus,
  CreateTaskInput,
  CompleteMessageInput,
  AppendNoteInput,
  MessageFilter,
  CreateResult,
  UpdateResult,
  QueryResult,
  MessageStatus,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'taskmessagebox.db');
const TERMINALS_ROOT = path.join(REPO_ROOT, 'terminals');

// Inline schema (no external file dependency)
const SCHEMA = `
-- TaskMessageBox SQLite Schema
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    from_terminal TEXT NOT NULL,
    to_terminal TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('task', 'question', 'done', 'blocked', 'info')),
    priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'in_progress', 'completed', 'blocked', 'archived')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    acceptance_criteria TEXT,
    context TEXT,
    completion_summary TEXT,
    completion_details TEXT,
    files_changed TEXT,
    blocked_reason TEXT,
    next_steps TEXT,
    ref_id TEXT,
    epic_id TEXT,
    project_id TEXT,
    model TEXT CHECK (model IN ('haiku', 'sonnet', 'opus')),
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    rendered_path TEXT,
    last_rendered_at TEXT,
    FOREIGN KEY (ref_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_to_terminal ON messages(to_terminal);
CREATE INDEX IF NOT EXISTS idx_messages_from_terminal ON messages(from_terminal);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages(priority);
CREATE INDEX IF NOT EXISTS idx_messages_epic ON messages(epic_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE TABLE IF NOT EXISTS message_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('notes', 'implementation', 'feedback', 'blockers', 'progress')),
    content TEXT NOT NULL,
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_message ON message_notes(message_id);

CREATE TABLE IF NOT EXISTS terminal_status (
    terminal TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'blocked')),
    current_task_id TEXT,
    last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (current_task_id) REFERENCES messages(id)
);

CREATE TABLE IF NOT EXISTS message_sequence (
    terminal TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0
);
`;

// ─── Database Instance ───────────────────────────────────────────────────────

let db: Database.Database | null = null;

export async function initDatabase(): Promise<void> {
  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Open database
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  db.exec(SCHEMA);

  console.log('[TaskMessageBox] Database initialized:', DB_PATH);
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('[TaskMessageBox] Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function generateContentHash(title: string, description: string): string {
  return crypto.createHash('sha256').update(title + description).digest('hex');
}

function generateMessageId(terminal: string): string {
  const db = getDb();

  // Get or create sequence
  const seq = db.prepare(`
    INSERT INTO message_sequence (terminal, last_number)
    VALUES (?, 0)
    ON CONFLICT(terminal) DO UPDATE SET last_number = last_number + 1
    RETURNING last_number
  `).get(terminal.toLowerCase()) as { last_number: number };

  const num = (seq?.last_number || 0) + 1;

  // Update if it was an insert
  if (!seq || seq.last_number === 0) {
    db.prepare('UPDATE message_sequence SET last_number = ? WHERE terminal = ?')
      .run(num, terminal.toLowerCase());
  }

  return `MSG-${terminal.toUpperCase()}-${num.toString().padStart(3, '0')}`;
}

function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

// ─── File Rendering ──────────────────────────────────────────────────────────

async function renderMessageToFile(message: Message): Promise<string> {
  const terminalDir = path.join(TERMINALS_ROOT, message.to_terminal);
  const boxDir = message.type === 'done' || message.type === 'blocked'
    ? path.join(terminalDir, 'outbox')
    : path.join(terminalDir, 'inbox');

  await fs.mkdir(boxDir, { recursive: true });

  // Generate filename
  const date = message.created_at.split('T')[0];
  const num = message.id.split('-').pop() || '001';
  const slug = message.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  const filename = `${date}_${num}_${slug}.md`;
  const filePath = path.join(boxDir, filename);

  // Build frontmatter
  const frontmatter: Record<string, string | undefined> = {
    id: message.id,
    from: message.from_terminal,
    to: message.to_terminal,
    type: message.type,
    priority: message.priority,
    status: message.status.toUpperCase(),
    model: message.model,
    ref: message.ref_id,
    epic_id: message.epic_id,
    project_id: message.project_id,
    created: message.created_at,
    completed: message.completed_at,
    content_hash: message.content_hash,
  };

  const frontmatterYaml = Object.entries(frontmatter)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  // Build body
  let body = `# ${message.title}\n\n`;
  body += message.description;

  if (message.acceptance_criteria && message.acceptance_criteria.length > 0) {
    body += '\n\n## Acceptance Criteria\n\n';
    body += message.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n');
  }

  if (message.context) {
    body += `\n\n## Context\n\n${message.context}`;
  }

  // Add completion info if present
  if (message.completion_summary) {
    body += `\n\n---\n\n## ${message.status === 'completed' ? 'Completion' : 'Blocked'} Report\n`;
    body += `*${message.completed_at}*\n\n`;
    body += `### Summary\n${message.completion_summary}\n`;

    if (message.completion_details) {
      body += `\n### Details\n${message.completion_details}\n`;
    }

    if (message.files_changed && message.files_changed.length > 0) {
      body += `\n### Files Changed\n`;
      body += message.files_changed.map(f => `- \`${f}\``).join('\n') + '\n';
    }

    if (message.blocked_reason) {
      body += `\n### Blocked Reason\n${message.blocked_reason}\n`;
    }

    if (message.next_steps) {
      body += `\n### Next Steps\n${message.next_steps}\n`;
    }
  }

  // Add notes if present
  if (message.notes && message.notes.length > 0) {
    for (const note of message.notes) {
      const authorLine = note.author ? ` (by ${note.author})` : '';
      body += `\n\n---\n\n## ${note.section.charAt(0).toUpperCase() + note.section.slice(1)}${authorLine}\n`;
      body += `*Added: ${note.created_at}*\n\n`;
      body += note.content;
    }
  }

  const fileContent = `---\n${frontmatterYaml}\n---\n\n${body}\n`;
  await fs.writeFile(filePath, fileContent, 'utf-8');

  // Update rendered path in DB
  getDb().prepare(`
    UPDATE messages
    SET rendered_path = ?, last_rendered_at = datetime('now')
    WHERE id = ?
  `).run(filePath, message.id);

  return filePath;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Create a new task/message
 */
export async function createTask(input: CreateTaskInput): Promise<CreateResult> {
  try {
    const db = getDb();
    const id = generateMessageId(input.to);
    const contentHash = generateContentHash(input.title, input.description);

    const stmt = db.prepare(`
      INSERT INTO messages (
        id, from_terminal, to_terminal, type, priority, status,
        title, description, acceptance_criteria, context,
        ref_id, epic_id, project_id, model, content_hash
      ) VALUES (
        ?, ?, ?, 'task', ?, 'unread',
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      input.from,
      input.to,
      input.priority,
      input.title,
      input.description,
      input.acceptance_criteria ? JSON.stringify(input.acceptance_criteria) : null,
      input.context || null,
      input.ref_id || null,
      input.epic_id || null,
      input.project_id || null,
      input.model || null,
      contentHash
    );

    // Get full message for rendering
    const message = await getMessage(id);
    if (!message) {
      return { success: false, error: 'Failed to retrieve created message' };
    }

    const renderedPath = await renderMessageToFile(message);

    return { success: true, id, rendered_path: renderedPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get a single message by ID
 */
export async function getMessage(id: string): Promise<Message | null> {
  const db = getDb();

  const row = db.prepare(`
    SELECT m.*,
           (SELECT COUNT(*) FROM message_notes n WHERE n.message_id = m.id) as note_count
    FROM messages m
    WHERE m.id = ?
  `).get(id) as (Message & { acceptance_criteria: string | null; files_changed: string | null }) | undefined;

  if (!row) return null;

  // Parse JSON fields
  const message: Message = {
    ...row,
    acceptance_criteria: row.acceptance_criteria ? JSON.parse(row.acceptance_criteria) : undefined,
    files_changed: row.files_changed ? JSON.parse(row.files_changed) : undefined,
  };

  // Load notes
  const notes = db.prepare(`
    SELECT * FROM message_notes WHERE message_id = ? ORDER BY created_at
  `).all(id) as MessageNote[];

  message.notes = notes;

  return message;
}

/**
 * Read a message (marks as read)
 */
export async function readMessage(id: string): Promise<QueryResult<Message>> {
  try {
    const db = getDb();

    // Update status to read
    db.prepare(`
      UPDATE messages
      SET status = 'read', read_at = datetime('now')
      WHERE id = ? AND status = 'unread'
    `).run(id);

    const message = await getMessage(id);
    if (!message) {
      return { success: false, error: `Message ${id} not found` };
    }

    // Re-render file with updated status
    await renderMessageToFile(message);

    return { success: true, data: message };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Complete a message (done/blocked)
 */
export async function completeMessage(input: CompleteMessageInput): Promise<UpdateResult> {
  try {
    const db = getDb();

    const status: MessageStatus = input.status === 'completed' ? 'completed' : 'blocked';

    db.prepare(`
      UPDATE messages
      SET status = ?,
          completion_summary = ?,
          completion_details = ?,
          files_changed = ?,
          blocked_reason = ?,
          next_steps = ?,
          completed_at = datetime('now')
      WHERE id = ?
    `).run(
      status,
      input.summary,
      input.details || null,
      input.files_changed ? JSON.stringify(input.files_changed) : null,
      input.blocked_reason || null,
      input.next_steps || null,
      input.message_id
    );

    // Get full message for rendering
    const message = await getMessage(input.message_id);
    if (!message) {
      return { success: false, error: `Message ${input.message_id} not found` };
    }

    const renderedPath = await renderMessageToFile(message);

    return { success: true, rendered_path: renderedPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Append a note to a message
 */
export async function appendNote(input: AppendNoteInput): Promise<UpdateResult> {
  try {
    const db = getDb();

    db.prepare(`
      INSERT INTO message_notes (message_id, section, content, author)
      VALUES (?, ?, ?, ?)
    `).run(input.message_id, input.section, input.content, input.author || null);

    // Get full message for rendering
    const message = await getMessage(input.message_id);
    if (!message) {
      return { success: false, error: `Message ${input.message_id} not found` };
    }

    const renderedPath = await renderMessageToFile(message);

    return { success: true, rendered_path: renderedPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Query messages with filters
 */
export async function queryMessages(filter: MessageFilter): Promise<QueryResult<Message[]>> {
  try {
    const db = getDb();

    let sql = 'SELECT * FROM messages WHERE 1=1';
    const params: unknown[] = [];

    if (filter.terminal) {
      sql += ' AND to_terminal = ?';
      params.push(filter.terminal);
    }

    if (filter.type) {
      if (Array.isArray(filter.type)) {
        sql += ` AND type IN (${filter.type.map(() => '?').join(',')})`;
        params.push(...filter.type);
      } else {
        sql += ' AND type = ?';
        params.push(filter.type);
      }
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        sql += ` AND status IN (${filter.status.map(() => '?').join(',')})`;
        params.push(...filter.status);
      } else {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
    }

    if (filter.priority) {
      if (Array.isArray(filter.priority)) {
        sql += ` AND priority IN (${filter.priority.map(() => '?').join(',')})`;
        params.push(...filter.priority);
      } else {
        sql += ' AND priority = ?';
        params.push(filter.priority);
      }
    }

    if (filter.epic_id) {
      sql += ' AND epic_id = ?';
      params.push(filter.epic_id);
    }

    if (filter.project_id) {
      sql += ' AND project_id = ?';
      params.push(filter.project_id);
    }

    sql += ' ORDER BY created_at DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    if (filter.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const rows = db.prepare(sql).all(...params) as Message[];

    // Parse JSON fields
    const messages = rows.map(row => ({
      ...row,
      acceptance_criteria: (row as unknown as { acceptance_criteria: string | null }).acceptance_criteria
        ? JSON.parse((row as unknown as { acceptance_criteria: string }).acceptance_criteria)
        : undefined,
      files_changed: (row as unknown as { files_changed: string | null }).files_changed
        ? JSON.parse((row as unknown as { files_changed: string }).files_changed)
        : undefined,
    }));

    return { success: true, data: messages, count: messages.length };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get inbox for a terminal
 */
export async function getInbox(terminal: string, statusFilter?: 'unread' | 'read' | 'all'): Promise<QueryResult<Message[]>> {
  const status = statusFilter === 'all' ? undefined : statusFilter;
  return queryMessages({
    terminal,
    type: ['task', 'question', 'info'],
    status: status ? [status] : ['unread', 'read', 'in_progress'],
  });
}

/**
 * Get outbox for a terminal (messages sent by terminal)
 */
export async function getOutbox(terminal: string): Promise<QueryResult<Message[]>> {
  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE from_terminal = ? AND type IN ('done', 'blocked')
      ORDER BY created_at DESC
    `).all(terminal) as Message[];

    return { success: true, data: rows, count: rows.length };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Terminal Status ─────────────────────────────────────────────────────────

export function setTerminalStatus(
  terminal: string,
  status: 'idle' | 'working' | 'blocked',
  taskId?: string
): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO terminal_status (terminal, status, current_task_id, last_activity_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(terminal) DO UPDATE SET
      status = excluded.status,
      current_task_id = excluded.current_task_id,
      last_activity_at = datetime('now')
  `).run(terminal, status, taskId || null);
}

export function getTerminalStatus(terminal?: string): TerminalStatus | TerminalStatus[] | null {
  const db = getDb();

  if (terminal) {
    return db.prepare('SELECT * FROM terminal_status WHERE terminal = ?').get(terminal) as TerminalStatus | undefined || null;
  }

  return db.prepare('SELECT * FROM terminal_status').all() as TerminalStatus[];
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default {
  initDatabase,
  createTask,
  getMessage,
  readMessage,
  completeMessage,
  appendNote,
  queryMessages,
  getInbox,
  getOutbox,
  setTerminalStatus,
  getTerminalStatus,
};
