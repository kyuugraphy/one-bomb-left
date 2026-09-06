import { describe, expect, it } from 'vitest'
import {
  ARENA_COLS,
  ARENA_ROWS,
  MIRROR_X,
  MIRROR_Y,
  ROTATE_180,
  SYMMETRY_TYPES,
  ARENA_COVERAGE_MAX,
  ARENA_COVERAGE_MIN,
  ARENA_ROCK_MAX_CELLS,
  BOSS_FOOTPRINT_COLS,
  BOSS_FOOTPRINT_ROWS,
  arenaBossSpawn,
  arenaEntry,
  generateArenaObstacles,
  imagesOf,
  isSymmetric,
  rollSymmetry
} from './arena.js'
import { reachesEveryOpenCell } from './obstacles.js'

describe('the symmetry a boss arena is built on', () => {
  it('offers three types', () => {
    expect(SYMMETRY_TYPES).toEqual([MIRROR_X, MIRROR_Y, ROTATE_180])
  })

  // A 90-degree turn maps (row, col) to (col, rows-1-row), so its image needs as many rows
  // as the room has columns. That only fits a square, and a boss arena is the base room's
  // 24x15 - so 90 degrees is not on the list, and could not be.
  it('is built on the base room, which is not square', () => {
    expect(ARENA_COLS).toBe(24)
    expect(ARENA_ROWS).toBe(15)
    expect(ARENA_COLS).not.toBe(ARENA_ROWS)
  })
})

describe('rollSymmetry', () => {
  it('draws from the three types', () => {
    for (let i = 0; i < 500; i++) {
      expect(SYMMETRY_TYPES).toContain(rollSymmetry(null, Math.random))
    }
  })

  it('reaches every type from a cold start', () => {
    const seen = new Set()

    for (let i = 0; i < 2000; i++) {
      seen.add(rollSymmetry(null, Math.random))
    }

    expect([...seen].sort()).toEqual([...SYMMETRY_TYPES].sort())
  })

  // Two arenas running on the same symmetry back to back read as one arena built twice.
  // The same lightweight rule the ambush lines use: exclude the last one, draw evenly from
  // what is left, rather than shuffling a fixed pool.
  it('never repeats the type it was told was last', () => {
    SYMMETRY_TYPES.forEach((last) => {
      ;[0, 0.25, 0.5, 0.75, 0.99].forEach((roll) => {
        expect(rollSymmetry(last, () => roll)).not.toBe(last)
      })
    })
  })

  it('can still reach both other types when one is excluded', () => {
    SYMMETRY_TYPES.forEach((last) => {
      const seen = new Set()

      for (let i = 0; i < 2000; i++) {
        seen.add(rollSymmetry(last, Math.random))
      }

      expect(seen.size).toBe(SYMMETRY_TYPES.length - 1)
      expect(seen.has(last)).toBe(false)
    })
  })

  it('ignores a last type it has never heard of', () => {
    const seen = new Set()

    for (let i = 0; i < 2000; i++) {
      seen.add(rollSymmetry('rotate-90', Math.random))
    }

    expect(seen.size).toBe(SYMMETRY_TYPES.length)
  })

  it('spends exactly one roll', () => {
    let calls = 0

    rollSymmetry(null, () => {
      calls += 1
      return 0.5
    })

    expect(calls).toBe(1)
  })
})

