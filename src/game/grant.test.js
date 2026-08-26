import { describe, expect, test } from 'vitest'
import { grantItem } from './grant.js'
import { createInventory } from './inventory.js'
import { getItem } from './items.js'

const freshState = () => ({ inventory: createInventory() })

describe('grantItem', () => {
  test('a passive item lands in a passive slot', () => {
    const gameState = freshState()

    const result = grantItem(gameState, getItem('iron_plating'))

    expect(gameState.inventory.passives[0].id).toBe('iron_plating')
    expect(result).toEqual({ success: true, slot: 0 })
  })

  test('an active item lands in an active slot', () => {
    const gameState = freshState()

    const result = grantItem(gameState, getItem('panic_button'))

    expect(gameState.inventory.actives[0].id).toBe('panic_button')
    expect(gameState.inventory.passives).toEqual([null, null, null, null])
    expect(result).toEqual({ success: true, slot: 0 })
  })

  test('a passive granted into 4 full slots reports full and adds nothing', () => {
    const gameState = freshState()
    gameState.inventory.passives = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    const result = grantItem(gameState, getItem('iron_plating'))

    expect(result).toEqual({ success: false, reason: 'full' })
    expect(gameState.inventory.passives.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('an active granted into 3 full slots reports full', () => {
    const gameState = freshState()
    gameState.inventory.actives = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(grantItem(gameState, getItem('second_wind'))).toEqual({
      success: false,
      reason: 'full'
    })
  })
})
