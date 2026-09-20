# Multi-Game Score Tracker & Match Records (Cloudflare Workers + D1 + Vanilla Frontend)

A complete architecture and design specification for building a post-game match logger, score records manager, and player stats tracker supporting specialized game types (**FPS**, **Board Games**, **RPG**, and **Custom**).

---

## 1. Confirmed Architecture & Requirements

| Component | Choice / Specification |
|---|---|
| **App Type** | **Multi-Game Tracker with Game Type Support** (FPS, Board Game, RPG, Custom) |
| **Data Entry** | **Post-Game Record Entry** (adaptive forms tailored to Kills/Deaths/Assists, Points/Money, or Character/XP/Gold) |
| **Frontend** | **Plain Vanilla HTML5 + Modern CSS + Vanilla JavaScript** (zero build step, dynamic form rendering) |
| **Backend** | **Cloudflare Workers** (TypeScript / Hono router with edge performance) |
| **Database** | **Cloudflare D1** (Serverless SQLite at the edge) |
| **Data Sync** | **5-Minute Polling Timer** (client auto-refreshes data every 5 minutes + instant manual refresh button) |
| **Authentication** | **User Accounts** (Email/Password registration & login, secure PBKDF2/WebCrypto hashing, JWT sessions) |

---

## 2. Game Types & Dynamic Data Fields

The application dynamically renders input fields based on the selected game's category:

| Game Type | Primary Metrics | Specific Input Fields per Player | Output & Leaderboard Metrics |
|---|---|---|---|
| **FPS** (First-Person Shooter) | Combat Efficiency & Victory | • Kills<br>• Deaths<br>• Assists<br>• Team Result (Win / Loss / Draw)<br>• Optional: Damage / Score | • K/D Ratio (`K / D`)<br>• Total Kills / Deaths<br>• Win Rate %<br>• Top Fragger Badge |
| **Board Game** | Points, Economy & Placement | • Final Score / Points<br>• In-Game Money / Cash<br>• Placement Rank (1st, 2nd, etc.)<br>• Winner Badge | • Lifetime Wins<br>• Win Rate %<br>• Average Score<br>• Total Wealth Accumulated |
| **RPG** (Role-Playing Game) | Progression & Quest Outcomes | • Character Name<br>• Class / Role (Tank, DPS, Healer)<br>• Level<br>• XP Gained<br>• Gold / Loot Acquired<br>• Quest Status (Success / Failed) | • Total XP Earned<br>• Highest Level Achieved<br>• Total Gold Hoarded<br>• Quests Completed |
| **Custom / General** | Versatile Points | • Score<br>• Rank / Place<br>• Winner Flag | • Win Rate %<br>• High Score<br>• Average Score |

---

## 3. ASCII UI Mockups

### Screen 1: Main Dashboard with Game Type Badges & Adaptive Leaderboard

```text
+----------------------------------------------------------------------------------------------------------------------+
|  [#] GAME SCORE HUB     [Game: Valorant (FPS) v]   [+ Log Match Result]   [+ New Game]              (User: Alex)      |
|  * Updated just now - Next auto-refresh in 04:32  [Refresh Now]                                             [Logout]  |
+----------------------------------------------------------------------------------------------------------------------+
|                                                                                                                      |
|  LEADERBOARD: Valorant [FPS Mode]                                                                                    |
|  +---------------------+-------------------+-------------------+-------------------+-------------------+-------------+ |
|  | Player              | Matches (W/L)     | Kills / Deaths    | K/D Ratio         | Assists           | Win Rate    | |
|  +---------------------+-------------------+-------------------+-------------------+-------------------+-------------+ |
|  | [1] Alex (MVP)      | 20 (14W - 6L)     | 412 / 230         | 1.79              | 98                | 70.0%       | |
|  | [2] Sarah           | 20 (14W - 6L)     | 340 / 255         | 1.33              | 160               | 70.0%       | |
|  | [3] Leo             | 15 (8W - 7L)      | 195 / 210         | 0.93              | 110               | 53.3%       | |
|  +---------------------+-------------------+-------------------+-------------------+-------------------+-------------+ |
|                                                                                                                      |
|  RECENT MATCH RECORDS                                                                                                |
|  +-----------------------------------------------------------------------------------------------------------------+ |
|  | Valorant (Competitive - Ascent)                                                     Played: Oct 24, 2026 at 20:15 |
|  | Match Result: VICTORY (13 - 9)                                                                                    |
|  |                                                                                                                   |
|  |   [#1 MVP]  Alex    -- 26 Kills | 12 Deaths |  6 Assists  (2.17 K/D)                                              |
|  |   [#2]      Sarah   -- 19 Kills | 14 Deaths | 11 Assists  (1.36 K/D)                                              |
|  |   [#3]      Leo     -- 11 Kills | 16 Deaths |  9 Assists  (0.69 K/D)                                              |
|  |                                                                                          [View Details] [Delete]  |
|  +-----------------------------------------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------------------------------------------+
```