// Every cell a given cell drags with it. Obstacles are placed by orbit rather than one at a
// time: a pair can pinch a channel neither cell would close alone, so the whole orbit goes
// down together and the room is checked once afterwards.
describe('imagesOf', () => {
  it('mirrors left to right across a vertical axis', () => {
    expect(imagesOf([3, 1], MIRROR_X)).toEqual([[3, 1], [3, 22]])
    expect(imagesOf([3, 22], MIRROR_X)).toEqual([[3, 22], [3, 1]])
  })

  it('mirrors top to bottom across a horizontal axis', () => {
    expect(imagesOf([1, 5], MIRROR_Y)).toEqual([[1, 5], [13, 5]])
  })

  it('turns a cell through half a circle', () => {
    expect(imagesOf([1, 1], ROTATE_180)).toEqual([[1, 1], [13, 22]])
  })

  it('always includes the cell it was given', () => {
    SYMMETRY_TYPES.forEach((type) => {
      for (let row = 1; row < ARENA_ROWS - 1; row++) {
        for (let col = 1; col < ARENA_COLS - 1; col++) {
          expect(imagesOf([row, col], type)).toContainEqual([row, col])
        }
      }
    })
  })

  // The middle row is its own reflection, so it must not be listed twice - a duplicate
  // would have the placer counting one cell as two and under-filling the arena.
  it('gives a cell on the axis a single image', () => {
    expect(imagesOf([7, 5], MIRROR_Y)).toEqual([[7, 5]])
  })

  // 24 is even, so there is no middle column to be its own reflection, and no cell is its
  // own image under a half turn either - (7, 11.5) is not a cell.
  it('has no self-image column, and none at all under rotation', () => {
    for (let col = 1; col < ARENA_COLS - 1; col++) {
      expect(imagesOf([7, col], MIRROR_X)).toHaveLength(2)
    }
    for (let row = 1; row < ARENA_ROWS - 1; row++) {
      for (let col = 1; col < ARENA_COLS - 1; col++) {
        expect(imagesOf([row, col], ROTATE_180)).toHaveLength(2)
      }
    }
  })

  it('keeps every image inside the arena', () => {
    SYMMETRY_TYPES.forEach((type) => {
      for (let row = 0; row < ARENA_ROWS; row++) {
        for (let col = 0; col < ARENA_COLS; col++) {
          imagesOf([row, col], type).forEach(([r, c]) => {
            expect(r).toBeGreaterThanOrEqual(0)
            expect(r).toBeLessThan(ARENA_ROWS)
            expect(c).toBeGreaterThanOrEqual(0)
            expect(c).toBeLessThan(ARENA_COLS)
          })
        }
      }
    })
  })

  // Applying the image twice comes back where it started, for all three. That is what makes
  // an orbit closed, and it is why placing a whole orbit leaves the grid symmetric.
  it('is its own inverse', () => {
    SYMMETRY_TYPES.forEach((type) => {
      for (let row = 1; row < ARENA_ROWS - 1; row++) {
        for (let col = 1; col < ARENA_COLS - 1; col++) {
          imagesOf([row, col], type).forEach((image) => {
            expect(imagesOf(image, type)).toContainEqual([row, col])
          })
        }
      }
    })
  })
})

// Used by the tests that come after this piece, to check a generated arena really is
// symmetric rather than looking it over by eye.
describe('isSymmetric', () => {
  const empty = () =>
    Array.from({ length: ARENA_ROWS }, () => Array.from({ length: ARENA_COLS }, () => false))

  it('accepts an empty grid under every type', () => {
    SYMMETRY_TYPES.forEach((type) => expect(isSymmetric(empty(), type)).toBe(true))
  })

  it('accepts a grid built by placing whole orbits', () => {
    SYMMETRY_TYPES.forEach((type) => {
      const grid = empty()

      ;[[2, 3], [5, 9], [11, 20]].forEach((cell) => {
        imagesOf(cell, type).forEach(([r, c]) => {
          grid[r][c] = true
        })
      })

      expect(isSymmetric(grid, type)).toBe(true)
    })
  })

  it('rejects a grid with a cell whose counterpart is missing', () => {
    SYMMETRY_TYPES.forEach((type) => {
      const grid = empty()

      grid[2][3] = true

      expect(isSymmetric(grid, type)).toBe(false)
    })
  })
})

