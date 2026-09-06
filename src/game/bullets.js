// What ends a player's shot. Three things can: it hits a wall or a rock, it runs out of
// range, or it runs out of time. The first is the scene's business; the other two are two
// ways of saying the same thing, and which of them actually bites depends on how fast the
// bullet is going - so the relationship is spelled out here and tested, rather than left
// as a comment that goes stale the first time someone tunes the speed.

export const BULLET_SPEED = 490

// Six cells of the 56 px grid. Short enough that a fight is something you walk into
// rather than something you solve from across the room, which a 1344 px room let you do.
export const BULLET_RANGE = 336

// The original limit, from before there was a range cap. At the shipped numbers the cap
// still bites first - see limitThatBinds - so this is a backstop rather than a rule the
// player ever feels. The margin is thinner than it was: dropping the speed to 490 left
// the timeout 1.75x the room it needs, down from 2.5x at 700.
export const BULLET_LIFETIME = 1200

// Enemy shots carry the same reach, deliberately: a duel is symmetric, and a room where
// the thing shooting back outranged you would make walking in the wrong move. It is its
// own constant rather than a second use of BULLET_RANGE so that either side can be tuned
// without the other silently following.
export const ENEMY_SHOT_RANGE = BULLET_RANGE

// The enemy's own backstop. It is even further from binding than the player's: an enemy
// shot travels at 0.65 of the player's move speed - 208 px/s - and covers its range in
// about 1.6 s, so 4 s is nearly two and a half times the room it needs.
export const ENEMY_SHOT_LIFETIME = 4000

// How long a bullet takes to cover its range, in milliseconds.
export function rangeReachedAt(range = BULLET_RANGE, speed = BULLET_SPEED) {
  return (range / speed) * 1000
}

// How far a bullet gets in that long.
export function travelIn(ms, speed = BULLET_SPEED) {
  return (speed * ms) / 1000
}

// Which limit actually ends a shot that hits nothing. 'range' means the distance cap is
// the rule and the timeout never fires; 'lifetime' means the bullet is slow enough that
// it times out before it has gone its full distance, and the cap is the dead letter.
export function limitThatBinds(
  range = BULLET_RANGE,
  speed = BULLET_SPEED,
  lifetime = BULLET_LIFETIME
) {
  return rangeReachedAt(range, speed) <= lifetime ? 'range' : 'lifetime'
}

// The speed below which the timeout starts cutting shots short of their range. Above it
// the cap is the only limit that matters; the gap between this and BULLET_SPEED is the
// headroom a speed-changing item would have before the timeout became a hidden nerf.
export function slowestSpeedRangeStillBinds(
  range = BULLET_RANGE,
  lifetime = BULLET_LIFETIME
) {
  return range / (lifetime / 1000)
}
