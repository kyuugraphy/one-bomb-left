import { describe, expect, it } from 'vitest'
import { DROP_CHANCE, HEAL_DROP, rollEnemyDrop } from './drops.js'

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

  it('drops a heal on a roll under one in ten', () => {
    expect(rollEnemyDrop(rng(0))).toBe(HEAL_DROP)
    expect(rollEnemyDrop(rng(0.05))).toBe(HEAL_DROP)
    expect(rollEnemyDrop(rng(DROP_CHANCE - 0.0001))).toBe(HEAL_DROP)
  })

  // The point of the change: a kill can no longer hand over an item of any kind. Whatever
  // the roll, the only two answers are half a heart or nothing.
  it('only ever answers with a heal or with nothing', () => {
    for (let sample = 0; sample < 20000; sample++) {
      const drop = rollEnemyDrop(Math.random)

      expect(drop === HEAL_DROP || drop === null).toBe(true)
    }
  })

  it('never rolls the treasure or the reward it used to', () => {
    const seen = new Set()

    for (let sample = 0; sample < 20000; sample++) {
      seen.add(rollEnemyDrop(Math.random))
    }

    expect(seen.has('treasure')).toBe(false)
    expect(seen.has('reward')).toBe(false)
    expect([...seen].sort()).toEqual([HEAL_DROP, null])
  })

  // There is no kind to pick any more, so the second roll the old version spent choosing
  // between heal, treasure and reward should be gone with it.
  it('spends exactly one roll, whether it drops or not', () => {
    const counting = (value) => {
      let calls = 0
      const result = rollEnemyDrop(() => {
        calls += 1
        return value
      })

      return { calls, result }
    }

    expect(counting(0.05)).toEqual({ calls: 1, result: HEAL_DROP })
    expect(counting(0.5)).toEqual({ calls: 1, result: null })
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

  // The heal used to be one third of one tenth - about 3.3% of kills. It is the whole
  // tenth now, so healing off the floor is three times as common as it was even though
  // the drop rate itself has not moved.
  it('makes a heal three times as likely as when a drop had three kinds', () => {
    const kills = 200000
    let healed = 0

    for (let i = 0; i < kills; i++) {
      if (rollEnemyDrop(Math.random) === HEAL_DROP) {
        healed += 1
      }
    }

    expect(healed / kills).toBeGreaterThan((DROP_CHANCE / 3) * 2.8)
  })
})