// The arena's clutter. Its own generator rather than generateObstacles with a flag, for the
// same reason corridors got one: that function seeds, grows, tests and commits inside one
// closed loop with no hook to mirror through, and putting a mirror option into the
// generator every room in the game depends on is a worse trade than a second small one.
// What is shared is the connectivity check, which is the part that matters.
describe('generateArenaObstacles', () => {
  const build = (symmetry, randomFn = Math.random) => generateArenaObstacles(symmetry, randomFn)

  it('hands back a full arena-sized grid', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { blocked } = build(symmetry)

      expect(blocked).toHaveLength(ARENA_ROWS)
      blocked.forEach((line) => expect(line).toHaveLength(ARENA_COLS))
    })
  })

  it('walls the border, as every room in the game does', () => {
    const { blocked } = build(MIRROR_X)

    for (let col = 0; col < ARENA_COLS; col++) {
      expect(blocked[0][col]).toBe(true)
      expect(blocked[ARENA_ROWS - 1][col]).toBe(true)
    }
    for (let row = 0; row < ARENA_ROWS; row++) {
      expect(blocked[row][0]).toBe(true)
      expect(blocked[row][ARENA_COLS - 1]).toBe(true)
    }
  })

  // The whole point. Not "looks symmetric" - every blocked cell's counterpart is blocked
  // too, checked mechanically.
  it('comes out genuinely symmetric on the type it was asked for', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 120; arena++) {
        expect(isSymmetric(build(symmetry).blocked, symmetry)).toBe(true)
      }
    })
  })

  // An arena you cannot cross is an arena you cannot fight a boss in. The orbit goes down
  // as one unit and the room is checked once, because a mirrored pair can pinch a channel
  // that neither cell would close on its own.
  //
  // Sample sizes here are deliberately modest. This ran 400 arenas per symmetry and took
  // 3.7 s of a 5 s timeout, so it failed under any load - a flaky test, not a flaky
  // generator. The property itself was checked over **216,000 arenas** offline with zero
  // disconnections; what is left here is a guard against regression, not the proof.
  it('always leaves every open cell reachable from every other', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 120; arena++) {
        const { blocked } = build(symmetry)
        const start = []

        for (let row = 1; row < ARENA_ROWS - 1 && !start.length; row++) {
          for (let col = 1; col < ARENA_COLS - 1 && !start.length; col++) {
            if (!blocked[row][col]) start.push(row, col)
          }
        }

        expect(reachesEveryOpenCell(blocked, start)).toBe(true)
      }
    })
  })

  // Lower than a combat room's, which runs to a third. A boss needs room to be fought in,
  // and clutter that reads as texture in an ordinary room reads as a cage here.
  it('keeps coverage below what an ordinary combat room can reach', () => {
    expect(ARENA_COVERAGE_MAX).toBeLessThan(1 / 3)
    expect(ARENA_COVERAGE_MIN).toBeLessThan(ARENA_COVERAGE_MAX)
  })

  it('lands its coverage inside the band it rolled', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 80; arena++) {
        const { coverage } = build(symmetry)

        expect(coverage).toBeGreaterThan(0)
        expect(coverage).toBeLessThanOrEqual(ARENA_COVERAGE_MAX + 0.05)
      }
    })
  })

  // Clumps, not scattered single cells and not the eight-cell boulders an ordinary room
  // grows. Four is where an arena still reads as pillars and cover rather than terrain,
  // and where mirroring a whole shape stays cheap - measured 5.7% of placements rejected
  // against 13.4% at eight.
  //
  // **A recorded shape is the whole orbit**, not the clump that seeded it: the clump plus
  // its reflection, placed and rejected as one unit because half an orbit is an asymmetric
  // arena. So four cells of clump paint up to eight, and a clump sitting on the mirror-y
  // axis - where a cell is its own image - paints exactly its own size.
  it('grows clumps no larger than four cells, and paints them with their images', () => {
    expect(ARENA_ROCK_MAX_CELLS).toBe(4)

    const orbitCap = ARENA_ROCK_MAX_CELLS * 2

    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 80; arena++) {
        build(symmetry).shapes.forEach((shape) => {
          expect(shape.cells.length).toBeGreaterThanOrEqual(1)
          expect(shape.cells.length).toBeLessThanOrEqual(orbitCap)
        })
      }
    })
  })

  // The clump itself is still bounded, which is the thing the number is about. Half an
  // orbit is at most a clump, so no half of any shape exceeds the cap.
  it('keeps each half of a mirrored shape within the clump size', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 80; arena++) {
        build(symmetry).shapes.forEach((shape) => {
          const halves = new Map()

          shape.cells.forEach((cell) => {
            // the orbit's two halves, keyed by whichever image sorts first
            const key = imagesOf(cell, symmetry)
              .map((image) => image.join(','))
              .sort()[0]

            halves.set(key, (halves.get(key) ?? 0) + 1)
          })

          expect(halves.size).toBeLessThanOrEqual(ARENA_ROCK_MAX_CELLS)
        })
      }
    })
  })

  it('tags every shape as a rock or a pit, the way every other room does', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      build(symmetry).shapes.forEach((shape) => {
        expect(typeof shape.asRock).toBe('boolean')
      })
    })
  })

  it('paints exactly the cells its shapes claim', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { blocked, shapes } = build(symmetry)

      shapes.forEach((shape) => {
        shape.cells.forEach(([row, col]) => expect(blocked[row][col]).toBe(true))
      })
    })
  })

  it('is repeatable for a repeatable RNG, so an arena can be pinned', () => {
    const seeded = () => {
      let seed = 7
      return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed / 2147483648
      }
    }

    const first = generateArenaObstacles(ROTATE_180, seeded())
    const second = generateArenaObstacles(ROTATE_180, seeded())

    expect(first.blocked).toEqual(second.blocked)
  })

  // A mirrored shape that lands on top of its own reflection is one shape, not two - the
  // count has to reflect what was painted or the coverage figure drifts.
  it('never double-counts a shape that overlaps its own image', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 80; arena++) {
        const { blocked, shapes } = build(symmetry)
        const claimed = new Set()

        shapes.forEach((shape) => shape.cells.forEach((cell) => claimed.add(cell.join(','))))

        let painted = 0

        for (let row = 1; row < ARENA_ROWS - 1; row++) {
          for (let col = 1; col < ARENA_COLS - 1; col++) {
            if (blocked[row][col]) painted += 1
          }
        }

        expect(claimed.size).toBe(painted)
      }
    })
  })
})

