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

  // Passives and actives are both unique: duplicates stack numerically on a passive, and
  // a duplicate active is dead weight because cooldowns are keyed by item id, so both
  // copies would share one timer.
  describe('an item the player already holds', () => {
    test('a duplicate passive is refused and nothing is added', () => {
      const gameState = freshState()
      grantItem(gameState, getItem('iron_plating'))

      const result = grantItem(gameState, getItem('iron_plating'))

      expect(result).toEqual({ success: false, reason: 'owned' })
      expect(gameState.inventory.passives.map((item) => item && item.id)).toEqual([
        'iron_plating',
        null,
        null,
        null
      ])
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
      grantItem(gameState, getItem('iron_plating'))

      const result = grantItem(gameState, getItem('steady_boots'))

      expect(result).toEqual({ success: true, slot: 1 })
    })

    // 'owned' beats 'full': there is no new item to place, so this must not raise the
    // swap prompt that a genuinely full rack does.
    test('a duplicate reports owned rather than full when the rack is full', () => {
      const gameState = freshState()
      grantItem(gameState, getItem('iron_plating'))
      grantItem(gameState, getItem('twitchy_trigger'))
      grantItem(gameState, getItem('steady_boots'))
      gameState.inventory.passives[3] = { id: 'filler', slot: 'passive' }

      expect(grantItem(gameState, getItem('iron_plating'))).toEqual({
        success: false,
        reason: 'owned'
      })
    })
  })
})
