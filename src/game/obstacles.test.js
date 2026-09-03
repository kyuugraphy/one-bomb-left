import { describe, expect, it } from 'vitest'
import { COVERAGE_MAX, NEIGHBOURS, generateObstacles, rollCoverage } from './obstacles.js'

// The real room: 24x15 cells of the 56 px grid, per main.js.
const COLS = 24
const ROWS = 15
const DOORWAY_CELL = [ROWS - 2, Math.floor(COLS / 2)]

// A queued RNG: each call returns the next value, so every roll in a test is chosen.
function rng(...values) {
  let i = 0
  return () => values[i++]
}

// The scene's own grid: a blocked border ring plus the doorway channel the player walks
// in through - the same shape buildObstacles hands the generator.
function reservedGrid() {
  const reserved = []

  for (let row = 0; row < ROWS; row++) {
    reserved[row] = []
    for (let col = 0; col < COLS; col++) {
      reserved[row][col] = row === 0 || col === 0 || row === ROWS - 1 || col === COLS - 1
    }
  }

  const left = Math.floor((COLS * 56 - 140) / 2 / 56)
  const right = Math.floor((COLS * 56 + 140) / 2 / 56)
  for (let row = ROWS - 3; row < ROWS - 1; row++) {
    for (let col = left; col <= right; col++) {
      reserved[row][col] = true
    }
  }

  return reserved
}

function layoutFor(coverage, randomFn = Math.random) {
  return generateObstacles({
    cols: COLS,
    rows: ROWS,
    reserved: reservedGrid(),
    doorwayCell: DOORWAY_CELL,
    coverage,
    randomFn
  })
}

// Every open interior cell must be reachable on foot from the doorway. This is the
// guarantee the generator enforces shape by shape; here it is checked on the finished room.
function fullyConnected(blocked) {
  let open = 0
  for (let row = 1; row < ROWS - 1; row++) {
    for (let col = 1; col < COLS - 1; col++) {
      if (!blocked[row][col]) {
        open += 1
      }
    }
  }

  const seen = new Set([DOORWAY_CELL.join(',')])
  const queue = [DOORWAY_CELL]
  let reached = 0

  while (queue.length) {
    const [row, col] = queue.pop()
    reached += 1

    NEIGHBOURS.forEach(([dRow, dCol]) => {
      const next = [row + dRow, col + dCol]
      const key = next.join(',')

      if (
        seen.has(key) ||
        next[0] < 1 ||
        next[1] < 1 ||
        next[0] > ROWS - 2 ||
        next[1] > COLS - 2 ||
        blocked[next[0]][next[1]]
      ) {
        return
      }

      seen.add(key)
      queue.push(next)
    })
  }

  return reached === open
}

describe('rollCoverage', () => {
  it('draws nothing at all on the low roll - an empty room is a real hand', () => {
    expect(rollCoverage(rng(0))).toBe(0)
  })

  it('never asks for more than a third of the floor', () => {
    expect(rollCoverage(rng(0.999999))).toBeLessThan(COVERAGE_MAX)
  })

  it('spreads evenly across the range rather than clustering', () => {
    ;[0.25, 0.5, 0.75].forEach((roll) => {
      expect(rollCoverage(rng(roll))).toBeCloseTo(roll * COVERAGE_MAX, 10)
    })
  })
})

describe('generateObstacles', () => {
  it('leaves the room bare when the coverage roll came up empty', () => {
    const layout = layoutFor(0)

    expect(layout.shapes).toHaveLength(0)
    expect(layout.coverage).toBe(0)
  })

  it('does not touch the reserved border or doorway', () => {
    const reserved = reservedGrid()
    const layout = generateObstacles({
      cols: COLS,
      rows: ROWS,
      reserved,
      doorwayCell: DOORWAY_CELL,
      coverage: COVERAGE_MAX,
      randomFn: Math.random
    })

    layout.shapes.forEach(({ cells }) =>
      cells.forEach(([row, col]) => expect(reserved[row][col]).toBe(false))
    )
  })

  it('lands inside 0-33% coverage across many fresh layouts', () => {
    for (let sample = 0; sample < 400; sample++) {
      const layout = layoutFor(rollCoverage(Math.random))

      expect(layout.coverage).toBeGreaterThanOrEqual(0)
      expect(layout.coverage).toBeLessThanOrEqual(COVERAGE_MAX)
    }
  })

  it('produces both sparse and dense rooms, not one fixed density', () => {
    const covers = Array.from({ length: 400 }, () => layoutFor(rollCoverage(Math.random)).coverage)

    expect(Math.min(...covers)).toBeLessThan(0.05)
    expect(Math.max(...covers)).toBeGreaterThan(0.28)
  })

  it('keeps every open cell reachable at coverage near the 33% ceiling', () => {
    for (let sample = 0; sample < 60; sample++) {
      expect(fullyConnected(layoutFor(COVERAGE_MAX).blocked)).toBe(true)
    }
  })

  it('keeps every open cell reachable at a very low coverage too', () => {
    for (let sample = 0; sample < 60; sample++) {
      expect(fullyConnected(layoutFor(rollCoverage(Math.random) * 0.1).blocked)).toBe(true)
    }
  })

  it('keeps every open cell reachable across the whole range', () => {
    for (let sample = 0; sample < 200; sample++) {
      expect(fullyConnected(layoutFor(rollCoverage(Math.random)).blocked)).toBe(true)
    }
  })

  it('still favours the wall band and small shapes', () => {
    const shapes = Array.from({ length: 40 }, () => layoutFor(COVERAGE_MAX).shapes).flat()
    const nearWall = shapes.filter(({ cells }) =>
      cells.some(
        ([row, col]) => Math.min(row - 1, col - 1, ROWS - 2 - row, COLS - 2 - col) < 3
      )
    )
    const rocks = shapes.filter(({ asRock }) => asRock)
    const small = rocks.filter(({ cells }) => cells.length <= 4)

    expect(nearWall.length / shapes.length).toBeGreaterThan(0.6)
    expect(small.length / rocks.length).toBeGreaterThan(0.5)
  })
})
