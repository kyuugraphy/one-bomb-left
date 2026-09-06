import { describe, expect, it } from 'vitest'
import {
  DOOR_STYLE,
  ENTRANCE_DOOR,
  ENTRANCE_ENEMIES,
  ENTRANCE_PLAN,
  MAX_TWIST_CAP,
  TWISTED_PLAN,
  TWIST_TRAP,
  BOSS_PLAN,
  assignTwistDispositions,
  TWIST_CHANCE,
  TWIST_NEVER,
  TWIST_ROLLS,
  TWIST_LINES,
  pickTwistLine,
  mustStaySafe,
  rollTwist,
  rollTwistCap,
  REWARD_TYPES,
  TIERS,
  TIER_GLOW,
  TYPE_WEIGHTS,
  roomPlanFor,
  rollDoorCount,
  rollDoors
} from './doors.js'
import { BOSS_DOOR, NORMAL_DOORS, SHOP_GUARANTEED } from './floors.js'
import { freshGameState, recordTwist } from './run.js'

// A queued RNG: each call returns the next value, so every roll in a test is chosen.
function rng(...values) {
  let i = 0
  return () => values[i++]
}

describe('rollDoorCount', () => {
  it('offers two doors on a low roll', () => {
    expect(rollDoorCount(rng(0))).toBe(2)
  })

  it('offers three doors on a high roll', () => {
    expect(rollDoorCount(rng(0.99))).toBe(3)
  })

  it('never offers fewer than two - one door is not a choice', () => {
    ;[0, 0.25, 0.5, 0.75, 0.99].forEach((roll) => {
      expect(rollDoorCount(rng(roll))).toBeGreaterThanOrEqual(2)
    })
  })

  it('never offers more than three', () => {
    ;[0, 0.25, 0.5, 0.75, 0.99].forEach((roll) => {
      expect(rollDoorCount(rng(roll))).toBeLessThanOrEqual(3)
    })
  })
})

describe('rollDoors', () => {
  it('rolls two doors when the count roll is low', () => {
    expect(rollDoors(rng(0, 0, 0, 0, 0))).toHaveLength(2)
  })

  it('rolls three doors when the count roll is high', () => {
    expect(rollDoors(rng(0.99, 0, 0, 0, 0, 0, 0))).toHaveLength(3)
  })

  it('tags every door with a reward type and a difficulty tier', () => {
    rollDoors(rng(0, 0, 0, 0, 0)).forEach((door) => {
      expect(REWARD_TYPES).toContain(door.type)
      expect(TIERS).toContain(door.tier)
    })
  })

  // Combat is the default room now that safe and risky are one thing, so it has to be able
  // to fill more than one slot. The old rule - never the same type twice - was right when
  // four types meant four different kinds of room; with three it would make a three-door
  // choice deterministic, always exactly one of each.
  it('can offer combat on more than one door at once', () => {
    const doors = rollDoors(rng(0.99, 0, 0, 0, 0, 0, 0))

    expect(doors.map((door) => door.type)).toEqual(['combat', 'combat', 'combat'])
  })

  // Shop and puzzle stay special by being scarce. Two gold doors would be one choice
  // offered twice, which is what the old no-repeat rule was really protecting.
  it('never offers two shops or two puzzles in one room', () => {
    for (let room = 0; room < 20000; room++) {
      const types = rollDoors(Math.random).map((door) => door.type)

      expect(types.filter((type) => type === 'shop').length).toBeLessThanOrEqual(1)
      expect(types.filter((type) => type === 'puzzle').length).toBeLessThanOrEqual(1)
    }
  })

  it('rolls the tier independently of the type, so tiers may repeat', () => {
    const doors = rollDoors(rng(0, 0, 0, 0, 0))

    expect(doors[0].tier).toBe(doors[1].tier)
  })

  // Combat is the ordinary room, and a uniform draw did not make it one: it came out at
  // 44% of doors, with one room in six offering no fight at all and a third of two-door
  // rooms offering none. Weighting it double puts the default back where the four-type
  // draw had it, without ever guaranteeing a fight is on the menu.
  it('deals combat about twice as often as a shop or a puzzle', () => {
    expect(TYPE_WEIGHTS.combat).toBe(2 * TYPE_WEIGHTS.shop)
    expect(TYPE_WEIGHTS.combat).toBe(2 * TYPE_WEIGHTS.puzzle)

    const seen = { combat: 0, shop: 0, puzzle: 0 }
    let doors = 0

    for (let room = 0; room < 40000; room++) {
      rollDoors(Math.random).forEach((door) => {
        seen[door.type] += 1
        doors += 1
      })
    }

    expect(seen.combat / doors).toBeGreaterThan(0.55)
    expect(seen.combat / doors).toBeLessThan(0.65)
  })

  it('leaves at most about one room in ten with no fight on offer', () => {
    let noCombat = 0
    const rooms = 40000

    for (let room = 0; room < rooms; room++) {
      if (!rollDoors(Math.random).some((door) => door.type === 'combat')) {
        noCombat += 1
      }
    }

    expect(noCombat / rooms).toBeLessThan(0.11)
    // and never zero: a room that is a shop and a puzzle is a real hand, just a rare one
    expect(noCombat).toBeGreaterThan(0)
  })

  it('offers every type often enough to be worth reading', () => {
    const seen = { combat: 0, shop: 0, puzzle: 0 }

    for (let room = 0; room < 20000; room++) {
      rollDoors(Math.random).forEach((door) => {
        seen[door.type] += 1
      })
    }

    REWARD_TYPES.forEach((type) => expect(seen[type]).toBeGreaterThan(1000))
  })
})

