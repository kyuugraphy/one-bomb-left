import { describe, expect, it } from 'vitest'
import { DROP_CHANCE, DROP_KINDS, rollEnemyDrop } from './drops.js'

// A queued RNG: each call returns the next value, so every roll in a test is chosen.
function rng(...values) {
  let i = 0
  return () => values[i++]
}

describe('rollEnemyDrop', () => {
  it('drops nothing on anything but the low roll', () => {
    expect(rollEnemyDrop(rng(DROP_CHANCE))).toBeNull()
    expect(rollEnemyDrop(rng(0.5))).toBeNull()
    expect(rollEnemyDrop(rng(0.99))).toBeNull()
  })

  it('drops something on a roll under one in ten', () => {
    expect(rollEnemyDrop(rng(0.05, 0))).not.toBeNull()
  })

  it('picks the heal, the treasure or the reward off the second roll', () => {
    expect(rollEnemyDrop(rng(0, 0))).toBe('heal')
    expect(rollEnemyDrop(rng(0, 0.5))).toBe('treasure')
    expect(rollEnemyDrop(rng(0, 0.99))).toBe('reward')
  })

  it('never returns anything outside the three kinds', () => {
    for (let sample = 0; sample < 2000; sample++) {
      const drop = rollEnemyDrop(Math.random)

      if (drop !== null) {
        expect(DROP_KINDS).toContain(drop)
      }
    }
  })

  it('drops on about one kill in ten', () => {
    const kills = 200000
    let dropped = 0

    for (let i = 0; i < kills; i++) {
      if (rollEnemyDrop(Math.random)) {
        dropped += 1
      }
    }

    expect(dropped / kills).toBeGreaterThan(0.095)
    expect(dropped / kills).toBeLessThan(0.105)
  })

  it('spreads the three kinds evenly across the drops it does make', () => {
    const counts = { heal: 0, treasure: 0, reward: 0 }
    let dropped = 0

    for (let i = 0; i < 200000; i++) {
      const drop = rollEnemyDrop(Math.random)

      if (drop) {
        counts[drop] += 1
        dropped += 1
      }
    }

    DROP_KINDS.forEach((kind) => {
      expect(counts[kind] / dropped).toBeGreaterThan(0.31)
      expect(counts[kind] / dropped).toBeLessThan(0.36)
    })
  })
})
