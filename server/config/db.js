/**
 * db.js — MongoDB connection (optional)
 * If MONGO_URI is not set, runs in memory-only mode.
 */
const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri || uri === 'memory') {
    console.log('[DB] No MONGO_URI set — running in IN-MEMORY mode (data not persisted)');
    isConnected = false;
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    isConnected = true;
    console.log(`[DB] MongoDB connected: ${mongoose.connection.host}`);

    mongoose.connection.on('error', err => console.error('[DB] Error:', err));
    mongoose.connection.on('disconnected', () => console.warn('[DB] Disconnected'));
  } catch (err) {
    console.warn('[DB] Could not connect to MongoDB:', err.message);
    console.log('[DB] Falling back to IN-MEMORY mode');
    isConnected = false;
  }
}

function isDbConnected() { return isConnected; }

module.exports = { connectDB, isDbConnected };
