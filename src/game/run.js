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

import { ENTRANCE_DOOR, isLie, rollLieCap, roomPlanFor } from './doors.js'
import { createInventory } from './inventory.js'

// The run's own state, everything that survives a door and nothing that survives a death.
export function freshGameState(randomFn = Math.random) {
  return {
    exp: 0,
    bombCount: 0,
    // How deep the run is. The entrance is room 1, and every door taken adds one; the
    // big-room band is measured against it.
    roomNumber: 1,
    // The telegraph's budget for this run and what it has spent. These live in gameState
    // rather than in the scene because that is exactly the lifetime they need: gameState
    // is passed through every door by reference, so the count survives a room change, and
    // it is rebuilt by freshGameState on death or Exit, so a new run gets a new budget
    // and a clean slate. Nothing else has that shape.
    lieCap: rollLieCap(randomFn),
    liesSoFar: 0,
    lastDoorWasLie: false,
    inventory: createInventory(),
    cooldowns: {}
  }
}

// Booked when the player actually walks through a door, not when the door was resolved.
// A room offers two or three doors and every one of them resolved to something, but the
// player only ever finds out about the one they took - so charging the budget for the
// others would spend it on lies nobody was told.
export function recordDoorOutcome(gameState, advertised, actual) {
  const lied = isLie(advertised, actual)

  gameState.lastDoorWasLie = lied

  if (lied) {
    gameState.liesSoFar += 1
  }

  return lied
}

// Unpack a restart payload into the room to build. `health: null` means "as much as this
// inventory allows", which only the scene can work out once stats are computed.
export function roomFor(data) {
  const plan = data?.plan ?? roomPlanFor(ENTRANCE_DOOR)

  return {
    plan,
    roomType: plan.roomType,
    shapeId: data?.shape ?? null,
    gameState: data?.carried?.gameState ?? freshGameState(),
    health: data?.carried?.health ?? null,
    // What the door claimed, when it turned out to be lying. null on an honest door and
    // on the entrance room, which no door chose.
    misled: data?.misled ?? null
  }
}
