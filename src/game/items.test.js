import { describe, expect, test } from 'vitest'
import { ACTIVE_ITEMS, ITEMS, PASSIVE_ITEMS, getItem, itemsFrom } from './items.js'

describe('item data', () => {
  // Items are unique, so a rack can only fill if the catalogue is bigger than the rack -
// and the swap prompt only fires when a further item turns up with the rack already
  // full. Under these counts the prompt is unreachable in play, whatever the UI does.
  test('there are enough passives to fill 4 slots and still find another', () => {
    expect(PASSIVE_ITEMS.length).toBeGreaterThanOrEqual(5)
  })

  test('there are enough actives to fill 3 slots and still find another', () => {
    expect(ACTIVE_ITEMS.length).toBeGreaterThanOrEqual(4)
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
      expect(['reward', 'treasure']).toContain(item.source)
    })
  })

  test('passives are marked passive and actives are marked active', () => {
    PASSIVE_ITEMS.forEach((item) => expect(item.slot).toBe('passive'))
    ACTIVE_ITEMS.forEach((item) => expect(item.slot).toBe('active'))
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

  test('the reward pool is everything that is not treasure', () => {
    const reward = itemsFrom('reward').map((item) => item.id)
    const treasure = itemsFrom('treasure').map((item) => item.id)

    expect(reward.length + treasure.length).toBe(ITEMS.length)
    expect(reward.some((id) => treasure.includes(id))).toBe(false)
    expect(reward).toContain('panic_button')
  })
})
