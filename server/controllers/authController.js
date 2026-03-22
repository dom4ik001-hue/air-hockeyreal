/**
 * authController.js — Registration and login
 * Works with MongoDB (if connected) or in-memory store.
 */
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { isDbConnected } = require('../config/db');
const mem  = require('../config/memoryStore');

// Lazy-load Mongoose model only if DB is connected
function getModel() {
  if (isDbConnected()) return require('../models/User');
  return null;
}

async function findByUsername(username) {
  const Model = getModel();
  if (Model) return Model.findOne({ username });
  return mem.findUserByUsername(username);
}

async function createUser(data) {
  const Model = getModel();
  if (Model) return Model.create(data);
  return mem.createUser(data);
}
/**
 * POST /api/auth/register
 */
async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { username, password } = req.body;

  try {
    const existing = await findByUsername(username);
    if (existing) {
      return res.status(409).json({ message: 'Никнейм уже занят' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const role = username === 'dom4ik001' ? 'admin' : 'player';
    const user = await createUser({ username, password_hash, role });
    const token = signToken(user._id, user.username, role);

    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }

  const { username, password } = req.body;

  try {
    const user = await findByUsername(username);
    if (!user) {
      return res.status(401).json({ message: 'Неверный никнейм или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Неверный никнейм или пароль' });
    }

    const token = signToken(user._id, user.username, user.role || 'player');
    return res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

function signToken(userId, username, role) {
  return jwt.sign(
    { sub: userId, username, role: role || 'player' },
    process.env.JWT_SECRET || 'dev_secret_change_in_production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function sanitizeUser(user) {
  return {
    id:             user._id,
    username:       user.username,
    elo_rating:     user.elo_rating,
    matches_played: user.matches_played,
    matches_won:    user.matches_won,
    matches_lost:   user.matches_lost,
    role:           user.username === 'dom4ik001' ? 'admin' : (user.role || 'player'),
    created_at:     user.created_at
  };
}

module.exports = { register, login };
