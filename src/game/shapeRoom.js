// Turning a shape mask from shapes.js into the things a scene needs: which cells are
// solid, which of them get painted as wall, where the doors on an exit tip go, and where
// a cell sits in world pixels. Pure functions with no Phaser in them, the same contract
// obstacles.js and doors.js keep - the scene reads these and paints the result.

import { doorCapacity, isFloor, shapeSize } from './shapes.js'

const FACINGS = {
  north: [-1, 0],
  south: [1, 0],
  east: [0, 1],
  west: [0, -1]
}

// How far in from the wall a door pad sits, in cells. The rectangular room puts its pads
// 1.5 cells down from the top wall and lets the free-cell snap push them the rest of the
// way in; two cells is where that lands, so a shaped room starts there.
export const DOOR_INSET = 2

export function roomSize(shape, cellSize) {
  const { rows, cols } = shapeSize(shape)

  return { width: cols * cellSize, height: rows * cellSize }
}

export function cellCentre([row, col], cellSize) {
  return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 }
}

// The cell `inset` steps in from a doorway, away from the way out. A doorway's own cell
// is part of the wall ring - it is the hole, not the floor beside it - so anything that
// wants floor there, a door pad or the player's landing spot, starts by stepping inward.
export function innerCell(doorway, inset = DOOR_INSET) {
  const [outRow, outCol] = FACINGS[doorway.facing]

  return [doorway.cell[0] - outRow * inset, doorway.cell[1] - outCol * inset]
}

// A cell the player cannot stand on. Void is solid for the obvious reason; a floor cell
// on the mask's edge is solid because that is where the wall goes - exactly what the
// rectangular room does when it marks its whole border ring blocked. Edge means
// 4-adjacent to void or to nothing at all, so the ring is one cell thick and unbroken.
export function solidGrid(shape) {
  const { rows, cols } = shapeSize(shape)

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => !isFloor(shape, row, col) || isEdge(shape, row, col))
  )
}

function isEdge(shape, row, col) {
  return Object.values(FACINGS).some(
    ([dRow, dCol]) => !isFloor(shape, row + dRow, col + dCol)
  )
}

// The cells solidGrid() turned into wall *and* that something could see: the floor cells
// on the edge. The void behind them needs no tile of its own - the ring is unbroken, so
// nothing on foot ever reaches it, and painting 484 dead cells for the L would be 484
// bodies bought for nothing.
export function wallCells(shape) {
  const { rows, cols } = shapeSize(shape)
  const cells = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (isFloor(shape, row, col) && isEdge(shape, row, col)) {
        cells.push([row, col])
      }
    }
  }

  return cells
}

// The run of wall a doorway is cut through, walked out from its cell in both directions
// along the wall. A cell only counts while the cell on its *outward* side is void or off
// the mask: G's inner bar dies into the south bar, so the floor there keeps running for
// twice as long as the wall does, and measuring the floor would put half a door in open
// space. Comes back ordered, so spreading doors along it is an index walk.
export function wallRun(shape, doorway) {
  const [outRow, outCol] = FACINGS[doorway.facing]
  const [alongRow, alongCol] = [Math.abs(outCol), Math.abs(outRow)]
  const onWall = ([row, col]) =>
    isFloor(shape, row, col) && !isFloor(shape, row + outRow, col + outCol)

  const run = [doorway.cell]

  for (const step of [-1, 1]) {
    let [row, col] = doorway.cell

    for (;;) {
      row += alongRow * step
      col += alongCol * step

      if (!onWall([row, col])) {
        break
      }

      run.push([row, col])
    }
  }

  return run.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

// Every way `count` doors divide between tips of these capacities, as a list of
// per-tip counts. Recursive because the shapes have one or two tips and might one day
// have three; the lists are tiny either way.
function allocations(capacities, count) {
  if (capacities.length === 0) {
    return count === 0 ? [[]] : []
  }

  const [head, ...rest] = capacities
  const out = []

  for (let take = 0; take <= Math.min(head, count); take++) {
    allocations(rest, count - take).forEach((tail) => out.push([take, ...tail]))
  }

  return out
}

// How a room's doors divide between a shape's exit tips, drawn uniformly over every
// valid split. Filling the first tip before starting the next looks the same on L and Z,
// which have one tip each - but it would put every door T ever offers on its west arm and
// never on its east one, which is the whole thing the two-tip shapes were drawn to avoid.
// "Both on this tip", "both on that one" and "one each" are three real hands, and which
// one a room deals is a roll, not a property of the shape. RNG injected, as doors.js.
export function splitDoors(shape, count, randomFn) {
  const capacities = shape.exits.map((exit) => doorCapacity(exit.span))
  const total = capacities.reduce((sum, capacity) => sum + capacity, 0)
  const options = allocations(capacities, Math.min(count, total))

  return options[Math.floor(randomFn() * options.length)]
}

// Where the pads for `count` doors go on one exit tip: spread evenly along the tip's wall
// run - the same (index + 0.5) spacing the rectangular room uses across its top wall -
// then stepped inward off the wall onto floor the player can stand on. Never more doors
// than doorCapacity() said the tip would seat.
export function doorCells(shape, doorway, count, inset = DOOR_INSET) {
  const run = wallRun(shape, doorway)
  const taken = Math.min(count, doorCapacity(doorway.span))

  return Array.from({ length: taken }, (_, index) =>
    innerCell(
      { cell: run[Math.floor(((index + 0.5) / taken) * run.length)], facing: doorway.facing },
      inset
    )
  )
}
