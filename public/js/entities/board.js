/**
 * board.js - Cartoon hockey rink (horizontal, goals left/right)
 */

export const MAP_CONFIGS = {
  classic: {
    name: 'Классика',
    ice: '#c5e8f7', iceStripe: '#b8ddf0',
    border: '#1a4a8a', borderWidth: 10,
    line: '#e8507a', lineAlpha: 0.85,
    circle: '#4488cc', circleAlpha: 0.7,
    goalPost: '#1a4a8a', goalNet: 'rgba(26,74,138,0.12)',
    goalWidth: 130, puckFriction: 0.99, puckSpeed: 18,
  },
  neon: {
    name: 'Неон',
    ice: '#0d0020', iceStripe: '#130030',
    border: '#cc00ff', borderWidth: 8,
    line: '#00ffcc', lineAlpha: 0.9,
    circle: '#ff00aa', circleAlpha: 0.8,
    goalPost: '#cc00ff', goalNet: 'rgba(204,0,255,0.15)',
    goalWidth: 130, puckFriction: 0.99, puckSpeed: 18,
  },
  ice: {
    name: 'Лёд',
    ice: '#e8f6ff', iceStripe: '#d8eefa',
    border: '#6699bb', borderWidth: 10,
    line: '#ff7799', lineAlpha: 0.7,
    circle: '#88bbdd', circleAlpha: 0.6,
    goalPost: '#5588aa', goalNet: 'rgba(85,136,170,0.12)',
    goalWidth: 130, puckFriction: 0.998, puckSpeed: 20,
  },
  fire: {
    name: 'Огонь',
    ice: '#1c0500', iceStripe: '#250700',
    border: '#ff4400', borderWidth: 9,
    line: '#ffcc00', lineAlpha: 0.85,
    circle: '#ff8800', circleAlpha: 0.75,
    goalPost: '#ff3300', goalNet: 'rgba(255,68,0,0.15)',
    goalWidth: 130, puckFriction: 0.995, puckSpeed: 22,
  },
  forest: {
    name: 'Лес',
    ice: '#d4edda', iceStripe: '#c5e5cc',
    border: '#2d6a2d', borderWidth: 10,
    line: '#cc3355', lineAlpha: 0.8,
    circle: '#44aa55', circleAlpha: 0.65,
    goalPost: '#1e4d1e', goalNet: 'rgba(45,106,45,0.12)',
    goalWidth: 130, puckFriction: 0.99, puckSpeed: 18,
  },
  mini: {
    name: 'Мини',
    ice: '#fff0cc', iceStripe: '#ffe8b8',
    border: '#cc7700', borderWidth: 10,
    line: '#cc3366', lineAlpha: 0.8,
    circle: '#ee9900', circleAlpha: 0.7,
    goalPost: '#aa5500', goalNet: 'rgba(204,119,0,0.12)',
    goalWidth: 80, puckFriction: 0.99, puckSpeed: 18,
  }
};

export class Board {
  constructor(width, height, mapId) {
    this.width  = width;
    this.height = height;
    this.setMap(mapId || 'classic');
  }

  setMap(mapId) {
    this.mapId  = mapId;
    this.config = MAP_CONFIGS[mapId] || MAP_CONFIGS.classic;
    this.goalWidth  = this.config.goalWidth;
    this.goalDepth  = 24;
    this.cornerRadius = 30;
    // goalLeft/goalRight = Y coords of goal opening
    this.goalLeft  = (this.height - this.goalWidth) / 2;
    this.goalRight = this.goalLeft + this.goalWidth;
  }

  // Horizontal board: goals on left (x=0) and right (x=W)
  checkGoal(x, y, radius) {
    var inGoalY = y > this.goalLeft + radius && y < this.goalRight - radius;
    if (inGoalY) {
      if (x - radius <= 0)          return 'left';
      if (x + radius >= this.width) return 'right';
    }
    return null;
  }

