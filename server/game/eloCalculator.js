/**
 * eloCalculator.js — Simple ELO system
 * Win: +100, Loss: -50
 */
function calculateElo(winnerRating, loserRating) {
  const changeA = 100;   // winner gets +100
  const changeB = -50;   // loser gets -50

  const newA = Math.max(0, winnerRating + changeA);
  const newB = Math.max(0, loserRating + changeB);

  return { changeA, changeB, newA, newB };
}

module.exports = { calculateElo };
