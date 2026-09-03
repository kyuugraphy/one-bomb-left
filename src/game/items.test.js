import { describe, expect, test } from 'vitest'
import {
  ACTIVE_ITEMS,
  DEBUFF_ITEMS,
  ITEMS,
  PASSIVE_ITEMS,
  SET_BONUS,
  TRINKET_ITEMS,
  getItem,
  itemsFrom
} from './items.js'

describe('item data', () => {
  // Actives are unique and capped, so the rack can only fill - and the swap prompt only
  // fire - if the catalogue holds more of them than the rack does. The passive tier is
  // uncapped and stacks, so it has no such floor.
  test('there are enough actives to fill 3 slots and still find another', () => {
    expect(ACTIVE_ITEMS.length).toBeGreaterThanOrEqual(4)
  })

  test('there is at least one trinket to put in the one trinket slot', () => {
    expect(TRINKET_ITEMS.length).toBeGreaterThanOrEqual(1)
  })

  test('the tiers and the debuffs make up the whole catalogue and do not overlap', () => {
    expect(
      TRINKET_ITEMS.length + PASSIVE_ITEMS.length + ACTIVE_ITEMS.length + DEBUFF_ITEMS.length
    ).toBe(ITEMS.length)
  })

  test('the original five items are still in the catalogue', () => {
    const ids = ITEMS.map((item) => item.id)

    expect(ids).toContain('iron_plating')
    expect(ids).toContain('twitchy_trigger')
    expect(ids).toContain('steady_boots')
    expect(ids).toContain('panic_button')
    expect(ids).toContain('second_wind')
  })

  test('every item has a unique id, a name and a source', () => {
    const ids = ITEMS.map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
    ITEMS.forEach((item) => {
      expect(item.name).toBeTruthy()
      expect(['reward', 'treasure', 'debuff']).toContain(item.source)
    })
  })

  test('every item is marked with its own tier', () => {
    TRINKET_ITEMS.forEach((item) => expect(item.slot).toBe('trinket'))
    PASSIVE_ITEMS.forEach((item) => expect(item.slot).toBe('passive'))
    ACTIVE_ITEMS.forEach((item) => expect(item.slot).toBe('active'))
  })

  test('heavy vest is the trinket', () => {
    expect(getItem('heavy_vest').slot).toBe('trinket')
  })

  // The set moved to the active rack with the tier restructure.
  test('the set bonus is a pair of actives', () => {
    SET_BONUS.ids.forEach((id) => expect(getItem(id).slot).toBe('active'))
  })

  test('every active item has a cooldown, and second wind is the longer one', () => {
    const panic = getItem('panic_button')
    const secondWind = getItem('second_wind')

    expect(panic.cooldown).toBeGreaterThan(0)
    expect(secondWind.cooldown).toBeGreaterThan(panic.cooldown)
  })

  test('getItem finds an item by id and returns undefined for an unknown one', () => {
    expect(getItem('steady_boots').name).toBe('Steady Boots')
    expect(getItem('no_such_item')).toBeUndefined()
  })

  test('the treasure pool is a real roll', () => {
    // more than one, so the chest is an actual roll rather than a fixed handout
    expect(itemsFrom('treasure').length).toBeGreaterThanOrEqual(2)
    expect(itemsFrom('treasure').map((item) => item.id)).toContain('steady_boots')
  })

  test('the three sources partition the catalogue with no overlap', () => {
    const reward = itemsFrom('reward').map((item) => item.id)
    const treasure = itemsFrom('treasure').map((item) => item.id)
    const debuff = itemsFrom('debuff').map((item) => item.id)

    expect(reward.length + treasure.length + debuff.length).toBe(ITEMS.length)
    expect(reward.some((id) => treasure.includes(id))).toBe(false)
    expect(debuff.some((id) => reward.includes(id) || treasure.includes(id))).toBe(false)
    expect(reward).toContain('panic_button')
  })
})

// Debuffs are the risky room's payout, so what matters about them as data is that they
// are passives - the one tier that cannot refuse an item or be walked away from - and
// that no other roll can reach them.
describe('debuff items', () => {
  test('there are four of them, matching the design', () => {
    expect(DEBUFF_ITEMS.map((item) => item.id).sort()).toEqual([
      'rusty_grip',
      'slug_step',
      'sluggish',
      'thin_skin'
    ])
  })

  test('every one is a passive, so it can never be declined for want of a slot', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.slot).toBe('passive'))
  })

  test('every one is sourced debuff, so no other pool can draw it', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.source).toBe('debuff'))
    expect(itemsFrom('debuff')).toEqual(DEBUFF_ITEMS)
  })

  test('none of them is in the reward, treasure or shop-facing pools', () => {
    const safe = [...itemsFrom('reward'), ...itemsFrom('treasure')].map((item) => item.id)

    DEBUFF_ITEMS.forEach((item) => expect(safe).not.toContain(item.id))
  })

  // Each one has to actually do something, and the fields are what computeStats reads.
  test('each one carries the field that makes it hurt', () => {
    expect(getItem('rusty_grip').fireRateMultiplier).toBeLessThan(1)
    expect(getItem('sluggish').moveSpeedMultiplier).toBeLessThan(1)
    expect(getItem('thin_skin').maxHpBonus).toBeLessThan(0)
    expect(getItem('slug_step').spawnsSlug).toBe(true)
  })

  test('none of them is secretly a buff', () => {
    DEBUFF_ITEMS.forEach((item) => {
      expect(item.maxHpBonus ?? 0).toBeLessThanOrEqual(0)
      expect(item.damageBonus ?? 0).toBeLessThanOrEqual(0)
      expect(item.moveSpeedMultiplier ?? 1).toBeLessThanOrEqual(1)
      expect(item.fireRateMultiplier ?? 1).toBeLessThanOrEqual(1)
      expect(item.fireCooldownBonus ?? 0).toBeGreaterThanOrEqual(0)
    })
  })

  test('none of them carries a cooldown, so nothing treats one as an active', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.cooldown).toBeUndefined())
  })
})
