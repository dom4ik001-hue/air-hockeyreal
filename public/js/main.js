/** main.js */
import { showScreen } from './ui/navigation.js';
import { showToast } from './ui/notifications.js';
import { openModal, closeModal } from './ui/modals.js';
import { GameEngine } from './core/engine.js';
import { drawMapPreview, MAP_CONFIGS } from './entities/board.js';
import { apiLogin, apiRegister, apiGetProfile, apiGetLeaderboard, apiLogout, saveUser, getUser, isLoggedIn as apiIsLoggedIn } from './network/api.js';
import { connectSocket, socketAuthenticate, socketFindMatch, socketCancelSearch, socketSendInput, socketLeaveMatch, onSocketEvent, offSocketEvent } from './network/socket-client.js';
import { getEloLevel, drawLevelBadge, levelBadgeHTML, levelRangeText } from './ui/eloLevel.js';

var currentUser = null, selectedMode = 'bot', selectedMap = 'classic';
var gameEngine = null, searchTimer = null, playerIndex = 1;

function isLoggedIn() { return !!currentUser || (!!localStorage.getItem('ah_token') && !!getUser()); }
function setUser(u) {
  currentUser = u;
  saveUser(u);
  updateHeaderUser();
  var adminBtn = document.getElementById('btn-admin');
  if (adminBtn) adminBtn.classList.toggle('hidden', !_isAdminOrMod());
}
function clearUser() { currentUser = null; apiLogout(); updateHeaderUser(); }

function updateHeaderUser() {
  var name = currentUser ? currentUser.username : 'Гость';
  var elo = currentUser ? (currentUser.elo_rating || 1000) : 1000;
  var m = currentUser ? (currentUser.matches_played || 0) : 0;
  var w = currentUser ? (currentUser.matches_won || 0) : 0;
  var wr = m > 0 ? Math.round((w / m) * 100) + '%' : '—';
  document.getElementById('header-username').textContent = name;
  document.getElementById('header-elo').textContent = '📈 ' + elo + '  ' + levelRangeText(elo);
  document.getElementById('qs-elo').textContent = elo;
  document.getElementById('qs-matches').textContent = m;
  document.getElementById('qs-winrate').textContent = wr;
}

function setFieldError(id, msg) { var el = document.getElementById(id); if (el) el.textContent = msg; }
function clearFieldErrors() { document.querySelectorAll('.field-error').forEach(function(el) { el.textContent = ''; }); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function bindAuthEvents() {
  document.getElementById('go-register').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.remove('hidden');
  });
  document.getElementById('go-login').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('form-login').classList.remove('hidden');
  });
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault(); clearFieldErrors();
    var username = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value;
    if (!username) { setFieldError('login-username-error', 'Введите никнейм'); return; }
    if (!password) { setFieldError('login-password-error', 'Введите пароль'); return; }
    try {
      var res = await apiLogin(username, password);
      setUser(res.user); showScreen('screen-menu');
      showToast('Добро пожаловать, ' + res.user.username + '!', 'success');
    } catch (err) { showToast(err.message || 'Ошибка входа', 'error'); }
  });
  document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault(); clearFieldErrors();
    var username = document.getElementById('reg-username').value.trim();
    var password = document.getElementById('reg-password').value;
    var password2 = document.getElementById('reg-password2').value;
    if (!username || username.length < 3) { setFieldError('reg-username-error', 'Минимум 3 символа'); return; }
    if (!password || password.length < 6) { setFieldError('reg-password-error', 'Минимум 6 символов'); return; }
    if (password !== password2) { setFieldError('reg-password2-error', 'Пароли не совпадают'); return; }
    try {
      var res = await apiRegister(username, password);
      setUser(res.user); showScreen('screen-menu');
      showToast('Аккаунт создан!', 'success');
    } catch (err) { showToast(err.message || 'Ошибка регистрации', 'error'); }
  });
  document.getElementById('btn-guest').addEventListener('click', function() {
    clearUser(); showScreen('screen-menu');
  });
}

