/**
 * leaderboardController.js — Top-100 leaderboard
 */
const { isDbConnected } = require('../config/db');
const mem = require('../config/memoryStore');

async function getLeaderboard(req, res) {
  try {
    let users;
    if (isDbConnected()) {
      const User = require('../models/User');
      users = await User.find({})
        .sort({ elo_rating: -1 })
        .limit(100)
        .select('username elo_rating matches_played matches_won');
    } else {
      users = mem.getTopUsers(100);
    }

    const result = users.map((u, i) => ({
      rank:     i + 1,
      username: u.username,
      elo:      u.elo_rating,
      winrate:  u.matches_played > 0
        ? Math.round((u.matches_won / u.matches_played) * 100)
        : 0
    }));

    return res.json(result);
  } catch (err) {
    console.error('[Leaderboard] Error:', err);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = { getLeaderboard };