describe('roomPlanFor', () => {
  const plan = (type, tier) => roomPlanFor({ type, tier })

  it('builds a complete plan for every type and tier the roll can produce', () => {
    REWARD_TYPES.forEach((type) =>
      TIERS.forEach((tier) => {
        const built = plan(type, tier)

        expect(built.roomType).toMatch(/^(combat|shop|puzzle)$/)
        expect(built.enemyCount).toBeGreaterThanOrEqual(0)
        expect(built.enemyStrengthBonus).toBeGreaterThanOrEqual(0)
        // no cursedChance any more: the curse system it fed is gone, and a risky room
        // pays in debuff items instead of in poisoned ones
        expect(built.cursedChance).toBeUndefined()
      })
    )
  })

  it('sends each door type to its own kind of room', () => {
    expect(plan('shop', 'medium').roomType).toBe('shop')
    expect(plan('combat', 'medium').roomType).toBe('combat')
    expect(plan('puzzle', 'medium').roomType).toBe('puzzle')
  })

  // The merged type keeps the risky table rather than splitting the difference with the
  // safe one. The safe table (1/2/3) was built to be the fight you took when you did not
  // want a fight, and that is not a thing the player can choose any more.
  //
  // **An explicit placeholder.** A real enemy pool with ranks is planned; when it lands it
  // replaces this table and nothing else, which is why the counts live in exactly one
  // entry of ROOM_PLANS rather than anywhere they would have to be chased down.
  it('puts the old risky counts behind the merged combat door', () => {
    expect(plan('combat', 'easy').enemyCount).toBe(4)
    expect(plan('combat', 'medium').enemyCount).toBe(6)
    expect(plan('combat', 'hard').enemyCount).toBe(9)
  })

  it('raises the enemy count with the tier for every door that has enemies', () => {
    REWARD_TYPES.filter((type) => type !== 'puzzle').forEach((type) => {
      expect(plan(type, 'medium').enemyCount).toBeGreaterThan(plan(type, 'easy').enemyCount)
      expect(plan(type, 'hard').enemyCount).toBeGreaterThan(plan(type, 'medium').enemyCount)
    })
  })

  it('toughens the enemies with the tier as well as multiplying them', () => {
    expect(plan('combat', 'easy').enemyStrengthBonus).toBe(0)
    expect(plan('combat', 'hard').enemyStrengthBonus).toBeGreaterThan(
      plan('combat', 'medium').enemyStrengthBonus
    )
  })

  // The puzzle room is a stub: no enemies at any tier, nothing cursed, nothing to clear.
  // The tier still rides on the door, because the telegraph lies about it like any other.
  it('leaves a puzzle room empty at every tier', () => {
    TIERS.forEach((tier) => expect(plan('puzzle', tier).enemyCount).toBe(0))
  })

  // SAFE and RISKY are one door now. Both names have to be gone rather than merely
  // unused, or a stale caller keeps working by accident and the merge is only half done.
  it('has one combat door where there were two, and no dead types', () => {
    expect(REWARD_TYPES).toEqual(['combat', 'shop', 'puzzle'])
    expect(REWARD_TYPES).not.toContain('safe_reward')
    expect(REWARD_TYPES).not.toContain('risky_reward')
    expect(REWARD_TYPES).not.toContain('combat_heavy')
  })

  it('starts the run behind a combat door', () => {
    expect(REWARD_TYPES).toContain(ENTRANCE_DOOR.type)
    expect(TIERS).toContain(ENTRANCE_DOOR.tier)
  })

  it('leaves an easy shop unguarded and a hard one guarded', () => {
    expect(plan('shop', 'easy').enemyCount).toBe(0)
    expect(plan('shop', 'hard').enemyCount).toBeGreaterThan(0)
  })
})

