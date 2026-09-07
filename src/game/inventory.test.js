import { describe, expect, it } from 'vitest'
import {
  addActive,
  addActiveToRack,
  addPassive,
  addTrinket,
  countOwned,
  createInventory,
  createRack,
  freeSlotCount,
  hasSetBonus,
  passiveCounts,
  setTrinket,
  swapActive,
  swapActiveInRack
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

// The 6-slot shared rack, which trinkets and the one held active are both paid for out
// of. Nothing in the game reads it yet - these tests are the only thing exercising it, so
// they carry the whole contract.
describe('createRack', () => {
  it('starts with six empty slots', () => {
    expect(createRack().slots).toEqual([null, null, null, null, null, null])
  })

  it('starts with no active held', () => {
    expect(createRack().active).toBe(null)
  })

  it('hands out a fresh rack each call', () => {
    const first = createRack()
    first.slots[0] = { id: 'heavy_vest' }

    expect(createRack().slots[0]).toBe(null)
  })
})

describe('addTrinket', () => {
  const vest = { id: 'heavy_vest' }

  it('fills the first empty slot', () => {
    const rack = createRack()

    expect(addTrinket(rack, vest)).toEqual({ success: true })
    expect(rack.slots[0]).toBe(vest)
  })

  it('costs exactly one slot', () => {
    const rack = createRack()
    addTrinket(rack, vest)

    expect(freeSlotCount(rack)).toBe(5)
  })

  // Trinkets are unique by id, so a second copy is refused rather than given its own
  // slot. This test used to assert the opposite - it was written before the rule existed.
  it('refuses a second copy of the same id', () => {
    const rack = createRack()
    addTrinket(rack, vest)

    expect(addTrinket(rack, vest)).toEqual({ success: false, reason: 'duplicate' })
  })

  it('adds no second copy when it refuses a duplicate', () => {
    const rack = createRack()
    addTrinket(rack, vest)
    addTrinket(rack, vest)

    expect(rack.slots).toEqual([vest, null, null, null, null, null])
    expect(freeSlotCount(rack)).toBe(5)
  })

  it('refuses a distinct object carrying an id already held', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })

    expect(addTrinket(rack, { id: 'heavy_vest' })).toEqual({
      success: false,
      reason: 'duplicate'
    })
  })

  it('lets two different trinket ids sit side by side', () => {
    const rack = createRack()
    const coin = { id: 'lucky_coin' }

    expect(addTrinket(rack, vest)).toEqual({ success: true })
    expect(addTrinket(rack, coin)).toEqual({ success: true })
    expect(rack.slots.slice(0, 2)).toEqual([vest, coin])
    expect(freeSlotCount(rack)).toBe(4)
  })

  // Duplicate is the more specific reason, so it wins over 'full' - the same precedence
  // addActiveToRack gives 'active-held' over 'no-space'.
  it('says duplicate rather than full when both would apply', () => {
    const rack = createRack()
    addTrinket(rack, vest)
    for (let i = 0; i < 5; i++) {
      addTrinket(rack, { id: 'trinket_' + i })
    }

    expect(freeSlotCount(rack)).toBe(0)
    expect(addTrinket(rack, vest)).toEqual({ success: false, reason: 'duplicate' })
  })

  // An active pays for its slots with its own reference in each, so those slots hold an
  // id like any other. A trinket sharing an id with the held active is a duplicate.
  it('counts the slots an active is paying for when looking for the id', () => {
    const rack = createRack()
    addActiveToRack(rack, { id: 'bulwark', rank: 2 })

    expect(addTrinket(rack, { id: 'bulwark' })).toEqual({
      success: false,
      reason: 'duplicate'
    })
  })

  it('reuses a gap rather than appending', () => {
    const rack = createRack()
    addTrinket(rack, vest)
    addTrinket(rack, { id: 'lucky_coin' })
    rack.slots[0] = null

    addTrinket(rack, { id: 'glass_eye' })

    expect(rack.slots[0]).toEqual({ id: 'glass_eye' })
  })

  it('takes six trinkets and then refuses', () => {
    const rack = createRack()

    for (let i = 0; i < 6; i++) {
      expect(addTrinket(rack, { id: 'trinket_' + i })).toEqual({ success: true })
    }

    expect(freeSlotCount(rack)).toBe(0)
    expect(addTrinket(rack, { id: 'one_too_many' })).toEqual({ success: false, reason: 'full' })
  })

  it('mutates nothing when it refuses', () => {
    const rack = createRack()

    for (let i = 0; i < 6; i++) {
      addTrinket(rack, { id: 'trinket_' + i })
    }
    addTrinket(rack, { id: 'one_too_many' })

    expect(rack.slots.map((item) => item.id)).toEqual([
      'trinket_0',
      'trinket_1',
      'trinket_2',
      'trinket_3',
      'trinket_4',
      'trinket_5'
    ])
  })
})