function bindMenuEvents() {
  document.getElementById('btn-open-play').addEventListener('click', function() {
    // Restore currentUser from cache if needed before entering setup screen
    if (!currentUser) { var c = getUser(); if (c) { currentUser = c; updateHeaderUser(); } }
    showScreen('screen-play-setup');
  });
  document.getElementById('btn-leaderboard').addEventListener('click', openLeaderboard);
  document.getElementById('btn-profile-side').addEventListener('click', openProfileModal);
  document.getElementById('btn-settings-side').addEventListener('click', function() { openModal('modal-settings'); });
  document.getElementById('btn-profile').addEventListener('click', openProfileModal);
  document.getElementById('btn-settings').addEventListener('click', function() { openModal('modal-settings'); });
  document.getElementById('btn-logout').addEventListener('click', function() {
    clearUser(); showScreen('screen-auth'); showToast('Вы вышли из аккаунта', 'info');
  });
}

function bindSetupEvents() {
  document.querySelectorAll('.mode-card').forEach(function(card) {
    card.addEventListener('click', function() {
      document.querySelectorAll('.mode-card').forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active'); selectedMode = card.dataset.mode;
    });
  });
  document.querySelectorAll('.map-card').forEach(function(card) {
    card.addEventListener('click', function() {
      document.querySelectorAll('.map-card').forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active'); selectedMap = card.dataset.map;
    });
  });
  document.getElementById('btn-setup-back').addEventListener('click', function() { showScreen('screen-menu'); });
  // Use onclick to prevent duplicate listeners
  document.getElementById('btn-start-game').onclick = function() {
    // Always try to restore currentUser from cache before checking
    if (!currentUser) { var c = getUser(); if (c) { currentUser = c; updateHeaderUser(); } }
    if (selectedMode === 'online' && !currentUser && !localStorage.getItem('ah_token')) {
      showToast('Войдите для онлайн-игры', 'warning'); return;
    }
    if (selectedMode === 'online') { startOnlineSearch(); }
    else { startGame(selectedMode, { mapId: selectedMap }); }
  };
}

function drawAllMapPreviews() {
  document.querySelectorAll('.map-preview[data-map]').forEach(function(canvas) {
    drawMapPreview(canvas, canvas.dataset.map);
  });
}

function getMobileControl() {
  var el = document.getElementById('setting-mobile-control');
  return el ? el.value : 'joystick';
}

function startGame(mode, options) {
  options = options || {};
  var mapId = options.mapId || 'classic';
  var mapCfg = MAP_CONFIGS[mapId] || MAP_CONFIGS.classic;
  showScreen('screen-game');
  var p1Name = currentUser ? currentUser.username : 'Игрок 1';
  var p2Name = mode === 'bot' ? 'Бот' : 'Игрок 2';
  document.getElementById('hud-p1-name').textContent = p1Name;
  document.getElementById('hud-p2-name').textContent = p2Name;
  document.getElementById('hud-p1-elo').textContent = currentUser ? currentUser.elo_rating : '';
  document.getElementById('hud-p2-elo').textContent = '';
  document.getElementById('hud-score-p1').textContent = '0';
  document.getElementById('hud-score-p2').textContent = '0';
  document.getElementById('hud-map-badge').textContent = mapCfg.name;
  var hint = document.getElementById('controls-hint');
  var mobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var mobileControl = getMobileControl();
  hint.textContent = mobile
    ? (mode === 'local' ? 'Левая половина — Игрок 2 | Правая — Игрок 1'
      : (mobileControl === 'touch' ? 'Касайся экрана для управления' : 'Тяни джойстик для управления'))
    : (mode === 'local' ? 'WASD — Игрок 1 | Стрелки — Игрок 2' : 'WASD или мышь для управления');
  hint.classList.remove('hidden');
  setTimeout(function() { hint.classList.add('hidden'); }, 3500);
  if (gameEngine) { gameEngine.stop(); gameEngine = null; }
  var canvas = document.getElementById('game-canvas');
  var particlesEl = document.getElementById('setting-particles');
  var particles = particlesEl ? particlesEl.checked : true;
  var colorEl = document.getElementById('setting-mallet-color');
  var malletColor = colorEl ? colorEl.value : '#e03030';
  gameEngine = new GameEngine(canvas, mode, { mapId: mapId, particles: particles, p1Color: malletColor, mobileControl: mobileControl });
  var overlayCountdown = document.getElementById('overlay-countdown');
  var countdownText = document.getElementById('countdown-text');
  canvas.addEventListener('countdown', function(e) {
    if (e.detail === null) { overlayCountdown.classList.add('hidden'); }
    else { overlayCountdown.classList.remove('hidden'); countdownText.textContent = e.detail; }
  });
  var overlayGoal = document.getElementById('overlay-goal');
  gameEngine.onGoal = function(scorer, score) {
    document.getElementById('hud-score-p1').textContent = score.p1;
    document.getElementById('hud-score-p2').textContent = score.p2;
    document.getElementById('goal-scorer-name').textContent = scorer === 'p1' ? p1Name : p2Name;
    overlayGoal.classList.remove('hidden');
    setTimeout(function() { overlayGoal.classList.add('hidden'); }, 1800);
  };
  gameEngine.onMatchEnd = function(data) { showMatchEnd(data); };
  gameEngine.start();
}

