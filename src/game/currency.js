export function addExp(gameState, amount) {
  if (amount < 0) {
    return
  }
  gameState.exp += amount
}

export function spendExp(gameState, amount) {
  if (gameState.exp < amount) {
    return { success: false, reason: 'insufficient' }
  }
  gameState.exp -= amount
  return { success: true }
}
