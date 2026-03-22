/**
 * eloCalculator.js — ELO rating system
 *
 * Three tiers:
 *   < 1000  : Newcomer boost (random +100..+143 / -20)
 *   1000-1500: Mid league (random +75..+130 / -50)
 *   > 1500  : Faceit-like formula (K=50, expected value)
 */

/**
 * Calculate new ELO ratings after a match.
 * @param {number} ratingA — current ELO of winner
 * @param {number} ratingB — current ELO of loser
 * @returns {{ changeA: number, changeB: number, newA: number, newB: number }}
 */
function calculateElo(ratingA, ratingB) {
  const changeA = getWinChange(ratingA, ratingB);
  const changeB = getLossChange(ratingB, ratingA);

  const newA = Math.max(0, ratingA + changeA);
  const newB = Math.max(0, ratingB + changeB);

  return { changeA, changeB, newA, newB };
}

/**
 * ELO gain for the winner.
 */
function getWinChange(winnerRating, loserRating) {
  if (winnerRating < 1000) {
    // Newcomer boost
    return randomInt(100, 143);
  }

  if (winnerRating <= 1500) {
    // Mid league
    return randomInt(75, 130);
  }

  // Faceit-like: K=50, expected value formula
  const K = 50;
  const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return Math.round(K * (1 - expected));
}

/**
 * ELO loss for the loser.
 */
function getLossChange(loserRating, winnerRating) {
  if (loserRating < 1000) {
    return -20;
  }

  if (loserRating <= 1500) {
    return -50;
  }

  // Faceit-like: K=50
  const K = 50;
  const expected = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));
  return -Math.round(K * expected);
}

/**
 * Random integer in [min, max] inclusive.
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { calculateElo };
