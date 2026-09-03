import { describe, expect, it } from 'vitest'
import { solidGrid } from './shapeRoom.js'
import {
  CORRIDOR_MAX_LENGTH,
  CORRIDOR_MIN_LENGTH,
  CORRIDOR_WALKABLE_WIDTH,
  CORRIDOR_WALL_RING,
  generateCorridorRoom
} from './corridor.js'

// A queued RNG: each call returns the next value, so every roll in a test is chosen.
function rng(...values) {
  let i = 0
  return () => values[i++]
}

const shapeSize = (shape) => ({ rows: shape.mask.length, cols: shape.mask[0].length })

// The dimensions that matter are the ones you can walk, measured off the finished grid
// rather than off the mask: the mask carries its own wall ring, so it is always two cells
// bigger than the space inside it, on both axes. Every number in the spec is a walkable
// one - 3 cells across, 12 to 60 along - and the mask is whatever holds that.
const walkable = (shape) => {
  const solid = solidGrid(shape)
  const { cols } = shapeSize(shape)
  const openPerRow = solid.map((line) => line.filter((cell) => !cell).length)
  const openPerCol = Array.from({ length: cols }, (_, col) =>
    solid.filter((line) => !line[col]).length
  )
  const along = openPerRow.filter((n) => n > 0)
  const across = openPerCol.filter((n) => n > 0)

  return shape.orientation === 'horizontal'
    ? { width: Math.max(...across, 0), length: Math.max(...along, 0) }
    : { width: Math.max(...along, 0), length: Math.max(...across, 0) }
}

const longSide = (shape) => Math.max(...Object.values(shapeSize(shape)))
const shortSide = (shape) => Math.min(...Object.values(shapeSize(shape)))

describe('generateCorridorRoom - shape and dimensions', () => {
  it('returns a mask of floor, rectangular and non-empty', () => {
    const shape = generateCorridorRoom(Math.random)

    expect(Array.isArray(shape.mask)).toBe(true)
    expect(shape.mask.length).toBeGreaterThan(0)
    shape.mask.forEach((line) => {
      expect(line.length).toBe(shape.mask[0].length)
      expect(line).toMatch(/^#+$/)
    })
  })

  it('runs horizontally or vertically, and nothing else', () => {
    for (let i = 0; i < 200; i++) {
      expect(['horizontal', 'vertical']).toContain(generateCorridorRoom(Math.random).orientation)
    }
  })

  // The orientation comes off a roll rather than being fixed, so the two ends of the roll
  // must not agree.
  it('takes its orientation off the roll', () => {
    const low = generateCorridorRoom(rng(0, 0))
    const high = generateCorridorRoom(rng(0.99, 0))

    expect(low.orientation).not.toBe(high.orientation)
  })

  it('deals the two orientations about evenly', () => {
    let horizontal = 0
    const runs = 4000

    for (let i = 0; i < runs; i++) {
      if (generateCorridorRoom(Math.random).orientation === 'horizontal') {
        horizontal += 1
      }
    }

    expect(horizontal / runs).toBeGreaterThan(0.45)
    expect(horizontal / runs).toBeLessThan(0.55)
  })

  it('lays a horizontal corridor out long across and narrow down', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)

      if (shape.orientation === 'horizontal') {
        const { rows, cols } = shapeSize(shape)

        expect(cols).toBeGreaterThan(rows)
      }
    }
  })

  it('lays a vertical corridor out long down and narrow across', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)

      if (shape.orientation === 'vertical') {
        const { rows, cols } = shapeSize(shape)

        expect(rows).toBeGreaterThan(cols)
      }
    }
  })

  // Three cells across is the number, and it is a walkable one. Two was too tight: a 36 px
  // enemy in a straight run with nowhere to step aside is a wall you shoot through rather
  // than something you dodge.
  it('is exactly CORRIDOR_WALKABLE_WIDTH cells wide to walk down, whichever way it runs', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)

      expect(walkable(shape).width, shape.orientation).toBe(CORRIDOR_WALKABLE_WIDTH)
    }
  })

  // The mask is the walkable space plus its wall: a mask only CORRIDOR_WALKABLE_WIDTH
  // across would be solid wall end to end, because every cell of it touches the outside.
  it('carries a mask a wall ring wider than the space inside it', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)

      expect(shortSide(shape), shape.orientation).toBe(
        CORRIDOR_WALKABLE_WIDTH + CORRIDOR_WALL_RING
      )
    }
  })

  it('is the same narrow width whichever way it runs', () => {
    const widths = new Set()

    for (let i = 0; i < 200; i++) {
      widths.add(shortSide(generateCorridorRoom(Math.random)))
    }

    expect(widths.size).toBe(1)
  })

  it('is between half and two and a half base rooms long to walk', () => {
    for (let i = 0; i < 400; i++) {
      const length = walkable(generateCorridorRoom(Math.random)).length

      expect(length).toBeGreaterThanOrEqual(CORRIDOR_MIN_LENGTH)
      expect(length).toBeLessThanOrEqual(CORRIDOR_MAX_LENGTH)
    }
  })

  it('carries a mask a wall ring longer than the walk inside it', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)

      expect(longSide(shape)).toBe(walkable(shape).length + CORRIDOR_WALL_RING)
    }
  })

  it('reaches both ends of that range', () => {
    expect(walkable(generateCorridorRoom(rng(0, 0))).length).toBe(CORRIDOR_MIN_LENGTH)
    expect(walkable(generateCorridorRoom(rng(0, 0.999999))).length).toBe(CORRIDOR_MAX_LENGTH)
  })

  it('puts the mask ends at the walkable ends plus the ring', () => {
    expect(longSide(generateCorridorRoom(rng(0, 0)))).toBe(
      CORRIDOR_MIN_LENGTH + CORRIDOR_WALL_RING
    )
    expect(longSide(generateCorridorRoom(rng(0, 0.999999)))).toBe(
      CORRIDOR_MAX_LENGTH + CORRIDOR_WALL_RING
    )
  })

  it('snaps to whole cells, so it always lands on the 56 px grid', () => {
    for (let i = 0; i < 200; i++) {
      const { rows, cols } = shapeSize(generateCorridorRoom(Math.random))

      expect(Number.isInteger(rows)).toBe(true)
      expect(Number.isInteger(cols)).toBe(true)
    }
  })

  it('covers the lengths in between rather than only the ends', () => {
    const lengths = new Set()

    for (let i = 0; i < 2000; i++) {
      lengths.add(walkable(generateCorridorRoom(Math.random)).length)
    }

    expect(lengths.size).toBeGreaterThan(10)
  })

  it('is always longer than it is wide, even at its shortest', () => {
    const shortest = generateCorridorRoom(rng(0, 0))

    expect(longSide(shortest)).toBeGreaterThan(shortSide(shortest))
  })
})
