import { describe, expect, it } from 'vitest'
import {
  addActive,
  addPassive,
  countOwned,
  createInventory,
  hasSetBonus,
  passiveCounts,
  setTrinket,
  swapActive
} from './inventory.js'

describe('createInventory', () => {
  it('starts with an empty trinket slot', () => {
    expect(createInventory().trinket).toBe(null)
  })

  it('starts with no passives at all', () => {
    expect(createInventory().passives).toEqual([])
  })

  it('starts with three empty active slots', () => {
    expect(createInventory().actives).toEqual([null, null, null])
  })

  it('hands out a fresh object each call', () => {
    const first = createInventory()
    first.passives.push({ id: 'a' })

    expect(createInventory().passives).toEqual([])
  })
})

describe('setTrinket', () => {
  it('puts a trinket in the empty slot', () => {
    const inventory = createInventory()
    setTrinket(inventory, { id: 'heavy_vest' })

    expect(inventory.trinket).toEqual({ id: 'heavy_vest' })
  })

  it('returns null when the slot was empty', () => {
    expect(setTrinket(createInventory(), { id: 'heavy_vest' })).toBe(null)
  })

  it('replaces the trinket that was there', () => {
    const inventory = createInventory()
    setTrinket(inventory, { id: 'heavy_vest' })
    setTrinket(inventory, { id: 'lucky_coin' })

    expect(inventory.trinket).toEqual({ id: 'lucky_coin' })
  })

  it('hands back the trinket it displaced', () => {
    const inventory = createInventory()
    setTrinket(inventory, { id: 'heavy_vest' })

    expect(setTrinket(inventory, { id: 'lucky_coin' })).toEqual({ id: 'heavy_vest' })
  })
})

describe('addPassive', () => {
  it('pushes the passive onto the list', () => {
    const inventory = createInventory()
    addPassive(inventory, { id: 'sharp_rounds' })

    expect(inventory.passives).toEqual([{ id: 'sharp_rounds' }])
  })

  it('keeps them in the order they were picked up', () => {
    const inventory = createInventory()
    addPassive(inventory, { id: 'sharp_rounds' })
    addPassive(inventory, { id: 'steady_boots' })

    expect(inventory.passives.map((item) => item.id)).toEqual(['sharp_rounds', 'steady_boots'])
  })

  it('allows duplicates - they are meant to stack', () => {
    const inventory = createInventory()
    addPassive(inventory, { id: 'sharp_rounds' })
    addPassive(inventory, { id: 'sharp_rounds' })

    expect(inventory.passives).toHaveLength(2)
  })

  it('never runs out of room', () => {
    const inventory = createInventory()

    for (let i = 0; i < 50; i++) {
      expect(addPassive(inventory, { id: 'sharp_rounds' })).toEqual({ success: true })
    }

    expect(inventory.passives).toHaveLength(50)
  })
})

describe('addActive', () => {
  it('fills the first empty slot', () => {
    const inventory = createInventory()

    expect(addActive(inventory, { id: 'bulwark' })).toEqual({ success: true, slot: 0 })
    expect(inventory.actives[0]).toEqual({ id: 'bulwark' })
  })

  it('reuses a gap left by a swap rather than appending', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })
    addActive(inventory, { id: 'repair_kit' })
    inventory.actives[0] = null

    expect(addActive(inventory, { id: 'panic_button' })).toEqual({ success: true, slot: 0 })
  })

  it('refuses once all three slots are taken', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })
    addActive(inventory, { id: 'repair_kit' })
    addActive(inventory, { id: 'panic_button' })

    expect(addActive(inventory, { id: 'second_wind' })).toEqual({
      success: false,
      reason: 'full'
    })
  })

  it('mutates nothing when it refuses', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })
    addActive(inventory, { id: 'repair_kit' })
    addActive(inventory, { id: 'panic_button' })
    addActive(inventory, { id: 'second_wind' })

    expect(inventory.actives.map((item) => item.id)).toEqual([
      'bulwark',
      'repair_kit',
      'panic_button'
    ])
  })
})

describe('swapActive', () => {
  it('overwrites the slot it is pointed at', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })
    swapActive(inventory, 0, { id: 'repair_kit' })

    expect(inventory.actives[0]).toEqual({ id: 'repair_kit' })
  })

  it('returns the active it displaced', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })

    expect(swapActive(inventory, 0, { id: 'repair_kit' })).toEqual({ id: 'bulwark' })
  })

  it('returns null when the slot was empty', () => {
    expect(swapActive(createInventory(), 2, { id: 'repair_kit' })).toBe(null)
  })

  it('leaves the other slots alone', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })
    addActive(inventory, { id: 'repair_kit' })
    swapActive(inventory, 1, { id: 'panic_button' })

    expect(inventory.actives[0]).toEqual({ id: 'bulwark' })
    expect(inventory.actives[2]).toBe(null)
  })
})

