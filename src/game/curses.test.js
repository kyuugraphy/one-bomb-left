import { describe, expect, test } from 'vitest'
import { applyCurse } from './curses.js'

describe('applyCurse', () => {
  test("applying a 'risk' curse increases gameState.riskLevel by 1", () => {
    const gameState = { riskLevel: 0 }

    applyCurse(gameState, 'risk')

    expect(gameState.riskLevel).toBe(1)
  })

  test("applying an 'enemy' curse increases gameState.enemyStrength by 1", () => {
    const gameState = { enemyStrength: 0 }

    applyCurse(gameState, 'enemy')

    expect(gameState.enemyStrength).toBe(1)
  })
})
