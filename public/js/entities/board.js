/**
 * board.js - Cartoon hockey rink (horizontal, goals left/right)
 * Board size: 1200x600
 */

export const MAP_CONFIGS = {
  classic: {
    name: 'Классика',
    ice: '#c8eaf8', iceStripe: '#b8ddf0', iceDot: 'rgba(100,160,210,0.18)',
    border: '#1a4a8a', borderWidth: 12,
    line: '#e8507a', lineAlpha: 0.9,
    circle: '#4488cc', circleAlpha: 0.75,
    goalPost: '#1a4a8a', goalNet: 'rgba(26,74,138,0.13)',
    goalWidth: 160, puckFriction: 0.99, puckSpeed: 20,
    obstacles: [],
  },
  neon: {
    name: 'Неон',
    ice: '#0d0020', iceStripe: '#130030', iceDot: 'rgba(200,0,255,0.12)',
    border: '#cc00ff', borderWidth: 10,
    line: '#00ffcc', lineAlpha: 0.9,
    circle: '#ff00aa', circleAlpha: 0.8,
    goalPost: '#cc00ff', goalNet: 'rgba(204,0,255,0.15)',
    goalWidth: 160, puckFriction: 0.99, puckSpeed: 20,
    obstacles: [],
  },
  ice: {
    name: 'Лёд',
    ice: '#e8f6ff', iceStripe: '#d8eefa', iceDot: 'rgba(80,140,200,0.12)',
    border: '#6699bb', borderWidth: 12,
    line: '#ff7799', lineAlpha: 0.7,
    circle: '#88bbdd', circleAlpha: 0.6,
    goalPost: '#5588aa', goalNet: 'rgba(85,136,170,0.12)',
    goalWidth: 160, puckFriction: 0.998, puckSpeed: 22,
    obstacles: [],
  },
  fire: {
    name: 'Огонь',
    ice: '#1c0500', iceStripe: '#250700', iceDot: 'rgba(255,100,0,0.1)',
    border: '#ff4400', borderWidth: 11,
    line: '#ffcc00', lineAlpha: 0.85,
    circle: '#ff8800', circleAlpha: 0.75,
    goalPost: '#ff3300', goalNet: 'rgba(255,68,0,0.15)',
    goalWidth: 160, puckFriction: 0.995, puckSpeed: 24,
    obstacles: [],
  },
  blocks: {
    name: 'Блоки',
    ice: '#d0e8ff', iceStripe: '#c0dcf5', iceDot: 'rgba(60,120,200,0.15)',
    border: '#2244aa', borderWidth: 12,
    line: '#ff4488', lineAlpha: 0.85,
    circle: '#3366cc', circleAlpha: 0.7,
    goalPost: '#2244aa', goalNet: 'rgba(34,68,170,0.13)',
    goalWidth: 160, puckFriction: 0.99, puckSpeed: 20,
    // obstacles: { x, y, r } — circular bumpers
    obstacles: [
      { x: 0.5, y: 0.5, r: 28 },           // center
      { x: 0.3, y: 0.28, r: 22 },
      { x: 0.3, y: 0.72, r: 22 },
      { x: 0.7, y: 0.28, r: 22 },
      { x: 0.7, y: 0.72, r: 22 },
    ],
  },
  maze: {
    name: 'Лабиринт',
    ice: '#e8ffe8', iceStripe: '#d8f5d8', iceDot: 'rgba(40,140,60,0.12)',
    border: '#1a6a1a', borderWidth: 12,
    line: '#cc3355', lineAlpha: 0.8,
    circle: '#33aa44', circleAlpha: 0.65,
    goalPost: '#1a6a1a', goalNet: 'rgba(26,106,26,0.13)',
    goalWidth: 160, puckFriction: 0.99, puckSpeed: 20,
    obstacles: [
      { x: 0.5, y: 0.25, r: 20 },
      { x: 0.5, y: 0.75, r: 20 },
      { x: 0.35, y: 0.5, r: 20 },
      { x: 0.65, y: 0.5, r: 20 },
      { x: 0.2,  y: 0.35, r: 16 },
      { x: 0.2,  y: 0.65, r: 16 },
      { x: 0.8,  y: 0.35, r: 16 },
      { x: 0.8,  y: 0.65, r: 16 },
    ],
  },
  mini: {
    name: 'Мини',
    ice: '#fff0cc', iceStripe: '#ffe8b8', iceDot: 'rgba(180,100,0,0.1)',
    border: '#cc7700', borderWidth: 12,
    line: '#cc3366', lineAlpha: 0.8,
    circle: '#ee9900', circleAlpha: 0.7,
    goalPost: '#aa5500', goalNet: 'rgba(204,119,0,0.12)',
    goalWidth: 100, puckFriction: 0.99, puckSpeed: 20,
    obstacles: [],
  },
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
    this.goalWidth    = this.config.goalWidth;
    this.goalDepth    = 30;
    this.cornerRadius = 40;
    this.goalLeft  = (this.height - this.goalWidth) / 2;
    this.goalRight = this.goalLeft + this.goalWidth;
    // Resolve obstacle positions to absolute coords
    this.obstacles = (this.config.obstacles || []).map(o => ({
      x: o.x * this.width,
      y: o.y * this.height,
      r: o.r
    }));
  }

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

    // ── Ice surface ──────────────────────────────────────────
    ctx.fillStyle = c.ice;
    _rr(ctx, 0, 0, W, H, R); ctx.fill();

    // Clip everything to rink shape
    ctx.save();
    _rr(ctx, 0, 0, W, H, R); ctx.clip();

    // Vertical stripes
    ctx.fillStyle = c.iceStripe;
    for (var sx = 0; sx < W; sx += 60) { ctx.fillRect(sx, 0, 30, H); }

    // Ice dots grid
    if (c.iceDot) {
      ctx.fillStyle = c.iceDot;
      for (var dx = 40; dx < W; dx += 55) {
        for (var dy = 30; dy < H; dy += 45) {
          ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // ── Zone lines (blue lines like real hockey) ─────────────
    ctx.strokeStyle = c.circle;
    ctx.globalAlpha = c.circleAlpha * 0.6;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(W * 0.3, 0); ctx.lineTo(W * 0.3, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.7, 0); ctx.lineTo(W * 0.7, H); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Center red line ──────────────────────────────────────
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = c.lineAlpha;
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 10]);
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── Center circle ────────────────────────────────────────
    ctx.strokeStyle = c.circle;
    ctx.globalAlpha = c.circleAlpha;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(W/2, H/2, H * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = c.circle; ctx.globalAlpha = c.circleAlpha;
    ctx.beginPath(); ctx.arc(W/2, H/2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Face-off circles (4 large ones like screenshot) ──────
    var fx = W * 0.22, fy = H * 0.28;
    this._faceoff(ctx, fx,     fy,     c, H * 0.18);
    this._faceoff(ctx, fx,     H - fy, c, H * 0.18);
    this._faceoff(ctx, W - fx, fy,     c, H * 0.18);
    this._faceoff(ctx, W - fx, H - fy, c, H * 0.18);

    // ── Goal crease arcs ─────────────────────────────────────
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = c.lineAlpha * 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, H/2, H * 0.25, -Math.PI/2, Math.PI/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W, H/2, H * 0.25, Math.PI/2, Math.PI * 1.5); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Obstacles (bumpers) ──────────────────────────────────
    this.obstacles.forEach(o => {
      // Shadow
      ctx.beginPath(); ctx.arc(o.x + 3, o.y + 4, o.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
      // Body
      var grad = ctx.createRadialGradient(o.x - o.r*0.3, o.y - o.r*0.3, 0, o.x, o.y, o.r);
      grad.addColorStop(0, _lighten(c.border, 60));
      grad.addColorStop(1, c.border);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      // Outline
      ctx.strokeStyle = _darken(c.border, 40);
      ctx.lineWidth = 3; ctx.stroke();
      // Highlight
      ctx.beginPath(); ctx.arc(o.x - o.r*0.3, o.y - o.r*0.35, o.r*0.28, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    });

    ctx.restore(); // end clip

    // ── Outer border ─────────────────────────────────────────
    ctx.strokeStyle = c.border;
    ctx.lineWidth = c.borderWidth;
    ctx.lineJoin = 'round';
    _rr(ctx, c.borderWidth/2, c.borderWidth/2, W - c.borderWidth, H - c.borderWidth, R);
    ctx.stroke();

    // ── Left goal ────────────────────────────────────────────
    this._drawGoal(ctx, 0, GL, GR, GD, c, false);
    // ── Right goal ───────────────────────────────────────────
    this._drawGoal(ctx, W, GL, GR, GD, c, true);

    // Neon glow
    if (this.mapId === 'neon') {
      ctx.save();
      ctx.shadowBlur = 22; ctx.shadowColor = c.border;
      ctx.strokeStyle = c.border; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
      ctx.restore();
    }
  }

  _drawGoal(ctx, wallX, GL, GR, GD, c, isRight) {
    var dir = isRight ? -1 : 1;
    var x0 = wallX, x1 = wallX + dir * GD;
    ctx.save();
    ctx.fillStyle = c.goalNet;
    ctx.fillRect(isRight ? x1 : x0, GL, GD, GR - GL);
    // Net grid
    ctx.strokeStyle = c.goalPost; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.28;
    for (var ny = GL + 12; ny < GR; ny += 18) {
      ctx.beginPath(); ctx.moveTo(x0, ny); ctx.lineTo(x1, ny); ctx.stroke();
    }
    var xa = isRight ? x1 : x0, xb = isRight ? x0 : x1;
    for (var nx = Math.min(xa,xb) + 8; nx < Math.max(xa,xb); nx += 14) {
      ctx.beginPath(); ctx.moveTo(nx, GL); ctx.lineTo(nx, GR); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Posts
    ctx.strokeStyle = c.goalPost; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, GL); ctx.lineTo(x1, GL);
    ctx.moveTo(x0, GR); ctx.lineTo(x1, GR);
    ctx.stroke();
    ctx.restore();
  }

  _faceoff(ctx, x, y, c, radius) {
    radius = radius || 50;
    ctx.save();
    ctx.strokeStyle = c.line;
    ctx.globalAlpha = c.lineAlpha * 0.7;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    // Inner cross
    ctx.lineWidth = 3;
    var arm = radius * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
    ctx.stroke();
    // Corner marks
    ctx.lineWidth = 4;
    var m = radius * 0.55, ml = 14;
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function(s) {
      ctx.beginPath();
      ctx.moveTo(x + s[0]*m, y + s[1]*(m - ml));
      ctx.lineTo(x + s[0]*m, y + s[1]*m);
      ctx.lineTo(x + s[0]*(m - ml), y + s[1]*m);
      ctx.stroke();
    });
    ctx.restore();
  }
}

export function drawMapPreview(canvas, mapId) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var c = MAP_CONFIGS[mapId] || MAP_CONFIGS.classic;
  var scale = H / 600;
  var gw = c.goalWidth * scale;
  var gl = (H - gw) / 2, gr = gl + gw;
  var gd = 8, r = 8;

  ctx.fillStyle = c.ice;
  _rr(ctx, 0, 0, W, H, r); ctx.fill();

  ctx.save();
  _rr(ctx, 0, 0, W, H, r); ctx.clip();
  ctx.fillStyle = c.iceStripe;
  for (var sx = 0; sx < W; sx += 12) { ctx.fillRect(sx, 0, 6, H); }

  // Zone lines
  ctx.strokeStyle = c.circle; ctx.lineWidth = 2; ctx.globalAlpha = c.circleAlpha * 0.5;
  ctx.beginPath(); ctx.moveTo(W*0.3, 0); ctx.lineTo(W*0.3, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.7, 0); ctx.lineTo(W*0.7, H); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.globalAlpha = c.lineAlpha;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  ctx.strokeStyle = c.circle; ctx.lineWidth = 2; ctx.globalAlpha = c.circleAlpha;
  ctx.beginPath(); ctx.arc(W/2, H/2, W * 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Obstacles preview
  (c.obstacles || []).forEach(function(o) {
    ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r * scale * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = c.border; ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
  });

  ctx.restore();

  ctx.strokeStyle = c.border; ctx.lineWidth = 3;
  _rr(ctx, 1.5, 1.5, W-3, H-3, r); ctx.stroke();

  ctx.fillStyle = c.goalNet;
  ctx.fillRect(0, gl, gd, gw); ctx.fillRect(W-gd, gl, gd, gw);
  ctx.strokeStyle = c.goalPost; ctx.lineWidth = 2.5;
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

function _lighten(hex, amt) { return _adj(hex, amt); }
function _darken(hex, amt)  { return _adj(hex, -amt); }
function _adj(hex, amt) {
  var n = parseInt((hex||'#3366aa').replace('#',''), 16);
  var r = Math.min(255, Math.max(0, (n>>16) + amt));
  var g = Math.min(255, Math.max(0, ((n>>8)&0xff) + amt));
  var b = Math.min(255, Math.max(0, (n&0xff) + amt));
  return 'rgb('+r+','+g+','+b+')';
}
