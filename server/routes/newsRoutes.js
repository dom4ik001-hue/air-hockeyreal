/**
 * newsRoutes.js — News API (public read, admin write)
 */
const express = require('express');
const { requireAuth } = require('./apiRoutes');
const router = express.Router();

// In-memory news store (persists until server restart)
const news = [];
let nextId = 1;

const ADMIN_USERNAME = 'dom4ik001';

async function isAdmin(req) {
  const userId = req.userId;
  try {
    const { isDbConnected } = require('../config/db');
    let user;
    if (isDbConnected()) {
      user = await require('../models/User').findById(userId);
    } else {
      user = require('../config/memoryStore').findUserById(userId);
    }
    return user && user.username === ADMIN_USERNAME;
  } catch { return false; }
}

// GET /api/news — public
router.get('/', (req, res) => {
  res.json([...news].reverse().slice(0, 20));
});

// POST /api/admin/news — admin only
router.post('/admin/news', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const { text, type } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Текст обязателен' });
  const item = { id: String(nextId++), text: text.trim(), type: type || 'news', createdAt: new Date() };
  news.push(item);
  res.status(201).json(item);
});

// DELETE /api/admin/news/:id — admin only
router.delete('/admin/news/:id', requireAuth, async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ message: 'Нет доступа' });
  const idx = news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Не найдено' });
  news.splice(idx, 1);
  res.json({ ok: true });
});

module.exports = router;
