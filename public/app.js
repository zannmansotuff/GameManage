// ==========================================
// Game Score Hub - Vanilla JavaScript Engine
// ==========================================

const API_BASE = '/api';
const AUTO_REFRESH_SECONDS = 300; // 5 minutes

// Application State
const state = {
  token: localStorage.getItem('gsh_token') || null,
  user: null,
  games: [],
  selectedGame: null,
  matches: [],
  stats: [],
  refreshTimer: AUTO_REFRESH_SECONDS,
  timerInterval: null
};

// DOM Elements
const authScreen = document.getElementById('authScreen');
const dashboardView = document.getElementById('dashboardView');
const navControls = document.getElementById('navControls');
const statusBar = document.getElementById('statusBar');
const navUsername = document.getElementById('navUsername');
const gameSelect = document.getElementById('gameSelect');
const activeGameTitle = document.getElementById('activeGameTitle');
const activeGameBadge = document.getElementById('activeGameBadge');
const activeGameMeta = document.getElementById('activeGameMeta');
const leaderboardHead = document.getElementById('leaderboardHead');
const leaderboardBody = document.getElementById('leaderboardBody');
const matchesList = document.getElementById('matchesList');
const timerText = document.getElementById('timerText');

// Modals
const matchModal = document.getElementById('matchModal');
const gameModal = document.getElementById('gameModal');
const matchGameSelect = document.getElementById('matchGameSelect');
const modalCategoryBadge = document.getElementById('modalCategoryBadge');
const matchPlayersHead = document.getElementById('matchPlayersHead');
const matchPlayersBody = document.getElementById('matchPlayersBody');

// ==========================================
// 1. API Client
// ==========================================

async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && state.token) {
        logout();
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

// ==========================================
// 2. Authentication Flow
// ==========================================

let isSignUpMode = false;
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authError = document.getElementById('authError');
const usernameGroup = document.getElementById('usernameGroup');
const btnAuthSubmit = document.getElementById('btnAuthSubmit');
const btnAuthToggle = document.getElementById('btnAuthToggle');
const authToggleText = document.getElementById('authToggleText');

btnAuthToggle.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUpMode = !isSignUpMode;
  authTitle.textContent = isSignUpMode ? 'Create your Account' : 'Sign In to GameScoreHub';
  btnAuthSubmit.textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
  authToggleText.textContent = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
  btnAuthToggle.textContent = isSignUpMode ? 'Sign In' : 'Create one';
  usernameGroup.style.display = isSignUpMode ? 'block' : 'none';
  authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.style.display = 'none';
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const username = document.getElementById('authUsername').value;

  try {
    const endpoint = isSignUpMode ? '/auth/register' : '/auth/login';
    const payload = isSignUpMode ? { email, password, username } : { email, password };
    const res = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });

    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('gsh_token', res.token);
    initDashboard();
  } catch (err) {
    authError.textContent = err.message;
    authError.style.display = 'block';
  }
});

document.getElementById('btnLogout').addEventListener('click', logout);

function logout() {
  state.token = null;
  state.user = null;
  state.games = [];
  state.selectedGame = null;
  localStorage.removeItem('gsh_token');
  clearInterval(state.timerInterval);
  showAuthScreen();
}

function showAuthScreen() {
  authScreen.style.display = 'block';
  dashboardView.style.display = 'none';
  navControls.style.display = 'none';
  statusBar.style.display = 'none';
}

// ==========================================
// 3. Dashboard & Game Management
// ==========================================