// The room a run opens in. It used to be a safe_reward/easy room and so held one enemy;
// merging safe into combat would have handed it the risky table's four, which is a
// difficulty change nobody chose - it is fallout from the merge, not a decision in it.
//
// So the entrance is spelled out rather than looked up, the same way CORRIDOR_PLAN is and
// for the same reason: no door chose either of them, so neither is a roll's answer. The
// alternative - a fourth tier, or a flag threaded through roomPlanFor - would put a
// special case in the path of every ordinary combat room to serve exactly one room in the
// game.
describe('ENTRANCE_PLAN', () => {
  it('opens the run with a single enemy, as it did before the merge', () => {
    expect(ENTRANCE_PLAN.enemyCount).toBe(1)
    expect(ENTRANCE_ENEMIES).toBe(1)
  })

  it('is otherwise an ordinary easy combat room', () => {
    expect(ENTRANCE_PLAN.type).toBe('combat')
    expect(ENTRANCE_PLAN.tier).toBe('easy')
    expect(ENTRANCE_PLAN.roomType).toBe('combat')
    expect(ENTRANCE_PLAN.enemyStrengthBonus).toBe(0)
  })

  // The whole point of spelling it out: every *other* easy combat room is untouched. A
  // door that resolves to combat/easy is a real fight, and the entrance is the exception.
  it('does not soften any other easy combat room', () => {
    expect(roomPlanFor({ type: 'combat', tier: 'easy' }).enemyCount).toBe(4)
    expect(roomPlanFor(ENTRANCE_DOOR).enemyCount).toBe(4)
  })

})

describe('door presentation', () => {
  it('gives every reward type a colour, so a new tag cannot ship invisible', () => {
    REWARD_TYPES.forEach((type) => {
      expect(DOOR_STYLE[type].color).toBeGreaterThan(0)
      expect(DOOR_STYLE[type].label.length).toBeGreaterThan(0)
    })
  })

  it('gives every tier a glow that rises with it', () => {
    expect(TIER_GLOW.easy.alpha).toBeLessThan(TIER_GLOW.medium.alpha)
    expect(TIER_GLOW.medium.alpha).toBeLessThan(TIER_GLOW.hard.alpha)
    expect(TIER_GLOW.easy.stroke).toBeLessThan(TIER_GLOW.hard.stroke)
  })
})

describe('rollTwistCap', () => {
  it('never lets a run be twisted more than MAX_TWIST_CAP times', () => {
    for (let i = 0; i < 5000; i++) {
      const cap = rollTwistCap(Math.random)

      expect(cap).toBeGreaterThanOrEqual(0)
      expect(cap).toBeLessThanOrEqual(MAX_TWIST_CAP)
      expect(Number.isInteger(cap)).toBe(true)
    }
  })

  // A cap of 0 is a real hand, not an off-by-one: some runs never twist at all, and the
  // player has no way to tell they are in one until it is over.
  it('can deal a run that never twists, and a run at the full cap', () => {
    expect(rollTwistCap(() => 0)).toBe(0)
    expect(rollTwistCap(() => 0.99)).toBe(MAX_TWIST_CAP)
  })

  it('reaches every cap in between', () => {
    const seen = new Set()

    for (let i = 0; i < 5000; i++) {
      seen.add(rollTwistCap(Math.random))
    }

    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4])
  })
})

