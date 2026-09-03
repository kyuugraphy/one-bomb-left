// What an enemy leaves behind. Rooms no longer lay treasure out on the floor at the
// start, so a kill is the only thing that hands the player anything - and it is a rare
// hand rather than a guaranteed one. Pure rolls with the RNG injected, the same contract
// as doors.js and obstacles.js; the scene turns the answer into a pickup.

// Nine kills in ten drop nothing at all. The old rule was a reward from every single
// death, which meant a combat_heavy room paid out nine items and the rack was full before
// the run had asked the player to choose anything.
export const DROP_CHANCE = 0.1

// The three things a drop can be, evenly:
// - heal:     back to full HP, the only floor source of healing outside the shop
// - treasure: rolled from the treasure pool and never cursed
// - reward:   rolled from the reward pool and cursed at the room's own odds, so a risky
//             room still poisons nearly everything it gives up
export const DROP_KINDS = ['heal', 'treasure', 'reward']

// null means the enemy dropped nothing, which is the usual answer.
export function rollEnemyDrop(randomFn) {
  if (randomFn() >= DROP_CHANCE) {
    return null
  }

  return DROP_KINDS[Math.floor(randomFn() * DROP_KINDS.length)]
}