describe('addActiveToRack', () => {
  const bulwark = { id: 'bulwark', rank: 1 }
  const secondWind = { id: 'second_wind', rank: 2 }
  const repairKit = { id: 'repair_kit', rank: 4 }

  it('holds the active it was given', () => {
    const rack = createRack()

    expect(addActiveToRack(rack, bulwark)).toEqual({ success: true })
    expect(rack.active).toBe(bulwark)
  })

  it('pays rank 1 out of one slot', () => {
    const rack = createRack()
    addActiveToRack(rack, bulwark)

    expect(rack.slots).toEqual([bulwark, null, null, null, null, null])
  })

  it('pays rank 2 out of two slots', () => {
    const rack = createRack()
    addActiveToRack(rack, secondWind)

    expect(rack.slots).toEqual([secondWind, secondWind, null, null, null, null])
    expect(freeSlotCount(rack)).toBe(4)
  })

  it('pays rank 4 out of four slots', () => {
    const rack = createRack()
    addActiveToRack(rack, repairKit)

    expect(freeSlotCount(rack)).toBe(2)
    expect(rack.slots.filter((slot) => slot === repairKit)).toHaveLength(4)
  })

  it('takes the free slots wherever they are, not only contiguous ones', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    rack.slots[0] = null

    addActiveToRack(rack, secondWind)

    expect(rack.slots[0]).toBe(secondWind)
    expect(rack.slots[1]).toEqual({ id: 'lucky_coin' })
    expect(rack.slots[2]).toBe(secondWind)
  })

  it('refuses a second active while one is held', () => {
    const rack = createRack()
    addActiveToRack(rack, bulwark)

    expect(addActiveToRack(rack, secondWind)).toEqual({
      success: false,
      reason: 'active-held'
    })
  })

  it('says active-held even when there is also no room, being the more specific reason', () => {
    const rack = createRack()
    addActiveToRack(rack, repairKit)
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })

    expect(freeSlotCount(rack)).toBe(0)
    expect(addActiveToRack(rack, bulwark)).toEqual({ success: false, reason: 'active-held' })
  })

  it('refuses when the trinkets have left too few slots for the rank', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addTrinket(rack, { id: 'glass_eye' })

    expect(freeSlotCount(rack)).toBe(3)
    expect(addActiveToRack(rack, repairKit)).toEqual({ success: false, reason: 'no-space' })
  })

  it('takes a rank that exactly fills what is left', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })

    expect(addActiveToRack(rack, repairKit)).toEqual({ success: true })
    expect(freeSlotCount(rack)).toBe(0)
  })

  it('mutates nothing when it refuses for want of space', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addTrinket(rack, { id: 'glass_eye' })
    addActiveToRack(rack, repairKit)

    expect(rack.active).toBe(null)
    expect(freeSlotCount(rack)).toBe(3)
  })
})

