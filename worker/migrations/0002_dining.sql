CREATE TABLE preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vegetarian INTEGER NOT NULL DEFAULT 0 CHECK (vegetarian IN (0, 1)),
  vegan INTEGER NOT NULL DEFAULT 0 CHECK (vegan IN (0, 1)),
  gluten_free INTEGER NOT NULL DEFAULT 0 CHECK (gluten_free IN (0, 1)),
  halal INTEGER NOT NULL DEFAULT 0 CHECK (halal IN (0, 1)),
  max_calories INTEGER,
  min_protein INTEGER,
  likes TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, bucket)
);
