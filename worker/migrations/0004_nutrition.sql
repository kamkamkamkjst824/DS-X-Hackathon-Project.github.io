CREATE TABLE nutrition_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  goals TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
