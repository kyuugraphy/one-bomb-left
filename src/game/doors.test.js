import { describe, expect, it } from 'vitest'
import {
  DOOR_STYLE,
  ENTRANCE_DOOR,
  ENTRANCE_ENEMIES,
  ENTRANCE_PLAN,
  MAX_LIE_CAP,
  isLie,
  mustBeHonest,
  rollLieCap,
  REWARD_TYPES,
  TIERS,
  TIER_ACCURACY,
  TIER_GLOW,
  TYPE_WEIGHTS,
  resolveDoor,
  roomPlanFor,
  rollDoorCount,
  rollDoors
} from './doors.js'

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

describe('resolveDoor', () => {
  const gold = { type: 'shop', tier: 'easy' }
  // A run with budget left and an honest door behind it: the state in which the accuracy
  // rolls actually get made, which is what these tests are about.
  const LYING_ALLOWED = { lieCap: 4, liesSoFar: 0, lastDoorWasLie: false }

  it('gives what the door advertised on an honest roll', () => {
    expect(resolveDoor(gold, LYING_ALLOWED, rng(0))).toEqual({ type: 'shop', tier: 'easy' })
  })

  // The telegraph has one channel left. Colour used to say what kind of reward was behind
  // the door, and with safe and risky merged there is no reward kind to name - only
  // whether this is a fight, a shop or a puzzle, which is what the room *is* rather than
  // what it pays. A door that lies about being a shop is not a gamble the player can
  // price; it is the amber door meaning nothing. So the type is a promise the telegraph
  // always keeps, and the whole lie budget is spent on difficulty.
  it('never changes the reward type, whatever the roll', () => {
    ;[0, 0.25, 0.5, 0.75, 0.9, 0.99].forEach((first) =>
      REWARD_TYPES.forEach((type) => {
        const actual = resolveDoor({ type, tier: 'easy' }, LYING_ALLOWED, rng(first, 0.99, 0.99))

        expect(actual.type).toBe(type)
      })
    )
  })

  it('gives a different tier when the tier roll misses', () => {
    const actual = resolveDoor(gold, LYING_ALLOWED, rng(0.99, 0))

    expect(actual.tier).not.toBe('easy')
    expect(TIERS).toContain(actual.tier)
  })

  it('never substitutes the advertised tier back in', () => {
    ;[0, 0.5, 0.99].forEach((pick) => {
      expect(resolveDoor(gold, LYING_ALLOWED, rng(0.99, pick)).tier).not.toBe('easy')
    })
  })

  // One roll to decide honesty, one more only if it missed. The order is the contract a
  // test queues against, and dropping the type channel shortened it by two.
  it('spends one roll on an honest door and two on a lying one', () => {
    const count = (values) => {
      let calls = 0
      const counted = () => {
        calls += 1
        return values[calls - 1]
      }
      resolveDoor(gold, LYING_ALLOWED, counted)
      return calls
    }

    expect(count([0, 0, 0])).toBe(1)
    expect(count([0.99, 0, 0])).toBe(2)
  })

  it('tells the truth about the tier most of the time, but not always', () => {
    expect(TIER_ACCURACY).toBeGreaterThanOrEqual(0.7)
    expect(TIER_ACCURACY).toBeLessThan(1)
  })

  it('resolves every door it is handed, honest or not', () => {
    REWARD_TYPES.forEach((type) =>
      TIERS.forEach((tier) => {
        const actual = resolveDoor({ type, tier }, LYING_ALLOWED, rng(0.99, 0, 0.99, 0))

        expect(REWARD_TYPES).toContain(actual.type)
        expect(TIERS).toContain(actual.tier)
      })
    )
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

describe('rollLieCap', () => {
  it('never lets a run be lied to more than MAX_LIE_CAP times', () => {
    for (let i = 0; i < 5000; i++) {
      const cap = rollLieCap(Math.random)

      expect(cap).toBeGreaterThanOrEqual(0)
      expect(cap).toBeLessThanOrEqual(MAX_LIE_CAP)
      expect(Number.isInteger(cap)).toBe(true)
    }
  })

  // A cap of 0 is a real hand, not an off-by-one: some runs never lie at all, and the
  // player has no way to tell they are in one until it is over.
  it('can deal a run that never lies, and a run at the full cap', () => {
    expect(rollLieCap(() => 0)).toBe(0)
    expect(rollLieCap(() => 0.99)).toBe(MAX_LIE_CAP)
  })

  it('reaches every cap in between', () => {
    const seen = new Set()

    for (let i = 0; i < 5000; i++) {
      seen.add(rollLieCap(Math.random))
    }

    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4])
  })
})

describe('isLie', () => {
  const gold = { type: 'shop', tier: 'easy' }

  it('is false when the door told the truth', () => {
    expect(isLie(gold, { type: 'shop', tier: 'easy' })).toBe(false)
  })

  it('is true when the tier is wrong', () => {
    expect(isLie(gold, { type: 'shop', tier: 'hard' })).toBe(true)
  })

  // The type is not a channel the telegraph can miss on any more - resolveDoor hands it
  // straight back - so a differing type is not a lie, it is a caller with a bug. Asking
  // about it here would keep a dead comparison alive on the strength of a test.
  it('reads only the tier, the one channel that can be wrong', () => {
    expect(isLie(gold, { type: 'puzzle', tier: 'easy' })).toBe(false)
    expect(isLie(gold, { type: 'puzzle', tier: 'hard' })).toBe(true)
  })
})

describe('mustBeHonest', () => {
  const run = (lieCap, liesSoFar, lastDoorWasLie) => ({ lieCap, liesSoFar, lastDoorWasLie })

  it('lets a fresh run with budget lie', () => {
    expect(mustBeHonest(run(4, 0, false))).toBe(false)
  })

  it('stops lying once the budget is spent', () => {
    expect(mustBeHonest(run(2, 1, false))).toBe(false)
    expect(mustBeHonest(run(2, 2, false))).toBe(true)
    expect(mustBeHonest(run(2, 3, false))).toBe(true)
  })

  it('never lies at all on a run capped at zero', () => {
    expect(mustBeHonest(run(0, 0, false))).toBe(true)
  })

  // The consecutive rule: one lie in a row is a gamble, two is a rigged game.
  it('forces honesty straight after a lie, even with budget to spare', () => {
    expect(mustBeHonest(run(4, 1, true))).toBe(true)
  })

  it('lets the door after that lie again', () => {
    expect(mustBeHonest(run(4, 1, false))).toBe(false)
  })
})

// The two rules together, walked through as a run would walk through them.
describe('the telegraph across a whole run', () => {
  const alwaysMiss = () => 0.99
  const advertised = { type: 'shop', tier: 'easy' }
  const resolveWith = (run) => resolveDoor(advertised, run, alwaysMiss)

  it('cannot lie twice in a row however hard the roll misses', () => {
    const run = { lieCap: 4, liesSoFar: 0, lastDoorWasLie: false }
    const outcomes = []

    for (let door = 0; door < 8; door++) {
      const actual = resolveWith(run)
      const lied = isLie(advertised, actual)

      outcomes.push(lied)
      run.lastDoorWasLie = lied
      if (lied) {
        run.liesSoFar += 1
      }
    }

    outcomes.forEach((lied, i) => {
      if (i > 0) {
        expect(lied && outcomes[i - 1]).toBe(false)
      }
    })
  })

  it('spends the budget and then tells the truth for the rest of the run', () => {
    for (let cap = 0; cap <= MAX_LIE_CAP; cap++) {
      const run = { lieCap: cap, liesSoFar: 0, lastDoorWasLie: false }
      let lies = 0

      for (let door = 0; door < 40; door++) {
        const actual = resolveWith(run)
        const lied = isLie(advertised, actual)

        run.lastDoorWasLie = lied
        if (lied) {
          run.liesSoFar += 1
          lies += 1
        }
      }

      expect(lies).toBe(cap)
    }
  })

  // With every roll missing, a run alternates lie / honest until the budget is gone -
  // so the cap is reached in exactly twice as many doors, and never sooner.
  it('takes at least two doors per lie, so a cap of 4 needs 7 doors to spend', () => {
    const run = { lieCap: 4, liesSoFar: 0, lastDoorWasLie: false }
    let doors = 0

    while (run.liesSoFar < 4 && doors < 100) {
      const lied = isLie(advertised, resolveWith(run))

      run.lastDoorWasLie = lied
      if (lied) {
        run.liesSoFar += 1
      }
      doors += 1
    }

    expect(doors).toBe(7)
  })

  it('never lies at all on a zero-cap run, whatever the rolls say', () => {
    const run = { lieCap: 0, liesSoFar: 0, lastDoorWasLie: false }

    for (let door = 0; door < 20; door++) {
      expect(resolveWith(run)).toEqual(advertised)
    }
  })
})
