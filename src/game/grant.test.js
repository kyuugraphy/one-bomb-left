import { describe, expect, test } from 'vitest'
import { grantItem } from './grant.js'
import { createInventory } from './inventory.js'
import { getItem } from './items.js'

const freshState = () => ({ inventory: createInventory() })

describe('grantItem', () => {
  test('a passive item joins the uncapped passive list', () => {
    const gameState = freshState()

    const result = grantItem(gameState, getItem('iron_plating'))

    expect(gameState.inventory.passives.map((item) => item.id)).toEqual(['iron_plating'])
    expect(result).toEqual({ success: true })
  })

  test('an active item lands in an active slot', () => {
    const gameState = freshState()

    const result = grantItem(gameState, getItem('panic_button'))

    expect(gameState.inventory.actives[0].id).toBe('panic_button')
    expect(gameState.inventory.passives).toEqual([])
    expect(result).toEqual({ success: true, slot: 0 })
  })

  test('a trinket lands in the trinket slot', () => {
    const gameState = freshState()

    const result = grantItem(gameState, getItem('heavy_vest'))

    expect(gameState.inventory.trinket.id).toBe('heavy_vest')
    expect(result).toEqual({ success: true, displaced: null })
  })

  // One slot, so a second trinket replaces rather than refuses - and the one it pushed
  // out comes back for the scene to drop on the floor.
  test('a second trinket replaces the first and hands it back', () => {
    const gameState = freshState()
    grantItem(gameState, getItem('heavy_vest'))
    gameState.inventory.trinket = { id: 'heavy_vest' }

    const result = grantItem(gameState, { id: 'lucky_coin', slot: 'trinket' })

    expect(gameState.inventory.trinket.id).toBe('lucky_coin')
    expect(result.displaced.id).toBe('heavy_vest')
  })

  // Passives are the one tier that is not unique: duplicates stack in computeStats.
  test('a duplicate passive is allowed and stacks', () => {
    const gameState = freshState()
    grantItem(gameState, getItem('iron_plating'))

    const result = grantItem(gameState, getItem('iron_plating'))

    expect(result).toEqual({ success: true })
    expect(gameState.inventory.passives.map((item) => item.id)).toEqual([
      'iron_plating',
      'iron_plating'
    ])
  })

  test('an active granted into 3 full slots reports full', () => {
    const gameState = freshState()
    gameState.inventory.actives = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(grantItem(gameState, getItem('second_wind'))).toEqual({
      success: false,
      reason: 'full'
    })
  })

  // The unique tiers are the trinket and the actives: a duplicate active is dead weight,
  // because cooldowns are keyed by item id, so both copies would share one timer.
  describe('an item the player already holds', () => {
    test('a duplicate trinket is refused', () => {
      const gameState = freshState()
      grantItem(gameState, getItem('heavy_vest'))

      expect(grantItem(gameState, getItem('heavy_vest'))).toEqual({
        success: false,
        reason: 'owned'
      })
    })

    test('a duplicate active is refused and nothing is added', () => {
      const gameState = freshState()
      grantItem(gameState, getItem('panic_button'))

      const result = grantItem(gameState, getItem('panic_button'))

      expect(result).toEqual({ success: false, reason: 'owned' })
      expect(gameState.inventory.actives.map((item) => item && item.id)).toEqual([
        'panic_button',
        null,
        null
      ])
    })

    test('a different item is still granted normally', () => {
      const gameState = freshState()
      grantItem(gameState, getItem('panic_button'))

      const result = grantItem(gameState, getItem('bulwark'))

      expect(result).toEqual({ success: true, slot: 1 })
    })

    // 'owned' beats 'full': there is no new item to place, so this must not raise the
    // swap prompt that a genuinely full rack does.
    test('a duplicate reports owned rather than full when the rack is full', () => {
      const gameState = freshState()
      grantItem(gameState, getItem('panic_button'))
      grantItem(gameState, getItem('bulwark'))
      grantItem(gameState, getItem('repair_kit'))

      expect(grantItem(gameState, getItem('panic_button'))).toEqual({
        success: false,
        reason: 'owned'
      })
    })
  })
})
