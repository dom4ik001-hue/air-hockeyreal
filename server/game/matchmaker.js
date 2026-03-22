/**
 * matchmaker.js — ELO-based matchmaking queue
 *
 * Algorithm:
 *   1. Player joins queue with their ELO.
 *   2. Every second, scan queue for compatible pairs (|elo_A - elo_B| <= range).
 *   3. Range starts at 200, expands by 200 every 10 seconds.
 *   4. On match found → call createRoom().
 */
const { createRoom } = require('./roomManager');

// Queue: Array<{ socketId, userId, username, elo, joinedAt, range }>
const queue = [];

// Interval handle
let matchmakingInterval = null;

/**
 * Add player to matchmaking queue.
 */
function joinQueue(player) {
  leaveQueue(player.socketId);

  queue.push({
    ...player,
    joinedAt: Date.now(),
    range: 10000 // Start with huge range — always find a match
  });

  console.log(`[MM] ${player.username} (${player.elo} ELO) joined queue. Queue size: ${queue.length}`);
}

/**
 * Remove player from queue.
 */
function leaveQueue(socketId) {
  const idx = queue.findIndex(p => p.socketId === socketId);
  if (idx !== -1) {
    console.log(`[MM] ${queue[idx].username} left queue`);
    queue.splice(idx, 1);
  }
}

/**
 * Start the matchmaking loop.
 * @param {object} io — Socket.io server instance
 */
function startMatchmaking(io) {
  if (matchmakingInterval) return;

  matchmakingInterval = setInterval(() => {
    // Expand ranges for waiting players
    const now = Date.now();
    queue.forEach(p => {
      const waitSec = (now - p.joinedAt) / 1000;
      p.range = 200 + Math.floor(waitSec / 10) * 200;
    });

    // Try to match pairs
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];

        const eloDiff = Math.abs(a.elo - b.elo);
        const maxRange = Math.max(a.range, b.range);

        if (eloDiff <= maxRange) {
          // Match found!
          console.log(`[MM] Match: ${a.username} vs ${b.username} (diff: ${eloDiff})`);

          // Remove from queue
          queue.splice(j, 1);
          queue.splice(i, 1);

          // Create room
          createRoom(a, b, io);

          // Restart scan from beginning
          i = -1;
          break;
        }
      }
    }
  }, 1000);

  console.log('[MM] Matchmaking loop started');
}

function stopMatchmaking() {
  if (matchmakingInterval) {
    clearInterval(matchmakingInterval);
    matchmakingInterval = null;
  }
}

function getQueueSize() {
  return queue.length;
}

module.exports = { joinQueue, leaveQueue, startMatchmaking, stopMatchmaking, getQueueSize };
