/**
 * userController.js — User profile
 */
const { isDbConnected } = require('../config/db');
const mem = require('../config/memoryStore');

async function getProfile(req, res) {
  try {
    let user;
    if (isDbConnected()) {
      try {
        const User = require('../models/User');
        user = await User.findById(req.userId).select('-password_hash');
      } catch {
        // Invalid ObjectId format — fall through to memory/token restore
        user = null;
      }
    } else {
      user = mem.findUserById(req.userId);
    }

    // If not found anywhere — restore ghost user from token payload
    if (!user && req.username) {
      user = {
        _id:            req.userId,
        username:       req.username,
        elo_rating:     1000,
        matches_played: 0,
        matches_won:    0,
        matches_lost:   0,
        role:           req.username === 'dom4ik001' ? 'admin' : (req.userRole || 'player'),
        banned:         false,
        created_at:     new Date(),
      };
      if (!isDbConnected()) mem.restoreUser(user);
    }

    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    return res.json({
      id:             user._id,
      username:       user.username,
      elo_rating:     user.elo_rating,
      matches_played: user.matches_played,
      matches_won:    user.matches_won,
      matches_lost:   user.matches_lost,
      // Fallback: dom4ik001 is always admin
      role:           user.username === 'dom4ik001' ? 'admin' : (user.role || 'player'),
      banned:         !!user.banned,
      created_at:     user.created_at
    });
  } catch (err) {
    console.error('[User] getProfile error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { getProfile };
