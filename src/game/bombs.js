const REFILL_CHANCE = 0.3

export function useBomb(gameState) {
  if (gameState.bombCount > 0) {
    gameState.bombCount -= 1
  }
}

export function refillBomb(gameState, randomFn) {
  if (randomFn() < REFILL_CHANCE) {
    gameState.bombCount += 1
  }
}
