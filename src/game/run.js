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

import { ENTRANCE_DOOR, roomPlanFor } from './doors.js'
import { createInventory } from './inventory.js'

// The run's own state, everything that survives a door and nothing that survives a death.
export function freshGameState() {
  return {
    riskLevel: 0,
    enemyStrength: 0,
    rewardsCollected: 0,
    exp: 0,
    bombCount: 0,
    // How deep the run is. The entrance is room 1, and every door taken adds one; the
    // big-room band is measured against it.
    roomNumber: 1,
    inventory: createInventory(),
    cooldowns: {}
  }
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
    health: data?.carried?.health ?? null
  }
}
