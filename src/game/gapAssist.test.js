import { describe, expect, it } from 'vitest'
import { CENTRED_ENOUGH, CENTRING_BAND, computeGapNudge } from './gapAssist.js'

// A small open room inside the blocked border ring every room is built with, so a cell
// read off the edge is wall the same way it is in the real grid.
const ROWS = 9
const COLS = 9

function openGrid() {
  const blocked = []

  for (let row = 0; row < ROWS; row++) {
    blocked[row] = []
    for (let col = 0; col < COLS; col++) {
      blocked[row][col] = row === 0 || col === 0 || row === ROWS - 1 || col === COLS - 1
    }
  }

  return blocked
}

// Rocks by cell, so each test reads as the square of floor it is describing.
function gridWith(...rocks) {
  const blocked = openGrid()

  rocks.forEach(([row, col]) => {
    blocked[row][col] = true
  })

  return blocked
}

// Directions are the -1/0/1 pairs updateMovement builds from WASD.
const RIGHT = { moveDirRow: 0, moveDirCol: 1 }
const LEFT = { moveDirRow: 0, moveDirCol: -1 }
const DOWN = { moveDirRow: 1, moveDirCol: 0 }
const UP = { moveDirRow: -1, moveDirCol: 0 }

// The player defaults to dead centre of cell (4, 4). Tests that care about being off
// centre say so, because that offset is now the whole input to how hard the lean is.
function nudge(blocked, direction, playerRow = 4.5, playerCol = 4.5) {
  return computeGapNudge({ playerRow, playerCol, ...direction, blocked })
}

// A one-cell gap: two rocks with a single block of space between them. Walking right out
// of cell (4, 4), the lane ahead is (4, 5) and the rocks sit at (3, 5) and (5, 5).
const GAP_RIGHT = gridWith([3, 5], [5, 5])
const GAP_LEFT = gridWith([3, 3], [5, 3])
const GAP_DOWN = gridWith([5, 3], [5, 5])
const GAP_UP = gridWith([3, 3], [3, 5])

// Far enough off centre to be at full lean, and comfortably inside the 5 px of slack a
// 46 px body actually has in a 56 px gap.
const OFF = 0.1

describe('computeGapNudge - lining up with a one-cell gap', () => {
  it('leans down when high in the lane, moving right', () => {
    expect(nudge(GAP_RIGHT, RIGHT, 4.5 - OFF).row).toBe(1)
  })

  it('leans up when low in the lane, moving right', () => {
    expect(nudge(GAP_RIGHT, RIGHT, 4.5 + OFF).row).toBe(-1)
  })

  it('leans down when high in the lane, moving left', () => {
    expect(nudge(GAP_LEFT, LEFT, 4.5 - OFF).row).toBe(1)
  })

  it('leans up when low in the lane, moving left', () => {
    expect(nudge(GAP_LEFT, LEFT, 4.5 + OFF).row).toBe(-1)
  })

  it('leans right when left of the lane, moving down', () => {
    expect(nudge(GAP_DOWN, DOWN, 4.5, 4.5 - OFF).col).toBe(1)
  })

  it('leans left when right of the lane, moving down', () => {
    expect(nudge(GAP_DOWN, DOWN, 4.5, 4.5 + OFF).col).toBe(-1)
  })

  it('leans right when left of the lane, moving up', () => {
    expect(nudge(GAP_UP, UP, 4.5, 4.5 - OFF).col).toBe(1)
  })

  it('leans left when right of the lane, moving up', () => {
    expect(nudge(GAP_UP, UP, 4.5, 4.5 + OFF).col).toBe(-1)
  })

  it('never leans along the axis the player is already moving on', () => {
    expect(nudge(GAP_RIGHT, RIGHT, 4.5 - OFF).col).toBe(0)
    expect(nudge(GAP_LEFT, LEFT, 4.5 + OFF).col).toBe(0)
    expect(nudge(GAP_DOWN, DOWN, 4.5, 4.5 - OFF).row).toBe(0)
    expect(nudge(GAP_UP, UP, 4.5, 4.5 + OFF).row).toBe(0)
  })

  it('works the same for a gap between a rock and the wall ring', () => {
    // Row 1 is the top open row, so a rock at (2, 5) leaves one cell between it and the
    // wall at (0, 5) - a real squeeze, just with the room's edge as one of the two sides.
    const blocked = gridWith([2, 5])

    expect(nudge(blocked, RIGHT, 1.5 + OFF).row).toBe(-1)
  })

  it('works the same for a one-cell hole in a wall, which is what a doorway is', () => {
    const blocked = openGrid()
    blocked[ROWS - 1][4] = false

    expect(nudge(blocked, DOWN, ROWS - 1.5, 4.5 + OFF).col).toBe(-1)
  })
})