// A shop or a puzzle can turn out to be a hard fight. The door said shop and meant it -
// nothing about the telegraph was wrong - the room itself turns once the player is inside.
// That is the whole difference from the lie system this replaced: a lie was the door
// showing the wrong label, and a twist is the room going hostile.
describe('rollTwist', () => {
  const OPEN = { twistCap: 4, twistsSoFar: 0, lastRoomWasTwist: false }
  const plan = (type, tier = 'easy') => roomPlanFor({ type, tier })

  it('can twist a shop and a puzzle', () => {
    expect(rollTwist(plan('shop'), OPEN, () => 0)).toBe(true)
    expect(rollTwist(plan('puzzle'), OPEN, () => 0)).toBe(true)
  })

  // Combat is never twisted: a fight that turns into a fight is not a surprise, and the
  // entrance room is a combat room, so a run could otherwise open on an ambush.
  it('never twists a combat room, however the roll falls', () => {
    ;[0, 0.001, 0.5, 0.99].forEach((roll) => {
      expect(rollTwist(plan('combat'), OPEN, () => roll)).toBe(false)
      expect(rollTwist(plan('combat', 'hard'), OPEN, () => roll)).toBe(false)
    })
  })

  it('twists on a roll under the chance and not on one at or above it', () => {
    expect(rollTwist(plan('shop'), OPEN, () => TWIST_CHANCE - 0.0001)).toBe(true)
    expect(rollTwist(plan('shop'), OPEN, () => TWIST_CHANCE)).toBe(false)
    expect(rollTwist(plan('shop'), OPEN, () => 0.5)).toBe(false)
  })

  it('is a one-in-a-hundred surprise', () => {
    expect(TWIST_CHANCE).toBe(0.01)
  })

  it('refuses when the run has no budget left', () => {
    const spent = { twistCap: 1, twistsSoFar: 1, lastRoomWasTwist: false }

    expect(rollTwist(plan('shop'), spent, () => 0)).toBe(false)
  })

  it('refuses straight after a twist', () => {
    const justTwisted = { twistCap: 4, twistsSoFar: 1, lastRoomWasTwist: true }

    expect(rollTwist(plan('shop'), justTwisted, () => 0)).toBe(false)
  })

  // Nothing is spent deciding a room that was never going to twist, so a caller queueing
  // rolls does not have to know which room types are eligible.
  it('spends a roll only on a room that could actually twist', () => {
    const count = (roomPlan, run) => {
      let calls = 0
      rollTwist(roomPlan, run, () => {
        calls += 1
        return 0
      })
      return calls
    }

    expect(count(plan('shop'), OPEN)).toBe(1)
    expect(count(plan('combat'), OPEN)).toBe(0)
    expect(count(plan('shop'), { twistCap: 0, twistsSoFar: 0, lastRoomWasTwist: false })).toBe(0)
  })

  it('turns a twisted room into a hard combat room', () => {
    expect(TWISTED_PLAN.type).toBe('combat')
    expect(TWISTED_PLAN.tier).toBe('hard')
    expect(TWISTED_PLAN.roomType).toBe('combat')
    expect(TWISTED_PLAN.enemyCount).toBe(roomPlanFor({ type: 'combat', tier: 'hard' }).enemyCount)
  })
})

describe('mustStaySafe', () => {
  const run = (twistCap, twistsSoFar, lastRoomWasTwist) => ({
    twistCap,
    twistsSoFar,
    lastRoomWasTwist
  })

  it('lets a fresh run with budget twist', () => {
    expect(mustStaySafe(run(4, 0, false))).toBe(false)
  })

  it('stops twisting once the budget is spent', () => {
    expect(mustStaySafe(run(2, 1, false))).toBe(false)
    expect(mustStaySafe(run(2, 2, false))).toBe(true)
    expect(mustStaySafe(run(2, 3, false))).toBe(true)
  })

  it('never twists at all on a run capped at zero', () => {
    expect(mustStaySafe(run(0, 0, false))).toBe(true)
  })

  // The consecutive rule: one twist is a surprise, two in a row is the game being unfair.
  it('forces safety straight after a twist, even with budget to spare', () => {
    expect(mustStaySafe(run(4, 1, true))).toBe(true)
  })

  it('lets the room after that twist again', () => {
    expect(mustStaySafe(run(4, 1, false))).toBe(false)
  })
})

