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
export const REWARD_TYPES = ['shop', 'risky_reward', 'safe_reward', 'combat_heavy']

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
// - safe_reward:  few enemies and nothing that can be cursed - the door you take to
//                 bank what you are carrying rather than to be handed anything.
// - risky_reward: more enemies, and nearly every drop they leave is cursed, so the
//                 payout comes with riskLevel/enemyStrength attached.
// - combat_heavy: an ordinary coin-flip curse, but a room packed with enemies - and a
//                 kill is 2 EXP and a one-in-ten shot at a drop, so this is the door you
//                 take to farm.
const ROOM_PLANS = {
  shop: { roomType: 'shop', enemies: { easy: 0, medium: 2, hard: 3 }, cursedChance: 0 },
  safe_reward: { roomType: 'combat', enemies: { easy: 1, medium: 2, hard: 3 }, cursedChance: 0 },
  risky_reward: { roomType: 'combat', enemies: { easy: 2, medium: 4, hard: 6 }, cursedChance: 0.9 },
  combat_heavy: { roomType: 'combat', enemies: { easy: 4, medium: 6, hard: 9 }, cursedChance: 0.5 }
}

// Tier does two things at once: more enemies (per the table) and tougher ones. The
// bonus rides on top of the run's own enemyStrength, so a hard room is hard on top of
// however many 'enemy' curses the player has collected - it does not replace them.
const TIER_STRENGTH_BONUS = { easy: 0, medium: 1, hard: 2 }

export function roomPlanFor({ type, tier }) {
  const spec = ROOM_PLANS[type]

  return {
    type,
    tier,
    roomType: spec.roomType,
    enemyCount: spec.enemies[tier],
    enemyStrengthBonus: TIER_STRENGTH_BONUS[tier],
    cursedChance: spec.cursedChance
  }
}

// Colour is the reward type and glow is the tier, so a door is read in one look: what
// it is, then how bad it is. The two channels are deliberately separate - a cyan door
// blazing at full intensity is a safe room that will still hurt.
export const DOOR_STYLE = {
  shop: { color: 0xfbbf24, label: 'SHOP' },
  risky_reward: { color: 0xc084fc, label: 'RISKY' },
  safe_reward: { color: 0x67e8f9, label: 'SAFE' },
  combat_heavy: { color: 0xef4444, label: 'COMBAT' }
}

// Fill alpha, border thickness and how fast the pad pulses. A hard door is brighter,
// thicker-edged and beating faster than an easy one.
export const TIER_GLOW = {
  easy: { alpha: 0.16, stroke: 2, pulse: 900 },
  medium: { alpha: 0.32, stroke: 4, pulse: 620 },
  hard: { alpha: 0.52, stroke: 6, pulse: 380 }
}
