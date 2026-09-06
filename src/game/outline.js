// The edge of a clump, as a line rather than as a stack of squares.
//
// Rocks and pits are sets of grid cells, and drawing them cell by cell makes every clump a
// union of 56 px squares - right angles on a grid, in a game that otherwise has none. This
// traces the boundary of a set of cells into a closed loop of points, so the shape can be
// drawn as one outline and that outline can be nudged off the grid.
//
// Pure, with the RNG injected, the same contract as the rest of the generation code; the
// scene turns the points into a mask.

// The four sides of a cell, each as the neighbour it faces and the directed edge it
// contributes when that neighbour is empty.
//
// **Direction matters.** Each edge is written so that following them start-to-end walks the
// boundary consistently - along the top rightwards, down the right side, along the bottom
// leftwards, up the left. That is what lets the loop be chained by matching each edge's end
// to the next one's start, instead of having to work out which way round the shape is.
const SIDES = [
  { step: [-1, 0], from: [0, 0], to: [0, 1] },
  { step: [0, 1], from: [0, 1], to: [1, 1] },
  { step: [1, 0], from: [1, 1], to: [1, 0] },
  { step: [0, -1], from: [1, 0], to: [0, 0] }
]

const key = (point) => point.join(',')

// Every boundary edge of the set: the sides of filled cells whose neighbour is not filled.
function boundaryEdges(cells) {
  const filled = new Set(cells.map(key))
  const edges = []

  cells.forEach(([row, col]) => {
    SIDES.forEach(({ step, from, to }) => {
      if (filled.has(key([row + step[0], col + step[1]]))) {
        return
      }

      edges.push({
        from: [row + from[0], col + from[1]],
        to: [row + to[0], col + to[1]]
      })
    })
  })

  return edges
}

// The outline of a set of cells, as one or more closed loops of corner points.
//
// Points are in **corner coordinates**: a cell at [row, col] has corners [row, col] through
// [row + 1, col + 1], so a loop is integers and the caller multiplies by the cell size.
//
// Collinear points are deliberately kept. A straight run of four cells comes back with a
// point every cell rather than just its two ends, because every one of those points is
// somewhere the outline can later be nudged - merging them first would leave long edges
// that stay perfectly straight no matter how hard they are jittered.
//
// More than one loop comes back when a clump pinches to a point - two cells meeting only at
// a corner, which a big enough clump can do. Each loop is closed and traced independently.
export function traceOutline(cells) {
  const remaining = new Map()

  boundaryEdges(cells).forEach((edge) => {
    const at = key(edge.from)

    remaining.set(at, [...(remaining.get(at) ?? []), edge])
  })

  const loops = []

  while (remaining.size > 0) {
    const [startKey] = remaining.keys()
    const loop = []
    let at = startKey

    while (remaining.has(at)) {
      const edges = remaining.get(at)
      const edge = edges.shift()

      if (edges.length === 0) {
        remaining.delete(at)
      }

      loop.push(edge.from)
      at = key(edge.to)
    }

    if (loop.length > 0) {
      loops.push(loop)
    }
  }

  return loops
}

// Nudge every point off the grid.
//
// The amount is in the caller's own units - grid units in the tests, pixels in the scene -
// so this does not need to know how big a cell is. Each point moves independently within a
// square of that size, which is enough to break the right angles without moving the outline
// far enough to uncover the cells underneath or cover ones that are not there.
//
// **Two rolls per point, x then y**, so a test can queue against it.
export function jitterPoints(points, amount, randomFn) {
  return points.map(([row, col]) => [
    row + (randomFn() * 2 - 1) * amount,
    col + (randomFn() * 2 - 1) * amount
  ])
}
