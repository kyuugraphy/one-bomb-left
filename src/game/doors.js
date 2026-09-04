// The door telegraph. A cleared room offers 2-3 doors; each one says what kind of room is
// behind it and how hard it will be, and is usually, but not always, telling the truth
// about the second of those. Everything here is a pure roll with the RNG injected, the
// same contract as shop.js and weights.js; the scene renders it.

// Two doors or three, evenly. One door would not be a choice and four crowds the top
// wall, so the range is deliberately narrow.
export function rollDoorCount(randomFn) {
  return 2 + Math.floor(randomFn() * 2)
}

// What kind of room is behind a door. Three, where there were four: **safe and risky are
// one type now.**
//
// They were split so that a door could offer "a small fight for a clean item" against "a
// big fight for a bargain with a cost attached", and the split did not earn its keep. The
// clean item was strictly the safer buy, so a player who had worked that out took the cyan
// door every time and the violet one became the door you picked when you were bored. One
// combat type, one enemy table, and the payout rolled on clearing it - so the gamble is in
// what the room gives you rather than in which colour you walked through.
//
// Combat is deliberately first: it is the default, and the pool is read in order.
export const REWARD_TYPES = ['combat', 'shop', 'puzzle']

// The one type a room may offer more than once. See rollDoors.
const REPEATABLE = 'combat'

// How often each type is drawn, relative to the others. Combat is the ordinary room and
// has to be dealt like one: drawn uniformly it came out at 44% of doors, with one room in
// six offering no fight at all and a third of two-door rooms offering none - so "skip the
// fight" was a strategy the draw handed out for free, and a puzzle room pays nothing but
// still counts as a room. Double weight puts combat back near where the four-type draw
// had it while leaving the shop-and-puzzle hand possible, just uncommon.
const TYPE_WEIGHTS = { combat: 2, shop: 1, puzzle: 1 }

export { TYPE_WEIGHTS }

export const TIERS = ['easy', 'medium', 'hard']

// Combat may fill any number of slots; a shop or a puzzle leaves the pool once it has been
// drawn, so neither can appear twice in one room.
//
// Types used to be drawn without replacement outright, which was right for four types and
// wrong for three: it would make every three-door room exactly one of each, so a choice
// the player is meant to read would carry no information at all, and combat - the ordinary
// room - could never be two of the three ways on. Shop and puzzle keep the old rule,
// because that rule was really protecting against one choice being offered twice, and two
// gold doors still are that.
//
// Tiers are rolled per door and independently, so "both ways on are hard" is a hand the
// player can be dealt.
export function rollDoors(randomFn) {
  const count = rollDoorCount(randomFn)
  const pool = [...REWARD_TYPES]
  const doors = []

  while (doors.length < count) {
    // One ticket per unit of weight, rebuilt each time because the pool shrinks: a room
    // that has already offered its shop draws from combat and puzzle only.
    const tickets = pool.flatMap((type) => Array(TYPE_WEIGHTS[type]).fill(type))
    const type = tickets[Math.floor(randomFn() * tickets.length)]

    if (type !== REPEATABLE) {
      pool.splice(pool.indexOf(type), 1)
    }

    doors.push({ type, tier: TIERS[Math.floor(randomFn() * TIERS.length)] })
  }

  return doors
}

// How often a door is honest about its difficulty. The lie is the point of the system: a
// door you can read perfectly is a menu, not a gamble - but a door that lies too often
// teaches the player to ignore the glow entirely, which costs the telegraph its meaning.
//
// There used to be a TYPE_ACCURACY beside this, and the two compounded to leave a door
// honest about both channels about four times in five. The type is never lied about now
// (see resolveDoor), so this is the whole of it: roughly one door in ten surprises you,
// where it used to be one in five. The lie budget therefore drains at about half the pace,
// and more runs finish under their cap - which is a change in how often the system speaks,
// not in how it works.
export const TIER_ACCURACY = 0.9

// A miss picks from the other options only - substituting the advertised value back in
// would silently turn a lie into the truth and make the real accuracy higher than it says.
function otherThan(options, advertised, randomFn) {
  const others = options.filter((option) => option !== advertised)

  return others[Math.floor(randomFn() * others.length)]
}

// How many doors a whole run is allowed to lie about: 0 to 4, rolled once when the run
// starts. Per-door odds alone meant a long run always got lied to eventually and a short
// one usually did not, which made the telegraph feel like weather rather than a hand you
// were dealt. A budget makes it a property of the run: some runs are honest all the way
// through, and the player cannot know which run they are in until it is over - which is
// what makes reading a door worth doing at all.
export const MAX_LIE_CAP = 4

export function rollLieCap(randomFn) {
  return Math.floor(randomFn() * (MAX_LIE_CAP + 1))
}

// A door lied if the room turned out harder or easier than the glow said. The type is not
// compared, because resolveDoor hands it straight back and a differing one cannot happen -
// keeping the comparison would be dead code that reads like a live rule.
export function isLie(advertised, actual) {
  return advertised.tier !== actual.tier
}

// When the accuracy roll is skipped and the door simply tells the truth. Two reasons, and
// the run state carries both: the budget is spent, or the last door the player took
// already lied. Two lies in a row reads as a rigged game rather than a gamble.
export function mustBeHonest({ lieCap, liesSoFar, lastDoorWasLie }) {
  return lastDoorWasLie === true || liesSoFar >= lieCap
}

