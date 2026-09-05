// The door telegraph, and the one surprise left in it.
//
// **A door never lies.** It says what kind of room is behind it and how hard that room
// will be, and both are true. There used to be a lie system here - a door could advertise
// one tier and open onto another - and it was removed rather than tuned, because a
// telegraph that misreports is a telegraph the player learns to ignore, and an ignored
// telegraph is three coloured squares with no game in them.
//
// What replaced it is the twist: a shop or a puzzle that turns into a fight once you are
// standing in it. The difference is where the surprise lives. A lie was the *sign* being
// wrong about a room that was always going to be what it was; a twist is the sign being
// right and the room changing its mind. Nothing the player read was false, so nothing they
// learned is worth unlearning - which is what makes the surprise survivable.
//
// Everything here is a pure roll with the RNG injected, the same contract as shop.js and
// weights.js; the scene renders it.

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
export const TYPE_WEIGHTS = { combat: 2, shop: 1, puzzle: 1 }

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

// ---- the twist -----------------------------------------------------------------------
//
// A shop or a puzzle can turn out to be a hard fight. Nothing at the door hints at it: the
// pad is the ordinary amber or pink, the glow is the tier the room would have had, and
// there is no fourth colour and no extra mark. The surprise has to be a surprise, or it is
// just a badge that means "this might be a fight", which every door already means.
//
// **Combat rooms are never twisted.** A fight that turns into a fight is not a surprise,
// and the entrance is a combat room - so without this a run could open on an ambush, which
// is the one place the game cannot afford one.
export const TWISTABLE_TYPES = ['shop', 'puzzle']

export function canTwist(plan) {
  return TWISTABLE_TYPES.includes(plan.type)
}

// One room in a hundred. Deliberately rare: a twist costs the player a shop they were
// counting on or a puzzle they wanted, and a surprise that keeps happening is a tax.
//
// Worth knowing what this rate actually buys. Shop and puzzle together are about 43% of
// doors, so roughly **0.4% of rooms twist** - about one per 230 rooms, or one run in
// twenty-odd at ten rooms a run. Most runs will never see it. The fairness rules below are
// therefore insurance rather than an active constraint at this rate, and that is a choice
// rather than an oversight: they are what stops the tuning knob from being dangerous if
// this number ever goes up.
export const TWIST_CHANCE = 0.01

// How many twists a whole run is allowed: 0 to 4, rolled once when the run starts. Same
// structure the lie budget had, and kept for the same reason - a per-room probability
// alone means a long run eventually eats one and a short run usually does not, so the
// surprise belongs to the length of the run rather than to the run itself. A budget makes
// it a property of the hand you were dealt.
export const MAX_TWIST_CAP = 4

export function rollTwistCap(randomFn) {
  return Math.floor(randomFn() * (MAX_TWIST_CAP + 1))
}

// When the twist roll is skipped and the room is simply what it said it was. Two reasons,
// and the run state carries both: the budget is spent, or the last twistable room already
// twisted. Two twists in a row reads as the game being unfair rather than surprising.
//
// Note "in a row" counts **twistable** rooms, not all rooms: a fight walked between a
// twisted puzzle and a shop does not buy the shop the right to twist. See recordTwist.
export function mustStaySafe({ twistCap, twistsSoFar, lastRoomWasTwist }) {
  return lastRoomWasTwist === true || twistsSoFar >= twistCap
}

// What a twisted room becomes: a hard combat room, in every respect an ordinary one. It
// pays the ordinary room-clear drop, its enemies are the ordinary hard count, and it is
// cleared the ordinary way. The only thing unusual about it is that the player did not
// choose it.
export const TWISTED_PLAN = roomPlanFor({ type: 'combat', tier: 'hard' })

// What the ambush says. One line drawn from the pool below, in place of the single fixed
// line this shipped with - a surprise that says the same words every time stops being one
// the second time you meet it.
//
// **The groupings are for editing, not for the player.** Nothing marks, tags or styles a
// register differently; every line is plain text in the same place, and there is no way to
// tell from inside the game which block a line came from. They are kept grouped and
// commented here only so they stay easy to add to and rewrite.
export const TWIST_LINES = [
  // --- delighted, and enjoying it -------------------------------------------------
  "Fooled you again~ This little trap was just for you. Don't pout, it's cuter when you struggle.",
  'Surprise~ Did that sting a little? Good. It means it worked.',
  "Aww, you actually believed it. That's almost sweet.",
  'Oh, you fell right in. How adorable.',
  'A little trap, wrapped up just for you~',
  "Didn't see that coming? Neither did you, apparently.",
  "You walked right into my hands. I don't mind.",

  // --- patient, and has watched this before ---------------------------------------
  "You always come back for more. It's almost sweet.",
  'Every time, the same door. Every time, the same you.',
  'You keep choosing this. I keep letting you.',
  'You always fall for it. I like to watch you fall. Always.',
  'You fall so easily. I never get tired of it.',
  "I could stop this. I don't want to.",
  'This never gets old. Not for me, anyway.',

  // --- apologetic, and faintly alarmed by its own house ---------------------------
  'Oh dear. Wrong door, wrong day, wrong everything.',
  'It only looked friendly. Most traps do.',
  "Ah. That wasn't supposed to happen. Or perhaps it was.",
  'How peculiar. It seemed so trustworthy.',
  'Well. That escalated with remarkably little warning.',
  'Terribly sorry. This sort of thing does happen here.',
  "That's odd. It never does this to the others.",

  // --- showman, and pleased with the craft ----------------------------------------
  'A little theater never hurt anyone. You, on the other hand—',
  'A little misdirection goes a long way.',
  "Misdirection only works once you've stopped looking for it.",
  'The best tricks explain themselves. Eventually.',
  'A twist works best when no one suspects a script.',
  'Every trap is just a trick with worse manners.',
  'The setup was the easy part.'
]

// One line, never the one before it. The exclusion is by value rather than by index so a
// stale or unknown `lastLine` - an older save, a line since rewritten - simply excludes
// nothing instead of silently dropping a real one from the draw.
//
// Filtering rather than rerolling keeps it to a single roll and keeps the remaining 27
// exactly equally likely; a reroll-until-different loop would be unbounded and no fairer.
export function pickTwistLine(lastLine, randomFn) {
  const options = TWIST_LINES.filter((line) => line !== lastLine)

  return options[Math.floor(randomFn() * options.length)]
}

// Whether this room turns hostile, rolled at the door alongside the plan and the shape so
// the room is settled before the scene ever starts - the same place and the same moment as
// every other property of a room.
//
// Nothing is rolled for a room that could never twist, so a caller queueing rolls does not
// have to know which types are eligible or what the run's budget looks like.
export function rollTwist(plan, run, randomFn) {
  if (!canTwist(plan) || mustStaySafe(run)) {
    return false
  }

  return randomFn() < TWIST_CHANCE
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
