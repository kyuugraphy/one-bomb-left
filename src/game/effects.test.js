import { describe, expect, test } from 'vitest'
import { computeStats } from './effects.js'
import { createInventory } from './inventory.js'
import { getItem } from './items.js'

const BASE = { maxHp: 6, fireCooldown: 180, moveSpeed: 320, damage: 1 }

const withPassives = (...ids) => {
  const inventory = createInventory()
  ids.forEach((id, i) => {
    inventory.passives[i] = getItem(id)
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

  test('iron plating and steady boots together grant +5% damage', () => {
    const stats = computeStats(BASE, withPassives('iron_plating', 'steady_boots'))

    expect(stats.damage).toBeCloseTo(1.05)
    expect(stats.maxHp).toBe(7)
    expect(stats.moveSpeed).toBeCloseTo(368)
  })

  test('either half of the set on its own grants no damage bonus', () => {
    expect(computeStats(BASE, withPassives('iron_plating')).damage).toBe(1)
    expect(computeStats(BASE, withPassives('steady_boots')).damage).toBe(1)
  })

  test('losing half the set drops the damage bonus again', () => {
    const inventory = withPassives('iron_plating', 'steady_boots')
    expect(computeStats(BASE, inventory).damage).toBeCloseTo(1.05)

    inventory.passives[1] = getItem('twitchy_trigger')

    expect(computeStats(BASE, inventory).damage).toBe(1)
  })

  test('an active item in an active slot contributes no passive stats', () => {
    const inventory = createInventory()
    inventory.actives[0] = getItem('panic_button')

    expect(computeStats(BASE, inventory)).toEqual(BASE)
  })

  test('a damage passive raises damage', () => {
    expect(computeStats(BASE, withPassives('sharp_rounds')).damage).toBeCloseTo(1.5)
  })

  // The set multiplier applies on top of flat damage, so the two compose rather than one
  // quietly replacing the other.
  test('the set bonus multiplies damage that a passive already raised', () => {
    const inventory = withPassives('sharp_rounds', 'iron_plating', 'steady_boots')

    expect(computeStats(BASE, inventory).damage).toBeCloseTo(1.5 * 1.05)
  })
})
