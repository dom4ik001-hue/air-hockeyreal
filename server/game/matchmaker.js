/**
 * matchmaker.js — ELO-based matchmaking queue
 */
const { createRoom } = require('./roomManager');

// Queue: Array<{ socketId, userId, username, elo, joinedAt }>
const queue = [];
let matchmakingInterval = null;
let _io = null;

const BOT_WAIT_SEC = 20; // seconds before bot fallback

function joinQueue(player) {
  leaveQueue(player.socketId);
  queue.push({ ...player, joinedAt: Date.now() });
  console.log(`[MM] ${player.username} (${player.elo} ELO) joined queue. Size: ${queue.length}`);
}

function leaveQueue(socketId) {
  const idx = queue.findIndex(p => p.socketId === socketId);
  if (idx !== -1) {
    console.log(`[MM] ${queue[idx].username} left queue`);
    queue.splice(idx, 1);
  }
}

function startMatchmaking(io) {
  _io = io;
  // Always restart the interval cleanly
  if (matchmakingInterval) clearInterval(matchmakingInterval);

  matchmakingInterval = setInterval(() => {
    const now = Date.now();

    // Try to match real pairs first
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];
        // Always match — range is unlimited
        console.log(`[MM] Match: ${a.username} vs ${b.username}`);
        queue.splice(j, 1);
        queue.splice(i, 1);
        createRoom(a, b, io);
        i = -1;
        break;
      }
    }

    // Bot fallback: if player waited > BOT_WAIT_SEC, match with bot
    for (let i = queue.length - 1; i >= 0; i--) {
      const p = queue[i];
      const waitSec = (now - p.joinedAt) / 1000;
      if (waitSec >= BOT_WAIT_SEC) {
        console.log(`[MM] Bot fallback for ${p.username} after ${Math.round(waitSec)}s`);
        queue.splice(i, 1);
        const bot = {
          socketId: 'bot_' + Date.now(),
          userId: null,
          username: '🤖 Бот',
          elo: p.elo,
          isBot: true,
        };
        createRoom(p, bot, io);
      }
    }
  }, 1000);

  console.log('[MM] Matchmaking loop started');
}

function stopMatchmaking() {
  if (matchmakingInterval) { clearInterval(matchmakingInterval); matchmakingInterval = null; }
}

function getQueueSize() { return queue.length; }

module.exports = { joinQueue, leaveQueue, startMatchmaking, stopMatchmaking, getQueueSize };