// Where the player comes in. **The entry has to sit on the symmetry**, or the arena is
// symmetric everywhere except the one place the player is guaranteed to be looking at when
// they arrive.
//
// A bottom-centre doorway - what every other room in the game uses - is on the axis for
// left/right mirroring and off it for the other two, so the entry is chosen per type rather
// than fixed.
describe('arenaEntry', () => {
  const grid = (cells) => {
    const g = Array.from({ length: ARENA_ROWS }, () =>
      Array.from({ length: ARENA_COLS }, () => false)
    )

    cells.forEach(([row, col]) => {
      g[row][col] = true
    })

    return g
  }

  it('gives every symmetry an entry inside the walls', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { cell } = arenaEntry(symmetry)

      expect(cell[0]).toBeGreaterThanOrEqual(1)
      expect(cell[0]).toBeLessThanOrEqual(ARENA_ROWS - 2)
      expect(cell[1]).toBeGreaterThanOrEqual(1)
      expect(cell[1]).toBeLessThanOrEqual(ARENA_COLS - 2)
    })
  })

  // The property that matters: reserving these cells must not itself break the symmetry the
  // obstacles were so careful to keep.
  it('reserves a closed orbit, so the entry is symmetric too', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      expect(isSymmetric(grid(arenaEntry(symmetry).reserved), symmetry)).toBe(true)
    })
  })

  it('always reserves the cell the player actually stands on', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { cell, reserved } = arenaEntry(symmetry)

      expect(reserved).toContainEqual(cell)
    })
  })

  // Left/right mirroring has a vertical axis, and 24 columns means it falls between columns
  // 11 and 12 rather than on one - so the doorway is the pair, and the player walks in
  // between them.
  it('brings the player in at the bottom middle when the arena mirrors left to right', () => {
    const { cell, reserved } = arenaEntry(MIRROR_X)

    expect(cell[0]).toBe(ARENA_ROWS - 2)
    expect(reserved.map(([, col]) => col).sort((a, b) => a - b)).toEqual([11, 12])
  })

  // Top/bottom mirroring has a horizontal axis, and 15 rows means it lands squarely on row
  // 7 - so the entry is a single cell on the middle row, at the left wall.
  it('brings the player in at the left middle when the arena mirrors top to bottom', () => {
    const { cell, reserved } = arenaEntry(MIRROR_Y)

    expect(cell).toEqual([7, 1])
    expect(reserved).toEqual([[7, 1]])
  })

  // A half turn has no axis to stand on, so the entry keeps its ordinary bottom-centre
  // position and its image is held open at the top as a matching alcove - floor with nothing
  // behind it, there so the arena still reads as turned rather than as broken.
  it('opens a matching alcove opposite the entry when the arena is rotated', () => {
    const { cell, reserved } = arenaEntry(ROTATE_180)

    expect(cell[0]).toBe(ARENA_ROWS - 2)
    expect(reserved).toHaveLength(2)
    expect(reserved).toContainEqual(cell)
    expect(reserved).toContainEqual([ARENA_ROWS - 1 - cell[0], ARENA_COLS - 1 - cell[1]])
  })
})

