/**
 * roomManager.js — Game room lifecycle and server-side physics
 * Server-authoritative: 60 ticks/sec, broadcasts game_state_update.
 * Works with MongoDB or in-memory store.
 */
const { v4: uuidv4 } = require('uuid');
const { calculateElo } = require('./eloCalculator');
const { isDbConnected } = require('../config/db');
const mem = require('../config/memoryStore');

// ─── Physics constants ────────────────────────────────────────
const BOARD_W     = 800;
const BOARD_H     = 400;
const PUCK_R      = 15;
const MALLET_R    = 30;
// Goals on LEFT (x=0) and RIGHT (x=BOARD_W), goal opening is Y range
const GOAL_TOP    = (BOARD_H - 130) / 2;
const GOAL_BOTTOM = GOAL_TOP + 130;
const FRICTION    = 0.99;
const MAX_SPEED   = 18;
const RESTITUTION = 0.9;
const TICK_RATE   = 60;
const MAX_GOALS   = 7;

const rooms       = new Map(); // roomId → state
const socketToRoom = new Map(); // socketId → roomId

// ─── DB helpers ───────────────────────────────────────────────
async function dbFindUser(id) {
  if (isDbConnected()) {
    const User = require('../models/User');
    return User.findById(id);
  }
  return mem.findUserById(id);
}

async function dbUpdateUser(id, patch) {
  if (isDbConnected()) {
    const User = require('../models/User');
    await User.findByIdAndUpdate(id, patch);
    // Ensure ELO >= 0
    await User.updateOne({ _id: id, elo_rating: { $lt: 0 } }, { $set: { elo_rating: 0 } });
  } else {
    mem.updateUser(id, patch);
  }
}

async function dbCreateMatch(data) {
  if (isDbConnected()) {
    const Match = require('../models/Match');
    return Match.create(data);
  }
  return mem.createMatch(data);
}

// ─── Room creation ────────────────────────────────────────────
function createRoom(p1, p2, io) {
  const roomId = uuidv4();

  const state = {
    roomId, io,
    p1: { ...p1, x: BOARD_W * 0.75, y: BOARD_H / 2, score: 0, vx: 0, vy: 0 },
    p2: { ...p2, x: BOARD_W * 0.25, y: BOARD_H / 2, score: 0, vx: 0, vy: 0 },
    puck: { x: BOARD_W / 2, y: BOARD_H / 2, vx: 0, vy: 0 },
    status: 'countdown',
    tickInterval: null,
    countdownTimer: null
  };

  rooms.set(roomId, state);
  socketToRoom.set(p1.socketId, roomId);
  socketToRoom.set(p2.socketId, roomId);

  const s1 = io.sockets.sockets.get(p1.socketId);
  const s2 = io.sockets.sockets.get(p2.socketId);
  if (s1) s1.join(roomId);
  if (s2) s2.join(roomId);

  if (s1) s1.emit('match_found', {
    matchId: roomId, opponentName: p2.username, opponentElo: p2.elo, playerIndex: 1
  });
  if (s2) s2.emit('match_found', {
    matchId: roomId, opponentName: p1.username, opponentElo: p1.elo, playerIndex: 2
  });

  startCountdown(state);
  return roomId;
}

function startCountdown(state) {
  let count = 3;
  state.io.to(state.roomId).emit('game_start', { countdown: count });

  const tick = () => {
    count--;
    if (count > 0) {
      state.io.to(state.roomId).emit('game_start', { countdown: count });
      state.countdownTimer = setTimeout(tick, 1000);
    } else {
      state.io.to(state.roomId).emit('game_start', { countdown: 'GO' });
      state.countdownTimer = setTimeout(() => {
        state.status = 'playing';
        startGameLoop(state);
      }, 700);
    }
  };
  state.countdownTimer = setTimeout(tick, 1000);
}

function startGameLoop(state) {
  const interval = Math.floor(1000 / TICK_RATE);
  state.tickInterval = setInterval(() => {
    if (state.status !== 'playing') return;
    updatePhysics(state);
    broadcastState(state);
  }, interval);
}

