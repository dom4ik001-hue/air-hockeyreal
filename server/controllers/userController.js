/**
 * userController.js — User profile
 */
const { isDbConnected } = require('../config/db');
const mem = require('../config/memoryStore');

async function getProfile(req, res) {
  try {
    let user;
    if (isDbConnected()) {
      const User = require('../models/User');
      user = await User.findById(req.userId).select('-password_hash');
    } else {
      user = mem.findUserById(req.userId);
    }

    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    return res.json({
      id:             user._id,
      username:       user.username,
      elo_rating:     user.elo_rating,
      matches_played: user.matches_played,
      matches_won:    user.matches_won,
      matches_lost:   user.matches_lost,
      created_at:     user.created_at
    });
  } catch (err) {
    console.error('[User] getProfile error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { getProfile };
