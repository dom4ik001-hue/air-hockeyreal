/**
 * renderer.js — Canvas rendering orchestrator
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.particlesEnabled = true;
    this.particles = [];
  }

  resize(boardW, boardH) {
    this.canvas.width  = boardW;
    this.canvas.height = boardH;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(board, puck, mallets, localPlayerIndex = 0) {
    const ctx = this.ctx;
    this.clear();

    // 1. Board
    board.draw(ctx);

    // 2. Particles (behind puck)
    if (this.particlesEnabled) {
      this._updateParticles();
      this._drawParticles(ctx);
    }

    // 3. Puck
    puck.draw(ctx, this.particlesEnabled);

    // 4. Mallets
    mallets.forEach(m => m.draw(ctx));

    // 5. Local player indicator ring
    const local = mallets[localPlayerIndex];
    if (local) {
      ctx.beginPath();
      ctx.arc(local.x, local.y, local.radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  spawnGoalParticles(x, y, color = '#fbbf24') {
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.018 + Math.random() * 0.025,
        radius: 3 + Math.random() * 5,
        color
      });
    }
  }

  spawnHitParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.06 + Math.random() * 0.04,
        radius: 2 + Math.random() * 3,
        color: '#7dd3fc'
      });
    }
  }

  _updateParticles() {
    this.particles = this.particles.filter(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.04;
      p.life -= p.decay;
      return p.life > 0;
    });
  }

  _drawParticles(ctx) {
    this.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.radius * p.life), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}
