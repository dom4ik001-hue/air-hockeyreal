/**
 * puck.js — Cartoon-style hockey puck
 */
export class Puck {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    this.vx = 0;
    this.vy = 0;
    this.radius   = 14;
    this.mass     = 1;
    this.friction = 0.99;
    this.maxSpeed = 18;
    this.trail    = [];
    this.trailMax = 10;
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.trail = [];
  }

  update() {
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.maxSpeed) {
      const s = this.maxSpeed / speed;
      this.vx *= s; this.vy *= s;
    }
    this.vx *= this.friction;
    this.vy *= this.friction;
    if (Math.abs(this.vx) < 0.01) this.vx = 0;
    if (Math.abs(this.vy) < 0.01) this.vy = 0;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailMax) this.trail.shift();
    this.x += this.vx;
    this.y += this.vy;
  }

  draw(ctx, particlesEnabled = true) {
    const r = this.radius;

    // Trail
    if (particlesEnabled && this.trail.length > 1) {
      for (let i = 1; i < this.trail.length; i++) {
        const a = (i / this.trail.length) * 0.25;
        const tr = r * (i / this.trail.length) * 0.6;
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, tr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80,80,80,' + a + ')';
        ctx.fill();
      }
    }

    // Shadow
    ctx.beginPath();
    ctx.arc(this.x + 2, this.y + 3, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Body — dark grey like real puck
    const grad = ctx.createRadialGradient(
      this.x - r * 0.3, this.y - r * 0.3, 0,
      this.x, this.y, r
    );
    grad.addColorStop(0, '#555');
    grad.addColorStop(0.5, '#222');
    grad.addColorStop(1, '#111');
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Edge ring
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Highlight
    ctx.beginPath();
    ctx.arc(this.x - r * 0.3, this.y - r * 0.35, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
  }
}
