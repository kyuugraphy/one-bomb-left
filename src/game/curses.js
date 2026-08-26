export function applyCurse(gameState, curseType) {
  if (curseType === 'risk') {
    gameState.riskLevel += 1
  }
  if (curseType === 'enemy') {
    gameState.enemyStrength += 1
  }
}
