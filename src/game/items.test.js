import { describe, expect, test } from 'vitest'
import { ACTIVE_ITEMS, ITEMS, PASSIVE_ITEMS, getItem, itemsFrom } from './items.js'

describe('item data', () => {
  test('there are 3 passive items and 3 active slots worth of nothing yet', () => {
    expect(PASSIVE_ITEMS.map((item) => item.id)).toEqual([
      'iron_plating',
      'twitchy_trigger',
      'steady_boots'
    ])
  })

  test('there are 2 active items', () => {
    expect(ACTIVE_ITEMS.map((item) => item.id)).toEqual(['panic_button', 'second_wind'])
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

  test('steady boots is the only treasure item', () => {
    expect(itemsFrom('treasure').map((item) => item.id)).toEqual(['steady_boots'])
  })

  test('the reward pool is everything else', () => {
    expect(itemsFrom('reward').map((item) => item.id)).toEqual([
      'iron_plating',
      'twitchy_trigger',
      'panic_button',
      'second_wind'
    ])
  })
})
