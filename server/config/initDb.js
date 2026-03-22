/**
 * initDb.js — Database initialization script
 * Run: node server/config/initDb.js
 */
require('dotenv').config();
const { connectDB } = require('./db');
const User  = require('../models/User');
const Match = require('../models/Match');

async function init() {
  try {
    await connectDB();
    console.log('[Init] Ensuring indexes...');

    await User.createIndexes();
    await Match.createIndexes();

    console.log('[Init] Indexes created successfully');
    console.log('[Init] Database initialized');
    process.exit(0);
  } catch (err) {
    console.error('[Init] Error:', err);
    process.exit(1);
  }
}

init();