describe('countOwned', () => {
  it('counts none when the passive was never picked up', () => {
    expect(countOwned(createInventory(), 'sharp_rounds')).toBe(0)
  })

  it('counts a single copy', () => {
    const inventory = createInventory()
    addPassive(inventory, { id: 'sharp_rounds' })

    expect(countOwned(inventory, 'sharp_rounds')).toBe(1)
  })

  it('counts every copy of a stacked passive', () => {
    const inventory = createInventory()
    addPassive(inventory, { id: 'sharp_rounds' })
    addPassive(inventory, { id: 'sharp_rounds' })
    addPassive(inventory, { id: 'sharp_rounds' })

    expect(countOwned(inventory, 'sharp_rounds')).toBe(3)
  })

  it('does not count a different passive', () => {
    const inventory = createInventory()
    addPassive(inventory, { id: 'steady_boots' })
    addPassive(inventory, { id: 'sharp_rounds' })

    expect(countOwned(inventory, 'sharp_rounds')).toBe(1)
  })

  it('counts an equipped active as owned', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })

    expect(countOwned(inventory, 'bulwark')).toBe(1)
  })

  it('counts the worn trinket as owned', () => {
    const inventory = createInventory()
    setTrinket(inventory, { id: 'heavy_vest' })

    expect(countOwned(inventory, 'heavy_vest')).toBe(1)
  })
})

describe('hasSetBonus', () => {
  it('holds when both actives are equipped', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'panic_button' })
    addActive(inventory, { id: 'bulwark' })

    expect(hasSetBonus(inventory, 'panic_button', 'bulwark')).toBe(true)
  })

  it('holds whichever order they were equipped in', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'bulwark' })
    addActive(inventory, { id: 'panic_button' })

    expect(hasSetBonus(inventory, 'panic_button', 'bulwark')).toBe(true)
  })

  it('breaks when one of the pair is missing', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'panic_button' })

    expect(hasSetBonus(inventory, 'panic_button', 'bulwark')).toBe(false)
  })

  it('breaks when the pair is swapped out', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'panic_button' })
    addActive(inventory, { id: 'bulwark' })
    swapActive(inventory, 1, { id: 'repair_kit' })

    expect(hasSetBonus(inventory, 'panic_button', 'bulwark')).toBe(false)
  })

  it('is actives-only - a passive with the same id does not count', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'panic_button' })
    addPassive(inventory, { id: 'bulwark' })

    expect(hasSetBonus(inventory, 'panic_button', 'bulwark')).toBe(false)
  })

  it('does not count the trinket either', () => {
    const inventory = createInventory()
    addActive(inventory, { id: 'panic_button' })
    setTrinket(inventory, { id: 'bulwark' })

    expect(hasSetBonus(inventory, 'panic_button', 'bulwark')).toBe(false)
  })
})

describe('passiveCounts', () => {
  const iron = { id: 'iron_plating', name: 'Iron Plating' }
  const sharp = { id: 'sharp_rounds', name: 'Sharp Rounds' }

  it('counts nothing on an empty list', () => {
    expect(passiveCounts(createInventory())).toEqual([])
  })

  it('reports a single passive once', () => {
    const inventory = createInventory()
    addPassive(inventory, iron)

    expect(passiveCounts(inventory)).toEqual([{ item: iron, count: 1 }])
  })

  it('folds stacked copies into one row with a count', () => {
    const inventory = createInventory()
    addPassive(inventory, sharp)
    addPassive(inventory, sharp)
    addPassive(inventory, sharp)

    expect(passiveCounts(inventory)).toEqual([{ item: sharp, count: 3 }])
  })

  it('keeps the order the passives were first picked up in', () => {
    const inventory = createInventory()
    addPassive(inventory, sharp)
    addPassive(inventory, iron)
    addPassive(inventory, sharp)

    expect(passiveCounts(inventory)).toEqual([
      { item: sharp, count: 2 },
      { item: iron, count: 1 }
    ])
  })

  it('ignores the trinket and the actives - the passive tier only', () => {
    const inventory = createInventory()
    setTrinket(inventory, iron)
    addActive(inventory, sharp)

    expect(passiveCounts(inventory)).toEqual([])
  })
})
