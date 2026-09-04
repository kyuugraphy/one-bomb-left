import { describe, expect, it } from 'vitest'
import { solidGrid } from './shapeRoom.js'
import {
  CORRIDOR_COVERAGE_MAX,
  CORRIDOR_COVERAGE_MIN,
  CORRIDOR_MAX_LENGTH,
  CORRIDOR_MIN_LENGTH,
  CORRIDOR_WALKABLE_WIDTH,
  CORRIDOR_WALL_RING,
  generateCorridorObstacles,
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

// ---------------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------------

// Every cell you can stand on, read off the finished grid.
const walkableCells = (shape) => {
  const solid = solidGrid(shape)
  const cells = []

  solid.forEach((line, row) =>
    line.forEach((isSolid, col) => {
      if (!isSolid) {
        cells.push([row, col])
      }
    })
  )

  return cells
}

// The test's own flood fill, deliberately not the one the generator uses: this asks the
// question a corridor actually cares about - can you get from one end to the other - and
// answers it independently of whatever check the implementation ran.
const walksEndToEnd = (shape, blocked) => {
  const cells = walkableCells(shape)
  const along = shape.orientation === 'horizontal' ? 1 : 0
  const ends = cells.map((cell) => cell[along])
  const first = Math.min(...ends)
  const last = Math.max(...ends)
  const start = cells.find((cell) => cell[along] === first && !blocked[cell[0]][cell[1]])

  if (!start) {
    return false
  }

  const seen = new Set([start.join(',')])
  const queue = [start]
  let reachedFarEnd = false

  while (queue.length) {
    const [row, col] = queue.pop()

    if ((along === 1 ? col : row) === last) {
      reachedFarEnd = true
    }

    ;[[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([dRow, dCol]) => {
      const next = [row + dRow, col + dCol]
      const key = next.join(',')

      if (seen.has(key) || blocked[next[0]]?.[next[1]] !== false) {
        return
      }

      seen.add(key)
      queue.push(next)
    })
  }

  return reachedFarEnd
}

const corridorOf = (orientation, walkableLength) => {
  const orientationRoll = orientation === 'horizontal' ? 0 : 0.9
  const lengthRoll = (walkableLength - CORRIDOR_MIN_LENGTH) / (CORRIDOR_MAX_LENGTH - CORRIDOR_MIN_LENGTH + 1)

  return generateCorridorRoom(rng(orientationRoll, lengthRoll))
}

describe('generateCorridorObstacles - density', () => {
  it('covers between a tenth and a seventh of the walkable cells', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)
      const walk = walkableCells(shape).length
      const { shapes } = generateCorridorObstacles(shape, Math.random)
      const placed = shapes.reduce((n, s) => n + s.cells.length, 0)

      // within one cell of the band: a 36-cell corridor cannot land on 10% exactly
      expect(placed / walk).toBeGreaterThanOrEqual(CORRIDOR_COVERAGE_MIN - 1 / walk)
      expect(placed / walk).toBeLessThanOrEqual(CORRIDOR_COVERAGE_MAX + 1 / walk)
    }
  })

  it('averages inside the band over many corridors', () => {
    let total = 0
    const runs = 400

    for (let i = 0; i < runs; i++) {
      const shape = generateCorridorRoom(Math.random)
      total += generateCorridorObstacles(shape, Math.random).coverage
    }

    expect(total / runs).toBeGreaterThanOrEqual(CORRIDOR_COVERAGE_MIN)
    expect(total / runs).toBeLessThanOrEqual(CORRIDOR_COVERAGE_MAX)
  })

  it('reports the coverage it actually achieved', () => {
    for (let i = 0; i < 60; i++) {
      const shape = generateCorridorRoom(Math.random)
      const walk = walkableCells(shape).length
      const result = generateCorridorObstacles(shape, Math.random)
      const placed = result.shapes.reduce((n, s) => n + s.cells.length, 0)

      expect(result.coverage).toBeCloseTo(placed / walk, 10)
    }
  })

  it('leaves a corridor with obstacles on it, never an empty one', () => {
    for (let i = 0; i < 120; i++) {
      const shape = generateCorridorRoom(Math.random)

      expect(generateCorridorObstacles(shape, Math.random).shapes.length).toBeGreaterThan(0)
    }
  })
})

