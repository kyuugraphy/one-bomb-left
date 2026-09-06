import { NEIGHBOURS, reachesEveryOpenCell } from './obstacles.js'

// Boss arenas: a room built to be looked at as much as fought in.
//
// Every other room in the game is either hand-authored (the L/Z/T/G masks) or rolled from a
// couple of numbers (a corridor is an orientation and a length). An arena is neither. It is
// **generated fresh every time one is needed** and built around a symmetry, so a boss room
// reads as a place someone made rather than a room the generator happened to produce - and
// so no two of them are the same room twice.
//
// Closer in spirit to corridor.js than to shapes.js: nothing here is stored, everything is
// rolled, and the RNG is injected so every roll can be pinned by a test.

// The base room, in cells of the 56 px grid: 1344x840. An arena is exactly a base room, not
// one of the big shapes - a boss fight wants a space you can see all of at once.
export const ARENA_COLS = 24
export const ARENA_ROWS = 15

// **90 degrees is not on this list, and could not be.** A quarter turn maps (row, col) to
// (col, rows-1-row), so its image needs as many rows as the room has columns - it fits a
// square and nothing else. The arena is 24x15. The three below all map the rectangle onto
// itself, which is the whole requirement.
export const MIRROR_X = 'mirror-x'
export const MIRROR_Y = 'mirror-y'
export const ROTATE_180 = 'rotate-180'

export const SYMMETRY_TYPES = [MIRROR_X, MIRROR_Y, ROTATE_180]

// Which symmetry this arena is built on, never the one the last arena used.
//
// The same lightweight rule the ambush lines use, and for the same reason: two arenas on
// the same symmetry back to back read as one arena built twice. Excluding by value rather
// than by index means an unknown or stale type excludes nothing instead of silently
// dropping a real one from the draw, and filtering rather than rerolling keeps it to a
// single roll with the remaining two exactly equally likely.
export function rollSymmetry(lastType, randomFn) {
  const options = SYMMETRY_TYPES.filter((type) => type !== lastType)

  return options[Math.floor(randomFn() * options.length)]
}

// Every cell a given cell drags with it, the cell itself included.
//
// **Obstacles are placed by orbit, not one cell at a time.** A mirrored pair can pinch a
// channel that neither cell would close on its own, so the whole orbit goes down together
// and the room is checked for connectivity once afterwards. Testing the halves separately
// is the bug where each passes on its own merits and the two together wall the arena off.
//
// A cell on the axis is its own image and comes back once rather than twice - a duplicate
// would have the placer counting one cell as two and quietly under-filling the arena. That
// happens only under MIRROR_Y, on the middle row: 15 is odd so row 7 mirrors to itself,
// while 24 is even so no column does, and a half turn has no fixed cell at all because
// (7, 11.5) is not a cell.
export function imagesOf([row, col], symmetry) {
  const image =
    symmetry === MIRROR_X
      ? [row, ARENA_COLS - 1 - col]
      : symmetry === MIRROR_Y
        ? [ARENA_ROWS - 1 - row, col]
        : [ARENA_ROWS - 1 - row, ARENA_COLS - 1 - col]

  return image[0] === row && image[1] === col ? [[row, col]] : [[row, col], image]
}

// Whether a grid really is symmetric, rather than symmetric by eye. Used by the tests for
// everything built on top of this: a generator that places whole orbits should produce a
// grid this accepts, and a bug that places half an orbit should fail it.
export function isSymmetric(grid, symmetry) {
  return grid.every((line, row) =>
    line.every((value, col) =>
      imagesOf([row, col], symmetry).every(([r, c]) => grid[r][c] === value)
    )
  )
}

