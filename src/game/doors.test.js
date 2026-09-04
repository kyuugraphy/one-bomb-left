import { describe, expect, it } from 'vitest'
import {
  DOOR_STYLE,
  ENTRANCE_DOOR,
  ENTRANCE_ENEMIES,
  ENTRANCE_PLAN,
  MAX_TWIST_CAP,
  TWISTED_PLAN,
  TWIST_CHANCE,
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
import { recordTwist } from './run.js'

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
