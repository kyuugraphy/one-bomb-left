import { describe, expect, it } from 'vitest'
import { DOOR_INSET, doorCells, innerCell, solidGrid, wallCells, wallRun } from './shapeRoom.js'
import { doorCapacity } from './shapes.js'
import {
  CORRIDOR_COVERAGE_MAX,
  CORRIDOR_COVERAGE_MIN,
  CORRIDOR_FLOOR_DOORS,
  CORRIDOR_MAX_LENGTH,
  CORRIDOR_MIN_LENGTH,
  CORRIDOR_WALKABLE_WIDTH,
  CORRIDOR_WALL_RING,
  generateCorridorObstacles,
  generateCorridorRoom,
  corridorsForFloor,
  rollCorridorDoors
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

// The test's own flood fill, deliberately not the one the generator uses: it asks the
// question a corridor actually cares about and answers it independently of whatever check
// the implementation ran.
//
// "End to end" means **door pad to door pad**. It used to mean first walkable column to
// last, from before doors existed, when the extreme columns were the only stand-in for
// where you come in and go out. They are not that any more: a pad sits DOOR_INSET cells
// in from its wall, so the column behind it is decoration the player never steps on, and
// demanding it stay clear failed 0.4% of corridors over something that cannot be walked
// to anyway. The pads themselves are reserved and connect in 5,000 of 5,000.
const walksEndToEnd = (shape, blocked) => {
  const start = innerCell(shape.entry, DOOR_INSET)
  const targets = shape.exits.flatMap((exit) => doorCells(shape, exit, 1))

  if (blocked[start[0]]?.[start[1]] !== false) {
    return false
  }

  const seen = new Set([start.join(',')])
  const queue = [start]
  const reached = new Set()

  while (queue.length) {
    const [row, col] = queue.pop()

    reached.add(`${row},${col}`)
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

  return targets.every((target) => reached.has(target.join(',')))
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

// ---------------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------------

const FACINGS = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] }

// Can you walk from one cell to another through the obstacles that were placed?
const connects = (blocked, from, to) => {
  if (blocked[from[0]]?.[from[1]] !== false || blocked[to[0]]?.[to[1]] !== false) {
    return false
  }

  const seen = new Set([from.join(',')])
  const queue = [from]

  while (queue.length) {
    const [row, col] = queue.pop()

    if (row === to[0] && col === to[1]) {
      return true
    }

    Object.values(FACINGS).forEach(([dRow, dCol]) => {
      const next = [row + dRow, col + dCol]
      const key = next.join(',')

      if (seen.has(key) || blocked[next[0]]?.[next[1]] !== false) {
        return
      }

      seen.add(key)
      queue.push(next)
    })
  }

  return false
}

const doorwaysOf = (shape) => [shape.entry, ...shape.exits]

describe('generateCorridorRoom - doorways', () => {
  it('carries an entry and at least one exit, shaped like every other doorway', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)

      expect(shape.exits.length).toBeGreaterThan(0)
      doorwaysOf(shape).forEach((doorway) => {
        expect(Array.isArray(doorway.cell)).toBe(true)
        expect(doorway.cell).toHaveLength(2)
        expect(Object.keys(FACINGS)).toContain(doorway.facing)
        expect(doorway.span).toBeGreaterThan(0)
      })
    }
  })

  // The corridor-specific rule, and the only one: the long sides are 33 cells of wall and
  // would seat three doors each if anything let them. Nothing may.
  it('never puts a doorway on a long side', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)
      const alongTheLongSide =
        shape.orientation === 'horizontal' ? ['north', 'south'] : ['east', 'west']

      doorwaysOf(shape).forEach((doorway) =>
        expect(alongTheLongSide, shape.orientation).not.toContain(doorway.facing)
      )
    }
  })

  it('faces every doorway out along the long axis', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)
      const outTheEnds =
        shape.orientation === 'horizontal' ? ['east', 'west'] : ['north', 'south']

      doorwaysOf(shape).forEach((doorway) => expect(outTheEnds).toContain(doorway.facing))
    }
  })

  it('puts the entry at one far end and the exit at the other', () => {
    for (let i = 0; i < 200; i++) {
      const shape = generateCorridorRoom(Math.random)
      const along = shape.orientation === 'horizontal' ? 1 : 0
      const last = (shape.orientation === 'horizontal' ? shape.mask[0].length : shape.mask.length) - 1
      const ends = doorwaysOf(shape).map((doorway) => doorway.cell[along])

      expect(ends.sort((a, b) => a - b)).toEqual([0, last])
    }
  })

  // Which end you come in by is a roll, not a fixture - otherwise every corridor is walked
  // in the same direction.
  // Which *end*, not which facing: facing takes four values across the two orientations,
  // so counting those would pass on a corridor that always entered from the same end.
  it('rolls which end is the entry, in both orientations', () => {
    const ends = { horizontal: new Set(), vertical: new Set() }

    for (let i = 0; i < 400; i++) {
      const shape = generateCorridorRoom(Math.random)
      const along = shape.orientation === 'horizontal' ? 1 : 0

      ends[shape.orientation].add(shape.entry.cell[along] === 0 ? 'start' : 'end')
    }

    expect(ends.horizontal).toEqual(new Set(['start', 'end']))
    expect(ends.vertical).toEqual(new Set(['start', 'end']))
  })

  it('deals the two entry ends about evenly', () => {
    let first = 0
    const runs = 2000

    for (let i = 0; i < runs; i++) {
      const shape = generateCorridorRoom(Math.random)
      const along = shape.orientation === 'horizontal' ? 1 : 0

      if (shape.entry.cell[along] === 0) {
        first += 1
      }
    }

    expect(first / runs).toBeGreaterThan(0.44)
    expect(first / runs).toBeLessThan(0.56)
  })
})

