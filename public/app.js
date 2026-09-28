// ==========================================
// Game Score Hub - Vanilla JavaScript Engine
// ==========================================

const API_BASE = '/api';
const AUTO_REFRESH_SECONDS = 300;

const state = {
  token: localStorage.getItem('gsh_token') || null,
  user: null, games: [], selectedGame: null,
  matches: [], stats: [],
  refreshTimer: AUTO_REFRESH_SECONDS, timerInterval: null
};

const authScreen      = document.getElementById('authScreen');
const dashboardView   = document.getElementById('dashboardView');
const navControls     = document.getElementById('navControls');
const statusBar       = document.getElementById('statusBar');
const navUsername     = document.getElementById('navUsername');
const gameSelect      = document.getElementById('gameSelect');
const activeGameTitle = document.getElementById('activeGameTitle');
const activeGameBadge = document.getElementById('activeGameBadge');
const activeGameMeta  = document.getElementById('activeGameMeta');
const leaderboardHead = document.getElementById('leaderboardHead');
const leaderboardBody = document.getElementById('leaderboardBody');
const matchesList     = document.getElementById('matchesList');
const timerText       = document.getElementById('timerText');
const matchModal      = document.getElementById('matchModal');
const gameModal       = document.getElementById('gameModal');
const matchGameSelect = document.getElementById('matchGameSelect');
const modalCategoryBadge = document.getElementById('modalCategoryBadge');
const matchPlayersHead   = document.getElementById('matchPlayersHead');
const matchPlayersBody   = document.getElementById('matchPlayersBody');

// ==========================================
// THEME TOGGLE — single button
// ==========================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('gsh_theme', theme);
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
applyTheme(localStorage.getItem('gsh_theme') || 'dark');
document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);

// ==========================================
// 1. API Client
// ==========================================
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  try {
    const res  = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && state.token) logout();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) { console.error('API Error:', err); throw err; }
}

// ==========================================
// 2. Auth
// ==========================================
let isSignUpMode = false;
const authForm       = document.getElementById('authForm');
const authTitle      = document.getElementById('authTitle');
const authError      = document.getElementById('authError');
const authEmailGroup = document.getElementById('authEmailGroup');
const btnAuthSubmit  = document.getElementById('btnAuthSubmit');
const btnAuthToggle  = document.getElementById('btnAuthToggle');
const authToggleText = document.getElementById('authToggleText');

btnAuthToggle.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUpMode = !isSignUpMode;
  authTitle.textContent      = isSignUpMode ? 'Create your Account'      : 'Sign In to GameScoreHub';
  btnAuthSubmit.textContent  = isSignUpMode ? 'Sign Up'                  : 'Sign In';
  authToggleText.textContent = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
  btnAuthToggle.textContent  = isSignUpMode ? 'Sign In'                  : 'Create one';
  authEmailGroup.style.display = isSignUpMode ? 'block' : 'none';
  authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.style.display = 'none';
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const email    = isSignUpMode
    ? (document.getElementById('authEmail').value.trim() || `${username}@gamemanage.local`)
    : username;
  if (!username) { authError.textContent = 'Username is required.'; authError.style.display = 'block'; return; }
  try {
    const endpoint = isSignUpMode ? '/auth/register' : '/auth/login';
    const payload  = isSignUpMode ? { email, password, username } : { email: username, password };
    const res = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    state.token = res.token; state.user = res.user;
    localStorage.setItem('gsh_token', res.token);
    initDashboard();
  } catch (err) { authError.textContent = err.message; authError.style.display = 'block'; }
});

document.getElementById('btnLogout').addEventListener('click', logout);

function logout() {
  state.token = null; state.user = null; state.games = []; state.selectedGame = null;
  localStorage.removeItem('gsh_token');
  clearInterval(state.timerInterval);
  showAuthScreen();
}

function showAuthScreen() {
  authScreen.style.display = 'block';
  dashboardView.style.display = 'none';
  navControls.style.display = 'none';
  statusBar.style.display = 'none';
  document.querySelectorAll('.auth-float').forEach(el => el.style.display = 'block');
}

