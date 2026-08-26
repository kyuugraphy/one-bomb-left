import { applyCurse } from './curses.js'
import { grantItem } from './grant.js'

export function skipReward(gameState, reward) {
}

// Returns the inventory add result when the reward carried an item, so the caller can see
// a full rack, or null when it carried none.
export function takeReward(gameState, reward, randomFn) {
  gameState.rewardsCollected += 1

  const granted = reward.item ? grantItem(gameState, reward.item) : null

  if (reward.isCursed) {
    applyCurse(gameState, randomFn() < 0.5 ? 'risk' : 'enemy')
  }

  return granted
}
