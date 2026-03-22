/**
 * newsRoutes.js — News, Admin & Moderator API
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
async function getUser(userId) {
  const { isDbConnected } = require('../config/db');
  if (isDbConnected()) return require('../models/User').findById(userId);
  return require('../config/memoryStore').findUserById(userId);
}

async function getUserByName(username) {
  const { isDbConnected } = require('../config/db');
  if (isDbConnected()) return require('../models/User').findOne({ username });
  return require('../config/memoryStore').findUserByUsername(username);
}

async function updateUser(userId, patch) {
  const { isDbConnected } = require('../config/db');
  if (isDbConnected()) return require('../models/User').findByIdAndUpdate(userId, patch, { new: true });
  return require('../config/memoryStore').updateUser(userId, patch);
}

async function getRole(req) {
  const user = await getUser(req.userId);
  if (!user) return 'player';
  // Fallback: dom4ik001 is always admin even if role field missing in old DB
  if (user.username === 'dom4ik001') return 'admin';
  return user.role || 'player';
}

async function isAdmin(req) { return (await getRole(req)) === 'admin'; }
async function isMod(req)   { const r = await getRole(req); return r === 'admin' || r === 'moderator'; }

// ─── News (public read) ───────────────────────────────────────
router.get('/', (req, res) => res.json([...news].reverse().slice(0, 20)));

router.post('/admin/news', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { text, type } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Текст обязателен' });
  const item = { id: String(nextId++), text: text.trim(), type: type || 'news', createdAt: new Date() };
  news.push(item);
  res.status(201).json(item);
});

router.delete('/admin/news/:id', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const idx = news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Не найдено' });
  news.splice(idx, 1);
  res.json({ ok: true });
});

// ─── Game control (admin only) ────────────────────────────────
router.post('/admin/maintenance', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { enabled, message } = req.body;
  gameControl.maintenanceMode = !!enabled;
  if (message) gameControl.maintenanceMessage = message;
  res.json({ ok: true, maintenanceMode: gameControl.maintenanceMode, maintenanceMessage: gameControl.maintenanceMessage });
});

router.post('/admin/online-play', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { enabled } = req.body;
  gameControl.onlinePlayEnabled = !!enabled;
  res.json({ ok: true, onlinePlayEnabled: gameControl.onlinePlayEnabled });
});

router.get('/game/status', (req, res) => res.json({
  maintenanceMode: gameControl.maintenanceMode,
  maintenanceMessage: gameControl.maintenanceMessage,
  onlinePlayEnabled: gameControl.onlinePlayEnabled,
}));

// ─── Player management (admin + mod) ─────────────────────────

// GET /api/admin/players — list all players
router.get('/admin/players', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { isDbConnected } = require('../config/db');
  let users;
  try {
    if (isDbConnected()) {
      users = await require('../models/User').find({}).select('-password_hash').sort({ elo_rating: -1 }).limit(200);
    } else {
      users = require('../config/memoryStore').getAllUsers().sort((a, b) => b.elo_rating - a.elo_rating).slice(0, 200);
    }
    res.json(users.map(u => ({
      id: u._id, username: u.username, elo: u.elo_rating,
      role: u.role || 'player', banned: !!u.banned, banned_reason: u.banned_reason || '',
      matches: u.matches_played || 0, wins: u.matches_won || 0,
    })));
  } catch(e) { res.status(500).json({ message: 'Ошибка' }); }
});

// POST /api/admin/ban — ban/unban player
router.post('/admin/ban', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { username, banned, reason } = req.body;
  if (!username) return res.status(400).json({ message: 'username обязателен' });
  const target = await getUserByName(username);
  if (!target) return res.status(404).json({ message: 'Игрок не найден' });
  if (target.role === 'admin') return res.status(403).json({ message: 'Нельзя банить администратора' });
  await updateUser(target._id, { $set: { banned: !!banned, banned_reason: reason || '' } });
  res.json({ ok: true, username, banned: !!banned });
});

// POST /api/admin/elo — set/add ELO to player (admin only)
router.post('/admin/elo', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { username, amount, mode } = req.body; // mode: 'set' | 'add'
  if (!username || amount == null) return res.status(400).json({ message: 'username и amount обязательны' });
  const target = await getUserByName(username);
  if (!target) return res.status(404).json({ message: 'Игрок не найден' });
  let patch;
  if (mode === 'set') {
    patch = { $set: { elo_rating: Math.max(0, Number(amount)) } };
  } else {
    patch = { $inc: { elo_rating: Number(amount) } };
  }
  const updated = await updateUser(target._id, patch);
  const newElo = updated ? (updated.elo_rating != null ? updated.elo_rating : target.elo_rating + Number(amount)) : target.elo_rating;
  res.json({ ok: true, username, newElo: Math.max(0, newElo) });
});

// POST /api/admin/role — set moderator/player role (admin only)
router.post('/admin/role', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { username, role } = req.body;
  if (!username || !['player', 'moderator'].includes(role)) return res.status(400).json({ message: 'Неверные параметры' });
  const target = await getUserByName(username);
  if (!target) return res.status(404).json({ message: 'Игрок не найден' });
  if (target.role === 'admin') return res.status(403).json({ message: 'Нельзя изменить роль администратора' });
  await updateUser(target._id, { $set: { role } });
  res.json({ ok: true, username, role });
});

// ─── Active matches (admin + mod) ────────────────────────────
router.get('/admin/matches', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  try {
    const { getActiveRooms } = require('../game/roomManager');
    res.json(getActiveRooms());
  } catch(e) { res.json([]); }
});

// ─── Server status ────────────────────────────────────────────
router.get('/admin/status', requireAuth, async (req, res) => {
  if (!await isMod(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { isDbConnected } = require('../config/db');
  let userCount = 0;
  try {
    if (isDbConnected()) userCount = await require('../models/User').countDocuments();
    else userCount = require('../config/memoryStore').getAllUsers().length;
  } catch {}
  const role = await getRole(req);
  res.json({
    maintenanceMode: gameControl.maintenanceMode,
    maintenanceMessage: gameControl.maintenanceMessage,
    onlinePlayEnabled: gameControl.onlinePlayEnabled,
    newsCount: news.length,
    userCount,
    uptime: Math.floor(process.uptime()),
    dbConnected: isDbConnected(),
    role,
  });
});

module.exports = router;
module.exports.gameControl = gameControl;