// ==========================================
// 3. Dashboard
// ==========================================
async function initDashboard() {
  authScreen.style.display = 'none';
  dashboardView.style.display = 'block';
  navControls.style.display = 'flex';
  statusBar.style.display = 'flex';
  document.querySelectorAll('.auth-float').forEach(el => el.style.display = 'none');
  try {
    const meRes = await api('/auth/me');
    state.user = meRes.user;
    navUsername.textContent = state.user.username;
    const isAdmin = state.user && (state.user.is_admin || state.user.username.toLowerCase() === 'admin');
    const adminBadge  = document.getElementById('adminBadge');
    const btnDelGame  = document.getElementById('btnDeleteGame');
    if (adminBadge) adminBadge.style.display = isAdmin ? 'inline-block' : 'none';
    if (btnDelGame)  btnDelGame.style.display  = isAdmin ? 'inline-block' : 'none';
    await loadGames();
    startAutoRefreshTimer();
  } catch (err) { logout(); }
}

async function loadGames() {
  const { games } = await api('/games');
  state.games = games || [];
  gameSelect.innerHTML = '';
  matchGameSelect.innerHTML = '';
  if (state.games.length === 0) {
    gameSelect.innerHTML = '<option value="">No games yet (click + New Game)</option>';
    activeGameTitle.textContent = 'Welcome! Create your first game';
    activeGameBadge.style.display = 'none';
    activeGameMeta.textContent = 'Click "+ New Game" in the top bar to get started.';
    leaderboardBody.innerHTML = '<tr><td colspan="9" class="text-center">No games created yet.</td></tr>';
    matchesList.innerHTML = '<div class="empty-state">No games created yet.</div>';
    return;
  }
  activeGameBadge.style.display = 'inline-block';
  state.games.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id; opt.textContent = `${g.name} (${g.category.toUpperCase()})`;
    gameSelect.appendChild(opt);
    const mOpt = document.createElement('option');
    mOpt.value = g.id; mOpt.textContent = g.name;
    matchGameSelect.appendChild(mOpt);
  });
  if (!state.selectedGame || !state.games.find(g => g.id === state.selectedGame.id))
    state.selectedGame = state.games[0];
  else
    state.selectedGame = state.games.find(g => g.id === state.selectedGame.id);
  gameSelect.value = state.selectedGame.id;
  updateActiveGameBanner();
  await refreshGameData();
}

gameSelect.addEventListener('change', async (e) => {
  state.selectedGame = state.games.find(g => g.id === e.target.value);
  updateActiveGameBanner();
  await refreshGameData();
});

function updateActiveGameBanner() {
  if (!state.selectedGame) return;
  activeGameTitle.textContent = state.selectedGame.name;
  activeGameBadge.textContent = state.selectedGame.category.toUpperCase();
  activeGameBadge.className   = `badge badge-${state.selectedGame.category}`;
  const ruleNames = { highest_wins: 'Highest Score Wins', lowest_wins: 'Lowest Score Wins (Golf/Racing)', coop: 'Cooperative' };
  activeGameMeta.textContent = `Category: ${state.selectedGame.category.toUpperCase()} • Scoring Rule: ${ruleNames[state.selectedGame.scoring_type] || state.selectedGame.scoring_type}`;
}

async function refreshGameData() {
  if (!state.selectedGame) return;
  try {
    const [statsRes, matchesRes] = await Promise.all([
      api(`/stats?game_id=${state.selectedGame.id}`),
      api(`/matches?game_id=${state.selectedGame.id}`)
    ]);
    state.stats   = statsRes.stats   || [];
    state.matches = matchesRes.matches || [];
    const knownList = document.getElementById('knownPlayersList');
    if (knownList) {
      const names = new Set(state.stats.map(s => s.player_name));
      knownList.innerHTML = [...names].map(n => `<option value="${escapeHtml(n)}">`).join('');
    }
    renderLeaderboard();
    renderMatchesList();
  } catch (err) { console.error('Error refreshing:', err); }
}