function showMatchEnd(data) {
  var isWin = data.winner === 'p1';
  document.getElementById('match-end-icon').textContent = isWin ? '🏆' : '😔';
  document.getElementById('match-end-title').textContent = isWin ? 'Победа!' : 'Поражение';
  document.getElementById('match-end-score').textContent = data.score.p1 + ' : ' + data.score.p2;
  document.getElementById('elo-change-display').textContent = '';
  document.getElementById('overlay-match-end').classList.remove('hidden');
}

function startOnlineSearch() {
  var token = localStorage.getItem('ah_token');
  if (!token) { showToast('Войдите в аккаунт для онлайн-игры', 'warning'); showScreen('screen-play-setup'); return; }
  // Restore currentUser from cache if missing
  if (!currentUser) { var c = getUser(); if (c) { currentUser = c; updateHeaderUser(); } }
  if (!currentUser) { showToast('Войдите в аккаунт для онлайн-игры', 'warning'); showScreen('screen-play-setup'); return; }
  showScreen('screen-game');
  var overlaySearch = document.getElementById('overlay-searching');
  var rangeText = document.getElementById('search-range-text');
  var timeText = document.getElementById('search-time-text');
  overlaySearch.classList.remove('hidden');
  var elapsed = 0, range = 200;
  searchTimer = setInterval(function() {
    elapsed++;
    if (elapsed % 30 === 0) range = Math.min(range + 100, 1000);
    rangeText.textContent = 'Диапазон ELO: ±' + range;
    timeText.textContent = elapsed + ' сек.';
  }, 1000);
  offSocketEvent('authenticated', _onAuthenticated);
  offSocketEvent('match_found', _onMatchFound);
  offSocketEvent('auth_error', _onAuthError);
  onSocketEvent('authenticated', _onAuthenticated);
  onSocketEvent('match_found', _onMatchFound);
  onSocketEvent('auth_error', _onAuthError);
  var sock = connectSocket();
  function doAuth() { setTimeout(function() { socketAuthenticate(token); }, 150); }
  if (sock.connected) { doAuth(); }
  else {
    function _onConn() { offSocketEvent('_connected', _onConn); doAuth(); }
    onSocketEvent('_connected', _onConn);
  }
}

function _onAuthenticated() { socketFindMatch(); }
function _onMatchFound(data) { _cleanupSearch(); playerIndex = data.playerIndex; startOnlineGame(data); }
function _onAuthError(err) { _cleanupSearch(); showToast((err && err.message) || 'Ошибка авторизации', 'error'); showScreen('screen-menu'); }

function _cleanupSearch() {
  clearInterval(searchTimer); searchTimer = null;
  var overlaySearch = document.getElementById('overlay-searching');
  if (overlaySearch) overlaySearch.classList.add('hidden');
  offSocketEvent('authenticated', _onAuthenticated);
  offSocketEvent('match_found', _onMatchFound);
  offSocketEvent('auth_error', _onAuthError);
}

