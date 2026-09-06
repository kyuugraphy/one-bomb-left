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

import { rollCorridorDoors } from './corridor.js'
import { floorSize, rollTrapOrdinal } from './floors.js'
import { ENTRANCE_PLAN, canTwist, rollTwistCap } from './doors.js'
import { createInventory } from './inventory.js'

// The run's own state, everything that survives a door and nothing that survives a death.
export function freshGameState(randomFn = Math.random) {
  // Rolled once and reused: floor 1 is fixed so this spends nothing, but calling it
  // three times would read as three separate decisions.
  const floorRooms = floorSize(1, randomFn)

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
    // The last ambush line shown, so the next one can avoid it. Here rather than in the
    // scene for the same reason as the rest of this block: each room is a new scene, so a
    // scene-held value would forget between ambushes and "no repeats" would mean nothing.
    // null on a fresh run, so the first ambush of a run can be any of the 28.
    lastTwistLine: null,
    // How many doors the player has walked through, which is not the same as how many
    // rooms they have been in: a corridor is spliced in behind a door and costs a door
    // without costing a room. roomNumber counts rooms, this counts doors, and the two
    // drift apart by exactly the number of corridors walked.
    doorsTaken: 0,
    // ---- the floor ----
    //
    // A second set of counters beside the run-global ones above, and the separation is the
    // point rather than an accident: roomNumber is how deep the run is and drives the
    // big-room band, while roomOnFloor is where you are on this floor and drives the boss
    // and the shop checkpoints. Resetting the first every floor would make rooms 3-7 of
    // every floor a coin flip for a big room and every later room a rectangle.
    floorNumber: 1,
    floorRooms,
    roomOnFloor: 1,
    // **One trap per floor, across both kinds of twistable door.** It was two - a shop trap
    // and a puzzle trap, rolled independently - which put two ambushes on every floor and
    // gave each trap only its own type's offers to hide among, so both landed early. One
    // trap over the combined stream halves the encounters and lets the single ordinal
    // spread across everything the floor offers.
    //
    // twistablesSeen counts shop and puzzle doors together, in the order they are offered.
    trapOrdinal: rollTrapOrdinal(floorRooms, randomFn),
    twistablesSeen: 0,
    // Which door-takings of this floor have a corridor behind them, rolled once at the
    // start. See rollCorridorDoors for why up front rather than per door.
    corridorDoors: rollCorridorDoors(floorRooms, randomFn),
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

// Down the stairs. Everything belonging to the floor is re-dealt and everything belonging
// to the run is left alone.
//
// **The twist budget is deliberately not re-dealt.** It is a property of the run - some
// runs are never ambushed at all, and the player cannot know which run they are in until
// it is over. Re-dealing it every floor would turn that into "some floors are never
// ambushed", which is a weaker promise the player would learn to read off the floor number.
//
// The corridor list is re-rolled here and **doorsTaken is reset with it**, because the two
// are one thing: the list is a set of indices into this floor's door-takings, so re-rolling
// without resetting would index a fresh list with the last floor's count and skip most of
// it. Before floors existed the list was rolled once per run against a made-up ten-door
// floor, which is why a run stopped meeting corridors after its tenth door.
//
// Roll order is the contract a test queues against: the floor's length, then its trap,
// then its corridors.
export function advanceFloor(gameState, randomFn = Math.random) {
  gameState.floorNumber += 1
  gameState.floorRooms = floorSize(gameState.floorNumber, randomFn)
  gameState.roomOnFloor = 1
  gameState.trapOrdinal = rollTrapOrdinal(gameState.floorRooms, randomFn)
  gameState.twistablesSeen = 0
  gameState.corridorDoors = rollCorridorDoors(gameState.floorRooms, randomFn)
  gameState.doorsTaken = 0

  return gameState
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
