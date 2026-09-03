import { describe, expect, it } from 'vitest'
import { ROOM_SHAPES, doorCapacity, floorCells, isFloor, shapeSize } from './shapes.js'
import {
  DOOR_INSET,
  cellCentre,
  doorCells,
  roomSize,
  solidGrid,
  splitDoors,
  wallCells,
  wallRun
} from './shapeRoom.js'

const CELL = 56
const SHAPES = Object.values(ROOM_SHAPES)
const L = ROOM_SHAPES.L
const FACINGS = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] }
const NEIGHBOURS = Object.values(FACINGS)

describe('roomSize', () => {
  it('is the mask measured in cells', () => {
    expect(roomSize(L, CELL)).toEqual({ width: 40 * CELL, height: 40 * CELL })
  })
})

describe('cellCentre', () => {
  it('puts the origin cell half a cell in from the corner', () => {
    expect(cellCentre([0, 0], CELL)).toEqual({ x: 28, y: 28 })
  })

  it('reads row as y and col as x, not the other way round', () => {
    expect(cellCentre([3, 7], CELL)).toEqual({ x: 7 * CELL + 28, y: 3 * CELL + 28 })
  })

  // The scene rounds a world point back to a cell by flooring; a centre has to survive
  // the round trip or an obstacle would land a cell away from where it was drawn.
  it('round-trips through the scene floor-divide', () => {
    floorCells(L).forEach(([row, col]) => {
      const { x, y } = cellCentre([row, col], CELL)

      expect([Math.floor(y / CELL), Math.floor(x / CELL)]).toEqual([row, col])
    })
  })
})

describe('solidGrid', () => {
  it('matches the mask in size', () => {
    SHAPES.forEach((shape) => {
      const { rows, cols } = shapeSize(shape)
      const solid = solidGrid(shape)

      expect(solid.length).toBe(rows)
      solid.forEach((line) => expect(line.length).toBe(cols))
    })
  })

  it('marks every void cell solid', () => {
    SHAPES.forEach((shape) => {
      const solid = solidGrid(shape)

      solid.forEach((line, row) =>
        line.forEach((_, col) => {
          if (!isFloor(shape, row, col)) {
            expect(solid[row][col]).toBe(true)
          }
        })
      )
    })
  })

  // The open set has to sit strictly inside the mask: obstacle generation and its
  // flood-fill both work the 1..n-2 box, so an open cell on the outer row would be
  // walkable floor the generator never sees.
  it('leaves no open cell on the bounding box edge', () => {
    SHAPES.forEach((shape) => {
      const { rows, cols } = shapeSize(shape)
      const solid = solidGrid(shape)

      for (let col = 0; col < cols; col++) {
        expect(solid[0][col]).toBe(true)
        expect(solid[rows - 1][col]).toBe(true)
      }
      for (let row = 0; row < rows; row++) {
        expect(solid[row][0]).toBe(true)
        expect(solid[row][cols - 1]).toBe(true)
      }
    })
  })

  // The wall ring is the only thing keeping anything on foot out of the void, so it has
  // to be unbroken: no open cell may touch a void cell.
  it('never lets an open cell touch the void', () => {
    SHAPES.forEach((shape) => {
      const solid = solidGrid(shape)

      solid.forEach((line, row) =>
        line.forEach((isSolid, col) => {
          if (isSolid) {
            return
          }

          NEIGHBOURS.forEach(([dRow, dCol]) =>
            expect(isFloor(shape, row + dRow, col + dCol)).toBe(true)
          )
        })
      )
    })
  })

  // A rectangle is the degenerate mask, and the answer has to be the border ring the
  // rectangular room already builds - otherwise wiring shapes in changes those rooms.
  it('reduces to a plain border ring for a solid rectangle', () => {
    const rows = 15
    const cols = 24
    const rect = { mask: Array.from({ length: rows }, () => '#'.repeat(cols)) }

    solidGrid(rect).forEach((line, row) =>
      line.forEach((isSolid, col) =>
        expect(isSolid).toBe(row === 0 || col === 0 || row === rows - 1 || col === cols - 1)
      )
    )
  })

  // Open floor is what the room is for: the ring should cost the shape a rim, not a
  // meaningful share of the room the mask promised.
  it('keeps most of the mask walkable', () => {
    SHAPES.forEach((shape) => {
      const open = solidGrid(shape).flat().filter((isSolid) => !isSolid).length

      expect(open).toBeGreaterThan(floorCells(shape).length * 0.8)
    })
  })
})

