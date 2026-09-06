import { describe, expect, it } from 'vitest'
import {
  BASE_ROOM_CELLS,
  MAX_DOORS,
  ROOM_SHAPES,
  SHAPE_ROOM_CHANCE,
  SHAPE_EDGE_ROOMS,
  doorCapacity,
  floorCells,
  isFloor,
  rollRoomShape,
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

describe('rollRoomShape', () => {
  // A queued RNG, so every roll in a test is chosen rather than hoped for.
  const rng = (...values) => {
    let i = 0
    return () => values[i++]
  }
  const ids = Object.keys(ROOM_SHAPES)
  const rooms = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

  // The band is a share of the floor now, not rooms 3-7 of the run. It used to be measured
  // against the run-global room number, which meant floor 1 got big rooms and **every floor
  // after it was rectangles all the way down** - the run counter was past 7 before floor 2
  // began. Excluding the first and last two rooms of each floor gives every floor the same
  // shape of experience: settle in, then anything, then a run-up to the boss.
  it('leaves the first two rooms of any floor as rectangles', () => {
    ;[7, 11, 15].forEach((floorRooms) => {
      rooms(1, SHAPE_EDGE_ROOMS).forEach((room) =>
        expect(rollRoomShape(room, floorRooms, () => 0)).toBe(null)
      )
    })
  })

  // The last two are the pre-boss shop checkpoint and the room whose doors the boss takes
  // over. Neither is a place to drop a two-minute room.
  it('leaves the last two rooms of any floor as rectangles', () => {
    ;[7, 11, 15].forEach((floorRooms) => {
      rooms(floorRooms - SHAPE_EDGE_ROOMS + 1, floorRooms).forEach((room) =>
        expect(rollRoomShape(room, floorRooms, () => 0)).toBe(null)
      )
    })
  })

  it('includes both ends of the band, on every floor length', () => {
    ;[7, 11, 15].forEach((floorRooms) => {
      const first = SHAPE_EDGE_ROOMS + 1
      const last = floorRooms - SHAPE_EDGE_ROOMS

      expect(rollRoomShape(first, floorRooms, rng(0, 0))).toBe(ids[0])
      expect(rollRoomShape(last, floorRooms, rng(0, 0))).toBe(ids[0])
      expect(rollRoomShape(first - 1, floorRooms, rng(0, 0))).toBe(null)
      expect(rollRoomShape(last + 1, floorRooms, rng(0, 0))).toBe(null)
    })
  })

  // The whole point of the change: a floor deep in a run is as varied as floor 1.
  it('gives every floor its own band, scaled to its own length', () => {
    const eligible = (floorRooms) =>
      rooms(1, floorRooms).filter((room) => rollRoomShape(room, floorRooms, rng(0, 0)) !== null)

    expect(eligible(7)).toEqual([3, 4, 5])
    expect(eligible(9)).toEqual([3, 4, 5, 6, 7])
    expect(eligible(15)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })

  // A floor short enough to be all edge has no middle to put a big room in. Not reachable
  // today - the shortest floor is 7 - but the arithmetic should not produce a band that
  // runs backwards if one ever is.
  it('offers no band at all on a floor with no middle', () => {
    ;[1, 2, 3, 4].forEach((floorRooms) => {
      rooms(1, floorRooms).forEach((room) =>
        expect(rollRoomShape(room, floorRooms, () => 0)).toBe(null)
      )
    })
  })

  it('is a rectangle on the miss side of the chance and a shape on the hit side', () => {
    rooms(3, 5).forEach((room) => {
      expect(rollRoomShape(room, 7, rng(SHAPE_ROOM_CHANCE))).toBe(null)
      expect(rollRoomShape(room, 7, rng(SHAPE_ROOM_CHANCE - 0.001, 0))).not.toBe(null)
    })
  })

  it('only ever names a shape that exists', () => {
    for (let i = 0; i < 400; i++) {
      const rolled = rollRoomShape(4, 7, Math.random)

      if (rolled !== null) {
        expect(ROOM_SHAPES[rolled]).toBeDefined()
      }
    }
  })

  it('can reach all four shapes, evenly', () => {
    const seen = {}

    ids.forEach((_, index) => {
      // second roll picks the shape: index/ids.length lands squarely on that id
      seen[rollRoomShape(4, 7, rng(0, index / ids.length))] = true
    })

    expect(Object.keys(seen).sort()).toEqual([...ids].sort())
  })

  it('splits the band about evenly between shapes and rectangles', () => {
    let shaped = 0
    const runs = 4000

    for (let i = 0; i < runs; i++) {
      if (rollRoomShape(4, 7, Math.random) !== null) {
        shaped += 1
      }
    }

    expect(shaped / runs).toBeGreaterThan(SHAPE_ROOM_CHANCE - 0.05)
    expect(shaped / runs).toBeLessThan(SHAPE_ROOM_CHANCE + 0.05)
  })

  it('gives a floor a shaped middle and rectangular ends', () => {
    const floor = rooms(1, 7).map((room) => rollRoomShape(room, 7, () => 0) === null)

    expect(floor).toEqual([true, true, false, false, false, true, true])
  })
})