// ==========================================
// 4. Leaderboard
// ==========================================
function renderLeaderboard() {
  const cat = state.selectedGame.category;
  const isAdmin = state.user && (state.user.is_admin || state.user.username.toLowerCase() === 'admin');
  if (cat === 'fps') {
    leaderboardHead.innerHTML = `<tr><th>Rank</th><th>Player</th><th>Team</th><th>Matches (W/L)</th><th>Kills/Deaths</th><th>K/D</th><th>Assists</th><th>Win Rate</th>${isAdmin?'<th></th>':''}</tr>`;
  } else if (cat === 'rpg') {
    leaderboardHead.innerHTML = `<tr><th>Rank</th><th>Player</th><th>Team</th><th>Quests</th><th>Cleared</th><th>Total XP</th><th>Total Gold</th><th>Win Rate</th>${isAdmin?'<th></th>':''}</tr>`;
  } else {
    leaderboardHead.innerHTML = `<tr><th>Rank</th><th>Player</th><th>Team</th><th>Matches</th><th>Wins</th><th>Avg Score</th><th>Avg Money</th><th>Win Rate</th>${isAdmin?'<th></th>':''}</tr>`;
  }
  if (state.stats.length === 0) {
    leaderboardBody.innerHTML = `<tr><td colspan="${isAdmin?9:8}" class="text-center">No matches recorded yet.</td></tr>`;
    return;
  }
  leaderboardBody.innerHTML = state.stats.map((row, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`;
    const teamCell = `<td>${row.teams ? escapeHtml(row.teams) : '<span class="stat-sub">—</span>'}</td>`;
    const deleteCell = isAdmin ? `<td><button class="btn-icon btn-delete-player" data-name="${escapeHtml(row.player_name)}" title="Delete player from this game">🗑️</button></td>` : '';
    if (cat === 'fps') return `<tr>
      <td><span class="rank-cell">${medal}</span></td>
      <td><strong>${escapeHtml(row.player_name)}</strong></td>
      ${teamCell}
      <td>${row.matches_played} <span class="stat-sub">(${row.wins}W/${row.matches_played-row.wins}L)</span></td>
      <td>${row.total_kills||0}/${row.total_deaths||0}</td>
      <td><span class="badge badge-fps">${row.kd_ratio}</span></td>
      <td>${row.total_assists||0}</td>
      <td><span class="win-rate-pill">${row.win_rate}%</span></td>${deleteCell}</tr>`;
    if (cat === 'rpg') return `<tr>
      <td><span class="rank-cell">${medal}</span></td>
      <td><strong>${escapeHtml(row.player_name)}</strong></td>
      ${teamCell}
      <td>${row.matches_played}</td><td>${row.wins} Cleared</td>
      <td>${row.total_kills||row.avg_score}</td>
      <td>${row.total_money?`$${Number(row.total_money).toLocaleString()}`:'—'}</td>
      <td><span class="win-rate-pill">${row.win_rate}%</span></td>${deleteCell}</tr>`;
    return `<tr>
      <td><span class="rank-cell">${medal}</span></td>
      <td><strong>${escapeHtml(row.player_name)}</strong></td>
      ${teamCell}
      <td>${row.matches_played}</td><td>${row.wins} Wins</td>
      <td>${row.avg_score}</td>
      <td>${row.avg_money?`$${Number(row.avg_money).toLocaleString()}`:'—'}</td>
      <td><span class="win-rate-pill">${row.win_rate}%</span></td>${deleteCell}</tr>`;
  }).join('');

  // Wire admin delete-player buttons
  document.querySelectorAll('.btn-delete-player').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const name = e.currentTarget.getAttribute('data-name');
      if (confirm(`Delete "${name}" and all their records from "${state.selectedGame.name}"? This cannot be undone.`)) {
        try {
          await api(`/players?name=${encodeURIComponent(name)}&game_id=${state.selectedGame.id}`, { method: 'DELETE' });
          await refreshGameData();
        } catch (err) { alert(`Failed to delete player: ${err.message}`); }
      }
    });
  });
}

// ==========================================
// 5. Matches Feed
// ==========================================
function renderMatchesList() {
  if (state.matches.length === 0) {
    matchesList.innerHTML = '<div class="empty-state">No match records yet. Click "+ Log Match Result" above!</div>';
    return;
  }
  matchesList.innerHTML = state.matches.map((m) => {
    const dateStr = new Date(m.played_at).toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const cat = m.game_category;

    // Group players by team for display
    const playersByTeam = {};
    const noTeamPlayers = [];
    (m.players || []).forEach(p => {
      if (p.team_name) {
        if (!playersByTeam[p.team_name]) playersByTeam[p.team_name] = [];
        playersByTeam[p.team_name].push(p);
      } else {
        noTeamPlayers.push(p);
      }
    });

    function renderPlayerLine(p) {
      let stat = '';
      if (cat === 'fps') {
        const kd = p.deaths > 0 ? (p.kills/p.deaths).toFixed(2) : p.kills;
        stat = `${p.kills??0}K / ${p.deaths??0}D / ${p.assists??0}A <span class="stat-sub">(${kd} K/D)</span>`;
      } else if (cat === 'rpg') {
        const ex = p.extra_stats || {};
        const ci = ex.character ? `${ex.character} (${ex.class||'Adventurer'})` : '';
        const xg = [ex.xp?`+${ex.xp} XP`:'', ex.gold?`${ex.gold} Gold`:''].filter(Boolean).join(', ');
        stat = [ci, xg, p.notes].filter(Boolean).join(' • ');
      } else {
        stat = `${p.score} pts${p.money?` <span class="stat-sub">| $${Number(p.money).toLocaleString()}</span>`:''}`;
      }
      return `<div class="match-player-line ${p.is_winner?'match-player-winner':''}">
        <span class="player-name-cell">
          ${p.is_winner?'<span class="winner-crown">🏆</span>':'<span class="player-dot"></span>'}
          <strong>${escapeHtml(p.player_name)}</strong>
        </span>
        <span class="player-stat">${stat}</span>
      </div>`;
    }

    // Build players section: teams as blocks, no-team players listed normally
    let playersHtml = '';

    // Render teams first
    Object.entries(playersByTeam).forEach(([teamName, teamPlayers]) => {
      const teamWon = teamPlayers.some(p => p.is_winner);
      playersHtml += `<div class="match-team-block ${teamWon ? 'match-team-winner' : ''}">
        <div class="match-team-label">
          🛡️ <strong>${escapeHtml(teamName)}</strong>
          ${teamWon ? '<span class="team-win-badge">🏆 Winner</span>' : ''}
        </div>
        <div class="match-team-players">
          ${teamPlayers.map(renderPlayerLine).join('')}
        </div>
      </div>`;
    });

    // Render no-team players
    if (noTeamPlayers.length > 0) {
      // If there were also teams, add a separator label
      if (Object.keys(playersByTeam).length > 0) {
        playersHtml += `<div class="match-noteam-label">👤 Individual Players</div>`;
      }
      playersHtml += noTeamPlayers.map(renderPlayerLine).join('');
    }

    const outcomeBadge = m.match_outcome ? `<span class="outcome-badge outcome-${m.match_outcome}">${m.match_outcome.toUpperCase()}</span>` : '';
    const loggedBy     = m.logged_by ? `<span class="logged-by">by ${escapeHtml(m.logged_by)}</span>` : '';
    const isAdmin  = state.user && (state.user.is_admin || state.user.username.toLowerCase() === 'admin');
    const isOwner  = state.user && m.match_owner_id === state.user.id;
    const canEdit  = isAdmin || isOwner;

    const actions = canEdit ? `
      <div class="match-actions">
        <button class="btn-icon btn-edit-match" data-match='${JSON.stringify({
          id: m.id, title: m.title||'', notes: m.notes||'',
          outcome: m.match_outcome||'completed',
          played_at: m.played_at, category: m.game_category,
          game_id: m.game_id,
          players: m.players||[]
        }).replace(/'/g,"&#39;")}' title="Edit match">✏️</button>
        <button class="btn-icon btn-delete-match" data-id="${m.id}" title="Delete match">🗑️</button>
      </div>` : '';

    return `<div class="match-card">
      <div class="match-card-header">
        <div class="match-card-meta">
          <span class="match-card-title">${escapeHtml(m.title||'Match Record')}</span>
          ${outcomeBadge}${loggedBy}
        </div>
        <div class="match-card-right">
          <span class="match-card-date">📅 ${dateStr}</span>
          ${actions}
        </div>
      </div>
      ${m.notes?`<p class="match-notes">${escapeHtml(m.notes)}</p>`:''}
      <div class="match-players-feed">${playersHtml}</div>
    </div>`;
  }).join('');

  document.querySelectorAll('.btn-delete-match').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (confirm('Delete this match record? This cannot be undone.')) {
        try { await api(`/matches/${id}`, { method: 'DELETE' }); await refreshGameData(); }
        catch (err) { alert(`Failed to delete: ${err.message}`); }
      }
    });
  });

  document.querySelectorAll('.btn-edit-match').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const raw = e.currentTarget.getAttribute('data-match');
      const m   = JSON.parse(raw.replace(/&#39;/g, "'"));
      openEditMatchModal(m);
    });
  });
}

// ==========================================
// 6. Auto-Refresh Timer
// ==========================================
function startAutoRefreshTimer() {
  clearInterval(state.timerInterval);
  state.refreshTimer = AUTO_REFRESH_SECONDS;
  updateTimerDisplay();
  state.timerInterval = setInterval(async () => {
    state.refreshTimer--;
    if (state.refreshTimer <= 0) { state.refreshTimer = AUTO_REFRESH_SECONDS; await refreshGameData(); }
    updateTimerDisplay();
  }, 1000);
}
function updateTimerDisplay() {
  const m = Math.floor(state.refreshTimer/60), s = state.refreshTimer%60;
  timerText.textContent = `Next auto-refresh in ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
document.getElementById('btnManualRefresh').addEventListener('click', async () => {
  state.refreshTimer = AUTO_REFRESH_SECONDS; updateTimerDisplay(); await refreshGameData();
});

// ==========================================
// 7. Shared: player row builders
// ==========================================
function getPlayerHeaders(category) {
  if (category === 'fps') return `
    <tr><th style="width:28px">#</th><th>Player Name</th>
    <th style="width:70px">Kills</th><th style="width:70px">Deaths</th>
    <th style="width:70px">Assists</th><th style="width:85px">Score/Dmg</th>
    <th style="width:60px">MVP?</th><th style="width:35px"></th></tr>`;
  if (category === 'rpg') return `
    <tr><th style="width:28px">#</th><th>Player Name</th>
    <th>Class/Role</th><th style="width:65px">Level</th>
    <th style="width:80px">XP</th><th style="width:80px">Gold</th>
    <th style="width:35px"></th></tr>`;
  return `
    <tr><th style="width:28px">#</th><th>Player Name</th>
    <th style="width:105px">Score/Pts</th><th style="width:105px">Money ($)</th>
    <th style="width:85px">Rank</th><th style="width:70px">Winner?</th>
    <th style="width:35px"></th></tr>`;
}

function buildPlayerRow(category, rowNum, prefill) {
  const p  = prefill || {};
  const tr = document.createElement('tr');
  const ex = p.extra_stats || {};
  if (category === 'fps') {
    tr.innerHTML = `
      <td>${rowNum}</td>
      <td><input type="text" class="p-name" placeholder="Player ${rowNum}" list="knownPlayersList" value="${escapeHtml(p.player_name||'')}" required></td>
      <td><input type="number" class="p-kills"   min="0" value="${p.kills??0}"></td>
      <td><input type="number" class="p-deaths"  min="0" value="${p.deaths??0}"></td>
      <td><input type="number" class="p-assists" min="0" value="${p.assists??0}"></td>
      <td><input type="number" class="p-score"   placeholder="Score" value="${p.score||''}"></td>
      <td class="text-center"><input type="checkbox" class="p-winner" ${p.is_winner?'checked':''}></td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-remove-row">&times;</button></td>`;
  } else if (category === 'rpg') {
    tr.innerHTML = `
      <td>${rowNum}</td>
      <td><input type="text" class="p-name" placeholder="Hero Name" list="knownPlayersList" value="${escapeHtml(p.player_name||'')}" required></td>
      <td><input type="text"   class="p-rpg-class" placeholder="e.g. Mage" value="${escapeHtml(ex.class||'')}"></td>
      <td><input type="number" class="p-rpg-level" min="1" value="${ex.level||1}"></td>
      <td><input type="number" class="p-rpg-xp"    value="${ex.xp||0}"></td>
      <td><input type="number" class="p-rpg-gold"  value="${ex.gold||0}"></td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-remove-row">&times;</button></td>`;
  } else {
    tr.innerHTML = `
      <td>${rowNum}</td>
      <td><input type="text"   class="p-name"  placeholder="Player ${rowNum}" list="knownPlayersList" value="${escapeHtml(p.player_name||'')}" required></td>
      <td><input type="number" class="p-score" step="any" value="${p.score??0}" required></td>
      <td><input type="number" class="p-money" step="any" placeholder="$" value="${p.money||''}"></td>
      <td><input type="number" class="p-rank"  min="1" value="${p.rank||rowNum}"></td>
      <td class="text-center"><input type="checkbox" class="p-winner" ${p.is_winner?'checked':''}></td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-remove-row">&times;</button></td>`;
  }
  tr.querySelector('.btn-remove-row').addEventListener('click', () => tr.remove());
  return tr;
}

function collectPlayers(tbody, category, teamName) {
  const rows = tbody.querySelectorAll('tr');
  const out  = [];
  rows.forEach((tr, idx) => {
    const name = tr.querySelector('.p-name')?.value.trim() || `Player ${idx+1}`;
    if (category === 'fps') {
      out.push({ player_name: name, team_name: teamName||null,
        kills:    Number(tr.querySelector('.p-kills')?.value||0),
        deaths:   Number(tr.querySelector('.p-deaths')?.value||0),
        assists:  Number(tr.querySelector('.p-assists')?.value||0),
        score:    Number(tr.querySelector('.p-score')?.value||0),
        is_winner: tr.querySelector('.p-winner')?.checked });
    } else if (category === 'rpg') {
      const xp = Number(tr.querySelector('.p-rpg-xp')?.value||0);
      out.push({ player_name: name, team_name: teamName||null, score: xp,
        extra_stats: {
          class: tr.querySelector('.p-rpg-class')?.value,
          level: Number(tr.querySelector('.p-rpg-level')?.value||1),
          xp, gold: Number(tr.querySelector('.p-rpg-gold')?.value||0)
        }, is_winner: true });
    } else {
      out.push({ player_name: name, team_name: teamName||null,
        score:    Number(tr.querySelector('.p-score')?.value||0),
        money:    tr.querySelector('.p-money')?.value ? Number(tr.querySelector('.p-money').value) : null,
        rank:     Number(tr.querySelector('.p-rank')?.value||idx+1),
        is_winner: tr.querySelector('.p-winner')?.checked });
    }
  });
  return out;
}

// ==========================================
// 8. Teams helper
// ==========================================
let teamCounter = 0; // increments per session so Team 1, Team 2 etc.

function buildTeamBlock(teamName, category, prefillPlayers, container) {
  const block = document.createElement('div');
  block.className = 'team-block';

  // Auto-assign a team label based on position in container
  function getAutoLabel() {
    const idx = Array.from(container.querySelectorAll('.team-block')).indexOf(block);
    return `Team ${idx + 1}`;
  }

  const header = document.createElement('div');
  header.className = 'team-header';
  // Show team label (read-only display, no text input needed)
  const labelSpan = document.createElement('span');
  labelSpan.className = 'team-auto-label';
  labelSpan.textContent = teamName || 'Team';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-ghost btn-xs team-remove-btn';
  removeBtn.title = 'Remove team';
  removeBtn.textContent = '✕ Remove Team';

  header.appendChild(document.createTextNode('🛡️ '));
  header.appendChild(labelSpan);
  header.appendChild(removeBtn);
  block.appendChild(header);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-responsive';
  const table = document.createElement('table');
  table.className = 'input-table';
  const thead = document.createElement('thead');
  thead.innerHTML = getPlayerHeaders(category);
  const tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  block.appendChild(tableWrap);

  (prefillPlayers || []).forEach((p, i) => tbody.appendChild(buildPlayerRow(category, i+1, p)));
  if (!prefillPlayers || prefillPlayers.length === 0) tbody.appendChild(buildPlayerRow(category, 1));

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-secondary btn-sm mt-2';
  addBtn.textContent = '+ Add Player to Team';
  addBtn.addEventListener('click', () => tbody.appendChild(buildPlayerRow(category, tbody.children.length + 1)));
  block.appendChild(addBtn);

  removeBtn.addEventListener('click', () => {
    block.remove();
    // Re-label remaining teams
    relabelTeams(container);
  });

  container.appendChild(block);

  // Label all teams in order after adding
  relabelTeams(container);
  return block;
}

function relabelTeams(container) {
  container.querySelectorAll('.team-block').forEach((block, idx) => {
    const lbl = block.querySelector('.team-auto-label');
    if (lbl) lbl.textContent = `Team ${idx + 1}`;
  });
}

// ==========================================
// 9. New Match Modal
// ==========================================
document.getElementById('btnOpenNewMatch').addEventListener('click', () => {
  if (state.games.length === 0) { alert('Please create a game first!'); return; }
  openNewMatchModal();
});

function openNewMatchModal() {
  matchGameSelect.value = state.selectedGame ? state.selectedGame.id : state.games[0].id;
  document.getElementById('matchPlayedAt').value = new Date().toISOString().slice(0,16);
  document.getElementById('matchTitle').value  = '';
  document.getElementById('matchNotes').value  = '';
  onMatchGameChanged();
  matchModal.style.display = 'flex';
}

matchGameSelect.addEventListener('change', onMatchGameChanged);

function onMatchGameChanged() {
  const game = state.games.find(g => g.id === matchGameSelect.value) || state.selectedGame;
  if (!game) return;
  modalCategoryBadge.textContent = game.category.toUpperCase();
  modalCategoryBadge.className   = `badge-display badge-${game.category}`;
  matchPlayersHead.innerHTML = getPlayerHeaders(game.category);
  matchPlayersBody.innerHTML = '';
  // Start with one team block containing 2 players already added
  const teamsContainer = document.getElementById('newMatchTeamsContainer');
  teamsContainer.innerHTML = '';
  buildTeamBlock('', game.category, [{}, {}], teamsContainer);
}

document.getElementById('btnAddTeam').addEventListener('click', () => {
  const game = state.games.find(g => g.id === matchGameSelect.value) || state.selectedGame;
  const cat  = game ? game.category : 'board';
  buildTeamBlock('', cat, [], document.getElementById('newMatchTeamsContainer'));
});

document.getElementById('matchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const gameId = matchGameSelect.value;
  const game   = state.games.find(g => g.id === gameId);
  const cat    = game ? game.category : 'board';

  // Collect standalone players
  let players = collectPlayers(matchPlayersBody, cat, null);

  // Collect team players
  document.querySelectorAll('#newMatchTeamsContainer .team-block').forEach(block => {
    const teamName = block.querySelector('.team-auto-label')?.textContent.trim() || 'Team';
    const tbody    = block.querySelector('tbody');
    players = players.concat(collectPlayers(tbody, cat, teamName));
  });

  const payload = {
    game_id:       gameId,
    title:         document.getElementById('matchTitle').value.trim() || null,
    match_outcome: document.getElementById('matchOutcome').value,
    played_at:     new Date(document.getElementById('matchPlayedAt').value).toISOString(),
    notes:         document.getElementById('matchNotes').value.trim() || null,
    players
  };

  try {
    await api('/matches', { method: 'POST', body: JSON.stringify(payload) });
    matchModal.style.display = 'none';
    await refreshGameData();
  } catch (err) { alert(`Failed to save match: ${err.message}`); }
});

// ==========================================
// 10. Edit Match Modal
// ==========================================
function openEditMatchModal(m) {
  document.getElementById('editMatchId').value       = m.id;
  document.getElementById('editMatchCategory').value = m.category;
  document.getElementById('editMatchTitle').value    = m.title || '';
  document.getElementById('editMatchNotes').value    = m.notes || '';
  document.getElementById('editMatchOutcome').value  = m.outcome || 'completed';
  document.getElementById('editMatchError').style.display = 'none';

  // Populate game dropdown
  const editGameSelect = document.getElementById('editMatchGameSelect');
  editGameSelect.innerHTML = '';
  state.games.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    // select the game that matches this match's category (best guess by matching current game)
    if (g.category === m.category && !editGameSelect.value) opt.selected = true;
    editGameSelect.appendChild(opt);
  });
  // Try to find the game by stored game_id if available
  if (m.game_id) editGameSelect.value = m.game_id;

  // Set category badge
  const selGame = state.games.find(g => g.id === editGameSelect.value) || state.games[0];
  const editBadge = document.getElementById('editModalCategoryBadge');
  if (editBadge && selGame) {
    editBadge.textContent = selGame.category.toUpperCase();
    editBadge.className = `badge-display badge-${selGame.category}`;
  }

  // When game changes, rebuild player headers
  editGameSelect.onchange = () => {
    const g = state.games.find(g => g.id === editGameSelect.value);
    if (!g) return;
    document.getElementById('editMatchCategory').value = g.category;
    if (editBadge) { editBadge.textContent = g.category.toUpperCase(); editBadge.className = `badge-display badge-${g.category}`; }
    document.getElementById('editMatchPlayersHead').innerHTML = getPlayerHeaders(g.category);
    document.getElementById('editMatchPlayersBody').innerHTML = '';
    document.getElementById('editTeamsContainer').innerHTML = '';
    document.getElementById('editMatchPlayersBody').appendChild(buildPlayerRow(g.category, 1));
  };

  // Set date
  const dt = document.getElementById('editMatchPlayedAt');
  try { dt.value = new Date(m.played_at).toISOString().slice(0,16); } catch(e) { dt.value = ''; }

  const cat     = m.category;
  const players = m.players || [];

  // Rebuild headers
  document.getElementById('editMatchPlayersHead').innerHTML = getPlayerHeaders(cat);
  document.getElementById('editMatchPlayersBody').innerHTML = '';
  document.getElementById('editTeamsContainer').innerHTML   = '';

  // Group players by team
  const noTeam  = players.filter(p => !p.team_name);
  const teamMap = {};
  players.filter(p => p.team_name).forEach(p => {
    if (!teamMap[p.team_name]) teamMap[p.team_name] = [];
    teamMap[p.team_name].push(p);
  });

  // Render standalone players
  const editBody = document.getElementById('editMatchPlayersBody');
  noTeam.forEach((p, i) => editBody.appendChild(buildPlayerRow(cat, i+1, p)));
  if (noTeam.length === 0) editBody.appendChild(buildPlayerRow(cat, 1));

  // Render teams
  const teamsContainer = document.getElementById('editTeamsContainer');
  Object.entries(teamMap).forEach(([name, tPlayers]) => {
    buildTeamBlock(name, cat, tPlayers, teamsContainer);
  });

  // Wire add-player and add-team buttons
  document.getElementById('btnEditAddPlayerRow').onclick = () => {
    const curCat = document.getElementById('editMatchCategory').value;
    const n = editBody.children.length + 1;
    editBody.appendChild(buildPlayerRow(curCat, n));
  };
  document.getElementById('btnEditAddTeam').onclick = () => {
    const curCat = document.getElementById('editMatchCategory').value;
    buildTeamBlock('', curCat, [], teamsContainer);
  };

  document.getElementById('editMatchModal').style.display = 'flex';
}

