/**
 * apiRoutes.js — Protected API routes
 */
const express = require('express');
const jwt     = require('jsonwebtoken');
const { getProfile }     = require('../controllers/userController');
const { getLeaderboard } = require('../controllers/leaderboardController');

const router = express.Router();

// ─── JWT Auth Middleware ──────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_in_production');
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Недействительный токен' });
  }
}

// ─── Routes ──────────────────────────────────────────────────

// Public
router.get('/leaderboard', getLeaderboard);

// Protected
router.get('/user/profile', requireAuth, getProfile);

module.exports = router;
module.exports.requireAuth = requireAuth;
