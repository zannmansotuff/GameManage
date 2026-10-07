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
    return c.json({ error: 'Email or Username and password are required' }, 400);
  }

  const queryIdentifier = email.trim().toLowerCase();

  // Auto-seed admin account if logging in as admin and not yet created
  if (queryIdentifier === 'admin' || queryIdentifier === 'admin@gamemanage.com') {
    const existingAdmin = await c.env.DB.prepare(
      "SELECT id FROM users WHERE LOWER(username) = 'admin' OR LOWER(email) = 'admin@gamemanage.com'"
    ).first();

    if (!existingAdmin) {
      const adminId = crypto.randomUUID();
      const adminHash = await hashPassword('1234567');
      await c.env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, username) VALUES (?, ?, ?, ?)"
      ).bind(adminId, 'admin@gamemanage.com', adminHash, 'admin').run();
    }
  }

  try {
    const user: any = await c.env.DB.prepare(
      'SELECT id, email, password_hash, username FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?'
    ).bind(queryIdentifier, queryIdentifier).first();

    if (!user) {
      return c.json({ error: 'Invalid email/username or password' }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: 'Invalid email/username or password' }, 401);
    }

    const token = await signJWT({ id: user.id, email: user.email, username: user.username });
    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_admin: user.username.toLowerCase() === 'admin'
      }
    });
  } catch (err: any) {
    return c.json({ error: 'Login failed', details: err.message }, 500);
  }
});

// Me (Verify session)
app.get('/api/auth/me', (c) => {
  const user = c.get('user');
  return c.json({
    user: user ? { ...user, is_admin: user.username.toLowerCase() === 'admin' } : null
  });
});

// ----------------------------------------------------
// 2. GAMES CATALOG ROUTES (SHARED ACROSS ALL USERS)
// ----------------------------------------------------

// List all games
app.get('/api/games', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM games ORDER BY created_at DESC'
  ).all();

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