// The point of these: the corridor declares doorways in the same shape the hand-authored
// masks do, so shapeRoom's own helpers read them without a special case. If wallRun and
// doorCells did not agree with the declared span, the corridor would be carrying numbers
// that only its own code understood.
describe('generateCorridorRoom - doorways through the shared helpers', () => {
  it('declares a span that wallRun agrees with, the same invariant the masks hold to', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)

      doorwaysOf(shape).forEach((doorway) =>
        expect(wallRun(shape, doorway)).toHaveLength(doorway.span)
      )
    }
  })

  it('puts every doorway cell on a wall of the mask, not in the middle of the floor', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)
      const walls = new Set(wallCells(shape).map((cell) => cell.join(',')))

      doorwaysOf(shape).forEach((doorway) =>
        expect(walls.has(doorway.cell.join(','))).toBe(true)
      )
    }
  })

  it('keeps every cell of a doorway run on the same end wall', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)
      const along = shape.orientation === 'horizontal' ? 1 : 0

      doorwaysOf(shape).forEach((doorway) =>
        wallRun(shape, doorway).forEach((cell) =>
          expect(cell[along]).toBe(doorway.cell[along])
        )
      )
    }
  })

  it('seats exactly one door on an end, which is what a 5-cell run holds', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)

      shape.exits.forEach((exit) => {
        expect(doorCapacity(exit.span)).toBe(1)
        expect(doorCells(shape, exit, 3)).toHaveLength(1)
      })
    }
  })

  it('lands its door pads on open floor', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)
      const solid = solidGrid(shape)

      shape.exits.forEach((exit) =>
        doorCells(shape, exit, 1).forEach(([row, col]) => expect(solid[row][col]).toBe(false))
      )
    }
  })
})

