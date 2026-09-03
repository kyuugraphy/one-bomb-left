import { describe, expect, it } from 'vitest'
import { createInventory } from './inventory.js'
import { ITEMS, getItem, itemsFrom } from './items.js'
import {
  BOMB_REFILL,
  HP_REFILL,
  SHELF_SIZE,
  SHOP_PRICES,
  canAfford,
  priceOf,
  rollShopStock,
  sellableItems,
  shelfLabelFor
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

  // A shelf is exactly SHELF_SIZE wide now, refills included, whatever the rolls say.
  // It used to be a 3-4 roll on top of the refills, so a visit faced 5 or 6 things.
  it('puts exactly SHELF_SIZE things on the shelf, however the rolls fall', () => {
    ;[rng(0, 0, 0, 0), rng(0.99, 0.99, 0.99, 0.99), rng(0.5, 0.1, 0.9, 0.3)].forEach(
      (randomFn) => expect(rollShopStock(POOL, randomFn)).toHaveLength(SHELF_SIZE)
    )
  })

  it('fills the shelf with the two refills and one rolled item', () => {
    const stock = rollShopStock(POOL, rng(0, 0, 0, 0))

    expect(stock.filter((entry) => entry.kind === 'item')).toHaveLength(SHELF_SIZE - 2)
    expect(stock.filter((entry) => entry.kind !== 'item')).toHaveLength(2)
  })

  // No size roll any more, so the first random value is a draw rather than a count -
  // a high first roll must not quietly widen the shelf again.
  it('does not spend a roll on the size', () => {
    const low = rollShopStock(POOL, rng(0, 0, 0, 0))
    const high = rollShopStock(POOL, rng(0.99, 0, 0, 0))

    expect(low).toHaveLength(high.length)
  })

  it('never stocks the same item twice', () => {
    const stock = rollShopStock(POOL, rng(0.99, 0, 0, 0, 0))
    // one item per shelf today, so this is a guard on the draw rather than on this shelf
    const ids = stock.filter((entry) => entry.kind === 'item').map((entry) => entry.item.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('draws only from the pool it was given', () => {
    const stock = rollShopStock(POOL, rng(0.99, 0.99, 0.99, 0.99, 0.99))

    stock
      .filter((entry) => entry.kind === 'item')
      .forEach((entry) => expect(POOL.map((slot) => slot.item)).toContain(entry.item))
  })

  it('stocks what it can when the pool is smaller than the shelf', () => {
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

// What the shop is allowed to sell at all. rollShopStock draws from whatever pool it is
// handed, so this is where the guarantee that a debuff is never for sale actually lives.
describe('sellableItems', () => {
  const empty = createInventory()

  it('never offers a debuff, at any price, to any inventory', () => {
    const ids = sellableItems(ITEMS, empty).map((item) => item.id)

    itemsFrom('debuff').forEach((item) => expect(ids).not.toContain(item.id))
  })

  it('leaves the debuff pool out even when it is the whole catalogue', () => {
    expect(sellableItems(itemsFrom('debuff'), empty)).toEqual([])
  })

  it('offers everything that is not a debuff to a player holding nothing', () => {
    const safe = ITEMS.filter((item) => item.source !== 'debuff')

    expect(sellableItems(ITEMS, empty)).toEqual(safe)
  })

  it('stops offering a trinket or an active once it is owned', () => {
    const held = createInventory()
    held.trinket = getItem('heavy_vest')
    held.actives[0] = getItem('panic_button')

    const ids = sellableItems(ITEMS, held).map((item) => item.id)

    expect(ids).not.toContain('heavy_vest')
    expect(ids).not.toContain('panic_button')
    expect(ids).toContain('bulwark')
  })

  it('keeps offering a passive however many copies are already held', () => {
    const held = createInventory()
    held.passives.push(getItem('iron_plating'), getItem('iron_plating'))

    expect(sellableItems(ITEMS, held).map((item) => item.id)).toContain('iron_plating')
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

// What the shelf gives away before you pay. The price is a cost and stays visible; the
// item's identity is the thing being bought and does not.
describe('shelfLabelFor', () => {
  it('never shows a catalogue item name', () => {
    ITEMS.forEach((item) => {
      expect(shelfLabelFor({ kind: 'item', item })).not.toContain(item.name)
    })
  })

  it('never shows a catalogue item effect', () => {
    ITEMS.forEach((item) => {
      expect(shelfLabelFor({ kind: 'item', item })).not.toContain(item.effect)
    })
  })

  it('shows the tier instead, which the price already implies', () => {
    expect(shelfLabelFor({ kind: 'item', item: getItem('heavy_vest') })).toContain('TRINKET')
    expect(shelfLabelFor({ kind: 'item', item: getItem('iron_plating') })).toContain('PASSIVE')
    expect(shelfLabelFor({ kind: 'item', item: getItem('panic_button') })).toContain('ACTIVE')
  })

  it('marks a catalogue item as unknown', () => {
    ITEMS.forEach((item) => expect(shelfLabelFor({ kind: 'item', item })).toContain('?'))
  })

  // The refills are not items: there is nothing to find out, and hiding them would make a
  // puzzle out of the obvious purchase.
  it('keeps the refills named in full', () => {
    expect(shelfLabelFor(HP_REFILL)).toBe(HP_REFILL.name)
    expect(shelfLabelFor(BOMB_REFILL)).toBe(BOMB_REFILL.name)
  })

  it('labels every entry a real shelf can hold', () => {
    const stock = rollShopStock(POOL, rng(0, 0, 0, 0))

    stock.forEach((entry) => {
      const label = shelfLabelFor(entry)

      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    })
  })
})
