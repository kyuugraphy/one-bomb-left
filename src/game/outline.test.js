import { describe, expect, it } from 'vitest'
import { jitterPoints, traceOutline } from './outline.js'

// A queued RNG: each call returns the next value, so every roll in a test is chosen.
function rng(...values) {
  let i = 0
  return () => values[i++]
}

const loopOf = (cells) => {
  const loops = traceOutline(cells)

  expect(loops).toHaveLength(1)

  return loops[0]
}

describe('traceOutline', () => {
  it('walks a single cell as its four corners', () => {
    expect(loopOf([[0, 0]])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ])
  })

  // Collinear points are kept on purpose - see the note in outline.js. A domino is six
  // points, not four, because the two mid-edge points are places the outline can wobble.
  it('keeps the points along a straight run rather than merging them', () => {
    const loop = loopOf([
      [0, 0],
      [0, 1]
    ])

    expect(loop).toHaveLength(6)
    expect(loop).toContainEqual([0, 1])
    expect(loop).toContainEqual([1, 1])
  })

  it('closes the loop, so the last point joins the first', () => {
    const shapes = [
      [[0, 0]],
      [
        [0, 0],
        [0, 1]
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1]
      ],
      [
        [2, 2],
        [2, 3],
        [3, 2],
        [3, 3]
      ]
    ]

    shapes.forEach((cells) => {
      const loop = loopOf(cells)
      const [first] = loop
      const last = loop[loop.length - 1]

      expect(Math.abs(first[0] - last[0]) + Math.abs(first[1] - last[1])).toBe(1)
    })
  })

  // Every step is one cell edge. A jump of more than one means the chain took a wrong turn
  // somewhere, which would show up as an outline cutting across the middle of the shape.
  it('moves one cell edge at a time, never diagonally', () => {
    const cells = [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2]
    ]

    const loop = loopOf(cells)

    loop.forEach((point, index) => {
      const next = loop[(index + 1) % loop.length]
      const dRow = Math.abs(point[0] - next[0])
      const dCol = Math.abs(point[1] - next[1])

      expect(dRow + dCol).toBe(1)
    })
  })

  it('gives a solid block the perimeter of a block, not of its cells', () => {
    // a 2x2 square: 8 boundary edges, so 8 points
    expect(
      loopOf([
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1]
      ])
    ).toHaveLength(8)
  })

  it('traces an L without cutting the corner', () => {
    const loop = loopOf([
      [0, 0],
      [1, 0],
      [1, 1]
    ])

    // the inner corner of the L has to be on the outline
    expect(loop).toContainEqual([1, 1])
    expect(loop).toHaveLength(8)
  })

  it('holds every point on a real cell corner', () => {
    const cells = [
      [3, 4],
      [3, 5],
      [4, 5]
    ]

    loopOf(cells).forEach(([row, col]) => {
      expect(Number.isInteger(row)).toBe(true)
      expect(Number.isInteger(col)).toBe(true)
      expect(row).toBeGreaterThanOrEqual(3)
      expect(row).toBeLessThanOrEqual(5)
      expect(col).toBeGreaterThanOrEqual(4)
      expect(col).toBeLessThanOrEqual(6)
    })
  })

  it('hands back nothing for nothing', () => {
    expect(traceOutline([])).toEqual([])
  })

  // Two cells touching only at a corner cannot be walked as one loop, so they come back as
  // two. Rare - a clump has to be big enough to reach round - but it must not hang or throw.
  it('splits a shape that pinches to a point into separate loops', () => {
    const loops = traceOutline([
      [0, 0],
      [1, 1]
    ])

    expect(loops).toHaveLength(2)
    loops.forEach((loop) => expect(loop).toHaveLength(4))
  })

  it('consumes every boundary edge exactly once', () => {
    const cells = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1]
    ]
    const points = traceOutline(cells).flat()

    // 5 cells is 20 sides. Five pairs touch - (0,0)-(0,1), (0,0)-(1,0), (0,1)-(1,1),
    // (1,0)-(1,1), (1,1)-(2,1) - and each shared side hides two of them, so 20 - 2*5 = 10.
    expect(points).toHaveLength(10)
  })
})

describe('jitterPoints', () => {
  it('moves every point', () => {
    const moved = jitterPoints([[0, 0]], 0.2, rng(1, 0))

    expect(moved[0][0]).toBeCloseTo(0.2)
    expect(moved[0][1]).toBeCloseTo(-0.2)
  })

  it('keeps every point within the amount it was given', () => {
    const points = Array.from({ length: 200 }, (_, i) => [i % 7, i % 5])

    jitterPoints(points, 0.15, Math.random).forEach(([row, col], index) => {
      expect(Math.abs(row - points[index][0])).toBeLessThanOrEqual(0.15)
      expect(Math.abs(col - points[index][1])).toBeLessThanOrEqual(0.15)
    })
  })

  it('leaves a point alone on a middling roll', () => {
    expect(jitterPoints([[3, 4]], 0.2, rng(0.5, 0.5))).toEqual([[3, 4]])
  })

  it('spends two rolls a point, x then y', () => {
    let calls = 0

    jitterPoints([[0, 0], [1, 1], [2, 2]], 0.1, () => {
      calls += 1
      return 0.5
    })

    expect(calls).toBe(6)
  })

  it('hands back as many points as it was given', () => {
    const points = [[0, 0], [0, 1], [1, 1], [1, 0]]

    expect(jitterPoints(points, 0.1, Math.random)).toHaveLength(points.length)
  })

  it('does not touch the points it was given', () => {
    const points = [[0, 0], [0, 1]]
    const snapshot = JSON.stringify(points)

    jitterPoints(points, 0.3, Math.random)

    expect(JSON.stringify(points)).toBe(snapshot)
  })
})
