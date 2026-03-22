/**
 * server.js — Main Express + Socket.io server
 */
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');

const { connectDB }      = require('./config/db');
const authRoutes         = require('./routes/authRoutes');
const apiRoutes          = require('./routes/apiRoutes');
const newsRoutes         = require('./routes/newsRoutes');
const { joinQueue, leaveQueue, startMatchmaking } = require('./game/matchmaker');
const { handlePlayerInput, handleDisconnect, getPlayerIndex, getActiveRooms } = require('./game/roomManager');
const User = require('./models/User');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:  60000,
  pingInterval: 25000,
  // Allow both websocket and polling (important for some hosting providers)
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Static files
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// ─── REST Routes ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api',      apiRoutes);
app.use('/api',      newsRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Socket.io ───────────────────────────────────────────────

// socketId → { userId, username, elo }
const socketUsers = new Map();

// Per-socket input rate limiting: max 120 inputs/sec
const inputRateMap = new Map(); // socketId → { count, resetAt }

function checkInputRate(socketId) {
  const now = Date.now();
  let entry = inputRateMap.get(socketId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 1000 };
    inputRateMap.set(socketId, entry);
  }
  entry.count++;
  return entry.count <= 120;
}

io.on('connection', socket => {
  console.log('[Socket] Connected:', socket.id);

  // ── Authenticate ──────────────────────────────────────────
  // Accepts { username, userId } — no JWT needed for socket
  socket.on('authenticate', async ({ token, username: directUsername, userId: directUserId } = {}) => {
    console.log('[Socket] Auth attempt, socketId:', socket.id);
    const mem = require('./config/memoryStore');

    let username = directUsername;
    let userId   = directUserId;
    let elo      = 1000;
    let role     = 'player';
    let banned   = false;
    let bannedReason = '';

    // If username passed directly — use it (new flow)
    if (!username && token) {
      // Legacy: try to extract username from token (any secret)
      try { const p = jwt.verify(token, JWT_SECRET); username = p.username; userId = p.sub; }
      catch { try { const p = jwt.decode(token); if (p) { username = p.username; userId = p.sub; } } catch {} }
    }

    if (!username) {
      socket.emit('auth_error', { message: 'Не удалось определить пользователя' });
      return;
    }

    // Look up user for ELO and ban status
    try {
      let user = null;
      if (userId) {
        try { user = await User.findById(userId).select('-password_hash'); } catch {}
        if (!user) user = mem.findUserById(userId);
      }
      if (!user) {
        // Try by username
        try { user = await User.findOne({ username }).select('-password_hash'); } catch {}
        if (!user) user = mem.findUserByUsername(username);
      }
      if (user) {
        elo  = user.elo_rating || 1000;
        role = username === 'dom4ik001' ? 'admin' : (user.role || 'player');
        banned = !!user.banned;
        bannedReason = user.banned_reason || '';
        userId = user._id;
      } else {
        // Create ghost user in memory
        role = username === 'dom4ik001' ? 'admin' : 'player';
        const ghost = mem.restoreUser({ _id: userId || ('ghost_' + username), username, elo_rating: 1000, role, banned: false });
        userId = ghost ? ghost._id : (userId || ('ghost_' + username));
      }
    } catch (err) {
      console.error('[Socket] User lookup error:', err.message);
    }

    if (banned) {
      socket.emit('auth_error', { message: '🚫 Вы заблокированы' + (bannedReason ? ': ' + bannedReason : '') });
      return;
    }

    socketUsers.set(socket.id, { userId, username, elo, role });
    socket.emit('authenticated', { username, elo, role });
    console.log('[Socket] Auth OK:', username, elo, 'ELO');
  });

  // ── Find match ────────────────────────────────────────────
  socket.on('find_match', () => {
    const userData = socketUsers.get(socket.id);
    if (!userData) { socket.emit('auth_error', { message: 'Требуется авторизация' }); return; }
    const { gameControl } = require('./routes/newsRoutes');
    if (gameControl.maintenanceMode) {
      socket.emit('auth_error', { message: '🔧 ' + (gameControl.maintenanceMessage || 'Тех. перерыв') });
      return;
    }
    if (!gameControl.onlinePlayEnabled) {
      socket.emit('auth_error', { message: 'Онлайн-игра временно отключена' });
      return;
    }
    joinQueue({ socketId: socket.id, userId: userData.userId, username: userData.username, elo: userData.elo });
    socket.emit('search_status', { status: 'searching' });
  });

  // ── Cancel search ─────────────────────────────────────────
  socket.on('cancel_search', () => {
    leaveQueue(socket.id);
    socket.emit('search_status', { status: 'cancelled' });
  });

  // ── Player input (rate-limited + validated) ───────────────
  socket.on('player_input', ({ x, y } = {}) => {
    if (!checkInputRate(socket.id)) return; // rate limit
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (!isFinite(x) || !isFinite(y)) return;
    // Broad range check (server clamps precisely in roomManager)
    if (x < -100 || x > 900 || y < -100 || y > 500) return;

    const playerIndex = getPlayerIndex(socket.id);
    if (playerIndex === null) return;
    handlePlayerInput(socket.id, { x, y }, playerIndex === 1);
  });

  // ── Leave match ───────────────────────────────────────────
  socket.on('leave_match', () => {
    handleDisconnect(socket.id);
    leaveQueue(socket.id);
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', reason => {
    console.log('[Socket] Disconnected:', socket.id, '(' + reason + ')');
    leaveQueue(socket.id);
    handleDisconnect(socket.id);
    socketUsers.delete(socket.id);
    inputRateMap.delete(socket.id);
  });
});

// ─── Graceful shutdown ────────────────────────────────────────
function shutdown(signal) {
  console.log('[Server] ' + signal + ' received, shutting down...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Start ───────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();
    startMatchmaking(io);
    server.listen(PORT, () => {
      console.log('[Server] Running on http://localhost:' + PORT);
      console.log('[Server] Environment:', process.env.NODE_ENV || 'development');
    });
  } catch (err) {
    console.error('[Server] Startup error:', err);
    process.exit(1);
  }
}

start();