// What is actually behind the door, rolled once when the doors are built rather than on
// the walk-in, so the room the player chose is settled before they touch it. One roll to
// decide honesty, one more only if it missed; an honest-by-force door consumes none.
//
// **The type is always the truth.** It used to be lied about like the tier, and that made
// sense while colour named a *reward*: a cyan door opening onto a risky room was a gamble
// the player could price, because both outcomes were rooms they might have chosen. With
// safe and risky merged, colour no longer names a reward at all - it names whether this is
// a fight, a shop or a puzzle, which is what the room *is*. An amber door that opens onto
// a fight is not a gamble; it is the amber door meaning nothing, and a player who cannot
// trust it stops reading it. So the whole lie budget is spent on difficulty, the one thing
// left that the player can be wrong about and still have made a real choice.
export function resolveDoor(door, run, randomFn) {
  if (mustBeHonest(run)) {
    return { type: door.type, tier: door.tier }
  }

  const tier =
    randomFn() < TIER_ACCURACY ? door.tier : otherThan(TIERS, door.tier, randomFn)

  return { type: door.type, tier }
}

// What each tag actually means once the room is built. Enemy counts are per tier, and
// every other knob the generator reads sits beside them, so "what is a combat room" is one
// table entry rather than a condition scattered through the scene.
//
// - combat: the ordinary room. Enemies by tier, and clearing it pays one item - which kind
//           is rolled on the clear rather than settled by the door. See rollRoomDrop.
// - shop:   the shop room. The tier is the guard, not the stock: an easy shop is quiet, a
//           hard one is defended.
// - puzzle: a stub. An empty room with no enemies and no clutter, and no payout for
//           clearing it, until there is an actual puzzle to put in it.
//
// **The combat counts are a placeholder, and deliberately a whole one.** They are the old
// risky_reward table, kept rather than averaged with the safe table it absorbed: the safe
// counts (1/2/3) existed to be the fight you took when you did not want a fight, and that
// is not a choice on offer any more. A real enemy pool with ranks is planned. When it
// lands it replaces this one entry and nothing else - which is the reason the numbers are
// here, in a table, rather than anywhere the generator would have to be read to find them.
const ROOM_PLANS = {
  combat: { roomType: 'combat', enemies: { easy: 4, medium: 6, hard: 9 } },
  shop: { roomType: 'shop', enemies: { easy: 0, medium: 2, hard: 3 } },
  puzzle: { roomType: 'puzzle', enemies: { easy: 0, medium: 0, hard: 0 } }
}

// Tier does two things at once: more enemies (per the table) and tougher ones. The
// bonus is the only thing that toughens an enemy now: the 'enemy' curse that used to
// stack on top of it went with the curse system.
const TIER_STRENGTH_BONUS = { easy: 0, medium: 1, hard: 2 }

// The room a run starts in. No door chose it, so it is spelled out rather than rolled.
export const ENTRANCE_DOOR = { type: 'combat', tier: 'easy' }

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

// How many enemies the room a run opens in holds. One, as it always has.
//
// It was an easy safe_reward room before the merge, and that table held one; combat took
// over the risky table, which holds four. Four is right for a room the player *chose* and
// wrong for the room they are put in - a run should open with something to shoot at, not
// with a fight, and nobody decided otherwise. So this is the old behaviour kept rather
// than a new rule invented.
export const ENTRANCE_ENEMIES = 1

// The entrance is **spelled out rather than looked up**, exactly as CORRIDOR_PLAN is, and
// for the same reason: no door chose either of them, so neither is a roll's answer and
// neither belongs in the table that turns a roll into a room.
//
// The alternative was a fourth tier, or an "is this the entrance" flag threaded through
// roomPlanFor - both of which put a branch in the path of every ordinary combat room to
// serve exactly one room in the game. This way roomPlanFor is untouched and every other
// easy combat room still holds four.
export const ENTRANCE_PLAN = {
  ...roomPlanFor(ENTRANCE_DOOR),
  enemyCount: ENTRANCE_ENEMIES
}


// Glow is the tier, and that is now the only channel that carries a gamble. Colour still
// tells the three room types apart, but it is a label rather than a signal: it is always
// true, so reading it is free.
//
// **Combat is slate - the colour of the walls, and the colour of nothing.** Amber and pink
// mean something specific and rare; the ordinary room should not compete with them for the
// eye, and there is no reward type left for it to name. It is the same grey the corridor
// exit wears, which is the same idea twice: a pad that carries no information looks like
// the room rather than like a promise. The two are still told apart, because a combat door
// pulses with its tier and a corridor exit does not.
//
// Violet and cyan are free with safe and risky merged, and are left free. Red stays out
// of the door vocabulary as it always has - it is what damage and enemies are painted in.
export const DOOR_STYLE = {
  combat: { color: 0xcbd5e1, label: 'COMBAT' },
  shop: { color: 0xfbbf24, label: 'SHOP' },
  puzzle: { color: 0xf472b6, label: 'PUZZLE' }
}

// Fill alpha, border thickness and how fast the pad pulses. A hard door is brighter,
// thicker-edged and beating faster than an easy one.
export const TIER_GLOW = {
  easy: { alpha: 0.16, stroke: 2, pulse: 900 },
  medium: { alpha: 0.32, stroke: 4, pulse: 620 },
  hard: { alpha: 0.52, stroke: 6, pulse: 380 }
}