document.getElementById('editMatchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id     = document.getElementById('editMatchId').value;
  const cat    = document.getElementById('editMatchCategory').value;
  const gameId = document.getElementById('editMatchGameSelect').value;
  const errEl  = document.getElementById('editMatchError');
  errEl.style.display = 'none';

  // Collect standalone players
  let players = collectPlayers(document.getElementById('editMatchPlayersBody'), cat, null);

  // Collect team players
  document.querySelectorAll('#editTeamsContainer .team-block').forEach(block => {
    const teamName = block.querySelector('.team-auto-label')?.textContent.trim() || 'Team';
    const tbody    = block.querySelector('tbody');
    players = players.concat(collectPlayers(tbody, cat, teamName));
  });

  const dtVal = document.getElementById('editMatchPlayedAt').value;

  try {
    await api(`/matches/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        game_id:       gameId,
        title:         document.getElementById('editMatchTitle').value.trim()  || null,
        notes:         document.getElementById('editMatchNotes').value.trim()  || null,
        match_outcome: document.getElementById('editMatchOutcome').value,
        played_at:     dtVal ? new Date(dtVal).toISOString() : null,
        players
      })
    });
    document.getElementById('editMatchModal').style.display = 'none';
    await refreshGameData();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

// ==========================================
// 11. Create Game Modal
// ==========================================
document.getElementById('btnOpenNewGame').addEventListener('click', () => {
  document.getElementById('newGameName').value = '';
  gameModal.style.display = 'flex';
});

document.getElementById('gameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name         = document.getElementById('newGameName').value.trim();
  const category     = document.getElementById('newGameCategory').value;
  const scoring_type = document.getElementById('newGameScoring').value;
  try {
    const res = await api('/games', { method: 'POST', body: JSON.stringify({ name, category, scoring_type }) });
    state.selectedGame = res.game;
    gameModal.style.display = 'none';
    await loadGames();
  } catch (err) { alert(`Failed to create game: ${err.message}`); }
});

// ==========================================
// 12. Modal close + Delete Game
// ==========================================
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const m = document.getElementById(e.target.getAttribute('data-close'));
    if (m) m.style.display = 'none';
  });
});

document.getElementById('btnDeleteGame')?.addEventListener('click', async () => {
  if (!state.selectedGame) return;
  if (confirm(`Delete "${state.selectedGame.name}" and all its match history?`)) {
    try {
      await api(`/games/${state.selectedGame.id}`, { method: 'DELETE' });
      state.selectedGame = null;
      await loadGames();
    } catch (err) { alert(`Failed to delete game: ${err.message}`); }
  }
});

// ==========================================
// Utility
// ==========================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ==========================================
// Startup
// ==========================================
if (state.token) initDashboard(); else showAuthScreen();
