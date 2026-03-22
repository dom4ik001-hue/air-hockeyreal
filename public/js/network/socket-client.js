/**
 * socket-client.js — Socket.io client wrapper
 * Manages connection, authentication, matchmaking, and game events.
 */

let socket = null;
const listeners = {};

/** Initialize and connect socket */
export function connectSocket() {
  if (socket && socket.connected) return socket;

  // io() is loaded from Socket.io CDN script tag (added dynamically)
  socket = window.io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    _emit('_connected', null);
    // Auto-authenticate if token exists
    const token = localStorage.getItem('ah_token');
    if (token) socket.emit('authenticate', { token });
  });

  socket.on('disconnect', reason => {
    console.warn('[Socket] Disconnected:', reason);
    _emit('disconnect', reason);
  });

  socket.on('connect_error', err => {
    console.error('[Socket] Connection error:', err.message);
    _emit('connect_error', err);
  });

  // ─── Game events ─────────────────────────────────────────

  socket.on('authenticated', data => _emit('authenticated', data));
  socket.on('auth_error',    data => _emit('auth_error', data));

  socket.on('match_found',        data => _emit('match_found', data));
  socket.on('game_start',         data => _emit('game_start', data));
  socket.on('game_state_update',  data => _emit('game_state_update', data));
  socket.on('goal_scored',        data => _emit('goal_scored', data));
  socket.on('match_over',         data => _emit('match_over', data));
  socket.on('opponent_disconnected', data => _emit('opponent_disconnected', data));
  socket.on('search_status',      data => _emit('search_status', data));

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ─── Emit helpers ────────────────────────────────────────────

export function socketAuthenticate(token) {
  if (socket) socket.emit('authenticate', { token });
}

export function socketFindMatch() {
  if (socket) socket.emit('find_match');
}

export function socketCancelSearch() {
  if (socket) socket.emit('cancel_search');
}

export function socketSendInput(x, y) {
  if (socket) socket.emit('player_input', { x, y });
}

export function socketLeaveMatch() {
  if (socket) socket.emit('leave_match');
}

// ─── Event bus ───────────────────────────────────────────────

export function onSocketEvent(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
}

export function offSocketEvent(event, callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(cb => cb !== callback);
}

function _emit(event, data) {
  if (listeners[event]) {
    listeners[event].forEach(cb => cb(data));
  }
}

export function getSocket() { return socket; }
