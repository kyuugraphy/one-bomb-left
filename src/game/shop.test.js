import { describe, expect, it } from 'vitest'
import { ITEMS } from './items.js'
import {
  BOMB_REFILL,
  HP_REFILL,
  SHOP_PRICES,
  canAfford,
  priceOf,
  rollShopStock
} from './shop.js'

// A queued RNG: each call returns the next value, so every roll in a test is chosen.
function rng(...values) {
  let i = 0
  return () => values[i++]
}

// Every entry at full weight, so these draws read exactly as the old even ones did.
const POOL = [
  { item: { id: 'a', slot: 'passive' }, weight: 1 },
  { item: { id: 'b', slot: 'passive' }, weight: 1 },
  { item: { id: 'c', slot: 'active' }, weight: 1 },
  { item: { id: 'd', slot: 'active' }, weight: 1 },
  { item: { id: 'e', slot: 'passive' }, weight: 1 }
]

describe('rollShopStock', () => {
  it('always stocks both refills', () => {
    const stock = rollShopStock(POOL, rng(0, 0, 0, 0))

    expect(stock).toContainEqual(HP_REFILL)
    expect(stock).toContainEqual(BOMB_REFILL)
  })

  it('rolls 3 catalogue items on a low roll', () => {
    const stock = rollShopStock(POOL, rng(0, 0, 0, 0))

    expect(stock.filter((entry) => entry.kind === 'item')).toHaveLength(3)
  })

  it('rolls 4 catalogue items on a high roll', () => {
    const stock = rollShopStock(POOL, rng(0.99, 0, 0, 0, 0))

    expect(stock.filter((entry) => entry.kind === 'item')).toHaveLength(4)
  })

  it('never stocks the same item twice', () => {
    const stock = rollShopStock(POOL, rng(0.99, 0, 0, 0, 0))
    const ids = stock.filter((entry) => entry.kind === 'item').map((entry) => entry.item.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('draws only from the pool it was given', () => {
    const stock = rollShopStock(POOL, rng(0.99, 0.99, 0.99, 0.99, 0.99))

    stock
      .filter((entry) => entry.kind === 'item')
      .forEach((entry) => expect(POOL.map((slot) => slot.item)).toContain(entry.item))
  })

  it('stocks what it can when the pool is smaller than the roll', () => {
    const stock = rollShopStock([POOL[0]], rng(0.99, 0))

    expect(stock.filter((entry) => entry.kind === 'item')).toHaveLength(1)
    expect(stock).toHaveLength(3)
  })

  it('draws by weight, so a half-weighted item loses its share of the roll', () => {
    const heavy = { id: 'heavy', slot: 'passive' }
    const light = { id: 'light', slot: 'passive' }
    // total 1.25: heavy holds [0, 1) of the roll, so 0.6 * 1.25 = 0.75 lands on it -
    // an unweighted draw across two entries would have taken the second one.
    const stock = rollShopStock(
      [
        { item: heavy, weight: 1 },
        { item: light, weight: 0.25 }
      ],
      rng(0, 0.6, 0)
    )

    expect(stock[0].item).toBe(heavy)
  })

  it('stocks the refills alone when the pool is empty', () => {
    expect(rollShopStock([], rng(0))).toEqual([HP_REFILL, BOMB_REFILL])
  })
})

describe('priceOf', () => {
  it('charges the passive price for a passive item', () => {
    expect(priceOf({ kind: 'item', item: { slot: 'passive' } })).toBe(SHOP_PRICES.passive)
  })

  it('charges the active price for an active item', () => {
    expect(priceOf({ kind: 'item', item: { slot: 'active' } })).toBe(SHOP_PRICES.active)
  })

  it('prices the refills from the same table', () => {
    expect(priceOf(HP_REFILL)).toBe(SHOP_PRICES.hp_refill)
    expect(priceOf(BOMB_REFILL)).toBe(SHOP_PRICES.bomb_refill)
  })

  it('charges the trinket price for a trinket', () => {
    expect(priceOf({ kind: 'item', item: { slot: 'trinket' } })).toBe(SHOP_PRICES.trinket)
  })

  it('prices every tier the catalogue can offer', () => {
    ITEMS.forEach((item) => expect(priceOf({ kind: 'item', item })).toBeGreaterThan(0))
  })

  it('prices the trinket above the passives - one slot, permanent', () => {
    expect(SHOP_PRICES.trinket).toBeGreaterThan(SHOP_PRICES.passive)
  })

  it('prices passives above actives, and both above the refills', () => {
    expect(SHOP_PRICES.passive).toBeGreaterThan(SHOP_PRICES.active)
    expect(SHOP_PRICES.active).toBeGreaterThan(SHOP_PRICES.hp_refill)
    expect(SHOP_PRICES.hp_refill).toBeGreaterThan(SHOP_PRICES.bomb_refill)
  })
})

describe('canAfford', () => {
  it('affords an exact match', () => {
    expect(canAfford({ exp: 7 }, 7)).toBe(true)
  })

  it('refuses one short', () => {
    expect(canAfford({ exp: 6 }, 7)).toBe(false)
  })
})
