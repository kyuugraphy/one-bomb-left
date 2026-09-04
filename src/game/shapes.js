// The four non-rectangular "big room" templates, as pure data. A shape is a mask on the
// same 56 px grid the rectangular rooms use, plus the doorways cut into it: one ENTRY at
// one tip and one or more EXITs at the others, where the post-clear branching doors go.
// Nothing here knows about Phaser - the scene will read a mask and paint walls, obstacles
// and pathfinding around it, the same contract obstacles.js and doors.js keep.
//
// Masks are hand-authored so the silhouettes are chosen rather than rolled: '#' is floor,
// '.' is void. Each one carries roughly three base rooms of floor, so a big room reads as
// big on entry. Stroke widths differ per shape - whatever made that letter easiest to
// draw correctly - and the tests check the geometry rather than assuming a common width.

// A base room is 24x15 cells, per main.js. The "3x area" target is measured against this.
export const BASE_ROOM_CELLS = 24 * 15

// A room offers 2-3 doors once it is cleared (see doors.js), so three is the most any
// shape's exits ever have to seat between them.
export const MAX_DOORS = 3

// A doorway is 140 px wide - three cells, rounded up - and two doors side by side need a
// slab of wall between them or they read as one wide opening.
const DOOR_CELLS = 3
const DOOR_GAP = 2

// How many doors fit along a run of wall that many cells long. Capped at MAX_DOORS: a
// long tip is not an excuse to offer a fourth choice.
export function doorCapacity(span) {
  return Math.min(MAX_DOORS, Math.floor((span + DOOR_GAP) / (DOOR_CELLS + DOOR_GAP)))
}

// Which shape a room gets, or null for an ordinary rectangle. Big rooms are a mid-run
// event rather than the whole run: the first two rooms are where the game is learned, and
// a space you can see all of at once is the right place to learn it; by the eighth a run
// is long enough that a two-minute room every time would drag. In between, a room is a
// coin flip, and when it comes up big the four shapes are an even draw.
//
// Note a miss costs one roll and a hit costs two, so a caller queueing rolls has to know
// which way this one went.
export const SHAPE_ROOM_FIRST = 3
export const SHAPE_ROOM_LAST = 7
export const SHAPE_ROOM_CHANCE = 0.5

export function rollRoomShape(roomNumber, randomFn) {
  if (roomNumber < SHAPE_ROOM_FIRST || roomNumber > SHAPE_ROOM_LAST) {
    return null
  }

  if (randomFn() >= SHAPE_ROOM_CHANCE) {
    return null
  }

  const ids = Object.keys(ROOM_SHAPES)

  return ids[Math.floor(randomFn() * ids.length)]
}

export function shapeSize(shape) {
  return { rows: shape.mask.length, cols: shape.mask[0].length }
}

export function isFloor(shape, row, col) {
  return shape.mask[row]?.[col] === '#'
}

export function floorCells(shape) {
  const cells = []

  shape.mask.forEach((line, row) =>
    [...line].forEach((cell, col) => {
      if (cell === '#') {
        cells.push([row, col])
      }
    })
  )

  return cells
}

// L - a tall arm up the west side and a bar running east along the south. Two ends, so
// one entry and one exit; the exit tip is 18 cells wide and seats all three doors on its
// own, exactly as the north wall of a rectangular room does today.
const L_MASK = [
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '##################......................',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
]

// Z - a bar in the north-east, a short waist, and a bar in the south-west. Two ends
// again, on opposite corners, so the player crosses the whole room to reach the exit.
const Z_MASK = [
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................########################',
  '................################........',
  '................################........',
  '................################........',
  '................################........',
  '................################........',
  '................################........',
  '................################........',
  '................################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
  '################################........',
]

// T - a full-width crossbar along the north with a stem hanging south. Three ends: the
// stem is the entry, and the crossbar's two tips are the exits.
const T_MASK = [
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
  '............################............',
]

// G - a C open to the east with the letter's inner bar reaching back west into the
// mouth. Three ends: the north-east tip is the entry, and the exits are the inner bar's
// west tip and the east wall the inner bar and the south bar share.
const G_MASK = [
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............................',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '############............################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
  '########################################',
]


// Entry and exit doorways. `cell` is the floor cell the doorway is cut through, `facing`
// is the direction you leave the shape through it, and `span` is how far the floor runs
// along that wall - the budget doorCapacity() spends on doors.
//
// Shapes with three ends (T and G) spread their exits over two tips rather than three:
// a room offers at most three doors, and three tips holding one door each would make the
// count a property of the shape instead of a roll. Two exit tips whose capacities sum to
// three or more let the existing 2-3 door roll place itself either way - both on one tip,
// or split across them - so the shape widens where the doors *can* go without deciding
// how many there are.
export const ROOM_SHAPES = {
  L: {
    id: 'L',
    mask: L_MASK,
    entry: { cell: [30, 39], facing: 'east', span: 18 },
    exits: [{ cell: [0, 8], facing: 'north', span: 18 }]
  },
  Z: {
    id: 'Z',
    mask: Z_MASK,
    entry: { cell: [31, 0], facing: 'west', span: 16 },
    exits: [{ cell: [7, 39], facing: 'east', span: 16 }]
  },
  T: {
    id: 'T',
    mask: T_MASK,
    entry: { cell: [39, 19], facing: 'south', span: 16 },
    exits: [
      { cell: [7, 0], facing: 'west', span: 16 },
      { cell: [7, 39], facing: 'east', span: 16 }
    ]
  },
  G: {
    id: 'G',
    mask: G_MASK,
    entry: { cell: [4, 39], facing: 'east', span: 10 },
    exits: [
      { cell: [24, 24], facing: 'west', span: 10 },
      { cell: [29, 39], facing: 'east', span: 20 }
    ]
  }
}
