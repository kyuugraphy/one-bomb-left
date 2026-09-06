// The shape of a floor: how long it is, and which of its rooms are not free to be
// whatever the door roll says.
//
// A run used to be one unbroken chain of rooms with no structure and no end. This is the
// first thing to give it a skeleton - a floor has a length, a boss at the end of it, and
// two points along the way where the shop is guaranteed to be on offer.
//
// Everything here is a pure roll or a pure calculation with the RNG injected, the same
// contract as doors.js and corridor.js; the scene reads the answers and paints them.

// Floor 1 does not roll. It is where the game is learned, and a learning floor that varies
// is one that sometimes ends before it has taught anything. Every floor after it is a
// range, so a run is not the same shape twice.
export const FLOOR_ONE_ROOMS = 7

// Read in order, first match wins. Floors past the last band keep using it: floor 7 is not
// the end of anything yet, and a run chains on past it on the same rule, so how deep a
// player gets is a fact about the player rather than a number written down here.
export const FLOOR_BANDS = [
  { upTo: 1, min: FLOOR_ONE_ROOMS, max: FLOOR_ONE_ROOMS },
  { upTo: 2, min: 9, max: 11 },
  { upTo: Infinity, min: 13, max: 15 }
]

// **Rooms, not doors, and the boss is not one of them.** A seven-room floor is seven
// ordinary rooms and then a boss - eight rooms walked. Counting the boss inside the number
// would quietly shorten every floor by one, and the numbers were written as "how much
// floor is there before the boss".
export function floorSize(floorNumber, randomFn) {
  const band = FLOOR_BANDS.find((entry) => floorNumber <= entry.upTo)

  // A fixed band spends no roll at all, so a caller queueing rolls does not have to know
  // which floors happen to be fixed.
  if (band.min === band.max) {
    return band.min
  }

  return band.min + Math.floor(randomFn() * (band.max - band.min + 1))
}

// The first guaranteed shop, halfway along.
//
// An odd floor has an exact middle room and this is it. An even one does not, and the tie
// goes to the later of the two candidates: a resupply that arrives a room late is one you
// have started to need, and a room early is one you have not.
export function midFloorRoom(rooms) {
  return Math.ceil(rooms / 2)
}

// The second guaranteed shop, **one room before the boss door rather than on it**.
//
// This is the design's one real collision, resolved here. The last regular room is the one
// whose door choice the boss takes over entirely - no branching, no alternatives - and the
// same room was originally specified as the pre-boss shop checkpoint, which requires at
// least two doors. Both rules cannot own one choice. The checkpoint moved a room earlier,
// so a player still buys before the fight and the boss door still has nothing beside it.
export function preBossRoom(rooms) {
  return rooms - 1
}

// Both, in the order they are met.
export function shopCheckpoints(rooms) {
  return [midFloorRoom(rooms), preBossRoom(rooms)]
}

// What a room's doors are allowed to be. Three answers, and every room gets exactly one -
// asked in one place so that the boss takeover and the shop guarantee cannot both decide
// they own the same door choice.
export const BOSS_DOOR = 'boss'
export const SHOP_GUARANTEED = 'shop-guaranteed'
export const NORMAL_DOORS = 'normal'

export function doorPolicyFor(roomOnFloor, rooms) {
  if (roomOnFloor >= rooms) {
    return BOSS_DOOR
  }

  return shopCheckpoints(rooms).includes(roomOnFloor) ? SHOP_GUARANTEED : NORMAL_DOORS
}

// ---- the floor's one certain trap -----------------------------------------------------
//
// Exactly one *ordinary* shop door per floor is a guaranteed ambush rather than a 1% risk.
// The two checkpoint shops are never it - a resupply you cannot rely on is not a
// checkpoint - and every other ordinary shop door keeps its ordinary odds.
//
// **Which one is rolled here, before anyone knows how many there will be.** Doors are
// rolled room by room as the player walks, so a floor offers anywhere from none to seven
// ordinary shop doors and the number is not knowable at generation time. The trap is
// therefore "the Nth one you are offered", and if the floor never offers N of them, no
// trap fires that floor.
//
// So the guarantee is **at most one per floor, not exactly one**. Exactly one is not
// placeable without pre-rolling every room's doors up front, which would mean changing
// when doors are decided at all - a much larger change than the mechanic is worth. A
// 7-room floor offers no ordinary shop door 4.5% of the time; those floors get no trap.
//
// **Wide on purpose, because a narrow range front-loads the trap.** This was ceil(rooms/4)
// - two slots on a 7-room floor - chosen to maximise how often the trap got placed. It did
// that and produced a bias playtest caught immediately: 54% of traps fired in room 1, and
// another 32% in room 2, because the first twistable door a floor offers is itself usually
// in room 1. The player learned to expect the ambush before the floor had really started.
//
// Spanning nearly the whole floor flattens it - 24/24/23/8/16% across a 7-room floor,
// 13/13/13/13/13% across the first five of an 11-room one - at the cost of sometimes naming
// a slot the floor never reaches, so no trap is placed. Measured 90% placed at 7 rooms and
// 94% at 11, against 100% before. One floor in ten without a trap is the price of the other
// nine being unpredictable, and an unpredictable trap is the entire point of one.
export function TRAP_ORDINAL_MAX(rooms) {
  return rooms - 2
}

export function rollTrapOrdinal(rooms, randomFn) {
  return 1 + Math.floor(randomFn() * TRAP_ORDINAL_MAX(rooms))
}
