import { describe, expect, it } from 'vitest'
import {
  DOOR_STYLE,
  MAX_LIE_CAP,
  isLie,
  mustBeHonest,
  rollLieCap,
  REWARD_TYPES,
  TIERS,
  TIER_ACCURACY,
  TIER_GLOW,
  TYPE_ACCURACY,
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

  it('never offers the same reward type twice - two gold doors are one choice', () => {
    const doors = rollDoors(rng(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99))
    const types = doors.map((door) => door.type)

    expect(new Set(types).size).toBe(types.length)
  })

  it('rolls the tier independently of the type, so tiers may repeat', () => {
    // both type rolls low, both tier rolls low: same tier, different types
    const doors = rollDoors(rng(0, 0, 0, 0, 0))

    expect(doors[0].tier).toBe(doors[1].tier)
    expect(doors[0].type).not.toBe(doors[1].type)
  })
})

describe('resolveDoor', () => {
  const gold = { type: 'shop', tier: 'easy' }
  // A run with budget left and an honest door behind it: the state in which the accuracy
  // rolls actually get made, which is what these tests are about.
  const LYING_ALLOWED = { lieCap: 4, liesSoFar: 0, lastDoorWasLie: false }

  it('gives what the door advertised on an honest roll', () => {
    expect(resolveDoor(gold, LYING_ALLOWED, rng(0, 0))).toEqual({ type: 'shop', tier: 'easy' })
  })

  it('gives a different reward type when the type roll misses', () => {
    const actual = resolveDoor(gold, LYING_ALLOWED, rng(0.99, 0, 0))

    expect(actual.type).not.toBe('shop')
    expect(REWARD_TYPES).toContain(actual.type)
  })

  it('gives a different tier when the tier roll misses', () => {
    const actual = resolveDoor(gold, LYING_ALLOWED, rng(0, 0.99, 0))

    expect(actual.tier).not.toBe('easy')
    expect(TIERS).toContain(actual.tier)
  })

  it('can miss on both at once - colour and glow both lying', () => {
    const actual = resolveDoor(gold, LYING_ALLOWED, rng(0.99, 0, 0.99, 0))

    expect(actual.type).not.toBe('shop')
    expect(actual.tier).not.toBe('easy')
  })

  it('never substitutes the advertised type back in', () => {
    ;[0, 0.34, 0.67, 0.99].forEach((pick) => {
      expect(resolveDoor(gold, LYING_ALLOWED, rng(0.99, pick, 0)).type).not.toBe('shop')
    })
  })

  it('never substitutes the advertised tier back in', () => {
    ;[0, 0.5, 0.99].forEach((pick) => {
      expect(resolveDoor(gold, LYING_ALLOWED, rng(0, 0.99, pick)).tier).not.toBe('easy')
    })
  })

  it('tells the truth about the reward type 80-90% of the time', () => {
    expect(TYPE_ACCURACY).toBeGreaterThanOrEqual(0.8)
    expect(TYPE_ACCURACY).toBeLessThanOrEqual(0.9)
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
    expect(plan('safe_reward', 'medium').roomType).toBe('combat')
    expect(plan('risky_reward', 'medium').roomType).toBe('combat')
    expect(plan('puzzle', 'medium').roomType).toBe('puzzle')
  })

  // Risky is the heavy combat door now that combat_heavy is gone: it is where the enemy
  // counts that used to sit behind a red door live, and it is what you are paid a debuff
  // for surviving.
  it('puts more enemies behind a risky door than a safe one', () => {
    TIERS.forEach((tier) => {
      expect(plan('risky_reward', tier).enemyCount).toBeGreaterThan(
        plan('safe_reward', tier).enemyCount
      )
    })
  })

  it('raises the enemy count with the tier for every door that has enemies', () => {
    REWARD_TYPES.filter((type) => type !== 'puzzle').forEach((type) => {
      expect(plan(type, 'medium').enemyCount).toBeGreaterThan(plan(type, 'easy').enemyCount)
      expect(plan(type, 'hard').enemyCount).toBeGreaterThan(plan(type, 'medium').enemyCount)
    })
  })

  it('toughens the enemies with the tier as well as multiplying them', () => {
    expect(plan('risky_reward', 'easy').enemyStrengthBonus).toBe(0)
    expect(plan('risky_reward', 'hard').enemyStrengthBonus).toBeGreaterThan(
      plan('risky_reward', 'medium').enemyStrengthBonus
    )
  })

  // The puzzle room is a stub: no enemies at any tier, nothing cursed, nothing to clear.
  // The tier still rides on the door, because the telegraph lies about it like any other.
  it('leaves a puzzle room empty at every tier', () => {
    TIERS.forEach((tier) => expect(plan('puzzle', tier).enemyCount).toBe(0))
  })

  it('has no combat_heavy door left to plan for', () => {
    expect(REWARD_TYPES).not.toContain('combat_heavy')
    expect(REWARD_TYPES).toContain('puzzle')
    expect(REWARD_TYPES).toHaveLength(4)
  })

  it('leaves an easy shop unguarded and a hard one guarded', () => {
    expect(plan('shop', 'easy').enemyCount).toBe(0)
    expect(plan('shop', 'hard').enemyCount).toBeGreaterThan(0)
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

  it('is false when both channels match', () => {
    expect(isLie(gold, { type: 'shop', tier: 'easy' })).toBe(false)
  })

  it('is true when the type is wrong', () => {
    expect(isLie(gold, { type: 'puzzle', tier: 'easy' })).toBe(true)
  })

  it('is true when the tier is wrong', () => {
    expect(isLie(gold, { type: 'shop', tier: 'hard' })).toBe(true)
  })

  // Both channels missing is one lie, not two: the player walks into one room and gets
  // one surprise out of it.
  it('counts both channels missing as a single lie', () => {
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
