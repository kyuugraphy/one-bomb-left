// What an enemy leaves behind, beyond the EXP every kill pays. One kill in ten drops half
// a heart on the floor, and that is the whole of it - a pure roll with the RNG injected,
// the same contract as doors.js and obstacles.js; the scene turns the answer into a pickup.
//
// Items used to fall out of enemies too: a drop was an even three-way split between a
// heal, a treasure and a reward. They no longer do. A kill paying out a passive was the
// run's main item source, which made "how many things did I kill" the whole economy and
// left the rack filling up before the player had been asked to choose anything. Items now
// come from clearing a room and from the shop, where they can be handed over deliberately
// - so this is the healing tap and nothing else.

// Nine kills in ten drop nothing at all.
export const DROP_CHANCE = 0.1

// The only thing a kill can leave. Kept as a named constant rather than a bare string so
// the scene and this module cannot drift apart on the spelling.
export const HEAL_DROP = 'heal'

// null means the enemy dropped nothing but its EXP, which is the usual answer. One roll,
// not two: there is no longer a kind to pick once the chance has passed.
export function rollEnemyDrop(randomFn) {
  return randomFn() < DROP_CHANCE ? HEAL_DROP : null
}