// ---- the way in --------------------------------------------------------------------
//
// **The entry has to sit on the symmetry.** An arena that is symmetric everywhere except
// its doorway is asymmetric in the one place the player is guaranteed to be looking when
// they arrive. A bottom-centre doorway - what every other room in the game uses - is on the
// axis for left/right mirroring and off it for the other two, so the entry is chosen by
// type rather than fixed.
//
// What comes back is the cell the player stands on and the **closed orbit** of cells that
// must be held clear of obstacles. Reserving anything less than a whole orbit would break
// the symmetry the obstacle placer works so carefully to keep.
export function arenaEntry(symmetry) {
  // Top/bottom mirroring folds about row 7, which 15 rows puts squarely on a cell - so the
  // entry is a single cell on the middle row, at the left wall, and it is its own image.
  if (symmetry === MIRROR_Y) {
    const cell = [Math.floor(ARENA_ROWS / 2), 1]

    return { cell, reserved: imagesOf(cell, symmetry) }
  }

  // Everything else comes in at the bottom middle. 24 columns means the vertical axis falls
  // *between* columns 11 and 12 rather than on either, so under left/right mirroring the
  // doorway is that pair and the player walks in between them. Under a half turn the same
  // cell's image lands at the top, and is held open as a matching alcove - floor with
  // nothing behind it, there so the arena reads as turned rather than as broken.
  const cell = [ARENA_ROWS - 2, ARENA_COLS / 2 - 1]

  return { cell, reserved: imagesOf(cell, symmetry) }
}

// ---- where the boss stands ----------------------------------------------------------
//
// The middle of the arena, which is the one place equally far from every wall under all
// three symmetries - and, awkwardly, **not a cell**. The arena is 24 wide and 15 tall, so
// its true middle is (7, 11.5): row 7 is a real row, but there is no column 11.5.
//
// A block straddling that middle solves both halves of the problem at once. It gives the
// boss standing room no obstacle can take, and a block centred on the middle is a **closed
// orbit under every symmetry** - mirroring it left to right swaps its two columns, top to
// bottom swaps its outer rows, and a half turn does both - so reserving it leaves the arena
// symmetric, where reserving half an orbit would not.
//
// Three by two while the boss is a stub with no size of its own. When there is a real boss
// with a real footprint, this is the number to grow, and the orbit closes for any block
// centred the same way.
export const BOSS_FOOTPRINT_ROWS = 3
export const BOSS_FOOTPRINT_COLS = 2

export function arenaBossSpawn() {
  const midRow = Math.floor(ARENA_ROWS / 2)
  const midCol = ARENA_COLS / 2 - 1
  const reserved = []

  for (let row = 0; row < BOSS_FOOTPRINT_ROWS; row++) {
    for (let col = 0; col < BOSS_FOOTPRINT_COLS; col++) {
      reserved.push([midRow - Math.floor(BOSS_FOOTPRINT_ROWS / 2) + row, midCol + col])
    }
  }

  // The anchor, not the centre: the true centre falls between this cell and its neighbour,
  // so the scene places the boss at the middle of the whole block rather than on this cell.
  return { cell: [midRow, midCol], reserved }
}

// ---- the arena's clutter ---------------------------------------------------------------
//
// **Its own generator, not generateObstacles with a flag.** That function seeds, grows,
// tests and commits inside one closed loop, and its pickSeed drops two thirds of every
// shape into a band hugging the wall - there is no point in it to mirror through, and
// threading a mirror option into the generator every room in the game depends on is a worse
// trade than a second small one. Corridors reached the same conclusion for the same reason.
// What is shared is reachesEveryOpenCell, which is the part that matters.
//
// Lower than a combat room's third. A boss wants space to be fought in, and clutter that
// reads as texture in an ordinary room reads as a cage in an arena.
export const ARENA_COVERAGE_MIN = 0.1
export const ARENA_COVERAGE_MAX = 0.18

// Small clumps: pillars and cover, not the eight-cell boulders an ordinary room grows and
// not scattered single cells either. Measured on a 24x15 arena at 15% coverage, mirroring
// whole shapes costs 5.7% of placements at four cells against 13.4% at eight - and a
// mirrored eight-cell pair takes a sixteenth of the arena in one go.
export const ARENA_ROCK_MAX_CELLS = 4

// The rock/pit split every other room in the game uses.
const ROCK_SHARE = 0.6

function borderRing() {
  return Array.from({ length: ARENA_ROWS }, (_, row) =>
    Array.from(
      { length: ARENA_COLS },
      (_, col) => row === 0 || col === 0 || row === ARENA_ROWS - 1 || col === ARENA_COLS - 1
    )
  )
}