function startOnlineGame(matchData) {
  var canvas = document.getElementById('game-canvas');
  var mapId = selectedMap;
  var mapCfg = MAP_CONFIGS[mapId] || MAP_CONFIGS.classic;
  var myName = currentUser.username, oppName = matchData.opponentName;
  var p1Name = playerIndex === 1 ? myName : oppName;
  var p2Name = playerIndex === 1 ? oppName : myName;
  document.getElementById('hud-p1-name').textContent = p1Name;
  document.getElementById('hud-p2-name').textContent = p2Name;
  document.getElementById('hud-p1-elo').textContent = playerIndex === 1 ? currentUser.elo_rating : matchData.opponentElo;
  document.getElementById('hud-p2-elo').textContent = playerIndex === 1 ? matchData.opponentElo : currentUser.elo_rating;
  document.getElementById('hud-map-badge').textContent = mapCfg.name;
  if (gameEngine) { gameEngine.stop(); gameEngine = null; }
  gameEngine = new GameEngine(canvas, 'online', { mapId: mapId, mobileControl: getMobileControl() });
  gameEngine.onSendInput = function(x, y) { socketSendInput(x, y); };
  onSocketEvent('game_state_update', function(state) { gameEngine.applyNetworkState(state); });
  onSocketEvent('goal_scored', function(data) {
    gameEngine.handleNetworkGoal(data);
    document.getElementById('hud-score-p1').textContent = data.newScore.p1;
    document.getElementById('hud-score-p2').textContent = data.newScore.p2;
  });
  onSocketEvent('match_over', function(data) { gameEngine.handleNetworkMatchEnd(data); _showMatchEndOnline(data); });
  onSocketEvent('opponent_disconnected', function() { showToast('Соперник отключился', 'warning'); showScreen('screen-menu'); });
  gameEngine.start();
}

function _showMatchEndOnline(data) {
  var myKey = playerIndex === 1 ? 'p1' : 'p2';
  var isWin = data.winner === myKey;
  var change = data.eloChange || 0;
  document.getElementById('match-end-icon').textContent = isWin ? '🏆' : '😔';
  document.getElementById('match-end-title').textContent = isWin ? 'Победа!' : 'Поражение';
  document.getElementById('match-end-score').textContent = data.score.p1 + ' : ' + data.score.p2;
  var eloEl = document.getElementById('elo-change-display');
  eloEl.textContent = change >= 0 ? '+' + change + ' ELO' : change + ' ELO';
  eloEl.style.color = change >= 0 ? '#22c55e' : '#ef4444';
  if (currentUser && data.newElo !== undefined) { currentUser.elo_rating = data.newElo; updateHeaderUser(); }
  document.getElementById('overlay-match-end').classList.remove('hidden');
}

function bindGameEvents() {
  document.getElementById('btn-cancel-search').addEventListener('click', function() {
    _cleanupSearch(); socketCancelSearch(); showScreen('screen-menu');
  });
  document.getElementById('btn-game-back').addEventListener('click', function() {
    if (gameEngine) { gameEngine.stop(); gameEngine = null; }
    _cleanupSearch(); socketLeaveMatch(); showScreen('screen-menu');
  });
  document.getElementById('btn-play-again').addEventListener('click', function() {
    document.getElementById('overlay-match-end').classList.add('hidden');
    socketLeaveMatch();
    if (selectedMode === 'online') { startOnlineSearch(); }
    else { startGame(selectedMode, { mapId: selectedMap }); }
  });
  document.getElementById('btn-back-menu').addEventListener('click', function() {
    document.getElementById('overlay-match-end').classList.add('hidden');
    if (gameEngine) { gameEngine.stop(); gameEngine = null; }
    socketLeaveMatch(); showScreen('screen-menu');
  });
}

