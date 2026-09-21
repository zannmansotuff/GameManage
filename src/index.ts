import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hashPassword, verifyPassword, signJWT, verifyJWT } from './auth';

type Bindings = {
  DB: D1Database;
  ASSETS?: Fetcher;
};

type Variables = {
  user?: { id: string; email: string; username: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Enable CORS
app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Auth Middleware for protected /api/* routes
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/auth/register' || path === '/api/auth/login' || path === '/api/health') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing token' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyJWT(token);
  if (!payload || !payload.id) {
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  c.set('user', { id: payload.id, email: payload.email, username: payload.username });
  await next();
});

// Health Check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ----------------------------------------------------
// 1. AUTHENTICATION ROUTES
// ----------------------------------------------------

// Register
app.post('/api/auth/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, username } = body;

  if (!email || !password || !username) {
    return c.json({ error: 'Email, username, and password are required' }, 400);
  }

  try {
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await c.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, username) VALUES (?, ?, ?, ?)'
    ).bind(id, email.toLowerCase(), passwordHash, username).run();

    const token = await signJWT({ id, email: email.toLowerCase(), username });
    return c.json({ token, user: { id, email: email.toLowerCase(), username } }, 201);
  } catch (err: any) {
    return c.json({ error: 'Registration failed', details: err.message }, 500);
  }
});

// Login
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  try {
    const user: any = await c.env.DB.prepare(
      'SELECT id, email, password_hash, username FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    const token = await signJWT({ id: user.id, email: user.email, username: user.username });
    return c.json({ token, user: { id: user.id, email: user.email, username: user.username } });
  } catch (err: any) {
    return c.json({ error: 'Login failed', details: err.message }, 500);
  }
});

// Me (Verify session)
app.get('/api/auth/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// ----------------------------------------------------
// 2. GAMES CATALOG ROUTES
// ----------------------------------------------------

// List user games
app.get('/api/games', async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM games WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all();

  return c.json({ games: results });
});

// Create new game
app.post('/api/games', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  const { name, category = 'board', scoring_type = 'highest_wins' } = body;

  if (!name || !name.trim()) {
    return c.json({ error: 'Game name is required' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO games (id, user_id, name, category, scoring_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.id, name.trim(), category, scoring_type).run();

  return c.json({ game: { id, user_id: user.id, name: name.trim(), category, scoring_type } }, 201);
});

// Delete game
app.delete('/api/games/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM games WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return c.json({ success: true });
});

// ----------------------------------------------------
// 3. MATCH RECORDS ROUTES (POST-GAME LOGGING)
// ----------------------------------------------------

// Get matches (optional filter by game_id)
app.get('/api/matches', async (c) => {
  const user = c.get('user')!;
  const gameId = c.req.query('game_id');

  let query = 'SELECT m.*, g.name as game_name, g.category as game_category, g.scoring_type FROM matches m JOIN games g ON m.game_id = g.id WHERE m.user_id = ?';
  const params: any[] = [user.id];

  if (gameId) {
    query += ' AND m.game_id = ?';
    params.push(gameId);
  }
  query += ' ORDER BY m.played_at DESC LIMIT 50';

  const { results: matches } = await c.env.DB.prepare(query).bind(...params).all();

  // Fetch players for all matches
  if (matches.length > 0) {
    const matchIds = matches.map((m: any) => `'${m.id}'`).join(',');
    const { results: players } = await c.env.DB.prepare(
      `SELECT * FROM match_players WHERE match_id IN (${matchIds}) ORDER BY rank ASC, score DESC`
    ).all();

    // Map players to each match
    const playersByMatch = new Map<string, any[]>();
    for (const p of players as any[]) {
      if (!playersByMatch.has(p.match_id)) playersByMatch.set(p.match_id, []);
      playersByMatch.get(p.match_id)!.push({
        ...p,
        extra_stats: p.extra_stats ? JSON.parse(p.extra_stats) : null
      });
    }

    for (const m of matches as any[]) {
      m.players = playersByMatch.get(m.id) || [];
    }
  }

  return c.json({ matches });
});

// Log a completed match
app.post('/api/matches', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  const { game_id, title, match_outcome, notes, played_at, players = [] } = body;

  if (!game_id) {
    return c.json({ error: 'game_id is required' }, 400);
  }
  if (!Array.isArray(players) || players.length === 0) {
    return c.json({ error: 'At least one player is required' }, 400);
  }

  // Verify game ownership
  const game: any = await c.env.DB.prepare('SELECT * FROM games WHERE id = ? AND user_id = ?')
    .bind(game_id, user.id).first();
  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  const matchId = crypto.randomUUID();
  const playDate = played_at || new Date().toISOString();

  // Sort and rank players based on scoring_type or category
  const sortedPlayers = [...players];
  if (game.category === 'fps') {
    // Sort by Kills or K/D ratio or custom score
    sortedPlayers.sort((a, b) => (b.score || (b.kills - b.deaths)) - (a.score || (a.kills - a.deaths)));
  } else if (game.scoring_type === 'lowest_wins') {
    sortedPlayers.sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
  } else {
    // default highest wins
    sortedPlayers.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  // Insert match
  await c.env.DB.prepare(
    'INSERT INTO matches (id, game_id, user_id, title, match_outcome, notes, played_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(matchId, game_id, user.id, title || null, match_outcome || null, notes || null, playDate).run();

  // Insert players in batch
  const playerInserts = sortedPlayers.map((p, idx) => {
    const playerId = crypto.randomUUID();
    const rank = idx + 1;
    const isWinner = p.is_winner !== undefined ? (p.is_winner ? 1 : 0) : (rank === 1 ? 1 : 0);
    const extraStats = p.extra_stats ? JSON.stringify(p.extra_stats) : null;

    return c.env.DB.prepare(
      `INSERT INTO match_players 
       (id, match_id, player_name, score, rank, is_winner, kills, deaths, assists, money, extra_stats, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      playerId,
      matchId,
      p.player_name || 'Anonymous',
      Number(p.score || 0),
      rank,
      isWinner,
      p.kills !== undefined ? Number(p.kills) : null,
      p.deaths !== undefined ? Number(p.deaths) : null,
      p.assists !== undefined ? Number(p.assists) : null,
      p.money !== undefined ? Number(p.money) : null,
      extraStats,
      p.notes || null
    );
  });

  await c.env.DB.batch(playerInserts);

  return c.json({ success: true, match_id: matchId }, 201);
});

// Delete match
app.delete('/api/matches/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM matches WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return c.json({ success: true });
});

// ----------------------------------------------------
// 4. LEADERBOARD & STATS ROUTE
// ----------------------------------------------------

app.get('/api/stats', async (c) => {
  const user = c.get('user')!;
  const gameId = c.req.query('game_id');

  if (!gameId) {
    return c.json({ error: 'game_id query param is required' }, 400);
  }

  const game: any = await c.env.DB.prepare('SELECT * FROM games WHERE id = ? AND user_id = ?')
    .bind(gameId, user.id).first();
  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  // Aggregate stats per player
  const query = `
    SELECT 
      mp.player_name,
      COUNT(mp.id) as matches_played,
      SUM(CASE WHEN mp.is_winner = 1 THEN 1 ELSE 0 END) as wins,
      AVG(mp.score) as avg_score,
      MAX(mp.score) as max_score,
      SUM(mp.kills) as total_kills,
      SUM(mp.deaths) as total_deaths,
      SUM(mp.assists) as total_assists,
      AVG(mp.money) as avg_money,
      SUM(mp.money) as total_money
    FROM match_players mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ? AND m.user_id = ?
    GROUP BY mp.player_name
    ORDER BY wins DESC, avg_score DESC
  `;

  const { results } = await c.env.DB.prepare(query).bind(gameId, user.id).all();

  const formattedStats = results.map((row: any) => {
    const played = Number(row.matches_played || 0);
    const wins = Number(row.wins || 0);
    const winRate = played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0';

    const kills = Number(row.total_kills || 0);
    const deaths = Number(row.total_deaths || 0);
    const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);

    return {
      ...row,
      win_rate: winRate,
      kd_ratio: kdRatio,
      avg_score: Number(row.avg_score || 0).toFixed(1),
      avg_money: row.avg_money ? Number(row.avg_money).toFixed(0) : null
    };
  });

  return c.json({ game, stats: formattedStats });
});

export default app;