describe('generateCorridorObstacles - placement', () => {
  it('puts every obstacle on a cell you could otherwise stand on', () => {
    for (let i = 0; i < 120; i++) {
      const shape = generateCorridorRoom(Math.random)
      const solid = solidGrid(shape)

      generateCorridorObstacles(shape, Math.random).shapes.forEach(({ cells }) =>
        cells.forEach(([row, col]) => expect(solid[row][col]).toBe(false))
      )
    }
  })

  it('never stacks two obstacles on the same cell', () => {
    for (let i = 0; i < 120; i++) {
      const shape = generateCorridorRoom(Math.random)
      const keys = generateCorridorObstacles(shape, Math.random).shapes.flatMap(({ cells }) =>
        cells.map((cell) => cell.join(','))
      )

      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  // The reason this function exists. pickSeed drops two thirds of its shapes into a
  // 3-cell band hugging the wall, and a corridor is 3 cells wide - so the whole width is
  // that band and the bias buys nothing but clustering. Uniform means the middle lane
  // gets its third, not a sixth.
  it('spreads across the three lanes evenly, with no bias toward the walls', () => {
    const lanes = [0, 0, 0]

    for (let i = 0; i < 500; i++) {
      const shape = generateCorridorRoom(Math.random)
      const solid = solidGrid(shape)
      const across = shape.orientation === 'horizontal' ? 0 : 1
      const walk = walkableCells(shape)
      const nearest = Math.min(...walk.map((cell) => cell[across]))

      generateCorridorObstacles(shape, Math.random).shapes.forEach(({ cells }) =>
        cells.forEach((cell) => {
          expect(solid[cell[0]][cell[1]]).toBe(false)
          lanes[cell[across] - nearest] += 1
        })
      )
    }

    const total = lanes.reduce((a, b) => a + b, 0)

    // A near-wall bias would put the middle lane near a sixth. This window is wide enough
    // to survive the sampling and nowhere near wide enough to let that through.
    lanes.forEach((n) => {
      expect(n / total).toBeGreaterThan(0.28)
      expect(n / total).toBeLessThan(0.39)
    })
  })

  it('spreads along the length evenly, with no bias toward either end', () => {
    const thirds = [0, 0, 0]

    for (let i = 0; i < 500; i++) {
      const shape = generateCorridorRoom(Math.random)
      const along = shape.orientation === 'horizontal' ? 1 : 0
      const walk = walkableCells(shape)
      const first = Math.min(...walk.map((cell) => cell[along]))
      const span = Math.max(...walk.map((cell) => cell[along])) - first + 1

      generateCorridorObstacles(shape, Math.random).shapes.forEach(({ cells }) =>
        cells.forEach((cell) => {
          const third = Math.min(2, Math.floor(((cell[along] - first) / span) * 3))

          thirds[third] += 1
        })
      )
    }

    const total = thirds.reduce((a, b) => a + b, 0)

    // Wider than the lane window on purpose: when a corridor's length does not divide by
    // three the thirds are not equal sizes, which skews this a little all on its own.
    thirds.forEach((n) => {
      expect(n / total).toBeGreaterThan(0.28)
      expect(n / total).toBeLessThan(0.39)
    })
  })

  it('keeps the rock and pit split the base rooms use', () => {
    let rocks = 0
    let all = 0

    for (let i = 0; i < 400; i++) {
      const shape = generateCorridorRoom(Math.random)

      generateCorridorObstacles(shape, Math.random).shapes.forEach(({ cells, asRock }) => {
        all += cells.length
        if (asRock) {
          rocks += cells.length
        }
      })
    }

    expect(rocks / all).toBeGreaterThan(0.5)
    expect(rocks / all).toBeLessThan(0.7)
  })
})

describe('generateCorridorObstacles - connectivity', () => {
  it('always leaves a walk from one end to the other, whatever it rolls', () => {
    for (let i = 0; i < 300; i++) {
      const shape = generateCorridorRoom(Math.random)
      const { blocked } = generateCorridorObstacles(shape, Math.random)

      expect(walksEndToEnd(shape, blocked), shape.orientation).toBe(true)
    }
  })

  it('leaves that walk at every length in the range, both ways round', () => {
    for (let length = CORRIDOR_MIN_LENGTH; length <= CORRIDOR_MAX_LENGTH; length++) {
      ;['horizontal', 'vertical'].forEach((orientation) => {
        const shape = corridorOf(orientation, length)
        const { blocked } = generateCorridorObstacles(shape, Math.random)

        expect(walksEndToEnd(shape, blocked), `${orientation} ${length}`).toBe(true)
      })
    }
  })

  it('marks exactly the placed cells as blocked, and nothing else it can walk', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)
      const solid = solidGrid(shape)
      const { blocked, shapes } = generateCorridorObstacles(shape, Math.random)
      const placed = new Set(shapes.flatMap(({ cells }) => cells.map((cell) => cell.join(','))))

      solid.forEach((line, row) =>
        line.forEach((isSolid, col) => {
          const expected = isSolid || placed.has(`${row},${col}`)

          expect(blocked[row][col], `${row},${col}`).toBe(expected)
        })
      )
    }
  })

  it('reports how many candidate cells it had to throw away', () => {
    const result = generateCorridorObstacles(generateCorridorRoom(Math.random), Math.random)

    expect(typeof result.rejected).toBe('number')
    expect(result.rejected).toBeGreaterThanOrEqual(0)
  })
})
