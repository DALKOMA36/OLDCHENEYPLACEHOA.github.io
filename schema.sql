-- Jarvis D1 Database Schema
-- All tables for the personal AI life manager

-- User profile and settings
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'Friend',
  preferences TEXT DEFAULT '{}',
  integrations TEXT DEFAULT '{}',
  circle TEXT DEFAULT '[]',
  memory TEXT DEFAULT '[]',
  onboarded INTEGER DEFAULT 0,
  briefing_time TEXT DEFAULT '07:00',
  briefing_days TEXT DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]',
  diet TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Calendar events
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  title TEXT NOT NULL,
  time TEXT,
  location TEXT DEFAULT '',
  calendar TEXT DEFAULT 'personal',
  color TEXT DEFAULT '#6c5ce7',
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  title TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  assignee TEXT DEFAULT '',
  due_date TEXT,
  recurring INTEGER DEFAULT 0,
  category TEXT DEFAULT 'personal',
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  text TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '09:00',
  repeat TEXT DEFAULT 'none',
  priority TEXT DEFAULT 'normal',
  dismissed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  time TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Meal plans
CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  time TEXT DEFAULT '',
  cal INTEGER DEFAULT 0,
  ingredients TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, slot)
);

-- Grocery list
CREATE TABLE IF NOT EXISTS grocery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  checked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Channel messages (sent)
CREATE TABLE IF NOT EXISTS sent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'sms',
  sent_at TEXT DEFAULT (datetime('now'))
);

-- Channel drafts
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  recipient TEXT DEFAULT '',
  message TEXT DEFAULT '',
  channel TEXT DEFAULT 'sms',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Scanned documents
CREATE TABLE IF NOT EXISTS scanned_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  doc_type TEXT DEFAULT '',
  items TEXT DEFAULT '[]',
  source TEXT DEFAULT '',
  scanned_at TEXT DEFAULT (datetime('now'))
);

-- Train schedule (user's commute config)
CREATE TABLE IF NOT EXISTS train_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  train TEXT NOT NULL,
  direction TEXT NOT NULL,
  board_station TEXT NOT NULL,
  exit_station TEXT DEFAULT '',
  days TEXT DEFAULT '[]',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Travel trips
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  destination TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  travelers INTEGER DEFAULT 1,
  style TEXT DEFAULT 'mixed',
  interests TEXT DEFAULT '[]',
  budget TEXT DEFAULT 'moderate',
  status TEXT DEFAULT 'planned',
  itinerary TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Custom apps (App Builder)
CREATE TABLE IF NOT EXISTS custom_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT DEFAULT 'default',
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  fields TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Custom app entries
CREATE TABLE IF NOT EXISTS custom_app_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  data TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (app_id) REFERENCES custom_apps(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_date ON events(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, completed);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(user_id, date);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_slot ON meal_plans(user_id, slot);
