// Gap assist: the small perpendicular shove that stops a one-cell gap from eating a run.
//
// Arcade Physics resolves a body against every solid it overlaps, axis by axis. Walk a
// 46 px player at a 56 px gap between two rocks a few pixels off centre and the leading
// corner clips the rock's corner first; that contact is resolved on the movement axis, so
// the player stops dead against a hole they are visibly aimed at. Held input does not
// help - the same corner is still there next frame. It reads as the game ignoring the
// stick, which is the worst kind of bug: the player is doing it right and the room says no.
//
// The fix is to notice the squeeze one cell early and line the player up with the hole
// before the corners ever meet.
//
// **The hard part is not firing the rest of the time.** The first cut leaned whenever one
// side of the lane ahead was solid and the other was open, and that description fits far
// more of a room than it sounds like it does: every room sits inside a blocked wall ring,
// so walking anywhere along a wall matched it, as did passing any single rock in open
// floor. It shoved the player around empty rooms. So the rule is now the narrow one:
//
//   **One open cell with solid on both sides of it.** Two obstacles with a single block of
//   space between them - or a rock and a wall, or the two jambs of a doorway. That is the
//   only shape a 46 px body can catch on, and the only shape that gets help.
//
// Everything wider than one cell is left alone, because a 46 px body has 66 px of room in
// a two-cell gap and cannot clip either edge. Everything with an open side is left alone,
// because there is no hole to thread - the player can just walk around.
//
// The lean is also **proportional and self-cancelling**: it is how far off the gap's
// centreline the player is, so it fades to nothing as they come into line instead of
// pushing on past it. That is the other half of why the first cut threw people off.
//
// Pure, like obstacles.js and doors.js: the grid comes in, a direction goes out, and
// nothing here knows what a pixel or a Phaser body is. **The caller owns the units and the
// strength.** PlayScene converts world pixels to fractional cell units on the way in and
// scales the returned -1..1 bias into a velocity on the way out, which is what keeps the
// tuning knob in the scene where it can be felt, and this module a truth table.
//
// No randomness, so no randomFn parameter - the same square of grid always answers the
// same way. It is the one module in the family that has nothing to roll.

// How far off the centreline, in cells, counts as fully misaligned. Past this the lean is
// at full strength; inside it the lean eases off in proportion.
//
// 0.06 of a 56 px cell is about 3 px, which is deliberately less than the 5 px of slack a
// 46 px body has on each side of a one-cell gap: a player far enough out to actually catch
// a corner should be getting the whole correction, not a fraction of it. The taper is for
// settling the last pixel or two, not for rationing help to someone who needs it.
export const CENTRING_BAND = 0.06

// Close enough. Under a pixel of a 56 px cell, and correcting it would mean a permanent
// sliver of sideways velocity for no visible gain.
export const CENTRED_ENOUGH = 0.015

// Turn a movement direction a quarter turn: the axis the bias is allowed to act on.
// Movement is cardinal here (see below), so this is (dCol, -dRow) - for 'right' (0, 1) it
// gives (1, 0), the row axis, which is the pair of cells flanking the lane ahead.
function perpendicular(moveDirRow, moveDirCol) {
  return { row: moveDirCol, col: -moveDirRow }
}

// Outside the grid is wall. Every room is built inside a blocked border ring, so a cell
// read off the edge is not a case the player can reach - but reading it as open would
// invent a gap out of nothing, and this is the one place that would matter.
function isBlocked(blocked, row, col) {
  return blocked[row]?.[col] !== false
}

// Look one cell ahead and answer with how hard to lean, and which way.
//
// The four ways to get nothing back, in the order they are checked:
//
// - Standing still, or moving diagonally. A diagonal has no single perpendicular to lean
//   on - the quarter turn of (1, 1) is (1, -1), still diagonal - so a correction would
//   fight the player's own input on both axes instead of sliding them sideways. It is also
//   not the shape of the bug: the catch that strands a player is the one they walk straight
//   into and cannot get out of by holding the same key.
// - The cell ahead is solid. That is a wall, not a gap. Nothing to line up with.
// - Either flank is open. Then the space is wider than one cell, or open on one side, and
//   a 46 px body has room to spare. **This is the case that used to fire and should not**:
//   a wall on one side of the lane and floor on the other is what most of a room looks
//   like from inside it.
// - Already centred, within CENTRED_ENOUGH.
//
// `playerRow`/`playerCol` are fractional cell units, and **the fraction matters** - it is
// the whole input to how hard the lean is. The whole part says which cell the player is
// in; the fraction says where in it they are standing, and therefore how far off the
// centreline of the gap ahead. A caller that floors these before passing them in reports
// every player as sitting exactly half a cell off centre and gets a constant full-strength
// lean, which is the original bug wearing a new hat.
//
// The returned bias is on the perpendicular axis only, signed towards the open cell's
// centreline, and never leaves -1..1.
export function computeGapNudge({ playerRow, playerCol, moveDirRow, moveDirCol, blocked }) {
  const still = moveDirRow === 0 && moveDirCol === 0
  const diagonal = moveDirRow !== 0 && moveDirCol !== 0

  if (still || diagonal) {
    return { row: 0, col: 0 }
  }

  const aheadRow = Math.floor(playerRow) + moveDirRow
  const aheadCol = Math.floor(playerCol) + moveDirCol

  if (isBlocked(blocked, aheadRow, aheadCol)) {
    return { row: 0, col: 0 }
  }

  const perp = perpendicular(moveDirRow, moveDirCol)
  const oneSide = isBlocked(blocked, aheadRow + perp.row, aheadCol + perp.col)
  const otherSide = isBlocked(blocked, aheadRow - perp.row, aheadCol - perp.col)

  if (!oneSide || !otherSide) {
    return { row: 0, col: 0 }
  }

  // Which way along the perpendicular axis the centre of the gap lies, and how far. The
  // gap is the cell ahead, so its centreline sits half a cell into whichever cell the
  // player currently occupies on that axis - moving along one axis cannot change the other.
  const alongRow = moveDirRow === 0
  const playerPerp = alongRow ? playerRow : playerCol
  const offset = Math.floor(playerPerp) + 0.5 - playerPerp

  if (Math.abs(offset) < CENTRED_ENOUGH) {
    return { row: 0, col: 0 }
  }

  // `|| 0` folds -0 back into 0: it multiplies into a velocity perfectly well but compares
  // unequal to 0, so it would read as a bias where there is none.
  const lean = Math.max(-1, Math.min(1, offset / CENTRING_BAND)) || 0

  return alongRow ? { row: lean, col: 0 } : { row: 0, col: lean }
}
