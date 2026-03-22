/**
 * engine.js - Main game loop (HORIZONTAL board 800x400)
 * Goals on LEFT (p2) and RIGHT (p1)
 * p1 = right half, p2 = left half
 */
import { Board, MAP_CONFIGS } from '../entities/board.js';
import { Puck }     from '../entities/puck.js';
import { Mallet }   from '../entities/mallet.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
import { resolvePuckWalls, resolveMalletPuck } from './physics.js';

export const GameState = {
  IDLE: 'IDLE', COUNTDOWN: 'COUNTDOWN', PLAYING: 'PLAYING',
  GOAL_SCORED: 'GOAL_SCORED', MATCH_END: 'MATCH_END'
};

export class GameEngine {
  constructor(canvas, mode = 'bot', options = {}) {
    this.canvas  = canvas;
    this.mode    = mode;
    this.options = options;

    // HORIZONTAL: wide board
    this.BOARD_W = 800;
    this.BOARD_H = 400;

    const mapId  = options.mapId || 'classic';
    this.board   = new Board(this.BOARD_W, this.BOARD_H, mapId);
    const mapCfg = MAP_CONFIGS[mapId] || MAP_CONFIGS.classic;

    this.renderer = new Renderer(canvas);
    this.input    = new InputHandler(canvas);
    this.renderer.resize(this.BOARD_W, this.BOARD_H);
    this.renderer.particlesEnabled = options.particles !== false;

    this._mapPuckFriction = mapCfg.puckFriction;
    this._mapPuckSpeed    = mapCfg.puckSpeed;
    this._isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (mode === 'local') {
      this.input.setMode('local');
    } else if (this._isMobile) {
      // Respect user setting: 'joystick' or 'touch' (direct finger)
      const mobileControl = options.mobileControl || 'joystick';
      this.input.setMode(mobileControl === 'touch' ? 'mouse' : 'joystick');
    } else {
      this.input.setMode('mouse');
    }

    // p1 = RIGHT half (x > W/2), p2 = LEFT half (x < W/2)
    this.puck = new Puck(this.BOARD_W / 2, this.BOARD_H / 2);
    this.puck.friction = this._mapPuckFriction;
    this.puck.maxSpeed = this._mapPuckSpeed;

    this.mallet1 = new Mallet(
      this.BOARD_W * 0.75, this.BOARD_H / 2,
      options.p1Color || '#e03030', true
    );
    this.mallet2 = new Mallet(
      this.BOARD_W * 0.25, this.BOARD_H / 2,
      options.p2Color || '#3060e0', false
    );

    this.input.p1.x = this.mallet1.x; this.input.p1.y = this.mallet1.y;
    this.input.p2.x = this.mallet2.x; this.input.p2.y = this.mallet2.y;

    this.score    = { p1: 0, p2: 0 };
    this.maxGoals = 7;
    this.state    = GameState.IDLE;
    this._countdownTimer = null;
    this._goalTimer      = null;
    this.botSpeed = options.botSpeed || 2.2;
    this.networkState = null;
    this._rafId    = null;
    this._lastTime = 0;
    this.onGoal      = null;
    this.onMatchEnd  = null;
    this.onSendInput = null;
  }

  start() {
    this._startCountdown();
    this._rafId = requestAnimationFrame(t => this._loop(t));
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    clearTimeout(this._countdownTimer);
    clearTimeout(this._goalTimer);
    this.input.destroy();
  }

  applyNetworkState(state) {
    if (!state || !state.puck || !state.p1 || !state.p2) return;
    const vals = [state.puck.x, state.puck.y, state.p1.x, state.p1.y, state.p2.x, state.p2.y];
    if (vals.some(v => !isFinite(v))) return;
    this.networkState = state;
  }

  handleNetworkGoal(data) { this._handleGoal(data.scorer, data.newScore); }
  handleNetworkMatchEnd(data) { this.state = GameState.MATCH_END; if (this.onMatchEnd) this.onMatchEnd(data); }
  setParticles(enabled) { this.renderer.particlesEnabled = enabled; }

  _loop(timestamp) {
    this._rafId = requestAnimationFrame(t => this._loop(t));
    const dt = Math.min(timestamp - this._lastTime, 50);
    this._lastTime = timestamp;
    if (this.state === GameState.PLAYING) this._update(dt);
    this._render();
  }

  _update() {
    if (this.mode === 'online') this._updateOnline();
    else this._updateOffline();
  }

