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
  purchaseBlockedReason,
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
  // The refills are two entries in the draw now, not fixtures. A shop that happens to
  // offer neither is a real hand, and so is one that offers both.
  it('can stock a shelf with no refill on it at all', () => {
    const shelves = Array.from({ length: 300 }, () => rollShopStock(POOL, Math.random))

    expect(shelves.some((s) => s.every((entry) => entry.kind === 'item'))).toBe(true)
  })

  it('can still stock both refills at once', () => {
    const shelves = Array.from({ length: 300 }, () => rollShopStock(POOL, Math.random))

    expect(
      shelves.some((s) => s.includes(HP_REFILL) && s.includes(BOMB_REFILL))
    ).toBe(true)
  })

  it('never stocks the same refill twice', () => {
    Array.from({ length: 300 }, () => rollShopStock(POOL, Math.random)).forEach((stock) => {
      expect(stock.filter((entry) => entry === HP_REFILL).length).toBeLessThanOrEqual(1)
      expect(stock.filter((entry) => entry === BOMB_REFILL).length).toBeLessThanOrEqual(1)
    })
  })

  // A shelf is exactly SHELF_SIZE wide now, refills included, whatever the rolls say.
  // It used to be a 3-4 roll on top of the refills, so a visit faced 5 or 6 things.
  it('puts exactly SHELF_SIZE things on the shelf, however the rolls fall', () => {
    ;[rng(0, 0, 0, 0), rng(0.99, 0.99, 0.99, 0.99), rng(0.5, 0.1, 0.9, 0.3)].forEach(
      (randomFn) => expect(rollShopStock(POOL, randomFn)).toHaveLength(SHELF_SIZE)
    )
  })

  // The point of the change: how many of the three are catalogue items now varies.
  it('varies how much of the shelf is catalogue items', () => {
    const counts = new Set(
      Array.from({ length: 400 }, () =>
        rollShopStock(POOL, Math.random).filter((entry) => entry.kind === 'item').length
      )
    )

    expect(counts.size).toBeGreaterThan(1)
    ;[...counts].forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(SHELF_SIZE - 2)
      expect(n).toBeLessThanOrEqual(SHELF_SIZE)
    })
  })

  it('fills every slot it can, whatever mix it draws', () => {
    Array.from({ length: 200 }, () => rollShopStock(POOL, Math.random)).forEach((stock) =>
      expect(stock).toHaveLength(SHELF_SIZE)
    )
  })

  // No size roll any more, so the first random value is a draw rather than a count -
  // a high first roll must not quietly widen the shelf again.
  it('does not spend a roll on the size', () => {
    const low = rollShopStock(POOL, rng(0, 0, 0, 0))
    const high = rollShopStock(POOL, rng(0.99, 0, 0, 0))

    expect(low).toHaveLength(high.length)
  })

  it('never stocks the same item twice', () => {
    Array.from({ length: 300 }, () => rollShopStock(POOL, Math.random)).forEach((stock) => {
      const ids = stock.filter((entry) => entry.kind === 'item').map((entry) => entry.item.id)

      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  it('draws catalogue items only from the pool it was given', () => {
    Array.from({ length: 200 }, () => rollShopStock(POOL, Math.random)).forEach((stock) =>
      stock
        .filter((entry) => entry.kind === 'item')
        .forEach((entry) => expect(POOL.map((slot) => slot.item)).toContain(entry.item))
    )
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

  it('stocks the refills alone when the catalogue pool is empty', () => {
    const stock = rollShopStock([], rng(0, 0))

    expect(stock).toHaveLength(2)
    expect(stock).toContain(HP_REFILL)
    expect(stock).toContain(BOMB_REFILL)
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

  // A catalogue item writes nothing above its price: its icon is on the shelf and says
  // which item it is, so a word there would be repeating the picture. The label used to
  // read `PASSIVE  ?`, from when the shop sold blind.
  it('writes nothing above the price for a catalogue item', () => {
    ITEMS.forEach((item) => expect(shelfLabelFor({ kind: 'item', item })).toBe(''))
  })

  it('no longer labels stock as an unknown', () => {
    ITEMS.forEach((item) => expect(shelfLabelFor({ kind: 'item', item })).not.toContain('?'))
  })

  // The refills are not items: there is nothing to find out, and hiding them would make a
  // puzzle out of the obvious purchase.
  it('keeps the refills named in full', () => {
    expect(shelfLabelFor(HP_REFILL)).toBe(HP_REFILL.name)
    expect(shelfLabelFor(BOMB_REFILL)).toBe(BOMB_REFILL.name)
  })

  it('returns a string for every entry a real shelf can hold', () => {
    Array.from({ length: 100 }, () => rollShopStock(POOL, Math.random)).forEach((stock) =>
      stock.forEach((entry) => expect(typeof shelfLabelFor(entry)).toBe('string'))
    )
  })

  // The identity is on the shelf now; the exact effect is still what the purchase buys.
  it('still never shows a catalogue item effect', () => {
    ITEMS.forEach((item) =>
      expect(shelfLabelFor({ kind: 'item', item })).not.toContain(item.effect)
    )
  })
})

// Why a purchase cannot land, asked without making it land.
//
// This exists because of a **softlock found in play**: a shop holds its doors shut until
// the visit is over, and "over" was read as "nothing here is affordable". Affordable is
// not the same as buyable. A player at full HP, holding exactly the price of an HP Refill
// and not a point more, could not buy the refill (no HP to restore), could not afford
// anything else, and could not leave - the affordable item kept the doors shut and the
// refusal kept the purchase from landing.
//
// So the question the shop has to ask is "is there anything here they could actually
// complete", and both the refusal path and the exit gate now ask it here rather than each
// working it out for itself.
describe('purchaseBlockedReason', () => {
  const at = (health, maxHp, inventory = createInventory()) => ({
    gameState: { inventory },
    health,
    maxHp
  })
  const item = (id) => ({ kind: 'item', item: getItem(id) })

  it('lets an ordinary purchase through', () => {
    expect(purchaseBlockedReason(item('iron_plating'), at(3, 6))).toBe(null)
  })

  it('blocks an HP Refill at full health, and allows it below', () => {
    expect(purchaseBlockedReason({ kind: 'hp_refill' }, at(6, 6))).toBe('already at full HP')
    expect(purchaseBlockedReason({ kind: 'hp_refill' }, at(5, 6))).toBe(null)
  })

  // Bombs stack with no ceiling, so this one can always be bought.
  it('never blocks a bomb refill', () => {
    expect(purchaseBlockedReason({ kind: 'bomb_refill' }, at(6, 6))).toBe(null)
  })

  it('blocks an active already held', () => {
    const inventory = createInventory()
    inventory.actives[0] = getItem('panic_button')

    expect(purchaseBlockedReason(item('panic_button'), at(3, 6, inventory))).toBe('already owned')
  })

  it('blocks a trinket already worn, and allows a different one', () => {
    const inventory = createInventory()
    inventory.trinket = getItem('heavy_vest')

    expect(purchaseBlockedReason(item('heavy_vest'), at(3, 6, inventory))).toBe('already owned')
  })

  it('blocks a new active when the rack is full', () => {
    const inventory = createInventory()
    inventory.actives[0] = getItem('panic_button')
    inventory.actives[1] = getItem('second_wind')
    inventory.actives[2] = getItem('bulwark')

    expect(purchaseBlockedReason(item('repair_kit'), at(3, 6, inventory)))
      .toBe('no room - free a slot first')
  })

  // Passives are uncapped and stack, so owning one is never a reason not to buy another.
  it('never blocks a passive, however many are already held', () => {
    const inventory = createInventory()
    inventory.passives.push(getItem('iron_plating'), getItem('iron_plating'))

    expect(purchaseBlockedReason(item('iron_plating'), at(3, 6, inventory))).toBe(null)
  })

  // The whole point: it changes nothing. shopIsDone asks it about every item on the shelf
  // on the frame it is asked, so an answer that cost the player an item would be a bug
  // that fired every frame.
  it('does not touch the inventory or the health it is asked about', () => {
    const inventory = createInventory()
    inventory.actives[0] = getItem('panic_button')
    const snapshot = JSON.stringify(inventory)
    const state = at(4, 6, inventory)

    purchaseBlockedReason(item('repair_kit'), state)
    purchaseBlockedReason({ kind: 'hp_refill' }, state)
    purchaseBlockedReason(item('iron_plating'), state)

    expect(JSON.stringify(inventory)).toBe(snapshot)
    expect(state.health).toBe(4)
  })
})