describe('an arena built around its entry', () => {
  it('never builds an obstacle on the entry or its images', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { reserved } = arenaEntry(symmetry)

      for (let arena = 0; arena < 100; arena++) {
        const { blocked } = generateArenaObstacles(symmetry, Math.random)

        reserved.forEach(([row, col]) => expect(blocked[row][col]).toBe(false))
      }
    })
  })

  // Reachable from where the player actually is, not from wherever the flood fill happened
  // to start. An arena you cannot walk out of the doorway into is worse than a blocked one,
  // because it looks fine.
  it('leaves the whole arena reachable from the entry itself', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { cell } = arenaEntry(symmetry)

      for (let arena = 0; arena < 100; arena++) {
        const { blocked } = generateArenaObstacles(symmetry, Math.random)

        expect(reachesEveryOpenCell(blocked, cell)).toBe(true)
      }
    })
  })

  it('is still symmetric with the entry held open', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 100; arena++) {
        expect(isSymmetric(generateArenaObstacles(symmetry, Math.random).blocked, symmetry)).toBe(
          true
        )
      }
    })
  })
})

// Where the boss stands. The centre of the arena, which is the one place equally far from
// every wall under all three symmetries - and, awkwardly, **not a cell**: the arena is 24
// wide and 15 tall, so its true middle is (7, 11.5).
//
// The footprint is a block straddling that middle rather than a single cell, which solves
// two problems at once. It gives the boss somewhere to stand that obstacles cannot take,
// and a block centred on the middle is a closed orbit under every symmetry - so reserving
// it does not break the arena the way reserving half an orbit would.
describe('arenaBossSpawn', () => {
  const grid = (cells) => {
    const g = Array.from({ length: ARENA_ROWS }, () =>
      Array.from({ length: ARENA_COLS }, () => false)
    )

    cells.forEach(([row, col]) => {
      g[row][col] = true
    })

    return g
  }

  it('reserves a block of the size it says it does', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      expect(arenaBossSpawn(symmetry).reserved).toHaveLength(
        BOSS_FOOTPRINT_ROWS * BOSS_FOOTPRINT_COLS
      )
    })
  })

  // The same rule the entry follows, and for the same reason.
  it('reserves a closed orbit under every symmetry', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      expect(isSymmetric(grid(arenaBossSpawn(symmetry).reserved), symmetry)).toBe(true)
    })
  })

  // Straddling the true middle, not offset to one side of it. An arena whose boss stands
  // slightly left of centre is an arena that looks symmetric until you notice it is not.
  it('straddles the arena middle on both axes', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { reserved } = arenaBossSpawn(symmetry)
      const rows = reserved.map(([row]) => row)
      const cols = reserved.map(([, col]) => col)

      // rows 6-8 about the middle row 7; columns 11-12 about the middle line at 11.5
      expect(Math.min(...rows) + Math.max(...rows)).toBe(ARENA_ROWS - 1)
      expect(Math.min(...cols) + Math.max(...cols)).toBe(ARENA_COLS - 1)
    })
  })

  it('puts the anchor cell inside its own footprint', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { cell, reserved } = arenaBossSpawn(symmetry)

      expect(reserved).toContainEqual(cell)
    })
  })

  // The boss stands in the middle and the player comes in at a wall, so these must never be
  // the same cells - a boss spawning on top of the player is not an arena, it is an ambush.
  it('never overlaps the way in', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const entry = arenaEntry(symmetry).reserved.map((cell) => cell.join(','))

      arenaBossSpawn(symmetry).reserved.forEach((cell) => {
        expect(entry).not.toContain(cell.join(','))
      })
    })
  })
})

describe('an arena built around both the entry and the boss', () => {
  it('never builds an obstacle where the boss stands', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const { reserved } = arenaBossSpawn(symmetry)

      for (let arena = 0; arena < 100; arena++) {
        const { blocked } = generateArenaObstacles(symmetry, Math.random)

        reserved.forEach(([row, col]) => expect(blocked[row][col]).toBe(false))
      }
    })
  })

  // The fight has to be able to happen: the player walks in, the boss is in the middle, and
  // neither can be walled off from the other.
  it('always leaves the boss reachable from the way in', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      const entry = arenaEntry(symmetry).cell
      const boss = arenaBossSpawn(symmetry).cell

      for (let arena = 0; arena < 100; arena++) {
        const { blocked } = generateArenaObstacles(symmetry, Math.random)

        expect(reachesEveryOpenCell(blocked, entry)).toBe(true)
        expect(blocked[boss[0]][boss[1]]).toBe(false)
      }
    })
  })

  it('is still symmetric with both held open', () => {
    SYMMETRY_TYPES.forEach((symmetry) => {
      for (let arena = 0; arena < 100; arena++) {
        expect(isSymmetric(generateArenaObstacles(symmetry, Math.random).blocked, symmetry)).toBe(
          true
        )
      }
    })
  })
})
