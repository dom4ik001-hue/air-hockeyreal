/**
 * memoryStore.js — In-memory data store
 * Used when MongoDB is not available.
 * Data is lost on server restart.
 */
const { v4: uuidv4 } = require('uuid');

const users   = new Map(); // id → user object
const matches = [];

// ─── User operations ─────────────────────────────────────────

function createUser({ username, password_hash, role }) {
  const user = {
    _id:            uuidv4(),
    username,
    password_hash,
    elo_rating:     1000,
    matches_played: 0,
    matches_won:    0,
    matches_lost:   0,
    role:           role || 'player',
    banned:         false,
    banned_reason:  '',
    created_at:     new Date()
  };
  users.set(user._id, user);
  return user;
}

function findUserById(id) {
  return users.get(id) || null;
}

function findUserByUsername(username) {
  for (const u of users.values()) {
    if (u.username === username) return u;
  }
  return null;
}

function updateUser(id, patch) {
  const user = users.get(id);
  if (!user) return null;
  // Handle $inc style
  if (patch.$inc) {
    for (const [k, v] of Object.entries(patch.$inc)) {
      user[k] = (user[k] || 0) + v;
    }
  }
  if (patch.$set) {
    for (const [k, v] of Object.entries(patch.$set)) {
      user[k] = v;
    }
  }
  // Ensure ELO >= 0
  if (user.elo_rating < 0) user.elo_rating = 0;
  users.set(id, user);
  return user;
}

function getTopUsers(limit = 100) {
  return Array.from(users.values())
    .sort((a, b) => b.elo_rating - a.elo_rating)
    .slice(0, limit);
}

// ─── Match operations ─────────────────────────────────────────

function createMatch(data) {
  const match = { _id: uuidv4(), ...data, timestamp: new Date() };
  matches.push(match);
  return match;
}

module.exports = {
  createUser, findUserById, findUserByUsername,
  updateUser, getTopUsers, createMatch,
  getAllUsers: () => Array.from(users.values()),
};
