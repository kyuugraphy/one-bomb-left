import { describe, expect, it } from 'vitest'
import {
  BULLET_LIFETIME,
  BULLET_RANGE,
  BULLET_SPEED,
  ENEMY_SHOT_LIFETIME,
  ENEMY_SHOT_RANGE,
  limitThatBinds,
  rangeReachedAt,
  slowestSpeedRangeStillBinds,
  travelIn
} from './bullets.js'

const CELL = 56

describe('rangeReachedAt', () => {
  it('is range over speed, in milliseconds', () => {
    expect(rangeReachedAt(700, 700)).toBe(1000)
    expect(rangeReachedAt(350, 700)).toBe(500)
  })

  it('puts the shipped range at 857 ms', () => {
    expect(rangeReachedAt()).toBeCloseTo(857.14, 1)
  })
})

describe('travelIn', () => {
  it('is the inverse of rangeReachedAt', () => {
    expect(travelIn(rangeReachedAt())).toBeCloseTo(BULLET_RANGE)
  })

  // The slack keeps shrinking and the test keeps saying so out loud: 700 px/s cleared
  // the range inside half the lifetime, 490 needed two thirds, 392 needs about 71%.
  it('has a bullet outrun its range inside three quarters of its lifetime', () => {
    expect(travelIn(BULLET_LIFETIME * 0.75)).toBeGreaterThan(BULLET_RANGE)
    expect(travelIn(BULLET_LIFETIME * 0.66)).toBeLessThan(BULLET_RANGE)
  })
})

// The question this module exists to answer: with a 336 px cap at 392 px/s, does the old
// 1200 ms timeout ever end a shot first? It does not - but it is down to 1.4x the room it
// needs, from 2.5x when this module was written. It is still a backstop, and the test says
// so out loud in case someone changes the speed and quietly turns it back into a rule.
describe('limitThatBinds', () => {
  it('is the range cap at the shipped numbers', () => {
    expect(limitThatBinds()).toBe('range')
  })

  it('leaves the lifetime 1.4x the room it needs', () => {
    expect(BULLET_LIFETIME / rangeReachedAt()).toBeGreaterThan(1.35)
  })

  it('hands over to the lifetime once a bullet is slow enough', () => {
    expect(limitThatBinds(BULLET_RANGE, 200)).toBe('lifetime')
    expect(limitThatBinds(BULLET_RANGE, 1000)).toBe('range')
  })

  it('switches exactly at the crossover speed, and the cap wins the tie', () => {
    const crossover = slowestSpeedRangeStillBinds()

    expect(limitThatBinds(BULLET_RANGE, crossover)).toBe('range')
    expect(limitThatBinds(BULLET_RANGE, crossover - 1)).toBe('lifetime')
    expect(limitThatBinds(BULLET_RANGE, crossover + 1)).toBe('range')
  })
})

describe('slowestSpeedRangeStillBinds', () => {
  it('is 280 px/s for the shipped range and lifetime', () => {
    expect(slowestSpeedRangeStillBinds()).toBeCloseTo(280)
  })

  // 280 against a shipped 392: the gap a speed-cutting item has to play with is down to
  // 1.4x, and one more cut of this size puts the timeout back in charge.
  it('is still below the speed bullets actually travel, with 1.4x to spare', () => {
    expect(slowestSpeedRangeStillBinds()).toBeLessThan(BULLET_SPEED * 0.8)
  })
})

describe('the shipped numbers', () => {
  it('measures the range in whole grid cells', () => {
    expect(BULLET_RANGE % CELL).toBe(0)
    expect(BULLET_RANGE / CELL).toBe(6)
  })

  // Range is what makes a fight positional: it has to be short enough that crossing a
  // room matters, and long enough to outreach the thing shooting back.
  it('reaches further than an enemy has to walk to touch you, but not across a room', () => {
    expect(BULLET_RANGE).toBeGreaterThan(CELL * 3)
    expect(BULLET_RANGE).toBeLessThan((CELL * 24) / 2)
  })
})

// The enemy's shot speed is derived from PLAYER_SPEED in the scene (0.65 x 320 = 208),
// which is Phaser-side and cannot be imported here. It is passed in explicitly and the
// real value is confirmed by measuring a shot in the browser.
const ENEMY_SHOT_SPEED = 320 * 0.65

describe('enemy shots', () => {
  it('reach exactly as far as the player does', () => {
    expect(ENEMY_SHOT_RANGE).toBe(BULLET_RANGE)
  })

  it('is the range that ends them, not their timeout', () => {
    expect(limitThatBinds(ENEMY_SHOT_RANGE, ENEMY_SHOT_SPEED, ENEMY_SHOT_LIFETIME)).toBe('range')
  })

  it('takes about 1.6 s to cross its range, well inside a 4 s timeout', () => {
    expect(rangeReachedAt(ENEMY_SHOT_RANGE, ENEMY_SHOT_SPEED)).toBeCloseTo(1615, 0)
    expect(ENEMY_SHOT_LIFETIME / rangeReachedAt(ENEMY_SHOT_RANGE, ENEMY_SHOT_SPEED))
      .toBeGreaterThan(2)
  })

  it('leaves the timeout binding only below 84 px/s, far under the shipped speed', () => {
    const crossover = slowestSpeedRangeStillBinds(ENEMY_SHOT_RANGE, ENEMY_SHOT_LIFETIME)

    expect(crossover).toBeCloseTo(84)
    expect(crossover).toBeLessThan(ENEMY_SHOT_SPEED / 2)
  })

  // The shot is slower than the player's, so the same distance buys the player more time
  // to move out of the way - the reach is symmetric, the threat is not. The margin is
  // eroding as the player's shot slows: 3x at 700 px/s, 2.36x at 490, 1.88x at 392. Below
  // 1x the asymmetry inverts and an enemy shot arrives faster than the player's does.
  it('gives the player longer to dodge than their own shot gives an enemy', () => {
    expect(rangeReachedAt(ENEMY_SHOT_RANGE, ENEMY_SHOT_SPEED)).toBeGreaterThan(
      rangeReachedAt(BULLET_RANGE, BULLET_SPEED) * 1.8
    )
  })
})