async function openLeaderboard() {
  openModal('modal-leaderboard');
  var list = document.getElementById('leaderboard-list');
  list.innerHTML = '<div class="leaderboard-loading">Загрузка...</div>';
  try {
    var data = await apiGetLeaderboard();
    var users = Array.isArray(data) ? data : (data.users || []);
    if (!users.length) { list.innerHTML = '<div class="leaderboard-loading">Нет данных</div>'; return; }
    var html = '';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var me = (currentUser && u.username === currentUser.username) ? ' is-me' : '';
      var wr = (u.winrate != null) ? u.winrate + '%' : '—';
      html += '<div class="leaderboard-row' + me + '">' +
        '<span class="lb-rank">' + u.rank + '</span>' +
        '<span class="lb-name">' + levelBadgeHTML(u.elo) + ' ' + esc(u.username) + '</span>' +
        '<span class="lb-elo">' + u.elo + '</span>' +
        '<span class="lb-wr">' + wr + '</span>' +
        '</div>';
    }
    list.innerHTML = html;
  } catch (e) { list.innerHTML = '<div class="leaderboard-loading">Ошибка загрузки</div>'; }
}

function openProfileModal() {
  if (!isLoggedIn()) { showToast('Войдите для просмотра профиля', 'warning'); return; }
  var u = currentUser;
  var elo = u.elo_rating || 1000;
  document.getElementById('profile-username').textContent = u.username;
  document.getElementById('profile-elo').textContent = elo;
  document.getElementById('profile-matches').textContent = u.matches_played || 0;
  document.getElementById('profile-wins').textContent = u.matches_won || 0;
  var wr = u.matches_played > 0 ? Math.round((u.matches_won / u.matches_played) * 100) + '%' : '—';
  document.getElementById('profile-winrate').textContent = wr;
  // ELO level badge
  var lvl = getEloLevel(elo);
  var canvas = document.getElementById('profile-level-canvas');
  if (canvas) drawLevelBadge(canvas, elo);
  var lvlText = document.getElementById('profile-level-text');
  if (lvlText) lvlText.textContent = 'Уровень ' + lvl.level;
  var lvlRange = document.getElementById('profile-level-range');
  if (lvlRange) lvlRange.textContent = lvl.min + ' – ' + (lvl.max === Infinity ? '∞' : lvl.max) + ' ELO';
  openModal('modal-profile');
}

function bindModalEvents() {
  document.getElementById('close-leaderboard').addEventListener('click', function() { closeModal('modal-leaderboard'); });
  document.getElementById('close-profile').addEventListener('click', function() { closeModal('modal-profile'); });
  document.getElementById('close-settings').addEventListener('click', function() { closeModal('modal-settings'); });
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(overlay.id); });
  });
}

// ─── News ─────────────────────────────────────────────────────
async function loadNews() {
  var container = document.getElementById('news-list');
  if (!container) return;
  try {
    var res = await fetch('/api/news');
    var data = await res.json();
    var items = Array.isArray(data) ? data : [];
    if (!items.length) { container.innerHTML = '<div class="news-empty">Новостей пока нет</div>'; return; }
    container.innerHTML = items.map(function(n) {
      return '<div class="news-item glass-panel">' +
        '<div class="news-type news-type-' + n.type + '">' + _newsTypeLabel(n.type) + '</div>' +
        '<div class="news-text">' + esc(n.text) + '</div>' +
        '<div class="news-date">' + new Date(n.createdAt).toLocaleDateString('ru') + '</div>' +
        '</div>';
    }).join('');
  } catch(e) { container.innerHTML = '<div class="news-empty">Ошибка загрузки</div>'; }
}

function _newsTypeLabel(t) {
  if (t === 'maintenance') return '🔧 Тех. перерыв';
  if (t === 'update') return '🚀 Обновление';
  if (t === 'event') return '🎉 Событие';
  return '📢 Новость';
}

// ─── Admin panel ──────────────────────────────────────────────
function _isAdminOrMod() {
  if (!currentUser) return false;
  if (currentUser.username === 'dom4ik001') return true;
  return currentUser.role === 'admin' || currentUser.role === 'moderator';
}
function _isAdmin() {
  if (!currentUser) return false;
  if (currentUser.username === 'dom4ik001') return true;
  return currentUser.role === 'admin';
}