// The two rules together, walked through as a run would walk through them.
describe('twists across a whole run', () => {
  const alwaysTwist = () => 0
  const shop = roomPlanFor({ type: 'shop', tier: 'easy' })
  const combat = roomPlanFor({ type: 'combat', tier: 'easy' })

  // Entering a room and booking whatever came of it, the way takeDoor does.
  const enter = (run, plan, randomFn) => {
    const twisted = rollTwist(plan, run, randomFn)

    recordTwist(run, plan, twisted)

    return twisted
  }

  it('cannot twist twice in a row however the roll falls', () => {
    const run = { twistCap: 4, twistsSoFar: 0, lastRoomWasTwist: false }
    const outcomes = []

    for (let room = 0; room < 8; room++) {
      outcomes.push(enter(run, shop, alwaysTwist))
    }

    outcomes.forEach((twisted, i) => {
      if (i > 0) {
        expect(twisted && outcomes[i - 1]).toBe(false)
      }
    })
  })

  // The rule the spec was explicit about: a combat room in between does **not** clear the
  // block. Twist a puzzle, walk a fight, and the next shop is a real shop.
  it('keeps the block across an intervening combat room', () => {
    const run = { twistCap: 4, twistsSoFar: 0, lastRoomWasTwist: false }

    expect(enter(run, shop, alwaysTwist)).toBe(true)
    enter(run, combat, alwaysTwist)
    expect(run.lastRoomWasTwist).toBe(true)
    expect(enter(run, shop, alwaysTwist)).toBe(false)
    expect(enter(run, shop, alwaysTwist)).toBe(true)
  })

  it('spends the cap and then stays safe for the rest of the run', () => {
    for (let cap = 0; cap <= MAX_TWIST_CAP; cap++) {
      const run = { twistCap: cap, twistsSoFar: 0, lastRoomWasTwist: false }
      let twists = 0

      for (let room = 0; room < 40; room++) {
        if (enter(run, shop, alwaysTwist)) {
          twists += 1
        }
      }

      expect(twists).toBe(cap)
    }
  })

  // With every roll twisting, a run alternates twist / safe until the cap is gone - so a
  // cap of 4 takes seven twistable rooms to spend, and never fewer.
  it('takes at least two twistable rooms per twist', () => {
    const run = { twistCap: 4, twistsSoFar: 0, lastRoomWasTwist: false }
    let rooms = 0

    while (run.twistsSoFar < 4 && rooms < 100) {
      enter(run, shop, alwaysTwist)
      rooms += 1
    }

    expect(rooms).toBe(7)
  })

  it('never twists at all on a zero-cap run, whatever the rolls say', () => {
    const run = { twistCap: 0, twistsSoFar: 0, lastRoomWasTwist: false }

    for (let room = 0; room < 20; room++) {
      expect(enter(run, shop, alwaysTwist)).toBe(false)
    }
  })
})

// What the ambush says. One line drawn from a pool, rather than the single fixed line it
// shipped with - a surprise that says the same words every time stops being one the second
// time you meet it.
//
// The lines are flavour and nothing else: no register is marked, tagged or styled
// differently, and the player has no way to tell which group a line came from. They are
// grouped in the source only so they stay editable.
describe('the ambush line pool', () => {
  it('holds 28 lines', () => {
    expect(TWIST_LINES).toHaveLength(28)
  })

  it('has no duplicates - a repeat would quietly halve its own odds', () => {
    expect(new Set(TWIST_LINES).size).toBe(TWIST_LINES.length)
  })

  it('is all non-empty text', () => {
    TWIST_LINES.forEach((line) => {
      expect(typeof line).toBe('string')
      expect(line.trim().length).toBeGreaterThan(0)
    })
  })
})