// The lean is how far off centre she is, not a constant. This is what stops it shoving
// the player past the middle of the gap and out the other side.
describe('computeGapNudge - the lean tapers', () => {
  it('does nothing at all when already centred', () => {
    expect(nudge(GAP_RIGHT, RIGHT, 4.5)).toEqual({ row: 0, col: 0 })
  })

  it('does nothing inside the centred-enough band', () => {
    expect(nudge(GAP_RIGHT, RIGHT, 4.5 + CENTRED_ENOUGH / 2)).toEqual({ row: 0, col: 0 })
  })

  it('leans harder the further off centre she is', () => {
    const near = Math.abs(nudge(GAP_RIGHT, RIGHT, 4.5 + CENTRING_BAND / 3).row)
    const far = Math.abs(nudge(GAP_RIGHT, RIGHT, 4.5 + CENTRING_BAND / 1.5).row)

    expect(far).toBeGreaterThan(near)
  })

  it('reaches full lean at the edge of the band and stays there', () => {
    expect(nudge(GAP_RIGHT, RIGHT, 4.5 + CENTRING_BAND).row).toBeCloseTo(-1)
    expect(nudge(GAP_RIGHT, RIGHT, 4.5 + 0.3).row).toBe(-1)
  })

  it('never leaves -1 to 1 on either axis, however far off centre', () => {
    ;[4.01, 4.2, 4.5, 4.8, 4.99].forEach((playerRow) => {
      const result = nudge(GAP_RIGHT, RIGHT, playerRow)

      expect(result.row).toBeGreaterThanOrEqual(-1)
      expect(result.row).toBeLessThanOrEqual(1)
      expect(result.col).toBeGreaterThanOrEqual(-1)
      expect(result.col).toBeLessThanOrEqual(1)
    })
  })

  it('always leans towards the centre, never away from it', () => {
    ;[4.05, 4.2, 4.4].forEach((high) => {
      expect(nudge(GAP_RIGHT, RIGHT, high).row).toBeGreaterThan(0)
    })
    ;[4.6, 4.8, 4.95].forEach((low) => {
      expect(nudge(GAP_RIGHT, RIGHT, low).row).toBeLessThan(0)
    })
  })
})