function openAdminPanel() {
  if (!currentUser) { showToast('Войдите в аккаунт', 'warning'); return; }
  if (!_isAdminOrMod()) { showToast('Нет доступа', 'error'); return; }
  openModal('modal-admin');
  document.querySelectorAll('[data-admin-only]').forEach(function(el) {
    el.style.display = _isAdmin() ? '' : 'none';
  });
  loadAdminStats();
  loadAdminGameStatus();
}

function bindAdminEvents() {
  var btn = document.getElementById('btn-admin');
  if (btn) btn.addEventListener('click', openAdminPanel);
  var closeBtn = document.getElementById('close-admin');
  if (closeBtn) closeBtn.addEventListener('click', function() { closeModal('modal-admin'); });

  // Tabs
  document.querySelectorAll('.admin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.admin-tab-content').forEach(function(c) { c.classList.add('hidden'); });
      tab.classList.add('active');
      document.getElementById('admin-tab-' + tab.dataset.tab).classList.remove('hidden');
      if (tab.dataset.tab === 'stats') loadAdminStats();
      if (tab.dataset.tab === 'game') loadAdminGameStatus();
      if (tab.dataset.tab === 'matches') loadAdminMatches();
    });
  });

  // News form
  var form = document.getElementById('admin-news-form');
  if (form) form.addEventListener('submit', async function(e) {
    e.preventDefault();
    var text = document.getElementById('admin-news-text').value.trim();
    var type = document.getElementById('admin-news-type').value;
    if (!text) return;
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ text: text, type: type })
      });
      document.getElementById('admin-news-text').value = '';
      showToast('Новость опубликована!', 'success'); loadNews();
    } catch(e) { showToast('Ошибка публикации', 'error'); }
  });

  var delBtn = document.getElementById('admin-news-delete');
  if (delBtn) delBtn.addEventListener('click', async function() {
    var id = document.getElementById('admin-delete-id').value.trim();
    if (!id) return;
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/news/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
      document.getElementById('admin-delete-id').value = '';
      showToast('Удалено', 'success'); loadNews();
    } catch(e) { showToast('Ошибка удаления', 'error'); }
  });

  // Players load
  var playersLoad = document.getElementById('admin-players-load');
  if (playersLoad) playersLoad.addEventListener('click', loadAdminPlayers);
  var playerSearch = document.getElementById('admin-player-search');
  if (playerSearch) playerSearch.addEventListener('input', function() { filterAdminPlayers(playerSearch.value); });

  // Ban/unban
  document.getElementById('admin-ban-btn').addEventListener('click', async function() {
    var username = document.getElementById('admin-action-username').value.trim();
    var reason = document.getElementById('admin-ban-reason').value.trim();
    if (!username) return;
    try {
      var token = localStorage.getItem('ah_token');
      var r = await fetch('/api/admin/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: username, banned: true, reason: reason })
      });
      var d = await r.json();
      if (!r.ok) { showToast(d.message || 'Ошибка', 'error'); return; }
      showToast('🚫 ' + username + ' заблокирован', 'success'); loadAdminPlayers();
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  document.getElementById('admin-unban-btn').addEventListener('click', async function() {
    var username = document.getElementById('admin-action-username').value.trim();
    if (!username) return;
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/admin/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: username, banned: false })
      });
      showToast('✅ ' + username + ' разблокирован', 'success'); loadAdminPlayers();
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  // Mod/unmod (admin only)
  document.getElementById('admin-mod-btn').addEventListener('click', async function() {
    var username = document.getElementById('admin-action-username').value.trim();
    if (!username) return;
    try {
      var token = localStorage.getItem('ah_token');
      var r = await fetch('/api/admin/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: username, role: 'moderator' })
      });
      var d = await r.json();
      if (!r.ok) { showToast(d.message || 'Ошибка', 'error'); return; }
      showToast('🛡️ ' + username + ' — модератор', 'success'); loadAdminPlayers();
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  document.getElementById('admin-unmod-btn').addEventListener('click', async function() {
    var username = document.getElementById('admin-action-username').value.trim();
    if (!username) return;
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/admin/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: username, role: 'player' })
      });
      showToast('👤 Роль снята', 'success'); loadAdminPlayers();
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  // ELO management (admin only)
  var eloBtn = document.getElementById('admin-elo-btn');
  if (eloBtn) eloBtn.addEventListener('click', async function() {
    var username = document.getElementById('admin-elo-username').value.trim();
    var amount = parseInt(document.getElementById('admin-elo-amount').value);
    var mode = document.getElementById('admin-elo-mode').value;
    if (!username || isNaN(amount)) return;
    try {
      var token = localStorage.getItem('ah_token');
      var r = await fetch('/api/admin/elo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: username, amount: amount, mode: mode })
      });
      var d = await r.json();
      if (!r.ok) { showToast(d.message || 'Ошибка', 'error'); return; }
      showToast('📈 ' + username + ' → ' + d.newElo + ' ELO', 'success'); loadAdminPlayers();
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  // Matches refresh
  var matchRefresh = document.getElementById('admin-matches-refresh');
  if (matchRefresh) matchRefresh.addEventListener('click', loadAdminMatches);

  // Maintenance save
  var maintSave = document.getElementById('admin-maintenance-save');
  if (maintSave) maintSave.addEventListener('click', async function() {
    var enabled = document.getElementById('admin-maintenance-toggle').checked;
    var message = document.getElementById('admin-maintenance-msg').value.trim();
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ enabled: enabled, message: message || undefined })
      });
      showToast(enabled ? '🔧 Тех. перерыв включён' : '✅ Выключен', 'success');
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  // Online play save
  var onlineSave = document.getElementById('admin-online-save');
  if (onlineSave) onlineSave.addEventListener('click', async function() {
    var enabled = document.getElementById('admin-online-toggle').checked;
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/admin/online-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ enabled: enabled })
      });
      showToast(enabled ? '🌐 Онлайн включён' : '🚫 Онлайн выключен', 'success');
    } catch(e) { showToast('Ошибка', 'error'); }
  });

  var statsRefresh = document.getElementById('admin-stats-refresh');
  if (statsRefresh) statsRefresh.addEventListener('click', loadAdminStats);
}