// A clump grown from a seed, exactly as a rock is grown elsewhere - accrete a neighbour at
// a time, give up rather than loop forever if there is nowhere to go.
function growClump(blocked, seed, size, randomFn) {
  const cells = [seed]
  const taken = new Set([seed.join(',')])

  for (let guard = 0; cells.length < size && guard < size * 12; guard++) {
    const [row, col] = cells[Math.floor(randomFn() * cells.length)]
    const [dRow, dCol] = NEIGHBOURS[Math.floor(randomFn() * NEIGHBOURS.length)]
    const next = [row + dRow, col + dCol]
    const key = next.join(',')

    if (
      taken.has(key) ||
      next[0] < 1 ||
      next[1] < 1 ||
      next[0] > ARENA_ROWS - 2 ||
      next[1] > ARENA_COLS - 2 ||
      blocked[next[0]][next[1]]
    ) {
      continue
    }

    taken.add(key)
    cells.push(next)
  }

  return cells
}

// Obstacles for a boss arena, mirrored into the symmetry it was built on.
//
// **The whole orbit goes down as one unit and the room is checked once afterwards.** A
// mirrored pair can pinch a channel that neither half would close on its own, so testing
// the halves separately is the bug where each passes on its own merits and the two together
// wall the arena in two. Rejecting drops the entire orbit, never half of it - half an orbit
// left behind is an asymmetric arena.
export function generateArenaObstacles(symmetry, randomFn) {
  const blocked = borderRing()
  const open = []

  for (let row = 1; row < ARENA_ROWS - 1; row++) {
    for (let col = 1; col < ARENA_COLS - 1; col++) {
      open.push([row, col])
    }
  }

  const rolled = ARENA_COVERAGE_MIN + randomFn() * (ARENA_COVERAGE_MAX - ARENA_COVERAGE_MIN)
  const target = Math.round(open.length * rolled)
  // The doorway and the boss's standing room are both held back before anything is placed,
  // so the arena can always be walked into and always has somewhere to fight in the middle
  // of it. Held as keys rather than cells because an orbit is compared by value and a cell
  // is an array.
  const reserved = new Set(
    [...arenaEntry(symmetry).reserved, ...arenaBossSpawn().reserved].map((cell) =>
      cell.join(',')
    )
  )
  const candidates = open.filter((cell) => !reserved.has(cell.join(',')))
  const shapes = []
  let filled = 0

  while (filled < target && candidates.length > 0) {
    const [seed] = candidates.splice(Math.floor(randomFn() * candidates.length), 1)

    if (blocked[seed[0]][seed[1]]) {
      continue
    }

    const size = 1 + Math.floor(randomFn() * ARENA_ROCK_MAX_CELLS)
    const grown = growClump(blocked, seed, size, randomFn)

    // A clump that grew onto the doorway - or whose reflection lands there - is dropped
    // whole. Trimming it instead would leave an orbit missing a cell, which is an
    // asymmetric arena by a subtler route than failing to mirror at all.
    if (
      grown.some((cell) =>
        imagesOf(cell, symmetry).some((image) => reserved.has(image.join(',')))
      )
    ) {
      continue
    }

    // The shape and every image of it, deduplicated: a shape that overlaps its own
    // reflection is one shape, and counting the overlap twice would drift the coverage.
    const orbit = [
      ...new Map(
        grown
          .flatMap((cell) => imagesOf(cell, symmetry))
          .filter(([row, col]) => !blocked[row][col])
          .filter((cell) => !reserved.has(cell.join(',')))
          .map((cell) => [cell.join(','), cell])
      ).values()
    ]

    if (!orbit.length) {
      continue
    }

    orbit.forEach(([row, col]) => {
      blocked[row][col] = true
    })

    // Flooded from the doorway rather than from any open cell: an arena the player
    // cannot walk out of the entry into looks perfectly fine from the outside.
    if (reachesEveryOpenCell(blocked, arenaEntry(symmetry).cell)) {
      shapes.push({ cells: orbit, asRock: randomFn() < ROCK_SHARE })
      filled += orbit.length
    } else {
      orbit.forEach(([row, col]) => {
        blocked[row][col] = false
      })
    }
  }

  return { blocked, shapes, coverage: filled / open.length, symmetry }
}
