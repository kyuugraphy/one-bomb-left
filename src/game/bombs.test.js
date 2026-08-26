import { describe, expect, test } from 'vitest'
import { refillBomb, useBomb } from './bombs.js'

describe('useBomb', () => {
  test('using a bomb decreases gameState.bombCount by 1', () => {
    const gameState = { bombCount: 3 }

    useBomb(gameState)

    expect(gameState.bombCount).toBe(2)
  })

  test('using a bomb with none left leaves bombCount at 0', () => {
    const gameState = { bombCount: 0 }

    useBomb(gameState)

    expect(gameState.bombCount).toBe(0)
  })
})

describe('refillBomb', () => {
  test('a low random value refills a bomb', () => {
    const gameState = { bombCount: 1 }

    refillBomb(gameState, () => 0.1)

    expect(gameState.bombCount).toBe(2)
  })

  test('a high random value does not refill a bomb', () => {
    const gameState = { bombCount: 1 }

    refillBomb(gameState, () => 0.9)

    expect(gameState.bombCount).toBe(1)
  })
})