async function initDashboard() {
  authScreen.style.display = 'none';
  dashboardView.style.display = 'block';
  navControls.style.display = 'flex';
  statusBar.style.display = 'flex';

  try {
    const meRes = await api('/auth/me');
    state.user = meRes.user;
    navUsername.textContent = state.user.username;

    await loadGames();
    startAutoRefreshTimer();
  } catch (err) {
    logout();
  }
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
    leaderboardBody.innerHTML = '<tr><td colspan="7" class="text-center">No games created yet.</td></tr>';
    matchesList.innerHTML = '<div class="empty-state">No games created yet.</div>';
    return;
  }

  activeGameBadge.style.display = 'inline-block';

  state.games.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.name} (${g.category.toUpperCase()})`;
    gameSelect.appendChild(opt);

    const matchOpt = document.createElement('option');
    matchOpt.value = g.id;
    matchOpt.textContent = g.name;
    matchGameSelect.appendChild(matchOpt);
  });

  if (!state.selectedGame || !state.games.find(g => g.id === state.selectedGame.id)) {
    state.selectedGame = state.games[0];
  } else {
    state.selectedGame = state.games.find(g => g.id === state.selectedGame.id);
  }

  gameSelect.value = state.selectedGame.id;
  updateActiveGameBanner();
  await refreshGameData();
}

gameSelect.addEventListener('change', async (e) => {
  const gId = e.target.value;
  state.selectedGame = state.games.find(g => g.id === gId);
  updateActiveGameBanner();
  await refreshGameData();
});

function updateActiveGameBanner() {
  if (!state.selectedGame) return;
  activeGameTitle.textContent = state.selectedGame.name;
  activeGameBadge.textContent = state.selectedGame.category.toUpperCase();
  activeGameBadge.className = `badge badge-${state.selectedGame.category}`;

  const ruleNames = {
    highest_wins: 'Highest Score Wins',
    lowest_wins: 'Lowest Score Wins (Golf/Racing)',
    coop: 'Cooperative / Quest Victory'
  };
  activeGameMeta.textContent = `Category: ${state.selectedGame.category.toUpperCase()} • Scoring Rule: ${ruleNames[state.selectedGame.scoring_type] || state.selectedGame.scoring_type}`;
}

async function refreshGameData() {
  if (!state.selectedGame) return;

  try {
    const [statsRes, matchesRes] = await Promise.all([
      api(`/stats?game_id=${state.selectedGame.id}`),
      api(`/matches?game_id=${state.selectedGame.id}`)
    ]);

    state.stats = statsRes.stats || [];
    state.matches = matchesRes.matches || [];

    // Update known players datalist for autocomplete
    const knownList = document.getElementById('knownPlayersList');
    if (knownList && state.stats) {
      const playerNames = new Set(state.stats.map(s => s.player_name));
      knownList.innerHTML = [...playerNames].map(name => `<option value="${escapeHtml(name)}">`).join('');
    }

    renderLeaderboard();
    renderMatchesList();
  } catch (err) {
    console.error('Error refreshing game data:', err);
  }
}

// ==========================================
// 4. Adaptive Leaderboard Rendering
// ==========================================

function renderLeaderboard() {
  const category = state.selectedGame.category;

  // Build Headers dynamically based on category
  if (category === 'fps') {
    leaderboardHead.innerHTML = `
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Matches (W/L)</th>
        <th>Kills / Deaths</th>
        <th>K/D Ratio</th>
        <th>Assists</th>
        <th>Win Rate</th>
      </tr>
    `;
  } else if (category === 'rpg') {
    leaderboardHead.innerHTML = `
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Quests / Raids</th>
        <th>Wins / Cleared</th>
        <th>Total XP</th>
        <th>Total Gold</th>
        <th>Win Rate</th>
      </tr>
    `;
  } else {
    // Board Game or Custom
    leaderboardHead.innerHTML = `
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Matches</th>
        <th>Wins</th>
        <th>Avg Score</th>
        <th>Avg Money ($)</th>
        <th>Win Rate</th>
      </tr>
    `;
  }

  if (state.stats.length === 0) {
    leaderboardBody.innerHTML = '<tr><td colspan="7" class="text-center">No matches recorded for this game yet.</td></tr>';
    return;
  }

  leaderboardBody.innerHTML = state.stats.map((row, idx) => {
    const medal = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : `#${idx + 1} `;

    if (category === 'fps') {
      return `
        <tr>
          <td><strong>${medal}</strong></td>
          <td><strong>${escapeHtml(row.player_name)}</strong></td>
          <td>${row.matches_played} (${row.wins}W - ${row.matches_played - row.wins}L)</td>
          <td>${row.total_kills || 0} / ${row.total_deaths || 0}</td>
          <td><span class="badge badge-fps">${row.kd_ratio}</span></td>
          <td>${row.total_assists || 0}</td>
          <td>${row.win_rate}%</td>
        </tr>
      `;
    } else if (category === 'rpg') {
      return `
        <tr>
          <td><strong>${medal}</strong></td>
          <td><strong>${escapeHtml(row.player_name)}</strong></td>
          <td>${row.matches_played}</td>
          <td>${row.wins} Cleared</td>
          <td>${(row.total_kills || 0) > 0 ? row.total_kills.toLocaleString() : row.avg_score}</td>
          <td>${row.total_money ? `$${Number(row.total_money).toLocaleString()}` : '-'}</td>
          <td>${row.win_rate}%</td>
        </tr>
      `;
    } else {
      return `
        <tr>
          <td><strong>${medal}</strong></td>
          <td><strong>${escapeHtml(row.player_name)}</strong></td>
          <td>${row.matches_played}</td>
          <td>${row.wins} Wins</td>
          <td>${row.avg_score}</td>
          <td>${row.avg_money ? `$${Number(row.avg_money).toLocaleString()}` : '-'}</td>
          <td>${row.win_rate}%</td>
        </tr>
      `;
    }
  }).join('');
}

