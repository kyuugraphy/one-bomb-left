import { describe, expect, test } from 'vitest'
import {
  addActive,
  addPassive,
  createInventory,
  hasItem,
  hasSetBonus,
  swapActive,
  swapPassive
} from './inventory.js'
import { getItem } from './items.js'

describe('createInventory', () => {
  test('a new inventory has 4 empty passive slots', () => {
    const inventory = createInventory()

    expect(inventory.passives).toEqual([null, null, null, null])
  })

  test('a new inventory has 3 empty active slots', () => {
    const inventory = createInventory()

    expect(inventory.actives).toEqual([null, null, null])
  })
})

describe('addPassive', () => {
  test('an item goes into the first empty passive slot', () => {
    const inventory = createInventory()

    const result = addPassive(inventory, { id: 'thorns' })

    expect(inventory.passives[0]).toEqual({ id: 'thorns' })
    expect(result).toEqual({ success: true, slot: 0 })
  })

  test('a second item goes into the slot after the first', () => {
    const inventory = createInventory()

    addPassive(inventory, { id: 'thorns' })
    const result = addPassive(inventory, { id: 'boots' })

    expect(inventory.passives[1]).toEqual({ id: 'boots' })
    expect(result).toEqual({ success: true, slot: 1 })
  })

  test('an item fills a gap left by an earlier slot', () => {
    const inventory = createInventory()
    inventory.passives = [null, { id: 'boots' }, null, null]

    const result = addPassive(inventory, { id: 'thorns' })

    expect(inventory.passives[0]).toEqual({ id: 'thorns' })
    expect(result).toEqual({ success: true, slot: 0 })
  })

  test('adding to 4 full passive slots reports full and changes nothing', () => {
    const inventory = createInventory()
    const full = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    inventory.passives = [...full]

    const result = addPassive(inventory, { id: 'e' })

    expect(result).toEqual({ success: false, reason: 'full' })
    expect(inventory.passives).toEqual(full)
  })
})

describe('addActive', () => {
  test('an item goes into the first empty active slot', () => {
    const inventory = createInventory()

    const result = addActive(inventory, { id: 'dash' })

    expect(inventory.actives[0]).toEqual({ id: 'dash' })
    expect(result).toEqual({ success: true, slot: 0 })
  })

  test('adding to 3 full active slots reports full and changes nothing', () => {
    const inventory = createInventory()
    const full = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    inventory.actives = [...full]

    const result = addActive(inventory, { id: 'd' })

    expect(result).toEqual({ success: false, reason: 'full' })
    expect(inventory.actives).toEqual(full)
  })

  test('adding an active leaves the passive slots untouched', () => {
    const inventory = createInventory()

    addActive(inventory, { id: 'dash' })

    expect(inventory.passives).toEqual([null, null, null, null])
  })
})

describe('swapPassive', () => {
  test('the new item takes the slot', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'thorns' }, null, null, null]

    swapPassive(inventory, 0, { id: 'boots' })

    expect(inventory.passives[0]).toEqual({ id: 'boots' })
  })

  test('the item that was in the slot is returned', () => {
    const inventory = createInventory()
    inventory.passives = [null, { id: 'thorns' }, null, null]

    const dropped = swapPassive(inventory, 1, { id: 'boots' })

    expect(dropped).toEqual({ id: 'thorns' })
  })

  test('swapping into an empty slot returns null', () => {
    const inventory = createInventory()

    const dropped = swapPassive(inventory, 2, { id: 'boots' })

    expect(dropped).toBeNull()
    expect(inventory.passives[2]).toEqual({ id: 'boots' })
  })

  test('the other passive slots are left alone', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    swapPassive(inventory, 2, { id: 'e' })

    expect(inventory.passives).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'e' }, { id: 'd' }])
  })
})

describe('swapActive', () => {
  test('the new item takes the slot and the old one is returned', () => {
    const inventory = createInventory()
    inventory.actives = [null, { id: 'dash' }, null]

    const dropped = swapActive(inventory, 1, { id: 'shield' })

    expect(inventory.actives[1]).toEqual({ id: 'shield' })
    expect(dropped).toEqual({ id: 'dash' })
  })

  test('swapping an active leaves the passive slots untouched', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'thorns' }, null, null, null]

    swapActive(inventory, 0, { id: 'shield' })

    expect(inventory.passives).toEqual([{ id: 'thorns' }, null, null, null])
  })
})

describe('hasSetBonus', () => {
  test('both ids present in passives is a set bonus', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'thorns' }, null, { id: 'boots' }, null]

    expect(hasSetBonus(inventory, 'thorns', 'boots')).toBe(true)
  })

  test('the id order does not matter', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'thorns' }, null, { id: 'boots' }, null]

    expect(hasSetBonus(inventory, 'boots', 'thorns')).toBe(true)
  })

  test('only one of the two ids present is no set bonus', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'thorns' }, null, null, null]

    expect(hasSetBonus(inventory, 'thorns', 'boots')).toBe(false)
  })

  test('an empty inventory has no set bonus', () => {
    const inventory = createInventory()

    expect(hasSetBonus(inventory, 'thorns', 'boots')).toBe(false)
  })

  test('an id held in an active slot does not count', () => {
    const inventory = createInventory()
    inventory.passives = [{ id: 'thorns' }, null, null, null]
    inventory.actives = [{ id: 'boots' }, null, null]

    expect(hasSetBonus(inventory, 'thorns', 'boots')).toBe(false)
  })
})

describe('hasItem', () => {
  test('an empty inventory holds nothing', () => {
    expect(hasItem(createInventory(), 'iron_plating')).toBe(false)
  })

  test('a passive in the rack is held', () => {
    const inventory = createInventory()
    addPassive(inventory, getItem('iron_plating'))

    expect(hasItem(inventory, 'iron_plating')).toBe(true)
  })

  test('an active in the rack is held', () => {
    const inventory = createInventory()
    addActive(inventory, getItem('panic_button'))

    expect(hasItem(inventory, 'panic_button')).toBe(true)
  })

  test('an item the player does not carry is not held', () => {
    const inventory = createInventory()
    addPassive(inventory, getItem('iron_plating'))

    expect(hasItem(inventory, 'steady_boots')).toBe(false)
  })

  test('an item swapped out is no longer held', () => {
    const inventory = createInventory()
    addPassive(inventory, getItem('iron_plating'))
    swapPassive(inventory, 0, getItem('steady_boots'))

    expect(hasItem(inventory, 'iron_plating')).toBe(false)
    expect(hasItem(inventory, 'steady_boots')).toBe(true)
  })
})
