import { describe, expect, it } from 'vitest'
import {
  DOOR_STYLE,
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

  it('gives what the door advertised on an honest roll', () => {
    expect(resolveDoor(gold, rng(0, 0))).toEqual({ type: 'shop', tier: 'easy' })
  })

  it('gives a different reward type when the type roll misses', () => {
    const actual = resolveDoor(gold, rng(0.99, 0, 0))

    expect(actual.type).not.toBe('shop')
    expect(REWARD_TYPES).toContain(actual.type)
  })

  it('gives a different tier when the tier roll misses', () => {
    const actual = resolveDoor(gold, rng(0, 0.99, 0))

    expect(actual.tier).not.toBe('easy')
    expect(TIERS).toContain(actual.tier)
  })

  it('can miss on both at once - colour and glow both lying', () => {
    const actual = resolveDoor(gold, rng(0.99, 0, 0.99, 0))

    expect(actual.type).not.toBe('shop')
    expect(actual.tier).not.toBe('easy')
  })

  it('never substitutes the advertised type back in', () => {
    ;[0, 0.34, 0.67, 0.99].forEach((pick) => {
      expect(resolveDoor(gold, rng(0.99, pick, 0)).type).not.toBe('shop')
    })
  })

  it('never substitutes the advertised tier back in', () => {
    ;[0, 0.5, 0.99].forEach((pick) => {
      expect(resolveDoor(gold, rng(0, 0.99, pick)).tier).not.toBe('easy')
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
        const actual = resolveDoor({ type, tier }, rng(0.99, 0, 0.99, 0))

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

        expect(built.roomType).toMatch(/^(combat|shop)$/)
        expect(built.enemyCount).toBeGreaterThanOrEqual(0)
        expect(built.enemyStrengthBonus).toBeGreaterThanOrEqual(0)
        expect(built.cursedChance).toBeGreaterThanOrEqual(0)
        expect(built.cursedChance).toBeLessThanOrEqual(1)
      })
    )
  })

  it('sends shop doors to a shop room and everything else to a combat room', () => {
    expect(plan('shop', 'medium').roomType).toBe('shop')
    expect(plan('safe_reward', 'medium').roomType).toBe('combat')
    expect(plan('risky_reward', 'medium').roomType).toBe('combat')
    expect(plan('combat_heavy', 'medium').roomType).toBe('combat')
  })

  it('puts more enemies behind a combat-heavy door than a safe-reward one', () => {
    TIERS.forEach((tier) => {
      expect(plan('combat_heavy', tier).enemyCount).toBeGreaterThan(
        plan('safe_reward', tier).enemyCount
      )
    })
  })

  it('raises the enemy count with the tier, for every type', () => {
    REWARD_TYPES.forEach((type) => {
      expect(plan(type, 'medium').enemyCount).toBeGreaterThan(plan(type, 'easy').enemyCount)
      expect(plan(type, 'hard').enemyCount).toBeGreaterThan(plan(type, 'medium').enemyCount)
    })
  })

  it('toughens the enemies with the tier as well as multiplying them', () => {
    expect(plan('combat_heavy', 'easy').enemyStrengthBonus).toBe(0)
    expect(plan('combat_heavy', 'hard').enemyStrengthBonus).toBeGreaterThan(
      plan('combat_heavy', 'medium').enemyStrengthBonus
    )
  })

  it('curses nearly every reward behind a risky door', () => {
    expect(plan('risky_reward', 'medium').cursedChance).toBeGreaterThan(0.8)
  })

  it('curses nothing behind a safe door', () => {
    TIERS.forEach((tier) => expect(plan('safe_reward', tier).cursedChance).toBe(0))
  })

  it('leaves the ordinary coin-flip curse behind a combat door', () => {
    expect(plan('combat_heavy', 'medium').cursedChance).toBe(0.5)
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