// The whole point of this pass. A wall on one side and floor on the other is what most of
// a room looks like from inside it, and the first cut leaned on all of it.
describe('computeGapNudge - leaves everything wider than one cell alone', () => {
  it('leaves open floor alone in every direction', () => {
    ;[RIGHT, LEFT, DOWN, UP].forEach((direction) => {
      expect(nudge(openGrid(), direction, 4.2, 4.2)).toEqual({ row: 0, col: 0 })
    })
  })

  it('does not lean past a single rock in open floor', () => {
    expect(nudge(gridWith([3, 5]), RIGHT, 4.2)).toEqual({ row: 0, col: 0 })
    expect(nudge(gridWith([5, 5]), RIGHT, 4.8)).toEqual({ row: 0, col: 0 })
  })

  it('does not lean while walking along a wall', () => {
    // The reported bug: the border ring made every wall-adjacent lane look like a squeeze.
    expect(nudge(openGrid(), RIGHT, 1.2)).toEqual({ row: 0, col: 0 })
    expect(nudge(openGrid(), RIGHT, ROWS - 1.8)).toEqual({ row: 0, col: 0 })
    expect(nudge(openGrid(), DOWN, 4.5, 1.2)).toEqual({ row: 0, col: 0 })
    expect(nudge(openGrid(), DOWN, 4.5, COLS - 1.8)).toEqual({ row: 0, col: 0 })
  })

  it('does not lean in a wall corner, where two edges meet but nothing is threaded', () => {
    expect(nudge(openGrid(), RIGHT, 1.2, 1.2)).toEqual({ row: 0, col: 0 })
  })

  it('does not lean in a two-cell gap, which a 46 px body cannot catch on', () => {
    // Rocks at (2, 5) and (5, 5) leave rows 3 and 4 open: 112 px of room.
    const blocked = gridWith([2, 5], [5, 5])

    expect(nudge(blocked, RIGHT, 4.2)).toEqual({ row: 0, col: 0 })
  })

  it('does not lean along the open side of a long rock wall', () => {
    const blocked = gridWith([3, 4], [3, 5], [3, 6], [3, 7])

    expect(nudge(blocked, RIGHT, 4.2)).toEqual({ row: 0, col: 0 })
  })
})

describe('computeGapNudge - nothing to correct at all', () => {
  it('does not correct a player who is standing still', () => {
    expect(
      computeGapNudge({
        playerRow: 4.2,
        playerCol: 4.2,
        moveDirRow: 0,
        moveDirCol: 0,
        blocked: GAP_RIGHT
      })
    ).toEqual({ row: 0, col: 0 })
  })

  it('does not correct any of the four diagonals', () => {
    ;[
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    ].forEach(([moveDirRow, moveDirCol]) => {
      expect(
        computeGapNudge({
          playerRow: 4.2,
          playerCol: 4.2,
          moveDirRow,
          moveDirCol,
          blocked: GAP_RIGHT
        })
      ).toEqual({ row: 0, col: 0 })
    })
  })

  it('does not lean when the cell ahead is solid - that is a wall, not a gap', () => {
    // Rocks either side of the lane and in it: walking into the middle one.
    const blocked = gridWith([3, 5], [4, 5], [5, 5])

    expect(nudge(blocked, RIGHT, 4.2)).toEqual({ row: 0, col: 0 })
  })

  it('does not lean when walking into the wall ring', () => {
    expect(nudge(openGrid(), UP, 1.2, 4.2)).toEqual({ row: 0, col: 0 })
  })
})

describe('computeGapNudge - reading the grid', () => {
  it('reads the next cell along once the player has crossed into it', () => {
    // The gap at column 5 is behind her once she is in column 5; ahead is open floor.
    expect(nudge(GAP_RIGHT, RIGHT, 4.2, 4.5).row).toBe(1)
    expect(nudge(GAP_RIGHT, RIGHT, 4.2, 5.5)).toEqual({ row: 0, col: 0 })
  })

  it('treats cells outside the grid as blocked rather than open', () => {
    expect(nudge(openGrid(), UP, 0.5, 0.5)).toEqual({ row: 0, col: 0 })
  })

  it('does not mutate the grid it was handed', () => {
    const blocked = gridWith([3, 5], [5, 5])
    const before = JSON.stringify(blocked)

    nudge(blocked, RIGHT, 4.2)

    expect(JSON.stringify(blocked)).toBe(before)
  })

  it('hands back a fresh object each call, so a caller cannot poison the next one', () => {
    const first = nudge(GAP_RIGHT, RIGHT, 4.5 - OFF)
    first.row = 99

    expect(nudge(GAP_RIGHT, RIGHT, 4.5 - OFF).row).toBe(1)
  })
})
