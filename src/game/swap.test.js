import { describe, expect, test } from 'vitest'
import { addActive, addPassive, createInventory } from './inventory.js'
import { getItem } from './items.js'
import { applySwap, needsSwapPrompt, swapOptions } from './swap.js'

const freshState = () => ({ inventory: createInventory() })

describe('needsSwapPrompt', () => {
  test('a full rack needs the prompt', () => {
    expect(needsSwapPrompt({ success: false, reason: 'full' })).toBe(true)
  })

  test('a successful add does not', () => {
    expect(needsSwapPrompt({ success: true, slot: 2 })).toBe(false)
  })

  // Nothing to place, so there is no choice to offer.
  test('an item the player already owns does not', () => {
    expect(needsSwapPrompt({ success: false, reason: 'owned' })).toBe(false)
  })

  test('a reward that carried no item at all does not', () => {
    expect(needsSwapPrompt(null)).toBe(false)
  })
})

describe('swapOptions', () => {
  test('offers the 3 active slots', () => {
    const inventory = createInventory()
    addActive(inventory, getItem('panic_button'))

    const { rack, slots } = swapOptions(inventory)

    expect(rack).toBe('actives')
    expect(slots).toHaveLength(3)
    expect(slots[0].id).toBe('panic_button')
  })

  test('the slots handed back are the live rack, not a copy', () => {
    const inventory = createInventory()

    expect(swapOptions(inventory).slots).toBe(inventory.actives)
  })
})

describe('applySwap', () => {
  test('an active lands in the chosen active slot and returns the displaced one', () => {
    const gameState = freshState()
    addActive(gameState.inventory, getItem('panic_button'))

    const displaced = applySwap(gameState, getItem('second_wind'), 0)

    expect(gameState.inventory.actives[0].id).toBe('second_wind')
    expect(displaced.id).toBe('panic_button')
  })

  test('a swap leaves the uncapped passive list alone', () => {
    const gameState = freshState()
    addPassive(gameState.inventory, getItem('iron_plating'))
    addActive(gameState.inventory, getItem('panic_button'))

    applySwap(gameState, getItem('second_wind'), 0)

    expect(gameState.inventory.passives.map((item) => item.id)).toEqual(['iron_plating'])
  })

  test('swapping into an empty slot displaces nothing', () => {
    const gameState = freshState()

    expect(applySwap(gameState, getItem('second_wind'), 2)).toBeNull()
    expect(gameState.inventory.actives[2].id).toBe('second_wind')
  })
})