describe('pickTwistLine', () => {
  it('draws from the pool', () => {
    expect(TWIST_LINES).toContain(pickTwistLine(null, () => 0))
    expect(TWIST_LINES).toContain(pickTwistLine(null, () => 0.999))
  })

  it('reaches every line in the pool', () => {
    const seen = new Set()

    for (let i = 0; i < 20000; i++) {
      seen.add(pickTwistLine(null, Math.random))
    }

    expect(seen.size).toBe(TWIST_LINES.length)
  })

  // The one rule on top of the draw: the same line never lands twice running. Two
  // identical ambushes in a row reads as the game repeating itself rather than as a pool.
  it('never returns the line it was told was last', () => {
    TWIST_LINES.forEach((last) => {
      ;[0, 0.25, 0.5, 0.75, 0.999].forEach((roll) => {
        expect(pickTwistLine(last, () => roll)).not.toBe(last)
      })
    })
  })

  it('can still reach every other line when one is excluded', () => {
    const excluded = TWIST_LINES[0]
    const seen = new Set()

    for (let i = 0; i < 20000; i++) {
      seen.add(pickTwistLine(excluded, Math.random))
    }

    expect(seen.size).toBe(TWIST_LINES.length - 1)
    expect(seen.has(excluded)).toBe(false)
  })

  // Walked as a run walks it: each pick told what the previous one was.
  it('never repeats across a long sequence of ambushes', () => {
    let last = null

    for (let i = 0; i < 5000; i++) {
      const line = pickTwistLine(last, Math.random)

      expect(line).not.toBe(last)
      last = line
    }
  })

  // A line the pool has never heard of excludes nothing, so an unknown or stale value
  // cannot shrink the draw.
  it('ignores a last line that is not in the pool', () => {
    const seen = new Set()

    for (let i = 0; i < 20000; i++) {
      seen.add(pickTwistLine('something else entirely', Math.random))
    }

    expect(seen.size).toBe(TWIST_LINES.length)
  })

  it('spends exactly one roll', () => {
    let calls = 0

    pickTwistLine(null, () => {
      calls += 1
      return 0.5
    })

    expect(calls).toBe(1)
  })
})

// Not every shop door is equally dangerous, and none of them look different.
//
// The plan cannot carry this: a checkpoint shop and an ordinary shop have **identical**
// plans - same type, same tier - so canTwist(plan) cannot tell them apart. The disposition
// rides on the door instead, decided when the doors are built.
describe('rollTwist dispositions', () => {
  const OPEN = { twistCap: 4, twistsSoFar: 0, lastRoomWasTwist: false }
  const SPENT = { twistCap: 0, twistsSoFar: 0, lastRoomWasTwist: false }
  const JUST_TWISTED = { twistCap: 4, twistsSoFar: 1, lastRoomWasTwist: true }
  const shop = roomPlanFor({ type: 'shop', tier: 'easy' })
  const combat = roomPlanFor({ type: 'combat', tier: 'easy' })

  it('defaults to the ordinary roll when no disposition is given', () => {
    expect(rollTwist(shop, OPEN, () => 0)).toBe(true)
    expect(rollTwist(shop, OPEN, () => 0.5)).toBe(false)
  })

  // The two guaranteed checkpoints. A resupply you cannot rely on is not a checkpoint.
  it('never twists a door marked never, whatever the roll or the budget', () => {
    ;[0, 0.001, 0.5, 0.99].forEach((roll) => {
      expect(rollTwist(shop, OPEN, () => roll, TWIST_NEVER)).toBe(false)
    })
  })

  it('spends no roll on a door that can never twist', () => {
    let calls = 0

    rollTwist(shop, OPEN, () => {
      calls += 1
      return 0
    }, TWIST_NEVER)

    expect(calls).toBe(0)
  })

  // The floor's trap. It skips the 1% roll - that is the whole of what makes it a trap -
  // but it is not exempt from anything else.
  it('twists a trap door whatever the roll says, when the budget allows', () => {
    ;[0, 0.5, 0.99].forEach((roll) => {
      expect(rollTwist(shop, OPEN, () => roll, TWIST_TRAP)).toBe(true)
    })
  })

  // **A trap is guaranteed to exist, not guaranteed to fire.** It obeys the cap and the
  // no-consecutive rule exactly as a 1% twist does, so walking into one on a spent budget
  // gives an ordinary, safe room and no sign that anything was ever meant to happen.
  //
  // Measured consequence: about three fifths of the traps a player walks into fizzle, and
  // a run dealt twistCap 0 - one in five - never sees one fire at all.
  it('fizzles into a safe room when the budget is spent', () => {
    expect(rollTwist(shop, SPENT, () => 0, TWIST_TRAP)).toBe(false)
  })

  it('fizzles when the last twistable room already twisted', () => {
    expect(rollTwist(shop, JUST_TWISTED, () => 0, TWIST_TRAP)).toBe(false)
  })

  it('spends no roll on a trap door, fired or fizzled', () => {
    const count = (run) => {
      let calls = 0

      rollTwist(shop, run, () => {
        calls += 1
        return 0
      }, TWIST_TRAP)

      return calls
    }

    expect(count(OPEN)).toBe(0)
    expect(count(SPENT)).toBe(0)
  })

  // The plan is still a hard gate, even for 'always'. A fight that becomes a fight is not
  // an ambush, so a disposition assigned to the wrong door type fails closed rather than
  // producing a meaningless twist.
  it('will not twist a combat room even when marked as a trap', () => {
    expect(rollTwist(combat, OPEN, () => 0, TWIST_TRAP)).toBe(false)
  })

  it('leaves an ordinary shop door on the existing rules', () => {
    expect(rollTwist(shop, OPEN, () => 0, TWIST_ROLLS)).toBe(true)
    expect(rollTwist(shop, OPEN, () => 0.5, TWIST_ROLLS)).toBe(false)
    expect(rollTwist(shop, SPENT, () => 0, TWIST_ROLLS)).toBe(false)
    expect(rollTwist(shop, JUST_TWISTED, () => 0, TWIST_ROLLS)).toBe(false)
  })
})

