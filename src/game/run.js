// What a room is handed when the scene starts, and what a run carries between rooms.
// Pulled out of PlayScene because it is the difference between continuing a run and
// starting one, and that turned out to be worth testing on its own: a restart meant to
// wipe the run was quietly resuming it.
//
// The contract is the restart payload. A door hands over `{ plan, shape, carried }` and
// the run continues; an empty payload means a fresh run, and every field falls back.
// **`undefined` is not an empty payload here.** Phaser keeps a scene's stored data when
// `restart()` is called with no argument at all, so the previous room's payload comes
// straight back - which is why every fresh-run restart passes `{}` explicitly.

import { CORRIDOR_FLOOR_DOORS, rollCorridorDoors } from './corridor.js'
import { ENTRANCE_PLAN, canTwist, rollTwistCap } from './doors.js'
import { createInventory } from './inventory.js'

// The run's own state, everything that survives a door and nothing that survives a death.
export function freshGameState(randomFn = Math.random) {
  return {
    exp: 0,
    bombCount: 0,
    // How deep the run is. The entrance is room 1, and every door taken adds one; the
    // big-room band is measured against it.
    roomNumber: 1,
    // The twist budget for this run and what it has spent. These live in gameState rather
    // than in the scene because that is exactly the lifetime they need: gameState is
    // passed through every door by reference, so the count survives a room change, and it
    // is rebuilt by freshGameState on death or Exit, so a new run gets a new budget and a
    // clean slate. Nothing else has that shape.
    twistCap: rollTwistCap(randomFn),
    twistsSoFar: 0,
    lastRoomWasTwist: false,
    // How many doors the player has walked through, which is not the same as how many
    // rooms they have been in: a corridor is spliced in behind a door and costs a door
    // without costing a room. roomNumber counts rooms, this counts doors, and the two
    // drift apart by exactly the number of corridors walked.
    doorsTaken: 0,
    // Which door-takings of this floor have a corridor behind them, rolled once at the
    // start. See rollCorridorDoors for why up front rather than per door.
    corridorDoors: rollCorridorDoors(CORRIDOR_FLOOR_DOORS, randomFn),
    inventory: createInventory(),
    cooldowns: {}
  }
}

// Booked when the player actually walks through a door, not when the doors were rolled: a
// room offers two or three and the player only ever enters one, so charging the budget for
// the others would spend it on rooms nobody saw.
//
// **The plan is taken so a room that could never have twisted leaves the block alone.**
// That is the spec's rule rather than an implementation detail: twist a puzzle, walk a
// fight, and the next shop is still a real shop. If a combat room cleared the flag the
// no-consecutive rule would almost never fire, because combat is well over half of all
// doors - the block would be lifted by the very next room nearly every time.
export function recordTwist(gameState, plan, twisted) {
  if (!canTwist(plan)) {
    return twisted
  }

  gameState.lastRoomWasTwist = twisted

  if (twisted) {
    gameState.twistsSoFar += 1
  }

  return twisted
}

// Unpack a restart payload into the room to build. `health: null` means "as much as this
// inventory allows", which only the scene can work out once stats are computed.
export function roomFor(data) {
  const plan = data?.plan ?? ENTRANCE_PLAN

  return {
    plan,
    roomType: plan.roomType,
    shapeId: data?.shape ?? null,
    gameState: data?.carried?.gameState ?? freshGameState(),
    health: data?.carried?.health ?? null,
    // What the door said this room was, when the room turned out to be a fight instead.
    // null on an ordinary room and on the entrance, which no door chose.
    twisted: data?.twisted ?? null,
    // The room this corridor is on the way to, held while the player walks it. null in
    // every room that is not a corridor.
    pending: data?.pending ?? null
  }
}
