import { describe, expect, it } from 'vitest'
import {
  CLEAN_DROP,
  DEBUFF_DROP,
  DEBUFF_DROP_SHARE,
  DROP_CHANCE,
  HEAL_DROP,
  rollEnemyDrop,
  rollRoomDrop
} from './drops.js'

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

// What clearing a room hands over, now that SAFE and RISKY are one type.
//
// The old rule read the door: a safe room always paid a clean item, a risky one always
// paid a debuff, and which you got was settled the moment you picked a colour. With one
// combat type there is no colour left to read, so the payout becomes a roll - and it has
// to be a roll rather than a constant, or every room in the game would pay the same thing
// and clearing one would stop being worth anything in particular.
describe('rollRoomDrop', () => {
  it('pays a debuff-paired item on a low roll', () => {
    expect(rollRoomDrop(rng(0))).toBe(DEBUFF_DROP)
    expect(rollRoomDrop(rng(0.3))).toBe(DEBUFF_DROP)
    expect(rollRoomDrop(rng(DEBUFF_DROP_SHARE - 0.0001))).toBe(DEBUFF_DROP)
  })

  it('pays a clean item on anything from the share upward', () => {
    expect(rollRoomDrop(rng(DEBUFF_DROP_SHARE))).toBe(CLEAN_DROP)
    expect(rollRoomDrop(rng(0.8))).toBe(CLEAN_DROP)
    expect(rollRoomDrop(rng(0.99))).toBe(CLEAN_DROP)
  })

  // Unlike an enemy drop, a cleared room always pays something. The roll picks which kind,
  // never whether - a room you fought through and got nothing for is a room you would
  // rather have walked past.
  it('never pays nothing', () => {
    for (let sample = 0; sample < 20000; sample++) {
      const drop = rollRoomDrop(Math.random)

      expect(drop === DEBUFF_DROP || drop === CLEAN_DROP).toBe(true)
    }
  })

  it('splits 60/40 in favour of the debuff', () => {
    expect(DEBUFF_DROP_SHARE).toBe(0.6)

    const rooms = 100000
    let debuffs = 0

    for (let i = 0; i < rooms; i++) {
      if (rollRoomDrop(Math.random) === DEBUFF_DROP) {
        debuffs += 1
      }
    }

    // +/- 0.5 points either side, which is about 3 standard deviations at this sample.
    expect(debuffs / rooms).toBeGreaterThan(0.595)
    expect(debuffs / rooms).toBeLessThan(0.605)
  })

  it('spends exactly one roll, so a caller can queue against it', () => {
    let calls = 0
    const counted = () => {
      calls += 1
      return 0.5
    }

    rollRoomDrop(counted)

    expect(calls).toBe(1)
  })
})
