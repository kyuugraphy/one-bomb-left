import { reachesEveryOpenCell } from './obstacles.js'
import { DOOR_INSET, doorCells, innerCell, solidGrid } from './shapeRoom.js'
import { doorCapacity } from './shapes.js'

// Corridor rooms: long, narrow, straight through. Pure data like shapes.js, but generated
// rather than hand-authored - a corridor has no silhouette worth drawing by hand, only a
// direction and a length, so a mask that would be sixty lines of hashes is rolled instead.
//
// The shape it hands back is the same shape the L/Z/T/G masks are, so everything in
// shapeRoom.js reads it unchanged: solidGrid, wallCells, wallRun, doorCells.

// Every number here is a **walkable** one - the space between the walls, not the mask.
// solidGrid turns every floor cell that touches the outside into wall, so a mask is always
// CORRIDOR_WALL_RING cells bigger than the room inside it, on both axes.
export const CORRIDOR_WALL_RING = 2

// Three cells to walk across, 168 px, so the mask is 5. Two was too tight: a 36 px enemy
// in a straight run with nowhere to step aside is a wall you shoot through rather than
// something you dodge.
export const CORRIDOR_WALKABLE_WIDTH = 3

// Walkable length in cells of the 56 px grid, as a share of the base room's 24-cell side:
// half of one at the shortest, two and a half at the longest. 12 x 56 = 672 px,
// 60 x 56 = 3360 px. The mask therefore runs 14 to 62.
export const CORRIDOR_MIN_LENGTH = 12
export const CORRIDOR_MAX_LENGTH = 60

const HORIZONTAL = 'horizontal'
const VERTICAL = 'vertical'

// Three rolls, in this order: the orientation, the length, then which end you come in by.
// The order is part of the contract - a test that wants a particular corridor queues its
// rolls against it.
export function generateCorridorRoom(randomFn) {
  const orientation = randomFn() < 0.5 ? HORIZONTAL : VERTICAL
  const lengths = CORRIDOR_MAX_LENGTH - CORRIDOR_MIN_LENGTH + 1
  const walkableLength = CORRIDOR_MIN_LENGTH + Math.floor(randomFn() * lengths)

  // The mask is the walk plus its wall, on both axes. Whole cells throughout, so a
  // corridor always lands on the 56 px grid without anything having to be snapped.
  const long = walkableLength + CORRIDOR_WALL_RING
  const across = CORRIDOR_WALKABLE_WIDTH + CORRIDOR_WALL_RING

  const rows = orientation === HORIZONTAL ? across : long
  const cols = orientation === HORIZONTAL ? long : across

  // A doorway at one far end, cut through the middle of that end wall. `span` is the whole
  // end wall - all five cells of it, corners included - which is what wallRun measures
  // walking out from the cell, and doorCapacity turns into exactly one door.
  //
  // Only the ends are ever offered. The long sides are 33 cells of unbroken wall on a
  // middling corridor and would seat three doors each if anything let them; a corridor
  // with a side door is a junction, not a corridor.
  const middle = Math.floor(across / 2)
  const endDoorway = (atStart) =>
    orientation === HORIZONTAL
      ? { cell: [middle, atStart ? 0 : long - 1], facing: atStart ? 'west' : 'east', span: across }
      : { cell: [atStart ? 0 : long - 1, middle], facing: atStart ? 'north' : 'south', span: across }

  // Which end is the way in is a roll: otherwise every corridor is walked the same way.
  const entryAtStart = randomFn() < 0.5

  return {
    id: 'corridor',
    orientation,
    mask: Array.from({ length: rows }, () => '#'.repeat(cols)),
    entry: endDoorway(entryAtStart),
    // One exit, at the other end. An end wall seats a single door, and one of the two ends
    // has to be the way in - so a corridor offers one door where a room offers two or
    // three. openDoors already trusts the spots it gets back rather than the roll, so it
    // needs no telling. A corridor is the bit between choices, not a choice.
    exits: [endDoorway(!entryAtStart)]
  }
}

