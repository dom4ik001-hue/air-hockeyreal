/** main.js */
import { showScreen } from './ui/navigation.js';
import { showToast } from './ui/notifications.js';
import { openModal, closeModal } from './ui/modals.js';
import { GameEngine } from './core/engine.js';
import { drawMapPreview, MAP_CONFIGS } from './entities/board.js';
import { apiLogin, apiRegister, apiGetProfile, apiGetLeaderboard, apiLogout, saveUser, getUser, isLoggedIn as apiIsLoggedIn } from './network/api.js';
import { connectSocket, socketAuthenticate, socketFindMatch, socketCancelSearch, socketSendInput, socketLeaveMatch, onSocketEvent, offSocketEvent } from './network/socket-client.js';

var currentUser = null, selectedMode = 'bot', selectedMap = 'classic';
var gameEngine = null, searchTimer = null, playerIndex = 1;

function isLoggedIn() { return !!currentUser; }
function setUser(u) { currentUser = u; saveUser(u); updateHeaderUser(); }
function clearUser() { currentUser = null; apiLogout(); updateHeaderUser(); }

function updateHeaderUser() {
  var name = currentUser ? currentUser.username : 'Гость';
  var elo = currentUser ? (currentUser.elo_rating || 1000) : 1000;
  var m = currentUser ? (currentUser.matches_played || 0) : 0;
  var w = currentUser ? (currentUser.matches_won || 0) : 0;
  var wr = m > 0 ? Math.round((w / m) * 100) + '%' : '—';
  document.getElementById('header-username').textContent = name;
  document.getElementById('header-elo').textContent = '📈 ' + elo;
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
  document.getElementById('btn-open-play').addEventListener('click', function() { showScreen('screen-play-setup'); });
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
  document.getElementById('btn-start-game').addEventListener('click', function() {
    if (selectedMode === 'online' && !isLoggedIn()) { showToast('Войдите для онлайн-игры', 'warning'); return; }
    if (selectedMode === 'online') { startOnlineSearch(); }
    else { startGame(selectedMode, { mapId: selectedMap }); }
  });
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
        '<span class="lb-name">' + esc(u.username) + '</span>' +
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
  document.getElementById('profile-username').textContent = u.username;
  document.getElementById('profile-elo').textContent = u.elo_rating || 1000;
  document.getElementById('profile-matches').textContent = u.matches_played || 0;
  document.getElementById('profile-wins').textContent = u.matches_won || 0;
  var wr = u.matches_played > 0 ? Math.round((u.matches_won / u.matches_played) * 100) + '%' : '—';
  document.getElementById('profile-winrate').textContent = wr;
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
function openAdminPanel() {
  if (!currentUser || currentUser.username !== 'dom4ik001') return;
  openModal('modal-admin');
  loadAdminStats();
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
      await fetch('/api/admin/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ text: text, type: type })
      });
      document.getElementById('admin-news-text').value = '';
      showToast('Новость опубликована!', 'success');
      loadNews();
    } catch(e) { showToast('Ошибка публикации', 'error'); }
  });

  // Delete news
  var delBtn = document.getElementById('admin-news-delete');
  if (delBtn) delBtn.addEventListener('click', async function() {
    var id = document.getElementById('admin-delete-id').value.trim();
    if (!id) return;
    try {
      var token = localStorage.getItem('ah_token');
      await fetch('/api/admin/news/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      document.getElementById('admin-delete-id').value = '';
      showToast('Удалено', 'success'); loadNews();
    } catch(e) { showToast('Ошибка удаления', 'error'); }
  });

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
      showToast(enabled ? '🔧 Тех. перерыв включён' : '✅ Тех. перерыв выключен', 'success');
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

  // Stats refresh
  var statsRefresh = document.getElementById('admin-stats-refresh');
  if (statsRefresh) statsRefresh.addEventListener('click', loadAdminStats);
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
  try {
    var res = await apiGetProfile();
    setUser(res.user || res);
    return true;
  } catch (e) { apiLogout(); return false; }
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
  var cached = getUser();
  if (cached) { currentUser = cached; updateHeaderUser(); }
  var loggedIn = await tryAutoLogin();
  if (loggedIn) {
    showScreen('screen-menu');
    var adminBtn = document.getElementById('btn-admin');
    if (adminBtn) adminBtn.classList.toggle('hidden', currentUser.username !== 'dom4ik001');
  }
});
