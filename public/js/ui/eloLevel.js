/**
 * eloLevel.js — Faceit-style ELO level system
 * Level 1: 100–500 | 2: 501–750 | 3: 751–900 | 4: 901–1050
 * Level 5: 1051–1200 | 6: 1201–1350 | 7: 1351–1530
 * Level 8: 1531–1750 | 9: 1751–2000 | 10: 2001+
 */

export const ELO_LEVELS = [
  { level: 1,  min: 0,    max: 500,  color: '#555',   arc: 0.08 },
  { level: 2,  min: 501,  max: 750,  color: '#22c55e', arc: 0.15 },
  { level: 3,  min: 751,  max: 900,  color: '#22c55e', arc: 0.25 },
  { level: 4,  min: 901,  max: 1050, color: '#eab308', arc: 0.35 },
  { level: 5,  min: 1051, max: 1200, color: '#eab308', arc: 0.45 },
  { level: 6,  min: 1201, max: 1350, color: '#eab308', arc: 0.55 },
  { level: 7,  min: 1351, max: 1530, color: '#f97316', arc: 0.65 },
  { level: 8,  min: 1531, max: 1750, color: '#f97316', arc: 0.75 },
  { level: 9,  min: 1751, max: 2000, color: '#ef4444', arc: 0.88 },
  { level: 10, min: 2001, max: Infinity, color: '#ef4444', arc: 1.0 },
];

export function getEloLevel(elo) {
  for (let i = ELO_LEVELS.length - 1; i >= 0; i--) {
    if (elo >= ELO_LEVELS[i].min) return ELO_LEVELS[i];
  }
  return ELO_LEVELS[0];
}

/**
 * Draw a Faceit-style level badge on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number} elo
 */
export function drawLevelBadge(canvas, elo) {
  const lvl = getEloLevel(elo);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 2;

  ctx.clearRect(0, 0, W, H);

  // Dark background circle
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill();

  // Arc progress
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + lvl.arc * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 2, startAngle, endAngle);
  ctx.strokeStyle = lvl.color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Level number
  ctx.fillStyle = lvl.color;
  ctx.font = `bold ${Math.floor(R * 0.72)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(lvl.level), cx, cy + 1);
}

/**
 * Return HTML string for an inline level badge (no canvas).
 */
export function levelBadgeHTML(elo) {
  const lvl = getEloLevel(elo);
  return `<span class="elo-badge lvl-${lvl.level}" style="--lvl-color:${lvl.color}" title="Уровень ${lvl.level}">${lvl.level}</span>`;
}

export function levelRangeText(elo) {
  const lvl = getEloLevel(elo);
  const max = lvl.max === Infinity ? '∞' : lvl.max;
  return `Ур. ${lvl.level}  (${lvl.min}–${max})`;
}