// The cells no obstacle may take: the door pads, and the spot the player lands on coming
// in. One idea rather than two, because both exist for the same reason - a corridor has to
// be enterable and exitable, and something you cannot stand on at either end fails that
// however connected the rest of it is.
//
// This replaced an earlier rule that kept one cell of each *end column* open. That was a
// proxy for "the door is reachable", and a loose one: the pad sits DOOR_INSET cells in
// from the wall, so the end column could be solid without hurting anything, while a single
// rock on the pad itself passed the check and buried the door. Reserving the cells that
// actually matter is both simpler and stricter.
export function corridorReservedCells(shape) {
  return [
    innerCell(shape.entry, DOOR_INSET),
    ...shape.exits.flatMap((exit) => doorCells(shape, exit, doorCapacity(exit.span)))
  ]
}

// How much of a corridor's walkable floor goes to obstacles. Well under a base room's
// third: a corridor is three cells wide and there is nowhere to go round, so clutter that
// reads as texture in an open room reads as a blockage here.
export const CORRIDOR_COVERAGE_MIN = 0.1
export const CORRIDOR_COVERAGE_MAX = 0.15

// The rock/pit split the base rooms already use.
const ROCK_SHARE = 0.6

// Obstacles for a corridor, placed **uniformly** across its walkable cells.
//
// It does not reuse generateObstacles, for two reasons. Its seeding drops two thirds of
// every shape into a 3-cell band hugging the wall - and a corridor is 3 cells wide, so the
// whole width is that band and the bias buys nothing but clustering. And it grows rocks
// into clumps of up to 8 cells and pits into noodles of up to 12, either of which spans a
// 3-wide corridor end to end; almost every candidate would be rejected for cutting the
// room in half. Corridor obstacles are single cells, tagged rock or pit at the same 0.6
// split, scattered at random.
//
// What it does share is the connectivity check: reachesEveryOpenCell, the same flood fill
// base rooms use. A candidate that cuts the corridor is dropped and another cell is tried,
// the same way generateObstacles rejects a shape rather than the whole layout.
//
// The two ends are protected as well as the middle. A corridor whose end column happened
// to fill up would still pass a plain connectivity check - every remaining open cell is
// reachable from every other - while being walled off exactly where its door goes.
export function generateCorridorObstacles(shape, randomFn) {
  const solid = solidGrid(shape)
  const blocked = solid.map((line) => [...line])
  const open = []

  solid.forEach((line, row) =>
    line.forEach((isSolid, col) => {
      if (!isSolid) {
        open.push([row, col])
      }
    })
  )

  const rolled =
    CORRIDOR_COVERAGE_MIN + randomFn() * (CORRIDOR_COVERAGE_MAX - CORRIDOR_COVERAGE_MIN)
  // Rounded rather than floored: a 36-cell corridor cannot land on a tenth exactly, and
  // flooring would put its coverage under the floor of the band rather than beside it.
  const target = Math.round(open.length * rolled)

  // The door pads and the landing spot are held back before anything is placed, so a
  // corridor can always be walked into and out of.
  const reserved = new Set(corridorReservedCells(shape).map((cell) => cell.join(',')))
  const candidates = open.filter((cell) => !reserved.has(cell.join(',')))
  const shapes = []
  let rejected = 0

  while (shapes.length < target && candidates.length > 0) {
    const [cell] = candidates.splice(Math.floor(randomFn() * candidates.length), 1)
    const [row, col] = cell

    blocked[row][col] = true

    // Flooding from whatever is still open rather than from a fixed cell: a fixed one
    // could never be built on, which is a bias of its own on a floor this small.
    const start = open.find(([atRow, atCol]) => !blocked[atRow][atCol])
    const stillWalkable = start && reachesEveryOpenCell(blocked, start)

    if (!stillWalkable) {
      blocked[row][col] = false
      rejected += 1
      continue
    }

    shapes.push({ cells: [cell], asRock: randomFn() < ROCK_SHARE })
  }

  return { blocked, shapes, coverage: shapes.length / open.length, rejected }
}