var _adminPlayersCache = [];

async function loadAdminPlayers() {
  var list = document.getElementById('admin-players-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty">Загрузка...</div>';
  try {
    var token = localStorage.getItem('ah_token');
    var r = await fetch('/api/admin/players', { headers: { 'Authorization': 'Bearer ' + token } });
    var data = await r.json();
    _adminPlayersCache = Array.isArray(data) ? data : [];
    renderAdminPlayers(_adminPlayersCache);
  } catch(e) { list.innerHTML = '<div class="admin-empty">Ошибка загрузки</div>'; }
}

function filterAdminPlayers(q) {
  var filtered = q ? _adminPlayersCache.filter(function(p) { return p.username.toLowerCase().includes(q.toLowerCase()); }) : _adminPlayersCache;
  renderAdminPlayers(filtered);
}

function renderAdminPlayers(players) {
  var list = document.getElementById('admin-players-list');
  if (!list) return;
  if (!players.length) { list.innerHTML = '<div class="admin-empty">Нет игроков</div>'; return; }
  list.innerHTML = players.map(function(p) {
    var roleClass = 'apr-' + (p.banned ? 'banned' : (p.role || 'player'));
    var roleLabel = p.banned ? '🚫 Бан' : (p.role === 'admin' ? '👑 Адм' : p.role === 'moderator' ? '🛡️ Мод' : '👤');
    return '<div class="admin-player-row" data-username="' + esc(p.username) + '">' +
      '<span class="ape">' + levelBadgeHTML(p.elo) + '</span>' +
      '<span class="apn">' + esc(p.username) + '</span>' +
      '<span class="ape">' + p.elo + '</span>' +
      '<span class="apr ' + roleClass + '">' + roleLabel + '</span>' +
      '</div>';
  }).join('');
  // Click to fill action username
  list.querySelectorAll('.admin-player-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var u = row.dataset.username;
      var inp = document.getElementById('admin-action-username');
      var eloInp = document.getElementById('admin-elo-username');
      if (inp) inp.value = u;
      if (eloInp) eloInp.value = u;
    });
  });
}