describe('doors and obstacles together', () => {
  const doorSpots = (shape) => [
    innerCell(shape.entry, DOOR_INSET),
    ...shape.exits.flatMap((exit) => doorCells(shape, exit, 1))
  ]

  // The composition the obstacle step has to respect: a rock on the door pad is a door you
  // cannot reach, and a rock on the spawn is a player standing inside one.
  it('never buries a door pad or the entry under an obstacle', () => {
    for (let i = 0; i < 300; i++) {
      const shape = generateCorridorRoom(Math.random)
      const { blocked } = generateCorridorObstacles(shape, Math.random)

      doorSpots(shape).forEach(([row, col]) =>
        expect(blocked[row][col], `${shape.orientation} ${row},${col}`).toBe(false)
      )
    }
  })

  it('always leaves a walk from the entry to the door', () => {
    for (let i = 0; i < 300; i++) {
      const shape = generateCorridorRoom(Math.random)
      const { blocked } = generateCorridorObstacles(shape, Math.random)
      const [entry, ...doors] = doorSpots(shape)

      doors.forEach((door) =>
        expect(connects(blocked, entry, door), shape.orientation).toBe(true)
      )
    }
  })

  it('still leaves that walk at both ends of the length range', () => {
    ;[CORRIDOR_MIN_LENGTH, CORRIDOR_MAX_LENGTH].forEach((length) =>
      ['horizontal', 'vertical'].forEach((orientation) => {
        const shape = corridorOf(orientation, length)
        const { blocked } = generateCorridorObstacles(shape, Math.random)
        const [entry, ...doors] = doorSpots(shape)

        doors.forEach((door) =>
          expect(connects(blocked, entry, door), `${orientation} ${length}`).toBe(true)
        )
      })
    )
  })

  it('still hits its coverage with the door cells held back', () => {
    for (let i = 0; i < 100; i++) {
      const shape = generateCorridorRoom(Math.random)
      const walk = walkableCells(shape).length
      const { coverage } = generateCorridorObstacles(shape, Math.random)

      expect(coverage).toBeGreaterThanOrEqual(CORRIDOR_COVERAGE_MIN - 1 / walk)
      expect(coverage).toBeLessThanOrEqual(CORRIDOR_COVERAGE_MAX + 1 / walk)
    }
  })
})

// ---------------------------------------------------------------------------------
// Where corridors land in a floor
// ---------------------------------------------------------------------------------

const gaps = (doors) => doors.slice(1).map((door, i) => door - doors[i])

const averageGap = (doorCount, runs = 4000) => {
  let total = 0
  let seen = 0

  for (let i = 0; i < runs; i++) {
    gaps(rollCorridorDoors(doorCount, Math.random)).forEach((gap) => {
      total += gap
      seen += 1
    })
  }

  return total / seen
}

describe('corridorsForFloor', () => {
  it('gives floor 1 one to three', () => {
    expect(corridorsForFloor(7)).toMatchObject({ min: 1, max: 3 })
    expect(corridorsForFloor(5)).toMatchObject({ min: 1, max: 3 })
  })

  it('gives a floor-2 sized floor one to four', () => {
    expect(corridorsForFloor(8)).toMatchObject({ min: 1, max: 4 })
    expect(corridorsForFloor(11)).toMatchObject({ min: 1, max: 4 })
  })

  it('gives the long floors two to five', () => {
    expect(corridorsForFloor(12)).toMatchObject({ min: 2, max: 5 })
    expect(corridorsForFloor(15)).toMatchObject({ min: 2, max: 5 })
    expect(corridorsForFloor(30)).toMatchObject({ min: 2, max: 5 })
  })

  // The band edges are where an off-by-one hides, and the bands are meant to line up with
  // the floor sizes: 7 is floor 1's whole count, 8 opens floor 2's range, 12 opens the rest.
  it('steps up at 8 and again at 12, not either side of them', () => {
    expect(corridorsForFloor(7).max).toBe(3)
    expect(corridorsForFloor(8).max).toBe(4)
    expect(corridorsForFloor(11).max).toBe(4)
    expect(corridorsForFloor(12).max).toBe(5)
  })

  it('never asks for more corridors than a floor could hold apart', () => {
    for (let doorCount = 1; doorCount <= 40; doorCount++) {
      expect(corridorsForFloor(doorCount).min).toBeLessThanOrEqual(Math.ceil(doorCount / 2))
    }
  })
})

