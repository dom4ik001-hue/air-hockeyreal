/**
 * physics.js — Collision detection and resolution
 * Horizontal board: goals on LEFT and RIGHT walls
 */

/**
 * Resolve puck vs board walls.
 * Board is horizontal: goals are on left (x=0) and right (x=W) walls.
 * goalLeft/goalRight refer to Y coordinates of the goal opening.
 * @returns {'left'|'right'|null}
 */
export function resolvePuckWalls(puck, board) {
  const { radius } = puck;
  const W  = board.width;
  const H  = board.height;
  const GL = board.goalLeft;   // Y start of goal
  const GR = board.goalRight;  // Y end of goal
  const e  = 0.9;

  // Check goal first
  const goal = board.checkGoal(puck.x, puck.y, radius);
  if (goal) return goal;

  // Top wall
  if (puck.y - radius < 0) {
    puck.y  = radius;
    puck.vy = Math.abs(puck.vy) * e;
  }
  // Bottom wall
  if (puck.y + radius > H) {
    puck.y  = H - radius;
    puck.vy = -Math.abs(puck.vy) * e;
  }
  // Left wall (skip goal opening)
  if (puck.x - radius < 0) {
    if (!(puck.y > GL && puck.y < GR)) {
      puck.x  = radius;
      puck.vx = Math.abs(puck.vx) * e;
    }
  }
  // Right wall (skip goal opening)
  if (puck.x + radius > W) {
    if (!(puck.y > GL && puck.y < GR)) {
      puck.x  = W - radius;
      puck.vx = -Math.abs(puck.vx) * e;
    }
  }

  _capSpeed(puck);
  return null;
}

/**
 * Resolve elastic 2D collision between mallet and puck.
 * @returns {boolean} true if collision occurred
 */
export function resolveMalletPuck(mallet, puck) {
  const dx   = puck.x - mallet.x;
  const dy   = puck.y - mallet.y;
  const dist = Math.hypot(dx, dy);
  const minD = mallet.radius + puck.radius;

  if (dist >= minD || dist === 0) return false;

  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = minD - dist;
  puck.x += nx * overlap;
  puck.y += ny * overlap;

  const dvx = puck.vx - mallet.vx;
  const dvy = puck.vy - mallet.vy;
  const dvN = dvx * nx + dvy * ny;

  if (dvN > 0) return false;

  const impulse = -2 * dvN / (1 / puck.mass + 1 / mallet.mass);
  puck.vx += (impulse / puck.mass) * nx;
  puck.vy += (impulse / puck.mass) * ny;

  const malletSpeed = Math.hypot(mallet.vx, mallet.vy);
  if (malletSpeed > 0.5) {
    puck.vx += mallet.vx * 1.5;
    puck.vy += mallet.vy * 1.5;
  }

  _capSpeed(puck);
  return true;
}

/**
 * Resolve puck vs circular obstacles (bumpers).
 * @returns {boolean} true if any collision occurred
 */
export function resolvePuckObstacles(puck, board) {
  if (!board.obstacles || !board.obstacles.length) return false;
  let hit = false;
  for (const o of board.obstacles) {
    const dx   = puck.x - o.x;
    const dy   = puck.y - o.y;
    const dist = Math.hypot(dx, dy);
    const minD = puck.radius + o.r;
    if (dist < minD && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      // Push puck out
      puck.x = o.x + nx * minD;
      puck.y = o.y + ny * minD;
      // Reflect velocity
      const dot = puck.vx * nx + puck.vy * ny;
      puck.vx -= 2 * dot * nx * 0.9;
      puck.vy -= 2 * dot * ny * 0.9;
      _capSpeed(puck);
      hit = true;
    }
  }
  return hit;
}

/**
 * Server-side: clamp mallet to its half (horizontal board).
 * p1 = right half (x > W/2), p2 = left half (x < W/2)
 */
export function clampMalletPosition(pos, board, isPlayer1) {
  const r = 30;
  let { x, y } = pos;

  x = Math.max(r, Math.min(board.width  - r, x));
  y = Math.max(r, Math.min(board.height - r, y));

  if (isPlayer1) x = Math.max(board.width / 2 + r, x);
  else           x = Math.min(board.width / 2 - r, x);

  return { x, y };
}

function _capSpeed(puck) {
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > puck.maxSpeed) {
    const s = puck.maxSpeed / speed;
    puck.vx *= s;
    puck.vy *= s;
  }
}