async function loadAdminMatches() {
  var list = document.getElementById('admin-matches-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-empty">Загрузка...</div>';
  try {
    var token = localStorage.getItem('ah_token');
    var r = await fetch('/api/admin/matches', { headers: { 'Authorization': 'Bearer ' + token } });
    var data = await r.json();
    if (!data.length) { list.innerHTML = '<div class="admin-empty">Нет активных матчей</div>'; return; }
    list.innerHTML = data.map(function(m) {
      return '<div class="admin-match-row">' +
        '<span class="amn">' + levelBadgeHTML(m.p1.elo) + ' ' + esc(m.p1.username) + ' vs ' + levelBadgeHTML(m.p2.elo) + ' ' + esc(m.p2.username) + '</span>' +
        '<span class="ams">' + m.p1.score + ':' + m.p2.score + '</span>' +
        '<span style="font-size:10px;color:var(--text-secondary)">' + m.status + '</span>' +
        '</div>';
    }).join('');
  } catch(e) { list.innerHTML = '<div class="admin-empty">Ошибка</div>'; }
}

async function loadAdminGameStatus() {
  try {
    var token = localStorage.getItem('ah_token');
    var res = await fetch('/api/admin/status', { headers: { 'Authorization': 'Bearer ' + token } });
    var data = await res.json();
    var maintToggle = document.getElementById('admin-maintenance-toggle');
    var maintMsg = document.getElementById('admin-maintenance-msg');
    var onlineToggle = document.getElementById('admin-online-toggle');
    if (maintToggle) maintToggle.checked = !!data.maintenanceMode;
    if (maintMsg) maintMsg.value = data.maintenanceMessage || '';
    if (onlineToggle) onlineToggle.checked = data.onlinePlayEnabled !== false;
  } catch(e) {}
}

async function loadAdminStats() {
  try {
    var token = localStorage.getItem('ah_token');
    var res = await fetch('/api/admin/status', { headers: { 'Authorization': 'Bearer ' + token } });
    var data = await res.json();
    var el = function(id) { return document.getElementById(id); };
    if (el('stat-users')) el('stat-users').textContent = data.userCount || 0;
    if (el('stat-news')) el('stat-news').textContent = data.newsCount || 0;
    if (el('stat-uptime')) el('stat-uptime').textContent = _formatUptime(data.uptime || 0);
    if (el('stat-db')) el('stat-db').textContent = data.dbConnected ? '✅ OK' : '💾 RAM';
  } catch(e) {}
}

function _formatUptime(sec) {
  if (sec < 60) return sec + 'с';
  if (sec < 3600) return Math.floor(sec / 60) + 'м';
  return Math.floor(sec / 3600) + 'ч ' + Math.floor((sec % 3600) / 60) + 'м';
}

async function tryAutoLogin() {
  if (!apiIsLoggedIn()) return false;
  // Restore from cache immediately
  var cached = getUser();
  if (cached) { currentUser = cached; updateHeaderUser(); }
  try {
    var res = await apiGetProfile();
    setUser(res.user || res);
    return true;
  } catch (e) {
    // Token invalid or server restarted — if we have cached user data, stay logged in
    // Only hard-logout if server explicitly says token is bad AND we have no cache
    if ((e.status === 401 || e.status === 403) && !cached) {
      apiLogout();
      return false;
    }
    // Keep cached user — they'll get a fresh token on next login
    if (cached) return true;
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  bindAuthEvents();
  bindMenuEvents();
  bindSetupEvents();
  bindGameEvents();
  bindModalEvents();
  bindAdminEvents();
  drawAllMapPreviews();
  loadNews();
  var loggedIn = await tryAutoLogin();
  if (loggedIn) {
    showScreen('screen-menu');
  }
  // Show admin button whenever user is loaded (cached or fresh)
  var adminBtn = document.getElementById('btn-admin');
  if (adminBtn) adminBtn.classList.toggle('hidden', !_isAdminOrMod());
});
