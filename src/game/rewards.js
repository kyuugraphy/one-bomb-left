import { applyCurse } from './curses.js'
import { grantItem } from './grant.js'

export function skipReward(gameState, reward) {
}

// Returns the inventory add result when the reward carried an item, so the caller can see
// a full rack, or null when it carried none.
export function takeReward(gameState, reward, randomFn) {
  const granted = reward.item ? grantItem(gameState, reward.item) : null

  // An item the player already holds is not a reward - nothing was placed, so nothing is
  // collected and no curse is paid. The caller leaves the pickup in the room.
  if (granted && granted.reason === 'owned') {
    return granted
  }

  gameState.rewardsCollected += 1

  if (reward.isCursed) {
    applyCurse(gameState, randomFn() < 0.5 ? 'risk' : 'enemy')
  }

  return granted
}
