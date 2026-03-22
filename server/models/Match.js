/**
 * Match.js — Mongoose Match history model
 */
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const matchSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4
  },
  player1_id: {
    type: String,
    required: true,
    ref: 'User'
  },
  player2_id: {
    type: String,
    required: true,
    ref: 'User'
  },
  player1_score: {
    type: Number,
    required: true
  },
  player2_score: {
    type: Number,
    required: true
  },
  player1_elo_change: {
    type: Number,
    required: true
  },
  player2_elo_change: {
    type: Number,
    required: true
  },
  winner_id: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false,
  versionKey: false
});

matchSchema.index({ player1_id: 1 });
matchSchema.index({ player2_id: 1 });
matchSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Match', matchSchema);
