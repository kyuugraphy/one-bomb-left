// The room's rocks and pits, as a grid rather than as sprites. The scene owns the
// dimensions, the border ring and the doorway reservation and paints whatever comes back;
// everything about *where* a shape goes lives here, as a pure roll with the RNG injected -
// the same contract as doors.js and shop.js.

// right, down, left, up - growNoodle turns by rotating this index
export const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0]
]

// How much of the floor a room may lose to obstacles. The figure is a ceiling, not a
// target: every room rolls its own coverage uniformly between nothing and this, so the
// generator produces bare arenas and cluttered warrens from the same code. A third is
// where connectivity starts to fight back - past it the flood-fill check rejects more
// shapes than it accepts and the room stops gaining coverage anyway.
export const COVERAGE_MAX = 1 / 3
const ROCK_AREA_SHARE = 0.6
const NEAR_WALL_SHARE = 2 / 3
const WALL_BAND = 3
const ROCK_MIN_CELLS = 1
const ROCK_MAX_CELLS = 8
const PIT_MIN_CELLS = 3
const PIT_MAX_CELLS = 12
const PIT_RUN_MIN = 2
const PIT_RUN_MAX = 5
const PLACEMENT_ATTEMPTS = 600

// An empty room is a real hand, not a failure to fill one: 0 is included and drawn as
// often as any other coverage.
export function rollCoverage(randomFn) {
  return randomFn() * COVERAGE_MAX
}

function between(randomFn, min, max) {
  return min + Math.floor(randomFn() * (max - min + 1))
}

function pick(randomFn, options) {
  return options[Math.floor(randomFn() * options.length)]
}

// Small shapes are common, big ones rare: weight each size by 1/size.
function pickSize(randomFn, min, max, cap) {
  const top = Math.min(max, Math.max(min, cap))
  let total = 0

  for (let size = min; size <= top; size++) {
    total += 1 / size
  }

  let roll = randomFn() * total

  for (let size = min; size <= top; size++) {
    roll -= 1 / size
    if (roll <= 0) {
      return size
    }
  }

  return min
}

// The mutable state one generation works on: the grid it is filling and the cells it may
// not touch. Kept in one object so the growth helpers stay plain functions.
function isFree(room, row, col) {
  return (
    row > 0 &&
    col > 0 &&
    row < room.rows - 1 &&
    col < room.cols - 1 &&
    !room.blocked[row][col] &&
    !room.reserved[row][col]
  )
}

// Two thirds of the shapes start in the band hugging the wall, the rest further in.
function pickSeed(room, randomFn) {
  const nearWall = randomFn() < NEAR_WALL_SHARE

  for (let attempt = 0; attempt < 60; attempt++) {
    const row = between(randomFn, 1, room.rows - 2)
    const col = between(randomFn, 1, room.cols - 2)
    const depth = Math.min(row - 1, col - 1, room.rows - 2 - row, room.cols - 2 - col)

    if (nearWall !== depth < WALL_BAND) {
      continue
    }
    if (isFree(room, row, col)) {
      return [row, col]
    }
  }

  return null
}

// Rocks: a seed cell that accretes neighbours into a clump.
function growChunk(room, randomFn, cap) {
  const seed = pickSeed(room, randomFn)
  if (!seed) {
    return null
  }

  const size = pickSize(randomFn, ROCK_MIN_CELLS, ROCK_MAX_CELLS, cap)
  const cells = [seed]
  const taken = new Set([seed.join(',')])

  for (let guard = 0; cells.length < size && guard < size * 12; guard++) {
    const [row, col] = pick(randomFn, cells)
    const [dRow, dCol] = pick(randomFn, NEIGHBOURS)
    const next = [row + dRow, col + dCol]
    const key = next.join(',')

    if (taken.has(key) || !isFree(room, next[0], next[1])) {
      continue
    }

    taken.add(key)
    cells.push(next)
  }

  return cells
}