describe('rollCorridorDoors', () => {
  const FLOOR = CORRIDOR_FLOOR_DOORS

  // How many a floor gets is banded by its size, so a long floor is not left with the
  // same one-to-three a short one gets and a corridor every seven rooms.
  it('deals a count inside its own floor band', () => {
    ;[5, 7, 8, 10, 11, 12, 15, 20].forEach((doorCount) => {
      const band = corridorsForFloor(doorCount)

      for (let i = 0; i < 400; i++) {
        const doors = rollCorridorDoors(doorCount, Math.random)

        expect(doors.length, `${doorCount} rooms`).toBeGreaterThanOrEqual(band.min)
        expect(doors.length, `${doorCount} rooms`).toBeLessThanOrEqual(band.max)
      }
    })
  })

  it('deals every count its band allows, not one fixed number', () => {
    ;[7, 10, 15].forEach((doorCount) => {
      const band = corridorsForFloor(doorCount)
      const counts = new Set()

      for (let i = 0; i < 4000; i++) {
        counts.add(rollCorridorDoors(doorCount, Math.random).length)
      }

      const wanted = []
      for (let n = band.min; n <= band.max; n++) {
        wanted.push(n)
      }

      expect([...counts].sort((a, b) => a - b), `${doorCount} rooms`).toEqual(wanted)
    })
  })

  it('picks door-takings that exist', () => {
    for (let i = 0; i < 2000; i++) {
      rollCorridorDoors(FLOOR, Math.random).forEach((door) => {
        expect(door).toBeGreaterThanOrEqual(0)
        expect(door).toBeLessThan(FLOOR)
        expect(Number.isInteger(door)).toBe(true)
      })
    }
  })

  it('hands them back sorted, with no door named twice', () => {
    for (let i = 0; i < 2000; i++) {
      const doors = rollCorridorDoors(FLOOR, Math.random)

      expect([...doors].sort((a, b) => a - b)).toEqual(doors)
      expect(new Set(doors).size).toBe(doors.length)
    }
  })

  // The spread constraint, and the whole reason this is rolled for a floor rather than per
  // door: two corridors back to back read as the game padding itself out.
  it('never puts two corridors on consecutive doors', () => {
    for (let i = 0; i < 5000; i++) {
      gaps(rollCorridorDoors(FLOOR, Math.random)).forEach((gap) =>
        expect(gap).toBeGreaterThanOrEqual(2)
      )
    }
  })

  // The point of banding the count by floor size: the "one every two or three rooms" feel
  // has to survive a floor twice as long, which a flat one-to-three could not do - it left
  // a 15-room floor with one corridor every seven and a half rooms.
  // Measured with the bands in: 2.8 at seven rooms, 3.1 at ten, 3.8 at fifteen. A flat
  // one-to-three gave 2.8, 3.6 and 5.0, so the long floors are the ones this bought.
  // Fifteen rooms is a corridor every three or four rather than every two or three - the
  // bands are steps, and the top one covers everything from twelve rooms up.
  it('keeps them a few rooms apart in every band', () => {
    ;[7, 10, 15].forEach((doorCount) => {
      const meanGap = averageGap(doorCount)

      expect(meanGap, `${doorCount} rooms`).toBeGreaterThan(2)
      expect(meanGap, `${doorCount} rooms`).toBeLessThan(4)
    })
  })

  // Density is the other half of the same question: rooms per corridor, rather than the
  // distance between two of them.
  it('keeps a corridor every few rooms in every band', () => {
    ;[7, 10, 15].forEach((doorCount) => {
      let corridors = 0
      const runs = 4000

      for (let i = 0; i < runs; i++) {
        corridors += rollCorridorDoors(doorCount, Math.random).length
      }

      const roomsPerCorridor = doorCount / (corridors / runs)

      expect(roomsPerCorridor, `${doorCount} rooms`).toBeGreaterThan(2)
      expect(roomsPerCorridor, `${doorCount} rooms`).toBeLessThan(5)
    })
  })

  // Density is the measure the banding was for, and the one that actually moved: rooms per
  // corridor went from 3.5, 5.0, 7.5 across the three sizes to 3.5, 4.0, 4.3. A long floor
  // is now within about a room of a short one instead of twice as sparse.
  it('keeps density roughly flat across the bands', () => {
    const density = (doorCount, runs = 4000) => {
      let corridors = 0

      for (let i = 0; i < runs; i++) {
        corridors += rollCorridorDoors(doorCount, Math.random).length
      }

      return doorCount / (corridors / runs)
    }

    expect(density(15) - density(7)).toBeLessThan(1.5)
  })

  // A corridor must be able to land anywhere in the floor, not just early: pre-rolling is
  // only fair if the whole span is reachable.
  it('can land on any door of the floor across enough runs', () => {
    const seen = new Set()

    for (let i = 0; i < 4000; i++) {
      rollCorridorDoors(FLOOR, Math.random).forEach((door) => seen.add(door))
    }

    expect(seen.size).toBe(FLOOR)
  })

  // Needs an even door count to mean anything: reversing a valid selection gives another
  // valid one, so the distribution is symmetric about the middle - but on an odd floor the
  // middle door falls on one side of the split and drags it off 50/50 on its own. That
  // artefact is why CORRIDOR_FLOOR_DOORS is even.
  it('does not crowd them all into the first half', () => {
    expect(FLOOR % 2).toBe(0)

    let firstHalf = 0
    let all = 0

    for (let i = 0; i < 4000; i++) {
      rollCorridorDoors(FLOOR, Math.random).forEach((door) => {
        all += 1
        if (door < FLOOR / 2) {
          firstHalf += 1
        }
      })
    }

    expect(firstHalf / all).toBeGreaterThan(0.45)
    expect(firstHalf / all).toBeLessThan(0.55)
  })

  // A floor too short to hold three non-adjacent corridors gets what fits, rather than
  // looping forever or handing back two on touching doors. Floor 1 is 7 rooms, but the
  // count is the floor's own and later floors run to 15 and beyond.
  it('takes what a short floor can hold', () => {
    for (let doorCount = 1; doorCount <= 6; doorCount++) {
      for (let i = 0; i < 400; i++) {
        const doors = rollCorridorDoors(doorCount, Math.random)

        expect(doors.length).toBeGreaterThanOrEqual(1)
        expect(doors.length).toBeLessThanOrEqual(Math.ceil(doorCount / 2))
        gaps(doors).forEach((gap) => expect(gap).toBeGreaterThanOrEqual(2))
        doors.forEach((door) => expect(door).toBeLessThan(doorCount))
      }
    }
  })

  it('gives the same floor to the same rolls', () => {
    const seeded = () => {
      let i = 0
      const q = [0.7, 0.2, 0.55, 0.9, 0.1, 0.3]

      return () => q[i++ % q.length]
    }

    expect(rollCorridorDoors(CORRIDOR_FLOOR_DOORS, seeded())).toEqual(
      rollCorridorDoors(CORRIDOR_FLOOR_DOORS, seeded())
    )
  })

  it('leaves most of the floor free of them', () => {
    ;[7, 10, 15].forEach((doorCount) => {
      for (let i = 0; i < 400; i++) {
        expect(rollCorridorDoors(doorCount, Math.random).length).toBeLessThan(doorCount / 2)
      }
    })
  })
})
