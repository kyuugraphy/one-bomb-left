// The door telegraph. A cleared room offers 2-3 doors; each one advertises what is
// behind it - a reward type (its colour) and a difficulty tier (its glow) - and is
// usually, but not always, telling the truth. Everything here is a pure roll with the
// RNG injected, the same contract as shop.js and weights.js; the scene renders it.

// Two doors or three, evenly. One door would not be a choice and four crowds the top
// wall, so the range is deliberately narrow.
export function rollDoorCount(randomFn) {
  return 2 + Math.floor(randomFn() * 2)
}

// What a door advertises. The colour the scene paints is keyed off this, so the four
// are the whole vocabulary of the telegraph.
export const REWARD_TYPES = ['shop', 'risky_reward', 'safe_reward', 'puzzle']

export const TIERS = ['easy', 'medium', 'hard']

// Types are drawn without replacement: two doors of the same colour would read as one
// choice offered twice. Tiers are rolled per door and independently, so "the safe one is
// also the hard one" is a hand the player can be dealt.
export function rollDoors(randomFn) {
  const count = rollDoorCount(randomFn)
  const remaining = [...REWARD_TYPES]
  const doors = []

  while (doors.length < count) {
    const [type] = remaining.splice(Math.floor(randomFn() * remaining.length), 1)
    doors.push({ type, tier: TIERS[Math.floor(randomFn() * TIERS.length)] })
  }

  return doors
}

// How often a door is honest. The lie is the point of the system: a door you can read
// perfectly is a menu, not a gamble - but a door that lies too often teaches the player
// to ignore the colour entirely, which costs the telegraph all its meaning. The two
// channels are rolled independently, so they compound: each is honest nine times in ten,
// which leaves a door honest about *both* roughly four times in five - the 10-20%
// surprise the telegraph was aiming for.
export const TYPE_ACCURACY = 0.9
export const TIER_ACCURACY = 0.9

// A miss picks from the other options only - substituting the advertised value back in
// would silently turn a lie into the truth and make the real accuracy higher than it says.
function otherThan(options, advertised, randomFn) {
  const others = options.filter((option) => option !== advertised)

  return others[Math.floor(randomFn() * others.length)]
}

// What is actually behind the door, rolled once when the doors are built rather than on
// the walk-in, so the room the player chose is settled before they touch it. Note a miss
// consumes one extra roll, for the substitution.
export function resolveDoor(door, randomFn) {
  const type =
    randomFn() < TYPE_ACCURACY ? door.type : otherThan(REWARD_TYPES, door.type, randomFn)
  const tier =
    randomFn() < TIER_ACCURACY ? door.tier : otherThan(TIERS, door.tier, randomFn)

  return { type, tier }
}

// What each tag actually means once the room is built. Enemy counts are per tier, and
// every other knob the generator reads sits beside them, so "what is a risky room" is
// one table entry rather than a condition scattered through the scene.
//
// - shop:         the shop room. The tier is the guard, not the stock: an easy shop is
//                 quiet, a hard one is defended.
// - safe_reward:  few enemies, and clearing it hands over one item that cannot be cursed
//                 - the door you take to be paid.
// - risky_reward: more enemies, and clearing it hands over one debuff. The room is the
//                 gamble now rather than the item being poisoned: you know exactly what
//                 kind of thing is waiting, you just do not know which one.
// - puzzle:       a stub. An empty room with no enemies and no clutter, and no payout for
//                 clearing it, until there is an actual puzzle to put in it. The door
//                 telegraph treats it like any other type, lies included.
//
// combat_heavy is gone: safe and risky already cover "how much of a fight is this", and a
// third combat door was a difficulty dial wearing a reward door's clothes.
const ROOM_PLANS = {
  shop: { roomType: 'shop', enemies: { easy: 0, medium: 2, hard: 3 } },
  safe_reward: { roomType: 'combat', enemies: { easy: 1, medium: 2, hard: 3 } },
  risky_reward: { roomType: 'combat', enemies: { easy: 4, medium: 6, hard: 9 } },
  puzzle: { roomType: 'puzzle', enemies: { easy: 0, medium: 0, hard: 0 } }
}

// Tier does two things at once: more enemies (per the table) and tougher ones. The
// bonus is the only thing that toughens an enemy now: the 'enemy' curse that used to
// stack on top of it went with the curse system.
const TIER_STRENGTH_BONUS = { easy: 0, medium: 1, hard: 2 }

// The room a run starts in. No door chose it, so it is spelled out rather than rolled.
export const ENTRANCE_DOOR = { type: 'safe_reward', tier: 'easy' }

export function roomPlanFor({ type, tier }) {
  const spec = ROOM_PLANS[type]

  return {
    type,
    tier,
    roomType: spec.roomType,
    enemyCount: spec.enemies[tier],
    enemyStrengthBonus: TIER_STRENGTH_BONUS[tier]
  }
}

// Colour is the reward type and glow is the tier, so a door is read in one look: what
// it is, then how bad it is. The two channels are deliberately separate - a cyan door
// blazing at full intensity is a safe room that will still hurt.
// Pink for the puzzle door: the four have to be told apart at a glance, and pink is the
// furthest unused hue from the violet risky door - the pair that would otherwise be
// easiest to confuse. Red is free again with combat_heavy gone, but red is what damage
// and enemies are painted in everywhere else, so it stays out of the door vocabulary.
export const DOOR_STYLE = {
  shop: { color: 0xfbbf24, label: 'SHOP' },
  risky_reward: { color: 0xc084fc, label: 'RISKY' },
  safe_reward: { color: 0x67e8f9, label: 'SAFE' },
  puzzle: { color: 0xf472b6, label: 'PUZZLE' }
}

// Fill alpha, border thickness and how fast the pad pulses. A hard door is brighter,
// thicker-edged and beating faster than an easy one.
export const TIER_GLOW = {
  easy: { alpha: 0.16, stroke: 2, pulse: 900 },
  medium: { alpha: 0.32, stroke: 4, pulse: 620 },
  hard: { alpha: 0.52, stroke: 6, pulse: 380 }
}