---

### Screen 2A: "Log Completed Match" — FPS Mode (Kills / Deaths / Assists)

```text
+-----------------------------------------------------------------------------------------------------+
|                                 LOG COMPLETED MATCH RECORD                                    [X]   |
+-----------------------------------------------------------------------------------------------------+
|                                                                                                     |
|  Select Game:                                          Game Category:                               |
|  [ Valorant                                    v ]    [ FPS (Kills/Deaths/Assists)            v ]   |
|                                                                                                     |
|  Match Title / Map:               Date & Time:               Match Outcome:                         |
|  [ Ascent - Competitive         ] [ 2026-10-24 20:00       ] [ Victory (Win)                  v ]   |
|                                                                                                     |
|  -------------------------------------------------------------------------------------------------  |
|  PLAYER COMBAT STATS (FPS):                                                                         |
|                                                                                                     |
|   #   Player Name          Kills    Deaths   Assists   K/D (Auto)  Score/Dmg   MVP / Top Fragger?       |
|  ---+--------------------+--------+--------+---------+-----------+-----------+-----------------------   |
|   1 | [ Alex             ] [ 26   ] [ 12   ] [  6    ]   2.17      [ 6250    ] [*] Match MVP            |
|   2 | [ Sarah            ] [ 19   ] [ 14   ] [ 11    ]   1.36      [ 4800    ] [ ]                      |
|   3 | [ Leo              ] [ 11   ] [ 16   ] [  9    ]   0.69      [ 3100    ] [ ]            [Remove]  |
|                                                                                                     |
|  [+ Add Another Player]                                                                             |
|  -------------------------------------------------------------------------------------------------  |
|                                                                                                     |
|                                                    [Cancel]                 [ Save Match Record ]   |
+-----------------------------------------------------------------------------------------------------+
```

---

### Screen 2B: "Log Completed Match" — Board Game Mode (Score / Money / Rank)

```text
+-----------------------------------------------------------------------------------------------------+
|                                 LOG COMPLETED MATCH RECORD                                    [X]   |
+-----------------------------------------------------------------------------------------------------+
|                                                                                                     |
|  Select Game:                                          Game Category:                               |
|  [ Monopoly / Catan                            v ]    [ Board Game (Score / Money)            v ]   |
|                                                                                                     |
|  Match Title:                     Date & Time:               Scoring Rule:                          |
|  [ Friday Game Night            ] [ 2026-10-24 21:00       ] [ Highest Score Wins             v ]   |
|                                                                                                     |
|  -------------------------------------------------------------------------------------------------  |
|  PLAYER RESULTS (BOARD GAME):                                                                       |
|                                                                                                     |
|   #   Player Name          Score/Points   Money/Cash ($)   Rank / Place   Winner?                   |
|  ---+--------------------+--------------+----------------+--------------+-----------------------    |
|   1 | [ Sarah            ] [ 10         ] [ $1,850       ] [ 1st Place  ] [*] Winner (Auto)         |
|   2 | [ Alex             ] [  9         ] [ $1,200       ] [ 2nd Place  ] [ ]                       |
|   3 | [ John             ] [  7         ] [   $450       ] [ 3rd Place  ] [ ]                       |
|   4 | [ David            ] [  6         ] [     $0       ] [ Bankrupt   ] [ ]             [Remove]  |
|                                                                                                     |
|  [+ Add Another Player]                                                                             |
|  -------------------------------------------------------------------------------------------------  |
|                                                                                                     |
|                                                    [Cancel]                 [ Save Match Record ]   |
+-----------------------------------------------------------------------------------------------------+
```

---

### Screen 2C: "Log Completed Match" — RPG Mode (Character / Level / XP / Gold)

```text
+-----------------------------------------------------------------------------------------------------+
|                                 LOG COMPLETED MATCH RECORD                                    [X]   |
+-----------------------------------------------------------------------------------------------------+
|                                                                                                     |
|  Select Game:                                          Game Category:                               |
|  [ D&D Campaign / Boss Raid                    v ]    [ RPG (Progression / Loot)              v ]   |
|                                                                                                     |
|  Quest / Raid Name:               Date & Time:               Raid Status:                           |
|  [ Dragon's Lair Dungeon        ] [ 2026-10-24 22:00       ] [ Boss Defeated (Success)        v ]   |
|                                                                                                     |
|  -------------------------------------------------------------------------------------------------  |
|  PARTY MEMBERS & REWARDS (RPG):                                                                     |
|                                                                                                     |
|   #   Player / Character    Class / Role   Level    XP Gained    Gold Loot     Notes / Item Drops   |
|  ---+---------------------+--------------+--------+------------+-------------+--------------------   |
|   1 | [ Sarah (Aria)      ] [ Mage / DPS ] [ 14   ] [ +2,500   ] [ 450 Gold  ] [ Flame Staff Drop ] |
|   2 | [ Alex (Thorin)     ] [ Paladin/Tk ] [ 15   ] [ +2,500   ] [ 450 Gold  ] [ Shield of Valor  ] |
|   3 | [ Leo (Finley)      ] [ Cleric/Heal] [ 14   ] [ +2,800   ] [ 600 Gold  ] [ MVP Healer Bonus ] |
|                                                                                                     |
|  [+ Add Party Member]                                                                               |
|  -------------------------------------------------------------------------------------------------  |
|                                                                                                     |
|                                                    [Cancel]                 [ Save Quest Record ]   |
+-----------------------------------------------------------------------------------------------------+
```

