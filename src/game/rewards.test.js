import { describe, expect, test } from 'vitest'
import { createInventory } from './inventory.js'
import { getItem } from './items.js'
import { skipReward, takeReward } from './rewards.js'

const freshState = () => ({ riskLevel: 0, enemyStrength: 0, rewardsCollected: 0 })

describe('skipReward', () => {
  test('skipping a clean reward changes nothing', () => {
    const gameState = freshState()

    skipReward(gameState, { isCursed: false })

    expect(gameState).toEqual(freshState())
  })

  test('skipping a cursed reward changes nothing', () => {
    const gameState = freshState()

    skipReward(gameState, { isCursed: true })

    expect(gameState).toEqual(freshState())
  })
})

describe('takeReward', () => {
  test('taking a clean reward collects it without applying a curse', () => {
    const gameState = freshState()

    takeReward(gameState, { isCursed: false }, () => 0.1)

    expect(gameState).toEqual({ ...freshState(), rewardsCollected: 1 })
  })

  test("a low random value curses a cursed reward with 'risk'", () => {
    const gameState = freshState()

    takeReward(gameState, { isCursed: true }, () => 0.1)

    expect(gameState).toEqual({ ...freshState(), rewardsCollected: 1, riskLevel: 1 })
  })

  test("a high random value curses a cursed reward with 'enemy'", () => {
    const gameState = freshState()

    takeReward(gameState, { isCursed: true }, () => 0.9)

    expect(gameState).toEqual({ ...freshState(), rewardsCollected: 1, enemyStrength: 1 })
  })
})

describe('takeReward with an item attached', () => {
  const itemState = () => ({ ...freshState(), inventory: createInventory() })

  test('taking a reward grants its item', () => {
    const gameState = itemState()

    takeReward(gameState, { isCursed: false, item: getItem('iron_plating') }, () => 0.1)

    expect(gameState.inventory.passives[0].id).toBe('iron_plating')
    expect(gameState.rewardsCollected).toBe(1)
  })

  test('the add result is returned so a full rack can raise the swap prompt', () => {
    const gameState = itemState()
    gameState.inventory.passives = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

    const result = takeReward(gameState, { isCursed: false, item: getItem('iron_plating') }, () => 0.1)

    expect(result).toEqual({ success: false, reason: 'full' })
  })

  test('a cursed reward still curses on top of granting its item', () => {
    const gameState = itemState()

    takeReward(gameState, { isCursed: true, item: getItem('twitchy_trigger') }, () => 0.9)

    expect(gameState.inventory.passives[0].id).toBe('twitchy_trigger')
    expect(gameState.enemyStrength).toBe(1)
  })

  test('a reward with no item still collects and curses as before', () => {
    const gameState = itemState()

    const result = takeReward(gameState, { isCursed: true }, () => 0.1)

    expect(result).toBeNull()
    expect(gameState.rewardsCollected).toBe(1)
    expect(gameState.riskLevel).toBe(1)
  })

  test('skipping a reward grants nothing', () => {
    const gameState = itemState()

    skipReward(gameState, { isCursed: false, item: getItem('iron_plating') })

    expect(gameState.inventory.passives).toEqual([null, null, null, null])
  })

  // An item the player already holds is not a reward: nothing is placed, so nothing is
  // collected and no curse is paid for it.
  describe('a reward carrying an item the player already holds', () => {
    test('reports owned and adds no duplicate', () => {
      const gameState = itemState()
      takeReward(gameState, { isCursed: false, item: getItem('iron_plating') }, () => 0.9)

      const result = takeReward(
        gameState,
        { isCursed: false, item: getItem('iron_plating') },
        () => 0.9
      )

      expect(result).toEqual({ success: false, reason: 'owned' })
      expect(gameState.inventory.passives.map((item) => item && item.id)).toEqual([
        'iron_plating',
        null,
        null,
        null
      ])
    })

    test('does not count toward rewardsCollected', () => {
      const gameState = itemState()
      takeReward(gameState, { isCursed: false, item: getItem('iron_plating') }, () => 0.9)

      takeReward(gameState, { isCursed: false, item: getItem('iron_plating') }, () => 0.9)

      expect(gameState.rewardsCollected).toBe(1)
    })

    test('pays no curse even when the pickup was cursed', () => {
      const gameState = itemState()
      takeReward(gameState, { isCursed: false, item: getItem('iron_plating') }, () => 0.9)

      takeReward(gameState, { isCursed: true, item: getItem('iron_plating') }, () => 0.9)

      expect(gameState.enemyStrength).toBe(0)
      expect(gameState.riskLevel).toBe(0)
    })
  })
})