describe('swapActiveInRack', () => {
  const bulwark = { id: 'bulwark', rank: 1 }
  const secondWind = { id: 'second_wind', rank: 2 }
  const repairKit = { id: 'repair_kit', rank: 4 }

  it('holds the new active instead of the old one', () => {
    const rack = createRack()
    addActiveToRack(rack, bulwark)

    expect(swapActiveInRack(rack, secondWind)).toEqual({ success: true })
    expect(rack.active).toBe(secondWind)
  })

  it('releases every slot the old active held', () => {
    const rack = createRack()
    addActiveToRack(rack, repairKit)
    swapActiveInRack(rack, bulwark)

    expect(rack.slots.filter((slot) => slot === repairKit)).toHaveLength(0)
    expect(freeSlotCount(rack)).toBe(5)
  })

  it('pays for the new active out of the slots the old one freed', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addActiveToRack(rack, secondWind)

    expect(freeSlotCount(rack)).toBe(2)
    expect(swapActiveInRack(rack, repairKit)).toEqual({ success: true })
    expect(rack.slots.filter((slot) => slot === repairKit)).toHaveLength(4)
    expect(freeSlotCount(rack)).toBe(0)
  })

  it('leaves the trinkets where they were', () => {
    const rack = createRack()
    const vest = { id: 'heavy_vest' }
    addTrinket(rack, vest)
    addActiveToRack(rack, secondWind)
    swapActiveInRack(rack, bulwark)

    expect(rack.slots[0]).toBe(vest)
  })

  // The edge case: freeing a rank 1 does not pay for a rank 4 when trinkets hold the
  // rest. The old active is gone either way, so the player ends up holding none.
  it('fails when even the freed slots are not enough', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addTrinket(rack, { id: 'glass_eye' })
    addActiveToRack(rack, bulwark)

    expect(swapActiveInRack(rack, repairKit)).toEqual({
      success: false,
      reason: 'no-space',
      freedOldActive: true
    })
  })

  it('leaves no active held after that failure, and the old one gone', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addTrinket(rack, { id: 'glass_eye' })
    addActiveToRack(rack, bulwark)
    swapActiveInRack(rack, repairKit)

    expect(rack.active).toBe(null)
    expect(rack.slots.filter((slot) => slot === bulwark)).toHaveLength(0)
    expect(rack.slots.filter((slot) => slot === repairKit)).toHaveLength(0)
  })

  it('leaves the freed slots free, so the next add can use them', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addTrinket(rack, { id: 'glass_eye' })
    addActiveToRack(rack, bulwark)
    swapActiveInRack(rack, repairKit)

    expect(freeSlotCount(rack)).toBe(3)
    expect(addActiveToRack(rack, secondWind)).toEqual({ success: true })
  })

  // Not a case the game reaches - the swap prompt only opens on a refusal from
  // addActiveToRack, which means one is held - but silence here would let a stray call
  // become a second way into placement.
  it('refuses outright when no active is held', () => {
    const rack = createRack()

    expect(swapActiveInRack(rack, bulwark)).toEqual({ success: false, reason: 'no-active' })
    expect(rack.active).toBe(null)
    expect(freeSlotCount(rack)).toBe(6)
  })
})

describe('freeSlotCount', () => {
  it('counts all six on a fresh rack', () => {
    expect(freeSlotCount(createRack())).toBe(6)
  })

  it('drops by one per trinket', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })

    expect(freeSlotCount(rack)).toBe(4)
  })

  it('drops by the rank of the held active', () => {
    const rack = createRack()
    addActiveToRack(rack, { id: 'repair_kit', rank: 4 })

    expect(freeSlotCount(rack)).toBe(2)
  })

  it('counts nothing free when trinkets and an active fill it', () => {
    const rack = createRack()
    addTrinket(rack, { id: 'heavy_vest' })
    addTrinket(rack, { id: 'lucky_coin' })
    addActiveToRack(rack, { id: 'repair_kit', rank: 4 })

    expect(freeSlotCount(rack)).toBe(0)
  })

  it('goes back up when an active is released', () => {
    const rack = createRack()
    addActiveToRack(rack, { id: 'repair_kit', rank: 4 })
    swapActiveInRack(rack, { id: 'bulwark', rank: 1 })

    expect(freeSlotCount(rack)).toBe(5)
  })
})
