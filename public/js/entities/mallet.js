/**
 * mallet.js — Air Hockey Mallet (striker) entity
 */
export class Mallet {
  constructor(x, y, color = '#3b82f6', isPlayer1 = true) {
    this.x  = x;
    this.y  = y;
    this.targetX = x;
    this.targetY = y;

    // Previous position for velocity calculation
    this.prevX = x;
    this.prevY = y;

    // Derived velocity (used for impulse transfer to puck)
    this.vx = 0;
    this.vy = 0;

    this.radius  = 30;
    this.mass    = 5;
    this.color   = color;
    this.isPlayer1 = isPlayer1; // p1 = bottom half, p2 = top half

    // Smoothing factor for mouse following
    this.smoothing = 0.35;
  }

  /**
   * Move toward target with smoothing.
   * boardW, boardH — table dimensions for boundary clamping.
   * halfConstraint — if true, mallet stays in its half.
   */
  update(boardW, boardH, halfConstraint = true) {
    this.prevX = this.x;
    this.prevY = this.y;

    // Smooth movement
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;

    // Clamp to board boundaries
    this.x = Math.max(this.radius, Math.min(boardW - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(boardH - this.radius, this.y));

    // Half-field constraint — horizontal board: p1 right half, p2 left half
    if (halfConstraint) {
      if (this.isPlayer1) {
        this.x = Math.max(boardW / 2 + this.radius, this.x);
      } else {
        this.x = Math.min(boardW / 2 - this.radius, this.x);
      }
    }

    // Calculate velocity from movement delta
    this.vx = this.x - this.prevX;
    this.vy = this.y - this.prevY;
  }

  /** Set target position (from mouse/touch input) */
  setTarget(x, y) {
    this.targetX = x;
    this.targetY = y;
  }

  /** Directly set position (for network sync) */
  setPosition(x, y) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = x;
    this.y = y;
    this.vx = this.x - this.prevX;
    this.vy = this.y - this.prevY;
  }

  draw(ctx) {
    const r = this.radius;

    // Shadow
    ctx.beginPath();
    ctx.arc(this.x + 3, this.y + 4, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Body gradient — cartoon style
    const bodyGrad = ctx.createRadialGradient(
      this.x - r * 0.3, this.y - r * 0.3, 0,
      this.x, this.y, r
    );
    bodyGrad.addColorStop(0, this._lighten(this.color, 60));
    bodyGrad.addColorStop(0.5, this.color);
    bodyGrad.addColorStop(1, this._darken(this.color, 40));
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Thick cartoon outline
    ctx.strokeStyle = this._darken(this.color, 60);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.arc(this.x - r * 0.28, this.y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  }

  /** Lighten a hex color by amount */
  _lighten(hex, amount) {
    return this._adjustColor(hex, amount);
  }
  _darken(hex, amount) {
    return this._adjustColor(hex, -amount);
  }
  _adjustColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `rgb(${r},${g},${b})`;
  }
}
