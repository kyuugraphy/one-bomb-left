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

// Two rolls, in this order: the orientation, then the length. The order is part of the
// contract - a test that wants a particular corridor queues its rolls against it.
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

  return {
    id: 'corridor',
    orientation,
    mask: Array.from({ length: rows }, () => '#'.repeat(cols))
  }
}