---

## 4. Database Schema Design (Cloudflare D1 SQLite)

```sql
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Games Catalog with Categories
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'board', -- 'fps', 'board', 'rpg', 'custom'
    scoring_type TEXT DEFAULT 'highest_wins', -- 'highest_wins', 'lowest_wins', or 'coop'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Completed Matches / Sessions
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NULL,                      -- e.g. "Ascent Competitive", "Dragon Dungeon"
    match_outcome TEXT NULL,              -- 'win', 'loss', 'draw', 'completed', 'failed'
    notes TEXT NULL,
    played_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Match Player Results with Flexible Category-Specific Metrics
CREATE TABLE IF NOT EXISTS match_players (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    score REAL DEFAULT 0,                 -- Primary rankable score (Points, Damage, or Level)
    rank INTEGER DEFAULT 1,               -- Placement rank (1st, 2nd, etc.)
    is_winner BOOLEAN DEFAULT 0,
    
    -- FPS Metrics (Nullable)
    kills INTEGER NULL,
    deaths INTEGER NULL,
    assists INTEGER NULL,

    -- Board Game Metrics (Nullable)
    money REAL NULL,

    -- RPG & Custom Metrics (Flexible JSON for character, class, xp, gold, loot)
    extra_stats TEXT NULL,                -- e.g. '{"character":"Aria","class":"Mage","xp":2500,"gold":450}'

    notes TEXT NULL                       -- Player specific note (e.g. "Flame Staff drop")
);

-- Indexes for high-speed queries and leaderboard aggregations
CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_name ON match_players(player_name);
```

---

## 5. REST API Specifications

### Game Management
- `GET /api/games` — Fetch user games (includes `category`: `fps`, `board`, `rpg`, `custom`).
- `POST /api/games` — Body: `{ name, category, scoring_type }`.

### Match Records (Adapts Payload by Category)
- `POST /api/matches` — Saves a completed match with tailored player payload:
  ```json
  // FPS Example
  {
    "game_id": "game_val_1",
    "title": "Ascent Competitive",
    "played_at": "2026-10-24T20:00:00Z",
    "match_outcome": "win",
    "players": [
      { "player_name": "Alex", "kills": 26, "deaths": 12, "assists": 6, "score": 6250, "is_winner": 1 },
      { "player_name": "Sarah", "kills": 19, "deaths": 14, "assists": 11, "score": 4800, "is_winner": 1 }
    ]
  }

  // Board Game Example
  {
    "game_id": "game_catan_1",
    "title": "Friday Night",
    "played_at": "2026-10-24T21:00:00Z",
    "players": [
      { "player_name": "Sarah", "score": 10, "money": 1850, "rank": 1, "is_winner": 1 },
      { "player_name": "Alex", "score": 9, "money": 1200, "rank": 2, "is_winner": 0 }
    ]
  }
  ```

### Category-Specific Analytics
- `GET /api/stats?game_id=:id` — Automatically computes appropriate metrics:
  - For **FPS**: Total Kills, Deaths, K/D ratio, Win Rate %, MVP counts.
  - For **Board Games**: Total Wins, Win Rate %, Average Score, Average Money.
  - For **RPG**: Total XP accumulated, Highest Level, Total Gold earned, Quest Success Rate %.

---

## 6. Frontend UI Structure (Vanilla HTML / CSS / JS)

- `public/index.html`: Contains modal templates that switch input columns dynamically when the selected game changes.
- `public/styles.css`: Styling for badges (`[FPS]`, `[Board]`, `[RPG]`), tables, and responsive forms.
- `public/app.js`: Listens to `gameSelect.onchange`, updates table headers & inputs dynamically according to the game category, and runs the 5-minute auto-refresh loop.

---

## 7. Next Steps for Implementation

1. **Phase 1**: Initialize `package.json`, `wrangler.toml` with D1 binding.
2. **Phase 2**: Apply SQLite migration script `migrations/0001_init.sql` (with FPS, Board, RPG fields).
3. **Phase 3**: Implement Cloudflare Worker API routes using Hono (Auth, Games, Matches with category support, Analytics).
4. **Phase 4**: Build Vanilla frontend with dynamic category switcher and 5-minute auto-refresh.
5. **Phase 5**: Verify locally and commit to GitHub.