describe('wallCells', () => {
  it('is exactly the floor cells solidGrid marks solid', () => {
    SHAPES.forEach((shape) => {
      const solid = solidGrid(shape)
      const expected = floorCells(shape).filter(([row, col]) => solid[row][col])

      expect(wallCells(shape)).toEqual(expected)
    })
  })

  it('paints no void cell', () => {
    SHAPES.forEach((shape) =>
      wallCells(shape).forEach(([row, col]) => expect(isFloor(shape, row, col)).toBe(true))
    )
  })
})

describe('wallRun', () => {
  // The span each shape declares is the number shapes.test.js checks and the number
  // doorCapacity() spends; the run walked out of the mask has to agree with it.
  it('is as long as the declared span, for every doorway of every shape', () => {
    SHAPES.forEach((shape) => {
      ;[shape.entry, ...shape.exits].forEach((doorway) =>
        expect(wallRun(shape, doorway).length).toBe(doorway.span)
      )
    })
  })

  it('contains the doorway cell', () => {
    SHAPES.forEach((shape) => {
      ;[shape.entry, ...shape.exits].forEach((doorway) =>
        expect(wallRun(shape, doorway)).toContainEqual(doorway.cell)
      )
    })
  })

  it('runs along one line, perpendicular to the way out', () => {
    SHAPES.forEach((shape) => {
      ;[shape.entry, ...shape.exits].forEach((doorway) => {
        const [outRow] = FACINGS[doorway.facing]
        const fixed = outRow === 0 ? 1 : 0

        wallRun(shape, doorway).forEach((cell) => expect(cell[fixed]).toBe(doorway.cell[fixed]))
      })
    })
  })

  it('is floor with void or nothing on its outward side', () => {
    SHAPES.forEach((shape) => {
      ;[shape.entry, ...shape.exits].forEach((doorway) => {
        const [outRow, outCol] = FACINGS[doorway.facing]

        wallRun(shape, doorway).forEach(([row, col]) => {
          expect(isFloor(shape, row, col)).toBe(true)
          expect(isFloor(shape, row + outRow, col + outCol)).toBe(false)
        })
      })
    })
  })

  // The rule the shape notes call out: G's inner bar dies into the south bar, so the
  // floor along that column runs twice as far as the west-facing wall does. Measuring
  // the floor instead would put half a door in open space.
  it('stops at the end of G inner bar rather than running on into the floor below it', () => {
    const bar = ROOM_SHAPES.G.exits[0]
    const floorRun = Array.from({ length: 40 }, (_, row) => row).filter((row) =>
      isFloor(ROOM_SHAPES.G, row, bar.cell[1])
    ).length

    expect(wallRun(ROOM_SHAPES.G, bar).length).toBe(10)
    expect(floorRun).toBeGreaterThan(10)
  })
})

describe('doorCells', () => {
  const isOpen = (shape) => {
    const solid = solidGrid(shape)

    return ([row, col]) => solid[row]?.[col] === false
  }

  it('never hands back more doors than the tip can seat', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) =>
        expect(doorCells(shape, exit, 9).length).toBe(doorCapacity(exit.span))
      )
    )
  })

  it('hands back the count asked for while there is room', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) => {
        for (let count = 1; count <= doorCapacity(exit.span); count++) {
          expect(doorCells(shape, exit, count).length).toBe(count)
        }
      })
    )
  })

  it('puts every pad on open floor, not in the wall or the void', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) =>
        doorCells(shape, exit, 3).forEach((cell) => expect(isOpen(shape)(cell)).toBe(true))
      )
    )
  })

  it('insets the pads off the wall, away from the way out', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) => {
        const [outRow, outCol] = FACINGS[exit.facing]

        doorCells(shape, exit, 2).forEach(([row, col]) => {
          const back = [row + outRow * DOOR_INSET, col + outCol * DOOR_INSET]

          expect(wallRun(shape, exit)).toContainEqual(back)
        })
      })
    )
  })

  it('spreads the pads out instead of stacking them', () => {
    SHAPES.forEach((shape) =>
      shape.exits.forEach((exit) => {
        const cells = doorCells(shape, exit, doorCapacity(exit.span))

        expect(new Set(cells.map((cell) => cell.join(','))).size).toBe(cells.length)
      })
    )
  })

  // Three doors on the 18-cell north tip is the case L was drawn for: they should land
  // spread across the arm rather than bunched at one end of it.
  it('spreads three doors across the L exit arm', () => {
    expect(doorCells(L, L.exits[0], 3).map(([, col]) => col)).toEqual([3, 9, 15])
  })
})