// ─── Physics ──────────────────────────────────────────────────
function updatePhysics(state) {
  const puck = state.puck;

  puck.vx *= FRICTION;
  puck.vy *= FRICTION;
  if (Math.abs(puck.vx) < 0.01) puck.vx = 0;
  if (Math.abs(puck.vy) < 0.01) puck.vy = 0;

  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > MAX_SPEED) {
    puck.vx = (puck.vx / speed) * MAX_SPEED;
    puck.vy = (puck.vy / speed) * MAX_SPEED;
  }

  puck.x += puck.vx;
  puck.y += puck.vy;

  resolveMalletPuck(state.p1, puck);
  resolveMalletPuck(state.p2, puck);

  const goal = resolveWalls(puck);
  if (goal) handleGoal(state, goal);
}

function resolveMalletPuck(mallet, puck) {
  const dx   = puck.x - mallet.x;
  const dy   = puck.y - mallet.y;
  const dist = Math.hypot(dx, dy);
  const minD = MALLET_R + PUCK_R;
  if (dist >= minD || dist === 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  puck.x += nx * (minD - dist);
  puck.y += ny * (minD - dist);

  const dvx = puck.vx - (mallet.vx || 0);
  const dvy = puck.vy - (mallet.vy || 0);
  const dvN = dvx * nx + dvy * ny;
  if (dvN > 0) return;

  const impulse = -(2) * dvN / (1 + 1 / 5);
  puck.vx += impulse * nx;
  puck.vy += impulse * ny;

  const ms = Math.hypot(mallet.vx || 0, mallet.vy || 0);
  if (ms > 0.5) {
    puck.vx += (mallet.vx || 0) * 1.2;
    puck.vy += (mallet.vy || 0) * 1.2;
  }

  const s2 = Math.hypot(puck.vx, puck.vy);
  if (s2 > MAX_SPEED) {
    puck.vx = (puck.vx / s2) * MAX_SPEED;
    puck.vy = (puck.vy / s2) * MAX_SPEED;
  }
}

function resolveWalls(puck) {
  // Horizontal board: goals on LEFT (x=0) and RIGHT (x=BOARD_W)
  // Goal opening is Y range [GOAL_TOP, GOAL_BOTTOM]
  const inGoalY = puck.y > GOAL_TOP && puck.y < GOAL_BOTTOM;

  // Top wall
  if (puck.y - PUCK_R <= 0) {
    puck.y  = PUCK_R;
    puck.vy = Math.abs(puck.vy) * RESTITUTION;
  }
  // Bottom wall
  if (puck.y + PUCK_R >= BOARD_H) {
    puck.y  = BOARD_H - PUCK_R;
    puck.vy = -Math.abs(puck.vy) * RESTITUTION;
  }
  // Left wall — goal opening or bounce
  if (puck.x - PUCK_R <= 0) {
    if (inGoalY) return 'left';
    puck.x  = PUCK_R;
    puck.vx = Math.abs(puck.vx) * RESTITUTION;
  }
  // Right wall — goal opening or bounce
  if (puck.x + PUCK_R >= BOARD_W) {
    if (inGoalY) return 'right';
    puck.x  = BOARD_W - PUCK_R;
    puck.vx = -Math.abs(puck.vx) * RESTITUTION;
  }
  return null;
}

function handleGoal(state, side) {
  if (state.status !== 'playing') return;
  state.status = 'goal';

  // 'left' goal = p1 scores (puck entered p2's goal), 'right' = p2 scores
  const scorer = side === 'left' ? 'p1' : 'p2';
  if (scorer === 'p1') state.p1.score++;
  else                 state.p2.score++;

  state.io.to(state.roomId).emit('goal_scored', {
    scorer,
    newScore:   { p1: state.p1.score, p2: state.p2.score },
    scorerName: scorer === 'p1' ? state.p1.username : state.p2.username
  });

  if (state.p1.score >= MAX_GOALS || state.p2.score >= MAX_GOALS) {
    clearInterval(state.tickInterval);
    setTimeout(() => endMatch(state, scorer), 2000);
  } else {
    setTimeout(() => {
      resetPuck(state);
      state.status = 'playing';
    }, 2000);
  }
}

function resetPuck(state) {
  state.puck = { x: BOARD_W / 2, y: BOARD_H / 2, vx: 0, vy: 0 };
  state.p1.x = BOARD_W * 0.75; state.p1.y = BOARD_H / 2;
  state.p2.x = BOARD_W * 0.25; state.p2.y = BOARD_H / 2;
}

async function endMatch(state, winner) {
  state.status = 'ended';
  clearInterval(state.tickInterval);
  clearTimeout(state.countdownTimer);

  const winnerId = winner === 'p1' ? state.p1.userId : state.p2.userId;
  const loserId  = winner === 'p1' ? state.p2.userId : state.p1.userId;

  let eloP1Change = 0, eloP2Change = 0;
  let newEloP1 = state.p1.elo, newEloP2 = state.p2.elo;

  if (state.p1.userId && state.p2.userId) {
    try {
      const winnerUser = await dbFindUser(winnerId);
      const loserUser  = await dbFindUser(loserId);

      if (winnerUser && loserUser) {
        const { changeA, changeB, newA, newB } = calculateElo(
          winnerUser.elo_rating, loserUser.elo_rating
        );

        if (winner === 'p1') {
          eloP1Change = changeA; eloP2Change = changeB;
          newEloP1 = newA;      newEloP2 = newB;
        } else {
          eloP2Change = changeA; eloP1Change = changeB;
          newEloP2 = newA;       newEloP1 = newB;
        }

        await dbUpdateUser(winnerId, { $inc: { elo_rating: winner === 'p1' ? eloP1Change : eloP2Change, matches_played: 1, matches_won: 1 } });
        await dbUpdateUser(loserId,  { $inc: { elo_rating: winner === 'p1' ? eloP2Change : eloP1Change, matches_played: 1, matches_lost: 1 } });

        await dbCreateMatch({
          player1_id: state.p1.userId, player2_id: state.p2.userId,
          player1_score: state.p1.score, player2_score: state.p2.score,
          player1_elo_change: eloP1Change, player2_elo_change: eloP2Change,
          winner_id: winnerId
        });
      }
    } catch (err) {
      console.error('[Room] ELO update error:', err);
    }
  }

  const s1 = state.io.sockets.sockets.get(state.p1.socketId);
  const s2 = state.io.sockets.sockets.get(state.p2.socketId);

  if (s1) s1.emit('match_over', {
    winner, score: { p1: state.p1.score, p2: state.p2.score },
    eloChange: eloP1Change, newElo: newEloP1
  });
  if (s2) s2.emit('match_over', {
    winner, score: { p1: state.p1.score, p2: state.p2.score },
    eloChange: eloP2Change, newElo: newEloP2
  });

  socketToRoom.delete(state.p1.socketId);
  socketToRoom.delete(state.p2.socketId);
  rooms.delete(state.roomId);
}

function broadcastState(state) {
  state.io.to(state.roomId).emit('game_state_update', {
    puck:  { x: state.puck.x, y: state.puck.y },
    p1:    { x: state.p1.x,   y: state.p1.y   },
    p2:    { x: state.p2.x,   y: state.p2.y   },
    score: { p1: state.p1.score, p2: state.p2.score }
  });
}

function handlePlayerInput(socketId, input, isPlayer1) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return;
  const state = rooms.get(roomId);
  if (!state || state.status !== 'playing') return;

  const player = isPlayer1 ? state.p1 : state.p2;
  const r = MALLET_R;

  let x = Math.max(r, Math.min(BOARD_W - r, input.x));
  let y = Math.max(r, Math.min(BOARD_H - r, input.y));

  // Horizontal board: p1 = right half (x > W/2), p2 = left half (x < W/2)
  if (isPlayer1) x = Math.max(BOARD_W / 2 + r, x);
  else           x = Math.min(BOARD_W / 2 - r, x);

  player.vx = x - player.x;
  player.vy = y - player.y;
  player.x  = x;
  player.y  = y;
}

async function handleDisconnect(socketId) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return;
  const state = rooms.get(roomId);
  if (!state || state.status === 'ended') return;

  state.status = 'ended';
  clearInterval(state.tickInterval);
  clearTimeout(state.countdownTimer);

  const disconnectedIsP1 = state.p1.socketId === socketId;
  const winner = disconnectedIsP1 ? 'p2' : 'p1';

  const opponentSocketId = disconnectedIsP1 ? state.p2.socketId : state.p1.socketId;
  const opponentSocket = state.io.sockets.sockets.get(opponentSocketId);
  if (opponentSocket) opponentSocket.emit('opponent_disconnected');

  await endMatch(state, winner);
}

function getRoomBySocket(socketId) { return socketToRoom.get(socketId); }

function getPlayerIndex(socketId) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;
  const state = rooms.get(roomId);
  if (!state) return null;
  return state.p1.socketId === socketId ? 1 : 2;
}

module.exports = {
  createRoom, handlePlayerInput, handleDisconnect,
  getRoomBySocket, getPlayerIndex
};
