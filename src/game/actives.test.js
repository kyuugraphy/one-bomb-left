import { describe, expect, test } from 'vitest'
import { cooldownRemaining, triggerActive } from './actives.js'
import { createInventory } from './inventory.js'
import { getItem } from './items.js'

const withActive = (id, slot = 0) => {
  const inventory = createInventory()
  inventory.actives[slot] = getItem(id)
  return inventory
}

describe('triggerActive', () => {
  test('triggering an empty slot fires nothing', () => {
    const result = triggerActive(createInventory(), 0, 0, {})

    expect(result).toEqual({ fired: false, reason: 'empty' })
  })

  test('a fresh active fires and reports which item it was', () => {
    const result = triggerActive(withActive('panic_button'), 0, 1000, {})

    expect(result.fired).toBe(true)
    expect(result.item.id).toBe('panic_button')
  })

  test('firing puts the item on cooldown for its own duration', () => {
    const cooldowns = {}

    triggerActive(withActive('panic_button'), 0, 1000, cooldowns)

    expect(cooldowns.panic_button).toBe(1000 + getItem('panic_button').cooldown)
  })

  test('firing again before the cooldown expires is refused', () => {
    const inventory = withActive('panic_button')
    const cooldowns = {}

    triggerActive(inventory, 0, 1000, cooldowns)
    const result = triggerActive(inventory, 0, 1000 + 11999, cooldowns)

    expect(result.fired).toBe(false)
    expect(result.reason).toBe('cooling')
  })

  test('a refused trigger does not extend the cooldown', () => {
    const inventory = withActive('panic_button')
    const cooldowns = {}

    triggerActive(inventory, 0, 1000, cooldowns)
    triggerActive(inventory, 0, 5000, cooldowns)

    expect(cooldowns.panic_button).toBe(13000)
  })

  test('the item fires again once its cooldown has run out', () => {
    const inventory = withActive('panic_button')
    const cooldowns = {}

    triggerActive(inventory, 0, 1000, cooldowns)
    const result = triggerActive(inventory, 0, 13000, cooldowns)

    expect(result.fired).toBe(true)
  })

  test('each active item cools down on its own clock', () => {
    const inventory = createInventory()
    inventory.actives[0] = getItem('panic_button')
    inventory.actives[1] = getItem('second_wind')
    const cooldowns = {}

    triggerActive(inventory, 0, 1000, cooldowns)
    const secondWind = triggerActive(inventory, 1, 1000, cooldowns)

    expect(secondWind.fired).toBe(true)
    expect(cooldowns.panic_button).toBe(13000)
    expect(cooldowns.second_wind).toBe(31000)
  })
})

describe('cooldownRemaining', () => {
  test('an item that has never fired is ready now', () => {
    expect(cooldownRemaining(getItem('panic_button'), 5000, {})).toBe(0)
  })

  test('a cooling item reports the milliseconds left', () => {
    expect(cooldownRemaining(getItem('panic_button'), 5000, { panic_button: 13000 })).toBe(8000)
  })

  test('a lapsed cooldown reports 0 rather than a negative', () => {
    expect(cooldownRemaining(getItem('panic_button'), 20000, { panic_button: 13000 })).toBe(0)
  })
})
