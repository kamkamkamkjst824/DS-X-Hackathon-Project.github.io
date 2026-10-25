-- Cached LLM interpretation of the free-text food preferences, one row per user.
-- likes_hash proves the cached interpretation still describes the saved likes text.
CREATE TABLE preference_interpretations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  likes_hash TEXT NOT NULL,
  interpretation TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