// The room at the end of a floor. A stub for now, exactly as the puzzle room is one: the
// point of building it is proving the trigger and the transition, not the fight.
describe('BOSS_PLAN', () => {
  it('is a room of its own kind, not a dressed-up combat room', () => {
    expect(BOSS_PLAN.type).toBe('boss')
    expect(BOSS_PLAN.roomType).toBe('boss')
  })

  it('is empty while it is a stub', () => {
    expect(BOSS_PLAN.enemyCount).toBe(0)
    expect(BOSS_PLAN.enemyStrengthBonus).toBe(0)
  })

  // Spelled out rather than rolled, like ENTRANCE_PLAN and CORRIDOR_PLAN: no door choice
  // produced it, so it is not an answer to a roll and does not belong in the table of them.
  it('never appears in the ordinary door pool', () => {
    expect(REWARD_TYPES).not.toContain('boss')
  })

  it('has something to draw, so the pad cannot ship invisible', () => {
    expect(DOOR_STYLE.boss.color).toBeGreaterThan(0)
    expect(DOOR_STYLE.boss.label.length).toBeGreaterThan(0)
  })
})

describe('rollDoors under a floor policy', () => {
  it('offers ordinary rooms exactly what it always did', () => {
    const doors = rollDoors(rng(0, 0, 0, 0, 0), NORMAL_DOORS)

    expect(doors).toHaveLength(2)
    doors.forEach((door) => expect(REWARD_TYPES).toContain(door.type))
  })

  // The last regular room of a floor. One door, nothing beside it, nothing to weigh up -
  // the choice was the room before this one.
  it('replaces the whole choice with a single boss door', () => {
    const doors = rollDoors(rng(0.99, 0.99, 0.99), BOSS_DOOR)

    expect(doors).toHaveLength(1)
    expect(doors[0].type).toBe('boss')
  })

  it('spends no roll on a boss door, because nothing about it is rolled', () => {
    let calls = 0

    rollDoors(() => {
      calls += 1
      return 0.5
    }, BOSS_DOOR)

    expect(calls).toBe(0)
  })

  // The two checkpoints. A shop is always on offer and is never the only thing on offer,
  // so the guarantee is a resupply rather than a room the player is pushed into.
  it('always puts a shop on a checkpoint room, and never only a shop', () => {
    for (let room = 0; room < 20000; room++) {
      const doors = rollDoors(Math.random, SHOP_GUARANTEED)
      const types = doors.map((door) => door.type)

      expect(types).toContain('shop')
      expect(types.some((type) => type !== 'shop')).toBe(true)
      expect(types.filter((type) => type === 'shop')).toHaveLength(1)
    }
  })

  it('leaves a checkpoint roll alone when it already produced a shop', () => {
    const doors = rollDoors(Math.random, SHOP_GUARANTEED)

    expect(doors.filter((door) => door.type === 'shop')).toHaveLength(1)
  })

  it('does not always put the guaranteed shop in the same slot', () => {
    const slots = new Set()

    for (let room = 0; room < 5000; room++) {
      slots.add(rollDoors(Math.random, SHOP_GUARANTEED).findIndex((d) => d.type === 'shop'))
    }

    expect(slots.size).toBeGreaterThan(1)
  })
})

