-- ==========================================
-- 0001_init.sql: Game Score Manager Schema
-- ==========================================

-- 1. Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Games Catalog (FPS, Board Game, RPG, Custom)
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'board', -- 'fps', 'board', 'rpg', 'custom'
    scoring_type TEXT DEFAULT 'highest_wins', -- 'highest_wins', 'lowest_wins', 'coop'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Completed Matches
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NULL,                      -- e.g. "Ascent Competitive", "Friday Catan"
    match_outcome TEXT NULL,              -- 'win', 'loss', 'draw', 'completed', 'failed'
    notes TEXT NULL,
    played_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Match Player Results with Metrics for FPS, Board, and RPG
CREATE TABLE IF NOT EXISTS match_players (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    score REAL DEFAULT 0,                 -- Primary rankable score (Points, Damage, Level)
    rank INTEGER DEFAULT 1,               -- Placement rank (1st, 2nd, etc.)
    is_winner BOOLEAN DEFAULT 0,
    
    -- FPS Metrics
    kills INTEGER NULL,
    deaths INTEGER NULL,
    assists INTEGER NULL,

    -- Board Game Metrics
    money REAL NULL,

    -- RPG & Custom Metrics (JSON string: character, class, xp, gold, loot)
    extra_stats TEXT NULL,

    notes TEXT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_name ON match_players(player_name);