// Delete game (ADMIN ONLY)
app.delete('/api/games/:id', async (c) => {
  const user = c.get('user')!;
  if (user.username.toLowerCase() !== 'admin') {
    return c.json({ error: 'Forbidden: Only the admin account can delete games' }, 403);
  }

  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ----------------------------------------------------
// 3. MATCH RECORDS ROUTES (SHARED ACROSS ALL USERS)
// ----------------------------------------------------

// Get matches (optional filter by game_id)
app.get('/api/matches', async (c) => {
  const gameId = c.req.query('game_id');

  let query = 'SELECT m.*, m.user_id as match_owner_id, g.name as game_name, g.category as game_category, g.scoring_type, u.username as logged_by FROM matches m JOIN games g ON m.game_id = g.id LEFT JOIN users u ON m.user_id = u.id';
  const params: any[] = [];

  if (gameId) {
    query += ' WHERE m.game_id = ?';
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

  // Verify game exists
  const game: any = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?')
    .bind(game_id).first();
  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  const matchId = crypto.randomUUID();
  const playDate = played_at || new Date().toISOString();

  // Sort and rank players based on scoring_type or category
  const sortedPlayers = [...players];
  if (game.category === 'fps') {
    sortedPlayers.sort((a, b) => (b.score || (b.kills - b.deaths)) - (a.score || (a.kills - a.deaths)));
  } else if (game.scoring_type === 'lowest_wins') {
    sortedPlayers.sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
  } else {
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
       (id, match_id, player_name, score, rank, is_winner, kills, deaths, assists, money, extra_stats, notes, team_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      p.notes || null,
      p.team_name || null
    );
  });

  await c.env.DB.batch(playerInserts);

  return c.json({ success: true, match_id: matchId }, 201);
});

// Delete match (owner or admin)
app.delete('/api/matches/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const match: any = await c.env.DB.prepare('SELECT user_id FROM matches WHERE id = ?').bind(id).first();
  if (!match) {
    return c.json({ error: 'Match not found' }, 404);
  }

  const isAdmin = user.username.toLowerCase() === 'admin';
  const isOwner = match.user_id === user.id;

  if (!isAdmin && !isOwner) {
    return c.json({ error: 'Forbidden: You can only delete your own match records' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM match_players WHERE match_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Update match fully (owner or admin) — replaces title/notes/outcome AND players
app.put('/api/matches/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const match: any = await c.env.DB.prepare('SELECT user_id, game_id FROM matches WHERE id = ?').bind(id).first();
  if (!match) {
    return c.json({ error: 'Match not found' }, 404);
  }

  const isAdmin = user.username.toLowerCase() === 'admin';
  const isOwner = match.user_id === user.id;

  if (!isAdmin && !isOwner) {
    return c.json({ error: 'Forbidden: You can only edit your own match records' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { title, notes, match_outcome, played_at, players, game_id } = body;

  // Update match header (optionally update game_id too)
  await c.env.DB.prepare(
    'UPDATE matches SET title = ?, notes = ?, match_outcome = ?, played_at = COALESCE(?, played_at), game_id = COALESCE(?, game_id) WHERE id = ?'
  ).bind(title || null, notes || null, match_outcome || null, played_at || null, game_id || null, id).run();

  // If players provided, replace them
  if (Array.isArray(players) && players.length > 0) {
    // Get game info for sorting (use updated game_id if provided)
    const gameIdForSort = game_id || match.game_id;
    const game: any = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gameIdForSort).first();

    // Sort players
    const sortedPlayers = [...players];
    if (game && game.category === 'fps') {
      sortedPlayers.sort((a, b) => (b.score || (b.kills - b.deaths)) - (a.score || (a.kills - a.deaths)));
    } else if (game && game.scoring_type === 'lowest_wins') {
      sortedPlayers.sort((a, b) => Number(a.score || 0) - Number(b.score || 0));
    } else {
      sortedPlayers.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    }

    // Delete old players
    await c.env.DB.prepare('DELETE FROM match_players WHERE match_id = ?').bind(id).run();

    // Insert new players
    const playerInserts = sortedPlayers.map((p, idx) => {
      const playerId = crypto.randomUUID();
      const rank = idx + 1;
      const isWinner = p.is_winner !== undefined ? (p.is_winner ? 1 : 0) : (rank === 1 ? 1 : 0);
      const extraStats = p.extra_stats ? JSON.stringify(p.extra_stats) : null;
      return c.env.DB.prepare(
        `INSERT INTO match_players
         (id, match_id, player_name, score, rank, is_winner, kills, deaths, assists, money, extra_stats, notes, team_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        playerId, id,
        p.player_name || 'Anonymous',
        Number(p.score || 0), rank, isWinner,
        p.kills !== undefined ? Number(p.kills) : null,
        p.deaths !== undefined ? Number(p.deaths) : null,
        p.assists !== undefined ? Number(p.assists) : null,
        p.money !== undefined ? Number(p.money) : null,
        extraStats,
        p.notes || null,
        p.team_name || null
      );
    });

    await c.env.DB.batch(playerInserts);
  }

  return c.json({ success: true });
});

// ----------------------------------------------------
// 4. LEADERBOARD & STATS ROUTE (SHARED ACROSS ALL PLAYERS)
// ----------------------------------------------------

app.get('/api/stats', async (c) => {
  const gameId = c.req.query('game_id');

  if (!gameId) {
    return c.json({ error: 'game_id query param is required' }, 400);
  }

  const game: any = await c.env.DB.prepare('SELECT * FROM games WHERE id = ?')
    .bind(gameId).first();
  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  // Aggregate stats across all players who played this game
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
      SUM(mp.money) as total_money,
      GROUP_CONCAT(DISTINCT mp.team_name) as teams
    FROM match_players mp
    JOIN matches m ON mp.match_id = m.id
    WHERE m.game_id = ?
    GROUP BY mp.player_name
    ORDER BY wins DESC, avg_score DESC
  `;

  const { results } = await c.env.DB.prepare(query).bind(gameId).all();

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

// Delete a single player from a match (owner or admin)
app.delete('/api/matches/:matchId/players/:playerId', async (c) => {
  const user = c.get('user')!;
  const { matchId, playerId } = c.req.param();

  const match: any = await c.env.DB.prepare('SELECT user_id FROM matches WHERE id = ?').bind(matchId).first();
  if (!match) {
    return c.json({ error: 'Match not found' }, 404);
  }

  const isAdmin = user.username.toLowerCase() === 'admin';
  const isOwner = match.user_id === user.id;

  if (!isAdmin && !isOwner) {
    return c.json({ error: 'Forbidden: You can only modify your own match records' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM match_players WHERE id = ? AND match_id = ?').bind(playerId, matchId).run();
  return c.json({ success: true });
});

// ----------------------------------------------------
// 5. PLAYER MODERATION ROUTE (ADMIN ONLY)
// ----------------------------------------------------

// Delete a player's records from a game (removes spam players from the leaderboard)
app.delete('/api/players', async (c) => {
  const user = c.get('user')!;
  if (user.username.toLowerCase() !== 'admin') {
    return c.json({ error: 'Forbidden: Only the admin account can delete players' }, 403);
  }

  const name = c.req.query('name');
  const gameId = c.req.query('game_id');

  if (!name || !gameId) {
    return c.json({ error: 'name and game_id query params are required' }, 400);
  }

  // Find matches in this game that include this player (to clean up empties later)
  const { results: affectedMatches } = await c.env.DB.prepare(
    `SELECT DISTINCT m.id FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE m.game_id = ? AND mp.player_name = ?`
  ).bind(gameId, name).all();

  // Delete all of this player's records in the game
  await c.env.DB.prepare(
    `DELETE FROM match_players WHERE match_id IN (SELECT id FROM matches WHERE game_id = ?) AND player_name = ?`
  ).bind(gameId, name).run();

  // Delete matches that no longer have any players left
  if (affectedMatches.length > 0) {
    const ids = (affectedMatches as any[]).map(m => `'${m.id}'`).join(',');
    const { results: emptyMatches } = await c.env.DB.prepare(
      `SELECT m.id FROM matches m LEFT JOIN match_players mp ON mp.match_id = m.id WHERE m.id IN (${ids}) GROUP BY m.id HAVING COUNT(mp.id) = 0`
    ).all();
    for (const em of emptyMatches as any[]) {
      await c.env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(em.id).run();
    }
  }

  return c.json({ success: true });
});

// ----------------------------------------------------
// 6. GROUPS ROUTES
// ----------------------------------------------------

// List all groups the current user belongs to (as owner or member), plus pending invites
app.get('/api/groups', async (c) => {
  const user = c.get('user')!;

  // Groups where user is owner or accepted member
  const { results: groups } = await c.env.DB.prepare(`
    SELECT g.*, u.username as owner_name,
      (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as member_count
    FROM groups g
    JOIN users u ON g.owner_id = u.id
    WHERE g.owner_id = ?
       OR g.id IN (SELECT group_id FROM group_members WHERE user_id = ?)
    ORDER BY g.created_at DESC
  `).bind(user.id, user.id).all();

  // For each group, get members
  const groupIds = (groups as any[]).map(g => g.id);
  let membersByGroup: Record<string, any[]> = {};
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => '?').join(',');
    const { results: members } = await c.env.DB.prepare(`
      SELECT gm.group_id, gm.user_id, u.username
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id IN (${placeholders})
    `).bind(...groupIds).all();
    for (const m of members as any[]) {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
      membersByGroup[m.group_id].push({ user_id: m.user_id, username: m.username });
    }
  }

  // Pending invites for current user
  const { results: invites } = await c.env.DB.prepare(`
    SELECT gi.id, gi.group_id, gi.status, gi.created_at,
           g.name as group_name, u.username as invited_by_name
    FROM group_invites gi
    JOIN groups g ON gi.group_id = g.id
    JOIN users u ON gi.invited_by = u.id
    WHERE gi.invited_user_id = ? AND gi.status = 'pending'
  `).bind(user.id).all();

  const enriched = (groups as any[]).map(g => ({
    ...g,
    members: membersByGroup[g.id] || [],
    is_owner: g.owner_id === user.id,
  }));

  return c.json({ groups: enriched, invites });
});

// Create a group
app.post('/api/groups', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  const { name } = body;
  if (!name?.trim()) return c.json({ error: 'Group name is required' }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO groups (id, name, owner_id) VALUES (?, ?, ?)'
  ).bind(id, name.trim(), user.id).run();

  // Owner is also automatically a member
  const memberId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO group_members (id, group_id, user_id) VALUES (?, ?, ?)'
  ).bind(memberId, id, user.id).run();

  return c.json({ group: { id, name: name.trim(), owner_id: user.id } }, 201);
});

// Delete a group (owner only)
app.delete('/api/groups/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const group: any = await c.env.DB.prepare('SELECT owner_id FROM groups WHERE id = ?').bind(id).first();
  if (!group) return c.json({ error: 'Group not found' }, 404);
  if (group.owner_id !== user.id) return c.json({ error: 'Only the group owner can delete it' }, 403);
  await c.env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// Invite a user to a group by username (owner only)
app.post('/api/groups/:id/invite', async (c) => {
  const user = c.get('user')!;
  const groupId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { username } = body;

  const group: any = await c.env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first();
  if (!group) return c.json({ error: 'Group not found' }, 404);
  if (group.owner_id !== user.id) return c.json({ error: 'Only the group owner can invite members' }, 403);

  // Find the user to invite
  const target: any = await c.env.DB.prepare(
    'SELECT id, username FROM users WHERE LOWER(username) = ?'
  ).bind(username.trim().toLowerCase()).first();
  if (!target) return c.json({ error: `User "${username}" not found` }, 404);
  if (target.id === user.id) return c.json({ error: 'You cannot invite yourself' }, 400);

  // Check if already a member
  const alreadyMember = await c.env.DB.prepare(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).bind(groupId, target.id).first();
  if (alreadyMember) return c.json({ error: `${target.username} is already in the group` }, 409);

  // Check if already invited
  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM group_invites WHERE group_id = ? AND invited_user_id = ?'
  ).bind(groupId, target.id).first() as any;
  if (existing && existing.status === 'pending') return c.json({ error: `${target.username} already has a pending invite` }, 409);

  // Re-invite if previously declined
  if (existing) {
    await c.env.DB.prepare(
      'UPDATE group_invites SET status = ?, invited_by = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind('pending', user.id, existing.id).run();
  } else {
    const inviteId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO group_invites (id, group_id, invited_user_id, invited_by, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(inviteId, groupId, target.id, user.id, 'pending').run();
  }

  return c.json({ success: true, invited: target.username });
});

// Accept or decline an invite
app.put('/api/groups/invites/:inviteId', async (c) => {
  const user = c.get('user')!;
  const inviteId = c.req.param('inviteId');
  const body = await c.req.json().catch(() => ({}));
  const { action } = body; // 'accept' | 'decline'

  const invite: any = await c.env.DB.prepare(
    'SELECT * FROM group_invites WHERE id = ? AND invited_user_id = ?'
  ).bind(inviteId, user.id).first();
  if (!invite) return c.json({ error: 'Invite not found' }, 404);
  if (invite.status !== 'pending') return c.json({ error: 'Invite already responded to' }, 400);

  if (action === 'accept') {
    await c.env.DB.prepare(
      'UPDATE group_invites SET status = ? WHERE id = ?'
    ).bind('accepted', inviteId).run();
    const memberId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO group_members (id, group_id, user_id) VALUES (?, ?, ?)'
    ).bind(memberId, invite.group_id, user.id).run();
  } else {
    await c.env.DB.prepare(
      'UPDATE group_invites SET status = ? WHERE id = ?'
    ).bind('declined', inviteId).run();
  }

  return c.json({ success: true });
});

// Remove a member from group (owner only, or member leaving)
app.delete('/api/groups/:id/members/:userId', async (c) => {
  const user = c.get('user')!;
  const { id: groupId, userId } = c.req.param();

  const group: any = await c.env.DB.prepare('SELECT owner_id FROM groups WHERE id = ?').bind(groupId).first();
  if (!group) return c.json({ error: 'Group not found' }, 404);

  const isSelf = userId === user.id;
  const isOwner = group.owner_id === user.id;
  if (!isSelf && !isOwner) return c.json({ error: 'Permission denied' }, 403);
  if (isOwner && isSelf) return c.json({ error: 'Owner cannot leave. Delete the group instead.' }, 400);

  await c.env.DB.prepare(
    'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
  ).bind(groupId, userId).run();
  return c.json({ success: true });
});

// Fallback to static assets (HTML/CSS/JS)
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
