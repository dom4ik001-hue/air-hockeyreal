/**
 * User.js — Mongoose User model
 */
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 16,
    match: /^[a-zA-Zа-яА-Я0-9_]+$/
  },
  password_hash: {
    type: String,
    required: true
  },
  elo_rating: {
    type: Number,
    default: 1000,
    min: 0
  },
  matches_played: {
    type: Number,
    default: 0
  },
  matches_won: {
    type: Number,
    default: 0
  },
  matches_lost: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['player', 'moderator', 'admin'],
    default: 'player'
  },
  banned: {
    type: Boolean,
    default: false
  },
  banned_reason: {
    type: String,
    default: ''
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false,  // use custom string _id
  versionKey: false
});

// Index for leaderboard queries
userSchema.index({ elo_rating: -1 });

module.exports = mongoose.model('User', userSchema);
