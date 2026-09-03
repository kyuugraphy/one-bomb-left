import { describe, expect, it } from 'vitest'
import {
  BASE_ROOM_CELLS,
  MAX_DOORS,
  ROOM_SHAPES,
  doorCapacity,
  floorCells,
  isFloor,
  shapeSize
} from './shapes.js'

const SHAPES = Object.values(ROOM_SHAPES)
const FACINGS = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] }

// The same guarantee the rectangular generator enforces shape by shape, run here over a
// hand-authored mask: walk out from the entry and count what you can stand on.
function reachableFrom(shape, start) {
  const seen = new Set([start.join(',')])
  const queue = [start]
  let reached = 0

  while (queue.length) {
    const [row, col] = queue.pop()
    reached += 1

    Object.values(FACINGS).forEach(([dRow, dCol]) => {
      const next = [row + dRow, col + dCol]
      const key = next.join(',')

      if (seen.has(key) || !isFloor(shape, next[0], next[1])) {
        return
      }

      seen.add(key)
      queue.push(next)
    })
  }

  return reached
}

// How far the wall a doorway sits in runs: down the column for a door in an east/west
// wall, across the row for one in a north/south wall. A cell only counts while it is
// still wall - floor with void or the mask edge on the outward side. G's inner bar dies
// into the south bar, so its west tip stops being a tip well before the floor stops.
function wallRun(shape, [row, col], facing) {
  const [oRow, oCol] = FACINGS[facing]
  const [dRow, dCol] = facing === 'north' || facing === 'south' ? [0, 1] : [1, 0]
  const onWall = (r, c) => isFloor(shape, r, c) && !isFloor(shape, r + oRow, c + oCol)
  let run = 1

  for (let step = 1; onWall(row + dRow * step, col + dCol * step); step++) run += 1
  for (let step = 1; onWall(row - dRow * step, col - dCol * step); step++) run += 1

  return run
}

describe('ROOM_SHAPES', () => {
  it('defines exactly the four templates L, Z, T and G', () => {
    expect(Object.keys(ROOM_SHAPES)).toEqual(['L', 'Z', 'T', 'G'])
    SHAPES.forEach((shape) => expect(shape.id).toBe(Object.keys(ROOM_SHAPES)[SHAPES.indexOf(shape)]))
  })

  it('spells every mask out as a rectangle of floor and void, nothing else', () => {
    SHAPES.forEach((shape) => {
      const { rows, cols } = shapeSize(shape)

      expect(shape.mask).toHaveLength(rows)
      shape.mask.forEach((line) => {
        expect(line).toHaveLength(cols)
        expect(line).toMatch(/^[#.]+$/)
      })
    })
  })

  it('gives each shape roughly three base rooms of floor', () => {
    SHAPES.forEach((shape) => {
      const area = floorCells(shape).length / BASE_ROOM_CELLS

      expect(area).toBeGreaterThan(2.5)
      expect(area).toBeLessThan(3.5)
    })
  })
})

describe('entry and exit cells', () => {
  it('puts the entry on a floor cell of its own mask', () => {
    SHAPES.forEach((shape) => expect(isFloor(shape, ...shape.entry.cell)).toBe(true))
  })

  it('puts every exit on a floor cell of its own mask', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) => expect(isFloor(shape, ...exit.cell)).toBe(true))
    )
  })

  it('never reuses one cell as two doorways', () => {
    SHAPES.forEach((shape) => {
      const keys = [shape.entry, ...shape.exits].map(({ cell }) => cell.join(','))

      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  it('faces every doorway out of the shape, not back into it', () => {
    SHAPES.forEach((shape) =>
      [shape.entry, ...shape.exits].forEach(({ cell, facing }) => {
        const [dRow, dCol] = FACINGS[facing]

        expect(isFloor(shape, cell[0] + dRow, cell[1] + dCol)).toBe(false)
      })
    )
  })

  it('declares a span that matches the floor actually running along that wall', () => {
    SHAPES.forEach((shape) =>
      [shape.entry, ...shape.exits].forEach((door) => {
        expect(wallRun(shape, door.cell, door.facing)).toBe(door.span)
      })
    )
  })
})

describe('connectivity', () => {
  it('reaches every floor cell from the entry - no isolated pockets', () => {
    SHAPES.forEach((shape) => {
      expect(reachableFrom(shape, shape.entry.cell)).toBe(floorCells(shape).length)
    })
  })

  it('reaches every floor cell from each exit too, so the walk works both ways', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) => {
        expect(reachableFrom(shape, exit.cell)).toBe(floorCells(shape).length)
      })
    )
  })

  it('would notice a pocket if one were authored in', () => {
    const ring = { id: 'ring', mask: ['###', '#.#', '###'] }
    const cutOff = { id: 'cutOff', mask: ['##.', '##.', '..#'] }

    expect(reachableFrom(ring, [2, 1])).toBe(floorCells(ring).length)
    expect(reachableFrom(cutOff, [0, 0])).toBeLessThan(floorCells(cutOff).length)
  })
})

describe('doorCapacity', () => {
  it('fits no door on a wall too short to hold one', () => {
    expect(doorCapacity(2)).toBe(0)
  })

  it('fits one door as soon as the wall is three cells wide', () => {
    expect(doorCapacity(3)).toBe(1)
  })

  it('needs a gap between doors, so eight cells still only hold two', () => {
    expect(doorCapacity(8)).toBe(2)
  })

  it('never reports more than the three doors a room ever offers', () => {
    expect(doorCapacity(200)).toBe(MAX_DOORS)
  })
})

describe('exit capacity', () => {
  it('leaves every shape room for the full three doors across its exits', () => {
    SHAPES.forEach((shape) => {
      const total = shape.exits.reduce((sum, exit) => sum + doorCapacity(exit.span), 0)

      expect(total).toBeGreaterThanOrEqual(MAX_DOORS)
    })
  })

  it('gives the two-ended shapes one exit tip and the three-ended ones two', () => {
    expect(ROOM_SHAPES.L.exits).toHaveLength(1)
    expect(ROOM_SHAPES.Z.exits).toHaveLength(1)
    expect(ROOM_SHAPES.T.exits).toHaveLength(2)
    expect(ROOM_SHAPES.G.exits).toHaveLength(2)
  })

  it('can seat all three doors on the single tip of a two-ended shape', () => {
    ;[ROOM_SHAPES.L, ROOM_SHAPES.Z].forEach((shape) => {
      expect(doorCapacity(shape.exits[0].span)).toBe(MAX_DOORS)
    })
  })
})