// Pits: a run-and-turn walk, so they come out as I, L, U, S or G noodles.
function growNoodle(room, randomFn, cap) {
  const seed = pickSeed(room, randomFn)
  if (!seed) {
    return null
  }

  const size = pickSize(randomFn, PIT_MIN_CELLS, PIT_MAX_CELLS, cap)
  const turn = pick(randomFn, [-1, 1, 0])
  const cells = [seed]
  const taken = new Set([seed.join(',')])
  let heading = between(randomFn, 0, 3)
  let [row, col] = seed

  while (cells.length < size) {
    const run = Math.min(between(randomFn, PIT_RUN_MIN, PIT_RUN_MAX), size - cells.length)
    const [dRow, dCol] = NEIGHBOURS[heading]
    let stepped = 0

    for (let i = 0; i < run; i++) {
      const next = [row + dRow, col + dCol]
      const key = next.join(',')

      if (taken.has(key) || !isFree(room, next[0], next[1])) {
        break
      }

      taken.add(key)
      cells.push(next)
      row = next[0]
      col = next[1]
      stepped += 1
    }

    if (stepped === 0) {
      break
    }

    // a fixed turn direction curls into U and G, a random one zigzags
    heading = (heading + (turn === 0 ? between(randomFn, 1, 3) : turn) + 4) % 4
  }

  return cells.length >= PIT_MIN_CELLS ? cells : null
}

// Flood fill from the doorway: if any open cell would be cut off, drop the shape.
function keepsRoomWalkable(room, shape) {
  shape.forEach(([row, col]) => {
    room.blocked[row][col] = true
  })

  let open = 0
  for (let row = 1; row < room.rows - 1; row++) {
    for (let col = 1; col < room.cols - 1; col++) {
      if (!room.blocked[row][col]) {
        open += 1
      }
    }
  }

  const seen = new Set([room.doorwayCell.join(',')])
  const queue = [room.doorwayCell]
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
        next[0] > room.rows - 2 ||
        next[1] > room.cols - 2 ||
        room.blocked[next[0]][next[1]]
      ) {
        return
      }

      seen.add(key)
      queue.push(next)
    })
  }

  shape.forEach(([row, col]) => {
    room.blocked[row][col] = false
  })

  return reached === open
}

// The cells a plain rectangular room starts out solid in: its border ring.
function borderRing(rows, cols) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from(
      { length: cols },
      (_, col) => row === 0 || col === 0 || row === rows - 1 || col === cols - 1
    )
  )
}

// Lay out one room. `reserved` is the scene's grid of cells nothing may be placed on -
// the wall ring and the doorway channel - and `blocked` comes back with the obstacles
// added to it. `solid` is what starts out impassable; a rectangle leaves it out and gets
// its border ring, and a shaped room passes the mask's own ring plus the void behind it.
// Every candidate shape is rejected unless the room stays fully walkable afterwards, so a
// low coverage roll and a high one are equally safe to walk into.
export function generateObstacles({
  cols,
  rows,
  reserved,
  solid,
  doorwayCell,
  coverage,
  randomFn
}) {
  const room = {
    cols,
    rows,
    reserved,
    doorwayCell,
    // Reserved is wider than blocked: the doorway channel is off limits to obstacles but
    // is floor the player walks on, so only the solid ring starts out blocked.
    blocked: (solid ?? borderRing(rows, cols)).map((line) => [...line])
  }

  // Counted rather than computed from the dimensions: a shaped room's floor is whatever
  // the mask left open, so coverage stays a share of the room you can actually walk.
  const interiorCells = room.blocked.flat().filter((isBlocked) => !isBlocked).length
  const targetCells = Math.floor(interiorCells * coverage)
  const rockTarget = Math.floor(targetCells * ROCK_AREA_SHARE)
  const shapes = []
  let rockCells = 0
  let filled = 0

  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && filled < targetCells; attempt++) {
    const asRock = rockCells < rockTarget
    const remaining = targetCells - filled
    const shape = asRock
      ? growChunk(room, randomFn, remaining)
      : growNoodle(room, randomFn, remaining)

    // A pit is three cells at its smallest, so the last one asked for can come back bigger
    // than the room has left to give. Dropping it keeps the rolled coverage a real ceiling
    // rather than one the tail of the fill steps over.
    if (!shape || shape.length > remaining || !keepsRoomWalkable(room, shape)) {
      continue
    }

    shape.forEach(([row, col]) => {
      room.blocked[row][col] = true
    })
    shapes.push({ cells: shape, asRock })

    filled += shape.length
    if (asRock) {
      rockCells += shape.length
    }
  }

  return { blocked: room.blocked, shapes, coverage: filled / interiorCells }
}