// ==========================================
// 5. Recent Matches Feed
// ==========================================

function renderMatchesList() {
  if (state.matches.length === 0) {
    matchesList.innerHTML = '<div class="empty-state">No match records yet. Click "+ Log Match Result" above!</div>';
    return;
  }

  matchesList.innerHTML = state.matches.map((m) => {
    const dateStr = new Date(m.played_at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const category = m.game_category;

    const playersHtml = (m.players || []).map((p) => {
      let statSummary = '';
      if (category === 'fps') {
        const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills;
        statSummary = `${p.kills ?? 0} Kills | ${p.deaths ?? 0} Deaths | ${p.assists ?? 0} Assists (${kd} K/D)`;
      } else if (category === 'rpg') {
        const extra = p.extra_stats || {};
        const charInfo = extra.character ? `${extra.character} (${extra.class || 'Adventurer'})` : '';
        const xpGold = [extra.xp ? `+${extra.xp} XP` : '', extra.gold ? `${extra.gold} Gold` : ''].filter(Boolean).join(', ');
        statSummary = [charInfo, xpGold, p.notes].filter(Boolean).join(' • ');
      } else {
        const moneyStr = p.money ? ` | $${Number(p.money).toLocaleString()}` : '';
        statSummary = `${p.score} pts${moneyStr}`;
      }

      const winnerBadge = p.is_winner ? '🏆 [Winner] ' : '';
      return `
        <div class="match-player-line ${p.is_winner ? 'match-player-winner' : ''}">
          <span><strong>${winnerBadge}${escapeHtml(p.player_name)}</strong></span>
          <span>${statSummary}</span>
        </div>
      `;
    }).join('');

    const outcomeBadge = m.match_outcome ? `<span class="badge">${m.match_outcome.toUpperCase()}</span>` : '';

    return `
      <div class="match-card">
        <div class="match-card-header">
          <div>
            <span class="match-card-title">${escapeHtml(m.title || 'Match Record')}</span>
            ${outcomeBadge}
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span class="match-card-date">${dateStr}</span>
            <button class="btn btn-ghost btn-xs btn-delete-match" data-id="${m.id}" style="color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2);" title="Delete match record">🗑️</button>
          </div>
        </div>
        ${m.notes ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">${escapeHtml(m.notes)}</p>` : ''}
        <div class="match-players-feed">
          ${playersHtml}
        </div>
      </div>
    `;
  }).join('');

  // Wire up delete handlers
  document.querySelectorAll('.btn-delete-match').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const matchId = e.currentTarget.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this match record? This cannot be undone.')) {
        try {
          await api(`/matches/${matchId}`, { method: 'DELETE' });
          await refreshGameData();
        } catch (err) {
          alert(`Failed to delete match: ${err.message}`);
        }
      }
    });
  });
}

// ==========================================
// 6. 5-Minute Auto-Refresh Timer
// ==========================================

function startAutoRefreshTimer() {
  clearInterval(state.timerInterval);
  state.refreshTimer = AUTO_REFRESH_SECONDS;
  updateTimerDisplay();

  state.timerInterval = setInterval(async () => {
    state.refreshTimer--;
    if (state.refreshTimer <= 0) {
      state.refreshTimer = AUTO_REFRESH_SECONDS;
      await refreshGameData();
    }
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.refreshTimer / 60);
  const s = state.refreshTimer % 60;
  timerText.textContent = `Next auto-refresh in ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

document.getElementById('btnManualRefresh').addEventListener('click', async () => {
  state.refreshTimer = AUTO_REFRESH_SECONDS;
  updateTimerDisplay();
  await refreshGameData();
});

// ==========================================
// 7. Dynamic Match Modal (FPS, Board, RPG)
// ==========================================

document.getElementById('btnOpenNewMatch').addEventListener('click', () => {
  if (state.games.length === 0) {
    alert('Please create a game first!');
    return;
  }
  openMatchModal();
});

function openMatchModal() {
  matchGameSelect.value = state.selectedGame ? state.selectedGame.id : state.games[0].id;
  document.getElementById('matchPlayedAt').value = new Date().toISOString().slice(0, 16);
  document.getElementById('matchTitle').value = '';
  document.getElementById('matchNotes').value = '';

  onMatchGameChanged();
  matchModal.style.display = 'flex';
}

matchGameSelect.addEventListener('change', onMatchGameChanged);

function onMatchGameChanged() {
  const game = state.games.find(g => g.id === matchGameSelect.value) || state.selectedGame;
  if (!game) return;

  modalCategoryBadge.textContent = game.category.toUpperCase();
  modalCategoryBadge.className = `badge-display badge-${game.category}`;

  renderModalPlayerHeaders(game.category);
  matchPlayersBody.innerHTML = '';
  // Default to 2 players
  addPlayerRow(game.category);
  addPlayerRow(game.category);
}

function renderModalPlayerHeaders(category) {
  if (category === 'fps') {
    matchPlayersHead.innerHTML = `
      <tr>
        <th style="width:30px">#</th>
        <th>Player Name</th>
        <th style="width:75px">Kills</th>
        <th style="width:75px">Deaths</th>
        <th style="width:75px">Assists</th>
        <th style="width:90px">Score/Dmg</th>
        <th style="width:65px">MVP?</th>
        <th style="width:40px"></th>
      </tr>
    `;
  } else if (category === 'rpg') {
    matchPlayersHead.innerHTML = `
      <tr>
        <th style="width:30px">#</th>
        <th>Player Name</th>
        <th>Class / Role</th>
        <th style="width:70px">Level</th>
        <th style="width:85px">XP Gained</th>
        <th style="width:85px">Gold Loot</th>
        <th style="width:40px"></th>
      </tr>
    `;
  } else {
    // Board Game or Custom
    matchPlayersHead.innerHTML = `
      <tr>
        <th style="width:30px">#</th>
        <th>Player Name</th>
        <th style="width:110px">Score/Points</th>
        <th style="width:110px">Money ($)</th>
        <th style="width:90px">Rank/Place</th>
        <th style="width:75px">Winner?</th>
        <th style="width:40px"></th>
      </tr>
    `;
  }
}

document.getElementById('btnAddPlayerRow').addEventListener('click', () => {
  const game = state.games.find(g => g.id === matchGameSelect.value) || state.selectedGame;
  addPlayerRow(game ? game.category : 'board');
});

function addPlayerRow(category) {
  const rowCount = matchPlayersBody.children.length + 1;
  const tr = document.createElement('tr');

  if (category === 'fps') {
    tr.innerHTML = `
      <td>${rowCount}</td>
      <td><input type="text" class="p-name" placeholder="Player ${rowCount}" list="knownPlayersList" required></td>
      <td><input type="number" class="p-kills" min="0" value="0"></td>
      <td><input type="number" class="p-deaths" min="0" value="0"></td>
      <td><input type="number" class="p-assists" min="0" value="0"></td>
      <td><input type="number" class="p-score" placeholder="Score"></td>
      <td class="text-center"><input type="checkbox" class="p-winner"></td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-remove-row">&times;</button></td>
    `;
  } else if (category === 'rpg') {
    tr.innerHTML = `
      <td>${rowCount}</td>
      <td><input type="text" class="p-name" placeholder="Hero Name" list="knownPlayersList" required></td>
      <td><input type="text" class="p-rpg-class" placeholder="e.g. Mage/Tank"></td>
      <td><input type="number" class="p-rpg-level" min="1" value="1"></td>
      <td><input type="number" class="p-rpg-xp" placeholder="XP" value="0"></td>
      <td><input type="number" class="p-rpg-gold" placeholder="Gold" value="0"></td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-remove-row">&times;</button></td>
    `;
  } else {
    tr.innerHTML = `
      <td>${rowCount}</td>
      <td><input type="text" class="p-name" placeholder="Player ${rowCount}" list="knownPlayersList" required></td>
      <td><input type="number" class="p-score" step="any" value="0" required></td>
      <td><input type="number" class="p-money" placeholder="$" step="any"></td>
      <td><input type="number" class="p-rank" min="1" value="${rowCount}"></td>
      <td class="text-center"><input type="checkbox" class="p-winner" ${rowCount === 1 ? 'checked' : ''}></td>
      <td><button type="button" class="btn btn-ghost btn-xs btn-remove-row">&times;</button></td>
    `;
  }

  tr.querySelector('.btn-remove-row').addEventListener('click', () => tr.remove());
  matchPlayersBody.appendChild(tr);
}

// Submit Match Form
document.getElementById('matchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const gameId = matchGameSelect.value;
  const game = state.games.find(g => g.id === gameId);
  const category = game ? game.category : 'board';

  const rows = matchPlayersBody.querySelectorAll('tr');
  const players = [];

  rows.forEach((tr, idx) => {
    const name = tr.querySelector('.p-name').value.trim() || `Player ${idx + 1}`;

    if (category === 'fps') {
      const kills = Number(tr.querySelector('.p-kills').value || 0);
      const deaths = Number(tr.querySelector('.p-deaths').value || 0);
      const assists = Number(tr.querySelector('.p-assists').value || 0);
      const score = Number(tr.querySelector('.p-score').value || kills);
      const isWinner = tr.querySelector('.p-winner').checked;
      players.push({ player_name: name, kills, deaths, assists, score, is_winner: isWinner });
    } else if (category === 'rpg') {
      const rClass = tr.querySelector('.p-rpg-class').value;
      const level = Number(tr.querySelector('.p-rpg-level').value || 1);
      const xp = Number(tr.querySelector('.p-rpg-xp').value || 0);
      const gold = Number(tr.querySelector('.p-rpg-gold').value || 0);
      players.push({
        player_name: name,
        score: xp,
        extra_stats: { class: rClass, level, xp, gold },
        is_winner: true
      });
    } else {
      const score = Number(tr.querySelector('.p-score').value || 0);
      const money = tr.querySelector('.p-money').value ? Number(tr.querySelector('.p-money').value) : null;
      const rank = Number(tr.querySelector('.p-rank').value || idx + 1);
      const isWinner = tr.querySelector('.p-winner').checked;
      players.push({ player_name: name, score, money, rank, is_winner: isWinner });
    }
  });

  const payload = {
    game_id: gameId,
    title: document.getElementById('matchTitle').value.trim() || null,
    match_outcome: document.getElementById('matchOutcome').value,
    played_at: new Date(document.getElementById('matchPlayedAt').value).toISOString(),
    notes: document.getElementById('matchNotes').value.trim() || null,
    players
  };

  try {
    await api('/matches', { method: 'POST', body: JSON.stringify(payload) });
    matchModal.style.display = 'none';
    await refreshGameData();
  } catch (err) {
    alert(`Failed to save match: ${err.message}`);
  }
});

// ==========================================
// 8. Create Game Modal
// ==========================================

document.getElementById('btnOpenNewGame').addEventListener('click', () => {
  document.getElementById('newGameName').value = '';
  gameModal.style.display = 'flex';
});

document.getElementById('gameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('newGameName').value.trim();
  const category = document.getElementById('newGameCategory').value;
  const scoring_type = document.getElementById('newGameScoring').value;

  try {
    const res = await api('/games', {
      method: 'POST',
      body: JSON.stringify({ name, category, scoring_type })
    });

    state.selectedGame = res.game;
    gameModal.style.display = 'none';
    await loadGames();
  } catch (err) {
    alert(`Failed to create game: ${err.message}`);
  }
});

// Modal close triggers
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modalId = e.target.getAttribute('data-close');
    const m = document.getElementById(modalId);
    if (m) m.style.display = 'none';
  });
});

// Delete Game
document.getElementById('btnDeleteGame')?.addEventListener('click', async () => {
  if (!state.selectedGame) return;
  if (confirm(`Are you sure you want to delete "${state.selectedGame.name}" and all its match history?`)) {
    try {
      await api(`/games/${state.selectedGame.id}`, { method: 'DELETE' });
      state.selectedGame = null;
      await loadGames();
    } catch (err) {
      alert(`Failed to delete game: ${err.message}`);
    }
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// 9. Startup Initialization
// ==========================================

if (state.token) {
  initDashboard();
} else {
  showAuthScreen();
}