describe('splitDoors', () => {
  const capacities = (shape) => shape.exits.map((exit) => doorCapacity(exit.span))
  // Every allocation the roll can land on, by sweeping the RNG across its whole range.
  const outcomes = (shape, count) =>
    Array.from({ length: 200 }, (_, i) => splitDoors(shape, count, () => i / 200).join(','))

  it('always hands out the doors that were rolled, while the tips can seat them', () => {
    SHAPES.forEach((shape) => {
      const total = capacities(shape).reduce((sum, c) => sum + c, 0)

      for (let count = 1; count <= 3; count++) {
        new Set(outcomes(shape, count)).forEach((outcome) => {
          const parts = outcome.split(',').map(Number)

          expect(parts.reduce((sum, n) => sum + n, 0)).toBe(Math.min(count, total))
        })
      }
    })
  })

  it('never puts more doors on a tip than it can seat', () => {
    SHAPES.forEach((shape) => {
      const caps = capacities(shape)

      for (let count = 1; count <= 3; count++) {
        new Set(outcomes(shape, count)).forEach((outcome) =>
          outcome.split(',').map(Number).forEach((n, index) => expect(n).toBeLessThanOrEqual(caps[index]))
        )
      }
    })
  })

  it('gives a one-tip shape the only answer there is', () => {
    expect(new Set(outcomes(L, 3))).toEqual(new Set(['3']))
    expect(new Set(outcomes(ROOM_SHAPES.Z, 2))).toEqual(new Set(['2']))
  })

  // The reason this function exists: filling the first tip first would put every door T
  // offers on its west arm forever. All three hands have to be reachable.
  it('deals both-here, both-there and one-each on T', () => {
    expect(new Set(outcomes(ROOM_SHAPES.T, 2))).toEqual(new Set(['0,2', '1,1', '2,0']))
  })

  it('reaches both of G tips, whose capacities differ', () => {
    expect(new Set(outcomes(ROOM_SHAPES.G, 2))).toEqual(new Set(['0,2', '1,1', '2,0']))
    // G's inner bar seats two, so a roll of three can never sit entirely on it
    expect(new Set(outcomes(ROOM_SHAPES.G, 3))).toEqual(new Set(['0,3', '1,2', '2,1']))
  })

  it('is a roll, not a fixed answer: no tip is favoured on a fair RNG', () => {
    const counts = {}
    outcomes(ROOM_SHAPES.T, 3).forEach((o) => {
      counts[o] = (counts[o] ?? 0) + 1
    })

    expect(Object.keys(counts).length).toBe(4)
    Object.values(counts).forEach((n) => expect(n).toBeGreaterThan(200 / 4 - 5))
  })

  // The pads a split actually turns into: as many as were allocated, all on open floor,
  // and a tip allocated nothing gets nothing.
  it('turns into that many pads, on floor, tip by tip', () => {
    SHAPES.forEach((shape) => {
      const solid = solidGrid(shape)

      for (let count = 2; count <= 3; count++) {
        const split = splitDoors(shape, count, () => 0.5)

        shape.exits.forEach((exit, index) => {
          const cells = doorCells(shape, exit, split[index])

          expect(cells.length).toBe(split[index])
          cells.forEach(([row, col]) => expect(solid[row][col]).toBe(false))
        })
      }
    })
  })
})
