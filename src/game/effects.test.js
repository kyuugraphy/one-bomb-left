import { describe, expect, test } from 'vitest'
import { MIN_MAX_HP, computeStats } from './effects.js'
import { createInventory } from './inventory.js'
import { getItem } from './items.js'

const BASE = { maxHp: 6, fireCooldown: 180, moveSpeed: 320, damage: 1 }

const withPassives = (...ids) => {
  const inventory = createInventory()
  ids.forEach((id) => inventory.passives.push(getItem(id)))
  return inventory
}

// The set is two equipped actives now, so the set tests build the active rack instead.
const withActives = (...ids) => {
  const inventory = createInventory()
  ids.forEach((id, i) => {
    inventory.actives[i] = getItem(id)
  })
  return inventory
}

describe('computeStats', () => {
  test('an empty inventory leaves the base stats untouched', () => {
    expect(computeStats(BASE, createInventory())).toEqual(BASE)
  })

  test('iron plating adds 1 max HP', () => {
    expect(computeStats(BASE, withPassives('iron_plating')).maxHp).toBe(7)
  })

  test('twitchy trigger cuts 20ms off the fire cooldown', () => {
    expect(computeStats(BASE, withPassives('twitchy_trigger')).fireCooldown).toBe(160)
  })

  test('steady boots adds 15% move speed', () => {
    expect(computeStats(BASE, withPassives('steady_boots')).moveSpeed).toBeCloseTo(368)
  })

  test('panic button and bulwark together grant +5% damage', () => {
    expect(computeStats(BASE, withActives('panic_button', 'bulwark')).damage).toBeCloseTo(1.05)
  })

  test('either half of the set on its own grants no damage bonus', () => {
    expect(computeStats(BASE, withActives('panic_button')).damage).toBe(1)
    expect(computeStats(BASE, withActives('bulwark')).damage).toBe(1)
  })

  test('losing half the set drops the damage bonus again', () => {
    const inventory = withActives('panic_button', 'bulwark')
    expect(computeStats(BASE, inventory).damage).toBeCloseTo(1.05)

    inventory.actives[1] = getItem('repair_kit')

    expect(computeStats(BASE, inventory).damage).toBe(1)
  })

  test('an active item contributes nothing but the set bonus', () => {
    expect(computeStats(BASE, withActives('panic_button'))).toEqual(BASE)
  })

  // Duplicates are the point of the uncapped tier: two copies stack numerically.
  test('two copies of the same passive stack', () => {
    expect(computeStats(BASE, withPassives('sharp_rounds', 'sharp_rounds')).damage).toBeCloseTo(2)
  })

  test('the trinket is summed with the passives', () => {
    const inventory = withPassives('iron_plating')
    inventory.trinket = getItem('heavy_vest')

    expect(computeStats(BASE, inventory).maxHp).toBe(9)
    expect(computeStats(BASE, inventory).moveSpeed).toBeCloseTo(288)
  })

  test('a damage passive raises damage', () => {
    expect(computeStats(BASE, withPassives('sharp_rounds')).damage).toBeCloseTo(1.5)
  })

  // The set multiplier applies on top of flat damage, so the two compose rather than one
  // quietly replacing the other.
  test('the set bonus multiplies damage that a passive already raised', () => {
    const inventory = withPassives('sharp_rounds')
    inventory.actives[0] = getItem('panic_button')
    inventory.actives[1] = getItem('bulwark')

    expect(computeStats(BASE, inventory).damage).toBeCloseTo(1.5 * 1.05)
  })
})

// The debuff tier goes through exactly the same machinery as any other passive - that is
// the point of putting it there - so what needs testing is the two things it added:
// a rate multiplier that divides, and a floor under max HP.
describe('computeStats with debuffs', () => {
  test('Rusty Grip lengthens the cooldown rather than shortening it', () => {
    const { fireCooldown } = computeStats(BASE, withPassives('rusty_grip'))

    expect(fireCooldown).toBeGreaterThan(BASE.fireCooldown)
  })

  // -15% fire rate means 0.85 shots in the time you used to get one, so the cooldown is
  // 1/0.85 as long - not 0.85 as long, which would have been a faster gun.
  test('Rusty Grip costs exactly 15% of the fire rate', () => {
    const { fireCooldown } = computeStats(BASE, withPassives('rusty_grip'))
    const rateBefore = 1000 / BASE.fireCooldown
    const rateAfter = 1000 / fireCooldown

    expect(rateAfter / rateBefore).toBeCloseTo(0.85)
    expect(fireCooldown).toBeCloseTo(BASE.fireCooldown / 0.85)
  })

  test('Rusty Grip stacks multiplicatively', () => {
    const one = computeStats(BASE, withPassives('rusty_grip')).fireCooldown
    const two = computeStats(BASE, withPassives('rusty_grip', 'rusty_grip')).fireCooldown

    expect(two).toBeCloseTo(BASE.fireCooldown / (0.85 * 0.85))
    expect(two).toBeGreaterThan(one)
  })

  // Flat millisecond bonuses apply before the rate multiplier, so a Hair Trigger makes the
  // gun faster and the Rusty Grip then takes its 15% off whatever is left.
  test('a flat cooldown bonus lands before the rate multiplier', () => {
    const { fireCooldown } = computeStats(BASE, withPassives('hair_trigger', 'rusty_grip'))

    expect(fireCooldown).toBeCloseTo((BASE.fireCooldown - 35) / 0.85)
  })

  test('Sluggish takes 15% of move speed, and stacks with a boost', () => {
    expect(computeStats(BASE, withPassives('sluggish')).moveSpeed).toBeCloseTo(320 * 0.85)
    expect(computeStats(BASE, withPassives('sluggish', 'steady_boots')).moveSpeed)
      .toBeCloseTo(320 * 0.85 * 1.15)
  })

  test('Thin Skin costs half a heart, and cancels against Iron Plating', () => {
    expect(computeStats(BASE, withPassives('thin_skin')).maxHp).toBe(5)
    expect(computeStats(BASE, withPassives('thin_skin', 'iron_plating')).maxHp).toBe(6)
  })

  // The uncapped tier means nothing stops a run collecting six of these. Zero max HP is
  // not a harder run, it is a health bar with no segments and a corpse.
  test('max HP never falls to zero however many Thin Skins are held', () => {
    for (let copies = 1; copies <= 12; copies++) {
      const stats = computeStats(BASE, withPassives(...Array(copies).fill('thin_skin')))

      expect(stats.maxHp).toBeGreaterThanOrEqual(MIN_MAX_HP)
    }

    expect(computeStats(BASE, withPassives(...Array(12).fill('thin_skin'))).maxHp).toBe(MIN_MAX_HP)
  })

  test('Slug Step changes no stat at all - the scene reads it, not computeStats', () => {
    expect(computeStats(BASE, withPassives('slug_step'))).toEqual(computeStats(BASE, createInventory()))
  })

  test('a debuff and a buff of the same kind cancel out', () => {
    const both = computeStats(BASE, withPassives('sluggish', 'steady_boots', 'thin_skin', 'iron_plating'))

    expect(both.maxHp).toBe(BASE.maxHp)
    expect(both.moveSpeed).toBeCloseTo(320 * 0.85 * 1.15)
  })
})
