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

// ---- what clearing a room pays -------------------------------------------------------
//
// A different table from the one above, living here because this is the drop module and
// two drop rules are better together than in a file of their own.
//
// The old rule was not a roll at all: a safe room always paid a clean item and a risky one
// always paid a debuff, so the payout was settled the moment the player picked a colour.
// With safe and risky merged into one combat type there is no colour left to read it off,
// and making every room pay the same thing would leave clearing one worth nothing in
// particular. So it is rolled, and the gamble moves from which door you took to what the
// room turns out to give you.
export const DEBUFF_DROP_SHARE = 0.6

export const DEBUFF_DROP = 'debuff'
export const CLEAN_DROP = 'clean'

// Weighted toward the debuff on purpose. Every one of them is a bargain rather than a
// punishment - a real bonus with a real cost - so the common payout being the one with a
// price attached is what keeps a run from becoming a pile of free upgrades. The clean item
// is the lighter outcome, and the rarer one.
//
// Unlike an enemy drop this never answers with nothing: a room the player fought through
// always pays. The roll picks which kind, never whether.
export function rollRoomDrop(randomFn) {
  return randomFn() < DEBUFF_DROP_SHARE ? DEBUFF_DROP : CLEAN_DROP
}
