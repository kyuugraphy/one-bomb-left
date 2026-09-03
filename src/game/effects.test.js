import { describe, expect, test } from 'vitest'
import { computeStats } from './effects.js'
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
