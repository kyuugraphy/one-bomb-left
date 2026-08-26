import { applyCurse } from './curses.js'
import { grantItem } from './grant.js'

export function skipReward(gameState, reward) {
}

// Counts a reward and pays its curse. Split out from takeReward because a reward whose
// item cannot be placed yet - a full rack raising the swap prompt - must not be charged
// until the player actually accepts it, or declining the prompt would still cost a curse.
export function collectReward(gameState, reward, randomFn) {
  gameState.rewardsCollected += 1

  if (reward.isCursed) {
    applyCurse(gameState, randomFn() < 0.5 ? 'risk' : 'enemy')
  }
}

// Returns the inventory add result when the reward carried an item, so the caller can see
// a full rack, or null when it carried none.
export function takeReward(gameState, reward, randomFn) {
  const granted = reward.item ? grantItem(gameState, reward.item) : null

  // Nothing was placed: an item the player already holds is not a reward at all, and a
  // full rack is a choice still to be made. Neither is collected and neither is cursed.
  if (granted && !granted.success) {
    return granted
  }

  collectReward(gameState, reward, randomFn)

  return granted
}