  _updateOffline() {
    const p1Only = this.mode !== 'local';
    this.input.updateKeyboard(this.BOARD_W, this.BOARD_H, 6, p1Only);
    if (this._isMobile && this.mode !== 'local') {
      this.input.updateJoystick(this.BOARD_W, this.BOARD_H, 7);
    }

    this.mallet1.setTarget(this.input.p1.x, this.input.p1.y);
    if (this.mode === 'local') {
      this.mallet2.setTarget(this.input.p2.x, this.input.p2.y);
    } else if (this.mode === 'bot') {
      this._updateBot();
    }

    this.mallet1.update(this.BOARD_W, this.BOARD_H, true);
    this.mallet2.update(this.BOARD_W, this.BOARD_H, true);

    const wasHit1 = resolveMalletPuck(this.mallet1, this.puck);
    const wasHit2 = resolveMalletPuck(this.mallet2, this.puck);
    if ((wasHit1 || wasHit2) && this.renderer.particlesEnabled) {
      this.renderer.spawnHitParticles(this.puck.x, this.puck.y);
    }

    this.puck.update();
    const goal = resolvePuckWalls(this.puck, this.board);
    if (goal) {
      // 'left' goal = p1 scores (p2's goal), 'right' goal = p2 scores (p1's goal)
      const scorer = goal === 'left' ? 'p1' : 'p2';
      this._handleGoal(scorer, null);
    }
  }

  _updateBot() {
    const puck   = this.puck;
    const mallet = this.mallet2;
    const homeX  = this.BOARD_W * 0.15;
    const homeY  = this.BOARD_H / 2;

    let targetX, targetY;
    if (puck.x < this.BOARD_W / 2) {
      // Puck in bot's half — chase
      const lead = 6;
      targetX = Math.max(30, Math.min(this.BOARD_W / 2 - 30, puck.x + puck.vx * lead));
      targetY = Math.max(30, Math.min(this.BOARD_H - 30, puck.y + puck.vy * lead));
    } else {
      targetX = homeX;
      targetY = homeY;
    }

    const dx = targetX - mallet.x, dy = targetY - mallet.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const speed = Math.min(this.botSpeed, dist);
      mallet.setTarget(
        mallet.x + (dx / dist) * speed * 5,
        mallet.y + (dy / dist) * speed * 5
      );
    }
  }

  _updateOnline() {
    this.input.updateKeyboard(this.BOARD_W, this.BOARD_H, 6, true);
    if (this._isMobile) this.input.updateJoystick(this.BOARD_W, this.BOARD_H, 7);
    if (this.onSendInput) this.onSendInput(this.input.p1.x, this.input.p1.y);
    if (this.networkState) {
      const ns = this.networkState, f = 0.25;
      this.puck.x    += (ns.puck.x - this.puck.x) * f;
      this.puck.y    += (ns.puck.y - this.puck.y) * f;
      this.mallet1.x += (ns.p1.x - this.mallet1.x) * f;
      this.mallet1.y += (ns.p1.y - this.mallet1.y) * f;
      this.mallet2.x += (ns.p2.x - this.mallet2.x) * f;
      this.mallet2.y += (ns.p2.y - this.mallet2.y) * f;
      if (ns.score) { this.score.p1 = ns.score.p1; this.score.p2 = ns.score.p2; }
    }
  }

  _handleGoal(scorer, newScore) {
    if (this.state !== GameState.PLAYING) return;
    this.state = GameState.GOAL_SCORED;
    if (newScore) { this.score.p1 = newScore.p1; this.score.p2 = newScore.p2; }
    else { if (scorer === 'p1') this.score.p1++; else this.score.p2++; }
    this.renderer.spawnGoalParticles(this.BOARD_W / 2, this.BOARD_H / 2);
    if (this.onGoal) this.onGoal(scorer, { ...this.score });
    const isMatchEnd = this.score.p1 >= this.maxGoals || this.score.p2 >= this.maxGoals;
    this._goalTimer = setTimeout(() => {
      if (isMatchEnd) {
        this.state = GameState.MATCH_END;
        const winner = this.score.p1 >= this.maxGoals ? 'p1' : 'p2';
        if (this.onMatchEnd) this.onMatchEnd({ winner, score: { ...this.score } });
      } else {
        this._resetAfterGoal();
      }
    }, 2000);
  }

  _resetAfterGoal() {
    this.puck.reset(this.BOARD_W / 2, this.BOARD_H / 2);
    this.mallet1.setPosition(this.BOARD_W * 0.75, this.BOARD_H / 2);
    this.mallet2.setPosition(this.BOARD_W * 0.25, this.BOARD_H / 2);
    this.input.p1.x = this.mallet1.x; this.input.p1.y = this.mallet1.y;
    this.input.p2.x = this.mallet2.x; this.input.p2.y = this.mallet2.y;
    this._startCountdown();
  }

  _startCountdown() {
    this.state = GameState.COUNTDOWN;
    let count = 3;
    const tick = () => {
      if (count > 0) {
        this._emitCountdown(count); count--;
        this._countdownTimer = setTimeout(tick, 1000);
      } else {
        this._emitCountdown('GO!');
        this._countdownTimer = setTimeout(() => {
          this._emitCountdown(null);
          this.state = GameState.PLAYING;
        }, 700);
      }
    };
    tick();
  }

  _emitCountdown(value) {
    this.canvas.dispatchEvent(new CustomEvent('countdown', { detail: value, bubbles: false }));
  }

  _render() {
    this.renderer.render(this.board, this.puck, [this.mallet1, this.mallet2], 0);
    if (this._isMobile && this.mode !== 'local') {
      this.input.drawJoystick(this.renderer.ctx);
    }
  }
}