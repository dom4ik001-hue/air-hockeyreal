/**
 * newsRoutes.js — News, Admin & Moderator API
 * Mounted at /api — so routes here are /api/news, /api/admin/*, etc.
 */
const express = require('express');
const { requireAuth } = require('./apiRoutes');
const router = express.Router();

const news = [];
let nextId = 1;

const gameControl = {
  maintenanceMode: false,
  maintenanceMessage: 'Сервер на техническом обслуживании. Скоро вернёмся!',
  onlinePlayEnabled: true,
};

// ─── Helpers ──────────────────────────────────────────────────
async function dbGetUser(userId) {
  const { isDbConnected } = require('../config/db');
  if (isDbConnected()) {
    try { return require('../models/User').findById(userId); } catch { return null; }
  }
  return require('../config/memoryStore').findUserById(userId);
}

async function dbGetUserByName(username) {
  const { isDbConnected } = require('../config/db');
  if (isDbConnected()) return require('../models/User').findOne({ username });
  return require('../config/memoryStore').findUserByUsername(username);
}

async function dbUpdateUser(userId, patch) {
  const { isDbConnected } = require('../config/db');
  if (isDbConnected()) return require('../models/User').findByIdAndUpdate(userId, patch, { new: true });
  return require('../config/memoryStore').updateUser(userId, patch);
}

async function getRole(req) {
  try {
    // Fast path: dom4ik001 is always admin
    if (req.username === 'dom4ik001') return 'admin';
    // Try by userId
    let user = null;
    if (req.userId) {
      try { user = await dbGetUser(req.userId); } catch {}
    }
    // Fallback: try by username from token
    if (!user && req.username) {
      user = await dbGetUserByName(req.username);
    }
    if (!user) return req.userRole || 'player';
    if (user.username === 'dom4ik001') return 'admin';
    return user.role || 'player';
  } catch { return req.userRole || 'player'; }
}

async function isAdmin(req) { return (await getRole(req)) === 'admin'; }
async function isMod(req) { const r = await getRole(req); return r === 'admin' || r === 'moderator'; }

// ─── News — GET /api/news ─────────────────────────────────────
router.get('/news', (req, res) => {
  res.json([...news].reverse().slice(0, 20));
});

// POST /api/news — create (mod+)
router.post('/news', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { text, type } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Текст обязателен' });
  const item = { id: String(nextId++), text: text.trim(), type: type || 'news', createdAt: new Date() };
  news.push(item);
  res.status(201).json(item);
});

// DELETE /api/news/:id — delete (mod+)
router.delete('/news/:id', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const idx = news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Не найдено' });
  news.splice(idx, 1);
  res.json({ ok: true });
});

// ─── Game status — public ─────────────────────────────────────
router.get('/game/status', (req, res) => {
  res.json({
    maintenanceMode: gameControl.maintenanceMode,
    maintenanceMessage: gameControl.maintenanceMessage,
    onlinePlayEnabled: gameControl.onlinePlayEnabled,
  });
});

// ─── Admin: server status ─────────────────────────────────────
router.get('/admin/status', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { isDbConnected } = require('../config/db');
  let userCount = 0;
  try {
    if (isDbConnected()) userCount = await require('../models/User').countDocuments();
    else userCount = require('../config/memoryStore').getAllUsers().length;
  } catch {}
  res.json({
    maintenanceMode: gameControl.maintenanceMode,
    maintenanceMessage: gameControl.maintenanceMessage,
    onlinePlayEnabled: gameControl.onlinePlayEnabled,
    newsCount: news.length,
    userCount,
    uptime: Math.floor(process.uptime()),
    dbConnected: isDbConnected(),
    role: await getRole(req),
  });
});

// ─── Admin: maintenance ───────────────────────────────────────
router.post('/admin/maintenance', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { enabled, message } = req.body;
  gameControl.maintenanceMode = !!enabled;
  if (message !== undefined) gameControl.maintenanceMessage = message || gameControl.maintenanceMessage;
  res.json({ ok: true, maintenanceMode: gameControl.maintenanceMode, maintenanceMessage: gameControl.maintenanceMessage });
});

// ─── Admin: online play toggle ────────────────────────────────
router.post('/admin/online-play', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  gameControl.onlinePlayEnabled = !!req.body.enabled;
  res.json({ ok: true, onlinePlayEnabled: gameControl.onlinePlayEnabled });
});

// ─── Admin: list players ──────────────────────────────────────
router.get('/admin/players', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { isDbConnected } = require('../config/db');
  try {
    let users;
    if (isDbConnected()) {
      users = await require('../models/User').find({}).select('-password_hash').sort({ elo_rating: -1 }).limit(200);
    } else {
      users = require('../config/memoryStore').getAllUsers().sort((a, b) => b.elo_rating - a.elo_rating).slice(0, 200);
    }
    res.json(users.map(u => ({
      id: u._id, username: u.username, elo: u.elo_rating,
      role: u.username === 'dom4ik001' ? 'admin' : (u.role || 'player'),
      banned: !!u.banned, banned_reason: u.banned_reason || '',
      matches: u.matches_played || 0, wins: u.matches_won || 0,
    })));
  } catch (e) { res.status(500).json({ message: 'Ошибка: ' + e.message }); }
});

// ─── Admin: ban/unban ─────────────────────────────────────────
router.post('/admin/ban', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { username, banned, reason } = req.body;
  if (!username) return res.status(400).json({ message: 'username обязателен' });
  const target = await dbGetUserByName(username);
  if (!target) return res.status(404).json({ message: 'Игрок не найден' });
  if (target.username === 'dom4ik001') return res.status(403).json({ message: 'Нельзя банить администратора' });
  await dbUpdateUser(target._id, { $set: { banned: !!banned, banned_reason: reason || '' } });
  res.json({ ok: true, username, banned: !!banned });
});

// ─── Admin: set ELO ──────────────────────────────────────────
router.post('/admin/elo', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { username, amount, mode } = req.body;
  if (!username || amount == null) return res.status(400).json({ message: 'username и amount обязательны' });
  const target = await dbGetUserByName(username);
  if (!target) return res.status(404).json({ message: 'Игрок не найден' });
  const val = Number(amount);
  if (isNaN(val)) return res.status(400).json({ message: 'amount должен быть числом' });
  const patch = mode === 'set'
    ? { $set: { elo_rating: Math.max(0, val) } }
    : { $inc: { elo_rating: val } };
  const updated = await dbUpdateUser(target._id, patch);
  const newElo = updated
    ? Math.max(0, updated.elo_rating != null ? updated.elo_rating : target.elo_rating + val)
    : Math.max(0, target.elo_rating + val);
  res.json({ ok: true, username, newElo });
});

// ─── Admin: set role ──────────────────────────────────────────
router.post('/admin/role', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { username, role } = req.body;
  if (!username || !['player', 'moderator'].includes(role)) return res.status(400).json({ message: 'Неверные параметры' });
  const target = await dbGetUserByName(username);
  if (!target) return res.status(404).json({ message: 'Игрок не найден' });
  if (target.username === 'dom4ik001') return res.status(403).json({ message: 'Нельзя изменить роль администратора' });
  await dbUpdateUser(target._id, { $set: { role } });
  res.json({ ok: true, username, role });
});

// ─── Admin: active matches ────────────────────────────────────
router.get('/admin/matches', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  try {
    const { getActiveRooms } = require('../game/roomManager');
    res.json(getActiveRooms());
  } catch (e) { res.json([]); }
});

module.exports = router;
module.exports.gameControl = gameControl;