  draw(ctx) {
    var W  = this.width, H = this.height;
    var GL = this.goalLeft, GR = this.goalRight, GD = this.goalDepth;
    var R  = this.cornerRadius;
    var c  = this.config;

    // --- Ice surface ---
    ctx.fillStyle = c.ice;
    _rr(ctx, 0, 0, W, H, R); ctx.fill();

    // Vertical stripes (subtle)
    ctx.save();
    _rr(ctx, 0, 0, W, H, R); ctx.clip();
    ctx.fillStyle = c.iceStripe;
    for (var sx = 0; sx < W; sx += 44) { ctx.fillRect(sx, 0, 22, H); }
    ctx.restore();

    // --- Outer border (thick cartoon) ---
    ctx.strokeStyle = c.border;
    ctx.lineWidth = c.borderWidth;
    ctx.lineJoin = 'round';
    _rr(ctx, c.borderWidth/2, c.borderWidth/2, W - c.borderWidth, H - c.borderWidth, R);
    ctx.stroke();

    // --- Center line (vertical) ---
    ctx.save();
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = c.lineAlpha;
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // --- Center circle ---
    ctx.save();
    ctx.strokeStyle = c.circle;
    ctx.globalAlpha = c.circleAlpha;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W/2, H/2, H * 0.28, 0, Math.PI * 2); ctx.stroke();
    // Center dot
    ctx.fillStyle = c.circle;
    ctx.globalAlpha = c.circleAlpha;
    ctx.beginPath(); ctx.arc(W/2, H/2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // --- Face-off circles ---
    var fx = W * 0.22, fy = H * 0.27;
    this._faceoff(ctx, fx, fy, c);
    this._faceoff(ctx, fx, H - fy, c);
    this._faceoff(ctx, W - fx, fy, c);
    this._faceoff(ctx, W - fx, H - fy, c);

    // --- Goal crease arcs ---
    ctx.save();
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = c.lineAlpha * 0.5;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, H/2, H * 0.22, -Math.PI/2, Math.PI/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W, H/2, H * 0.22, Math.PI/2, Math.PI * 1.5); ctx.stroke();
    ctx.restore();

    // --- Left goal ---
    ctx.save();
    ctx.fillStyle = c.goalNet;
    ctx.fillRect(0, GL, GD, this.goalWidth);
    ctx.strokeStyle = c.goalPost;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, GL); ctx.lineTo(GD, GL);
    ctx.moveTo(0, GR); ctx.lineTo(GD, GR);
    ctx.stroke();
    // Net lines
    ctx.strokeStyle = c.goalPost;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;
    for (var ny = GL + 10; ny < GR; ny += 14) {
      ctx.beginPath(); ctx.moveTo(0, ny); ctx.lineTo(GD, ny); ctx.stroke();
    }
    for (var nx = 6; nx < GD; nx += 10) {
      ctx.beginPath(); ctx.moveTo(nx, GL); ctx.lineTo(nx, GR); ctx.stroke();
    }
    ctx.restore();

    // --- Right goal ---
    ctx.save();
    ctx.fillStyle = c.goalNet;
    ctx.fillRect(W - GD, GL, GD, this.goalWidth);
    ctx.strokeStyle = c.goalPost;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W, GL); ctx.lineTo(W - GD, GL);
    ctx.moveTo(W, GR); ctx.lineTo(W - GD, GR);
    ctx.stroke();
    ctx.strokeStyle = c.goalPost;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;
    for (var ny2 = GL + 10; ny2 < GR; ny2 += 14) {
      ctx.beginPath(); ctx.moveTo(W, ny2); ctx.lineTo(W - GD, ny2); ctx.stroke();
    }
    for (var nx2 = W - GD + 4; nx2 < W; nx2 += 10) {
      ctx.beginPath(); ctx.moveTo(nx2, GL); ctx.lineTo(nx2, GR); ctx.stroke();
    }
    ctx.restore();

    // Neon glow effect
    if (this.mapId === 'neon') {
      ctx.save();
      ctx.shadowBlur = 18; ctx.shadowColor = c.border;
      ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
      ctx.restore();
    }
  }

  _faceoff(ctx, x, y, c) {
    ctx.save();
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = c.lineAlpha * 0.65;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawMapPreview(canvas, mapId) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var c = MAP_CONFIGS[mapId] || MAP_CONFIGS.classic;
  var gw = c.goalWidth * (H / 400);
  var gl = (H - gw) / 2, gr = gl + gw;
  var gd = 6, r = 6;

  ctx.fillStyle = c.ice;
  _rr(ctx, 0, 0, W, H, r); ctx.fill();

  ctx.save();
  _rr(ctx, 0, 0, W, H, r); ctx.clip();
  ctx.fillStyle = c.iceStripe;
  for (var sx = 0; sx < W; sx += 10) { ctx.fillRect(sx, 0, 5, H); }
  ctx.restore();

  ctx.strokeStyle = c.border; ctx.lineWidth = 2.5;
  _rr(ctx, 1.25, 1.25, W-2.5, H-2.5, r); ctx.stroke();

  ctx.strokeStyle = c.line; ctx.lineWidth = 1.5; ctx.globalAlpha = c.lineAlpha;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  ctx.strokeStyle = c.circle; ctx.lineWidth = 1.5; ctx.globalAlpha = c.circleAlpha;
  ctx.beginPath(); ctx.arc(W/2, H/2, W * 0.18, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = c.goalNet;
  ctx.fillRect(0, gl, gd, gw); ctx.fillRect(W-gd, gl, gd, gw);
  ctx.strokeStyle = c.goalPost; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0,gl); ctx.lineTo(gd,gl); ctx.moveTo(0,gr); ctx.lineTo(gd,gr);
  ctx.moveTo(W,gl); ctx.lineTo(W-gd,gl); ctx.moveTo(W,gr); ctx.lineTo(W-gd,gr);
  ctx.stroke();
}

function _rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}