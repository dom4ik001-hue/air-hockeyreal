/**
 * input.js — Unified input handler
 * Supports: Mouse, Multi-touch, WASD/Arrows keyboard, Virtual joystick (mobile)
 */
export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;

    // Current positions in CANVAS coordinates
    this.p1 = { x: 200, y: 600 }; // bottom player
    this.p2 = { x: 200, y: 200 }; // top player (local multiplayer)

    // Keyboard state
    this.keys = {};

    // Active touch IDs mapped to player
    this._touchMap = {}; // touchId → 'p1' | 'p2'

    // Virtual joystick state (mobile single-player)
    this.joystick = {
      active:   false,
      baseX:    0, baseY:    0,   // joystick center (canvas coords)
      stickX:   0, stickY:   0,   // current stick position
      dx:       0, dy:       0,   // normalized direction [-1..1]
      touchId:  null,
      radius:   55                // max joystick radius
    };

    this._bound = {};
    this._bindEvents();
  }

  // ─── Event binding ────────────────────────────────────────

  _bindEvents() {
    this._bound.mousemove  = e => this._onMouseMove(e);
    this._bound.touchstart = e => this._onTouchStart(e);
    this._bound.touchmove  = e => this._onTouchMove(e);
    this._bound.touchend   = e => this._onTouchEnd(e);
    this._bound.keydown    = e => { this.keys[e.code] = true; };
    this._bound.keyup      = e => { this.keys[e.code] = false; };

    this.canvas.addEventListener('mousemove',  this._bound.mousemove);
    this.canvas.addEventListener('touchstart', this._bound.touchstart, { passive: false });
    this.canvas.addEventListener('touchmove',  this._bound.touchmove,  { passive: false });
    this.canvas.addEventListener('touchend',   this._bound.touchend,   { passive: false });
    this.canvas.addEventListener('touchcancel',this._bound.touchend,   { passive: false });
    window.addEventListener('keydown', this._bound.keydown);
    window.addEventListener('keyup',   this._bound.keyup);
  }

  destroy() {
    this.canvas.removeEventListener('mousemove',   this._bound.mousemove);
    this.canvas.removeEventListener('touchstart',  this._bound.touchstart);
    this.canvas.removeEventListener('touchmove',   this._bound.touchmove);
    this.canvas.removeEventListener('touchend',    this._bound.touchend);
    this.canvas.removeEventListener('touchcancel', this._bound.touchend);
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup',   this._bound.keyup);
  }

  // ─── Mouse ────────────────────────────────────────────────

  _onMouseMove(e) {
    const pos = this._toCanvas(e.clientX, e.clientY);
    this.p1.x = pos.x;
    this.p1.y = pos.y;
  }

  // ─── Touch ────────────────────────────────────────────────

  _onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const pos = this._toCanvas(t.clientX, t.clientY);

      if (this._mode === 'joystick') {
        if (this.joystick.touchId === null) {
          this.joystick.active  = true;
          this.joystick.touchId = t.identifier;
          this.joystick.baseX   = pos.x;
          this.joystick.baseY   = pos.y;
          this.joystick.stickX  = pos.x;
          this.joystick.stickY  = pos.y;
          this.joystick.dx = 0;
          this.joystick.dy = 0;
        }
        continue;
      }

      // Local multiplayer: split by screen HORIZONTAL half (left=p2, right=p1)
      if (pos.x > this.canvas.width / 2) {
        this._touchMap[t.identifier] = 'p1';
        this.p1.x = pos.x; this.p1.y = pos.y;
      } else {
        this._touchMap[t.identifier] = 'p2';
        this.p2.x = pos.x; this.p2.y = pos.y;
      }
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const pos = this._toCanvas(t.clientX, t.clientY);

      // Joystick mode
      if (this._mode === 'joystick' && t.identifier === this.joystick.touchId) {
        const dx = pos.x - this.joystick.baseX;
        const dy = pos.y - this.joystick.baseY;
        const dist = Math.hypot(dx, dy);
        const r = this.joystick.radius;

        if (dist > r) {
          this.joystick.stickX = this.joystick.baseX + (dx / dist) * r;
          this.joystick.stickY = this.joystick.baseY + (dy / dist) * r;
          this.joystick.dx = dx / dist;
          this.joystick.dy = dy / dist;
        } else {
          this.joystick.stickX = pos.x;
          this.joystick.stickY = pos.y;
          this.joystick.dx = dist > 2 ? dx / r : 0;
          this.joystick.dy = dist > 2 ? dy / r : 0;
        }
        continue;
      }

      // Local multiplayer
      const player = this._touchMap[t.identifier];
      if (player === 'p1') { this.p1.x = pos.x; this.p1.y = pos.y; }
      if (player === 'p2') { this.p2.x = pos.x; this.p2.y = pos.y; }
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._mode === 'joystick' && t.identifier === this.joystick.touchId) {
        this.joystick.active  = false;
        this.joystick.touchId = null;
        this.joystick.dx = 0;
        this.joystick.dy = 0;
      }
      delete this._touchMap[t.identifier];
    }
  }

  // ─── Keyboard update (call every frame) ──────────────────

  /**
   * Update p1 position from WASD, p2 from Arrows.
   * @param {number} boardW
   * @param {number} boardH
   * @param {number} speed — px per frame
   * @param {boolean} p1Only — only update p1 (bot/online mode)
   */
  updateKeyboard(boardW, boardH, speed = 6, p1Only = false) {
    // Player 1: WASD
    if (this.keys['KeyA']) this.p1.x -= speed;
    if (this.keys['KeyD']) this.p1.x += speed;
    if (this.keys['KeyW']) this.p1.y -= speed;
    if (this.keys['KeyS']) this.p1.y += speed;

    if (!p1Only) {
      // Player 2: Arrow keys (local multiplayer)
      if (this.keys['ArrowLeft'])  this.p2.x -= speed;
      if (this.keys['ArrowRight']) this.p2.x += speed;
      if (this.keys['ArrowUp'])    this.p2.y -= speed;
      if (this.keys['ArrowDown'])  this.p2.y += speed;
    } else {
      // In single-player, arrows also control p1
      if (this.keys['ArrowLeft'])  this.p1.x -= speed;
      if (this.keys['ArrowRight']) this.p1.x += speed;
      if (this.keys['ArrowUp'])    this.p1.y -= speed;
      if (this.keys['ArrowDown'])  this.p1.y += speed;
    }

    // Clamp to board
    this.p1.x = Math.max(0, Math.min(boardW, this.p1.x));
    this.p1.y = Math.max(0, Math.min(boardH, this.p1.y));
    this.p2.x = Math.max(0, Math.min(boardW, this.p2.x));
    this.p2.y = Math.max(0, Math.min(boardH, this.p2.y));
  }

  /**
   * Update p1 from virtual joystick.
   * @param {number} boardW
   * @param {number} boardH
   * @param {number} speed
   */
  updateJoystick(boardW, boardH, speed = 7) {
    if (!this.joystick.active) return;
    this.p1.x += this.joystick.dx * speed;
    this.p1.y += this.joystick.dy * speed;
    this.p1.x = Math.max(0, Math.min(boardW, this.p1.x));
    this.p1.y = Math.max(0, Math.min(boardH, this.p1.y));
  }

  /**
   * Set input mode.
   * @param {'mouse'|'joystick'|'local'} mode
   */
  setMode(mode) {
    this._mode = mode;
    this.joystick.active  = false;
    this.joystick.touchId = null;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
  }

  /**
   * Draw virtual joystick on canvas (call from renderer).
   */
  drawJoystick(ctx) {
    if (!this.joystick.active) return;
    const j = this.joystick;

    // Base circle
    ctx.beginPath();
    ctx.arc(j.baseX, j.baseY, j.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();

    // Stick
    ctx.beginPath();
    ctx.arc(j.stickX, j.stickY, j.radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59,130,246,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59,130,246,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ─── Coordinate conversion ────────────────────────────────

  _toCanvas(clientX, clientY) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY
    };
  }
}
