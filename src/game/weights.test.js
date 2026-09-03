import { describe, expect, it } from 'vitest'
import { createInventory } from './inventory.js'
import { pickWeighted, weightFor, weightedPassivePool } from './weights.js'

describe('weightFor', () => {
  it('gives an unowned item full weight', () => {
    expect(weightFor(0)).toBe(1)
  })

  it('halves the weight of an item owned once', () => {
    expect(weightFor(1)).toBe(0.5)
  })

  it('halves again for a second copy', () => {
    expect(weightFor(2)).toBe(0.25)
  })

  it('keeps halving - a third copy is an eighth', () => {
    expect(weightFor(3)).toBe(0.125)
  })

  it('never reaches zero, so a hoarded item can still show up', () => {
    expect(weightFor(10)).toBeGreaterThan(0)
  })
})

const IRON = { id: 'iron_plating', slot: 'passive' }
const SHARP = { id: 'sharp_rounds', slot: 'passive' }

function inventoryWith(...items) {
  const inventory = createInventory()
  items.forEach((item) => inventory.passives.push(item))
  return inventory
}

describe('weightedPassivePool', () => {
  it('pairs every catalogue item with a weight', () => {
    const pool = weightedPassivePool(createInventory(), [IRON, SHARP])

    expect(pool).toEqual([
      { item: IRON, weight: 1 },
      { item: SHARP, weight: 1 }
    ])
  })

  it('halves the weight of the one item already held', () => {
    const pool = weightedPassivePool(inventoryWith(IRON), [IRON, SHARP])

    expect(pool).toEqual([
      { item: IRON, weight: 0.5 },
      { item: SHARP, weight: 1 }
    ])
  })

  it('halves again per stacked copy', () => {
    const pool = weightedPassivePool(inventoryWith(IRON, IRON), [IRON, SHARP])

    expect(pool[0].weight).toBe(0.25)
  })

  it('drops nothing from the catalogue - an owned item stays available', () => {
    const pool = weightedPassivePool(inventoryWith(IRON, IRON, IRON), [IRON, SHARP])

    expect(pool.map((entry) => entry.item)).toEqual([IRON, SHARP])
  })
})

describe('pickWeighted', () => {
  const half = [
    { item: IRON, weight: 0.5 },
    { item: SHARP, weight: 1 }
  ]

  it('picks the first entry on a roll inside its share', () => {
    expect(pickWeighted(half, () => 0)).toBe(IRON)
  })

  it('picks the later entry once the roll passes the first share', () => {
    // total 1.5, so IRON holds [0, 0.5) - a roll of 0.5 lands on SHARP
    expect(pickWeighted(half, () => 0.5 / 1.5)).toBe(SHARP)
  })

  it('gives the heavier entry the larger share of the range', () => {
    expect(pickWeighted(half, () => 0.99)).toBe(SHARP)
  })

  it('still picks the only entry there is', () => {
    expect(pickWeighted([{ item: IRON, weight: 0.125 }], () => 0.99)).toBe(IRON)
  })

  it('picks nothing from an empty pool', () => {
    expect(pickWeighted([], () => 0)).toBe(null)
  })
})
