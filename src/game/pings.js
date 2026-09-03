// The off-screen enemy indicator's one piece of arithmetic. A big room is larger than the
// viewport, so an enemy can be most of a minute's walk away and completely out of sight;
// the scene draws a small arrow at the edge of the screen for each one, and this is where
// on that edge the arrow goes.
//
// Pure because the awkward cases are all here rather than in the drawing: a ray leaving
// the centre has to hit the *nearer* of the two edges it is heading toward, and a ray
// running flat along an axis must not be handed the edge it is parallel to.

// Offset from the centre of a `2*halfWidth` x `2*halfHeight` rectangle to the point on
// its edge lying at `angle` (radians, x-axis right, y-axis down, as Phaser measures it).
export function edgePoint(angle, halfWidth, halfHeight) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)

  // Dividing by a zero component gives Infinity, which is exactly right: a ray parallel
  // to an edge never crosses it, so that edge loses the min() instead of winning it with
  // a nonsense answer.
  const distance = Math.min(halfWidth / Math.abs(dx), halfHeight / Math.abs(dy))

  return { x: dx * distance, y: dy * distance }
}
