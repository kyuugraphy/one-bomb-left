import { describe, expect, test } from 'vitest'
import { addExp, spendExp } from './currency.js'

describe('addExp', () => {
  test('a kill adds its EXP to the running total', () => {
    const gameState = { exp: 5 }

    addExp(gameState, 2)

    expect(gameState.exp).toBe(7)
  })

  test('a negative amount is ignored: a kill never removes EXP', () => {
    const gameState = { exp: 5 }

    addExp(gameState, -3)

    expect(gameState.exp).toBe(5)
  })
})

describe('spendExp', () => {
  test('an affordable purchase deducts the price', () => {
    const gameState = { exp: 10 }

    const result = spendExp(gameState, 4)

    expect(gameState.exp).toBe(6)
    expect(result).toEqual({ success: true })
  })

  test('spending the exact balance is affordable', () => {
    const gameState = { exp: 4 }

    const result = spendExp(gameState, 4)

    expect(gameState.exp).toBe(0)
    expect(result).toEqual({ success: true })
  })

  test('a purchase beyond the balance is refused and takes nothing', () => {
    const gameState = { exp: 3 }

    const result = spendExp(gameState, 4)

    expect(gameState.exp).toBe(3)
    expect(result).toEqual({ success: false, reason: 'insufficient' })
  })
})