// Which of a room's doors are safe, which are the floor's traps, and which take their
// chances. Separate from rolling the doors because it reads and advances the floor's
// counters - a roll should not be the thing that moves state.
describe('assignTwistDispositions', () => {
  const doorsOf = (...types) => types.map((type) => ({ type, tier: 'easy' }))

  it('marks a checkpoint shop as never twisting', () => {
    const state = freshGameState()
    const tagged = assignTwistDispositions(doorsOf('shop', 'combat'), state, SHOP_GUARANTEED)

    expect(tagged[0].disposition).toBe(TWIST_NEVER)
  })

  // A checkpoint shop is not one of the floor's ordinary shops, so it must not move the
  // counter the trap ordinal is measured against - or the trap would drift a door earlier
  // every time a checkpoint went by.
  it('does not count a checkpoint shop toward the trap ordinal', () => {
    const state = freshGameState()

    assignTwistDispositions(doorsOf('shop', 'combat'), state, SHOP_GUARANTEED)

    expect(state.twistablesSeen).toBe(0)
  })

  // **One counter for both.** A shop and a puzzle are the same kind of thing to the trap:
  // a door that might turn out to be an ambush. Counting them separately gave the floor two
  // traps and gave each of them only its own type's doors to hide among.
  it('counts shop and puzzle doors together as they are offered', () => {
    const state = freshGameState()

    assignTwistDispositions(doorsOf('shop', 'puzzle'), state, NORMAL_DOORS)

    expect(state.twistablesSeen).toBe(2)
  })

  it('marks the ordinal-th twistable door as the floor trap, whichever kind it is', () => {
    const state = freshGameState()

    state.trapOrdinal = 3

    const first = assignTwistDispositions(doorsOf('shop', 'puzzle'), state, NORMAL_DOORS)
    const second = assignTwistDispositions(doorsOf('puzzle', 'combat'), state, NORMAL_DOORS)

    expect(first.map((door) => door.disposition)).toEqual([TWIST_ROLLS, TWIST_ROLLS])
    expect(second[0].disposition).toBe(TWIST_TRAP)
  })

  it('can put the trap on a shop or on a puzzle, depending only on the order offered', () => {
    const onShop = freshGameState()
    const onPuzzle = freshGameState()

    onShop.trapOrdinal = 1
    onPuzzle.trapOrdinal = 1

    expect(assignTwistDispositions(doorsOf('shop'), onShop, NORMAL_DOORS)[0].disposition).toBe(
      TWIST_TRAP
    )
    expect(assignTwistDispositions(doorsOf('puzzle'), onPuzzle, NORMAL_DOORS)[0].disposition).toBe(
      TWIST_TRAP
    )
  })

  it('leaves combat and boss doors on the ordinary rules', () => {
    const state = freshGameState()
    const tagged = assignTwistDispositions(doorsOf('combat', 'boss'), state, NORMAL_DOORS)

    tagged.forEach((door) => expect(door.disposition).toBe(TWIST_ROLLS))
    expect(state.twistablesSeen).toBe(0)
  })

  // One ambush per floor, not one per room type.
  it('tags exactly one trap per floor', () => {
    const state = freshGameState()

    state.trapOrdinal = 1

    const traps = []

    for (let room = 0; room < 6; room++) {
      assignTwistDispositions(doorsOf('shop', 'puzzle'), state, NORMAL_DOORS).forEach((door) => {
        if (door.disposition === TWIST_TRAP) traps.push(door)
      })
    }

    expect(traps).toHaveLength(1)
  })

  it('hands back every door it was given, tagged', () => {
    const state = freshGameState()
    const tagged = assignTwistDispositions(doorsOf('combat', 'shop', 'puzzle'), state, NORMAL_DOORS)

    expect(tagged).toHaveLength(3)
    tagged.forEach((door) => {
      expect(door.type).toBeTruthy()
      expect(door.disposition).toBeTruthy()
    })
  })
})
