import { describe, expect, it } from 'vitest'
import { ENTRANCE_PLAN, MAX_TWIST_CAP, roomPlanFor } from './doors.js'
import { addExp } from './currency.js'
import { grantItem } from './grant.js'
import { countOwned, passiveCounts } from './inventory.js'
import { getItem } from './items.js'
import { freshGameState, recordTwist, roomFor } from './run.js'

// A run part-way through: some EXP banked, an item in the rack, some bombs, four rooms
// deep and standing in a hard shaped room.
function runInProgress() {
  const gameState = freshGameState()

  addExp(gameState, 37)
  grantItem(gameState, getItem('iron_plating'))
  gameState.bombCount = 2
  gameState.roomNumber = 4

  return gameState
}

const doorPayload = (gameState, health) => ({
  plan: roomPlanFor({ type: 'combat', tier: 'hard' }),
  shape: 'G',
  carried: { gameState, health }
})

describe('freshGameState', () => {
  it('starts a run with nothing banked and nothing held', () => {
    const state = freshGameState()

    expect(state.exp).toBe(0)
    expect(state.bombCount).toBe(0)
    expect(state.inventory.trinket).toBe(null)
    expect(state.inventory.passives).toEqual([])
    expect(state.inventory.actives).toEqual([null, null, null])
  })

  it('starts in the entrance room, which is room 1', () => {
    expect(freshGameState().roomNumber).toBe(1)
  })

  it('hands out its own state, not a shared one', () => {
    const first = freshGameState()
    const second = freshGameState()

    addExp(first, 10)
    grantItem(first, getItem('iron_plating'))

    expect(second.exp).toBe(0)
    expect(second.inventory.passives).toEqual([])
    expect(second.inventory).not.toBe(first.inventory)
  })
})

// The bug this file exists for. `scene.restart()` with no argument leaves the scene's
// stored data in place, so Phaser hands init() the previous room's payload straight back
// and a run that was supposed to end simply carried on - same EXP, same items, same
// difficulty, same room shape. The fix is to pass `{}`, and these pin down what `{}` has
// to mean.
describe('roomFor - starting a fresh run', () => {
  const emptyPayloads = [{}, undefined, null]

  it('banks nothing: EXP back to zero', () => {
    emptyPayloads.forEach((payload) => expect(roomFor(payload).gameState.exp).toBe(0))
  })

  it('keeps nothing: the rack comes up empty', () => {
    emptyPayloads.forEach((payload) => {
      const { inventory } = roomFor(payload).gameState

      expect(inventory.trinket).toBe(null)
      expect(inventory.passives).toEqual([])
      expect(inventory.actives).toEqual([null, null, null])
    })
  })

  it('drops the bombs with the rest of it', () => {
    emptyPayloads.forEach((payload) => expect(roomFor(payload).gameState.bombCount).toBe(0))
  })

  it('goes back to the entrance room rather than the room it died in', () => {
    emptyPayloads.forEach((payload) => {
      const room = roomFor(payload)

      // the entrance plan, not roomPlanFor(ENTRANCE_DOOR): the entrance holds one enemy
      // where an easy combat door holds four
      expect(room.plan).toEqual(ENTRANCE_PLAN)
      expect(room.plan.enemyCount).toBe(1)
      expect(room.gameState.roomNumber).toBe(1)
    })
  })

  // The stale-shape half of the leak: a run that ended in a G big room was starting the
  // next one in a G big room, because `shape` came back with everything else.
  it('is a plain rectangle, not whatever shape the last room was', () => {
    emptyPayloads.forEach((payload) => expect(roomFor(payload).shapeId).toBe(null))
  })

  it('is the entrance difficulty, not whatever tier the last room was', () => {
    const hard = roomFor(doorPayload(runInProgress(), 1))

    expect(hard.plan.tier).toBe('hard')
    expect(hard.plan.enemyCount).toBeGreaterThan(roomFor({}).plan.enemyCount)
    expect(roomFor({}).plan.tier).toBe('easy')
  })

  it('leaves health to the scene, so a fresh run starts full rather than on its last hit', () => {
    emptyPayloads.forEach((payload) => expect(roomFor(payload).health).toBe(null))
  })

  // Nothing may leak by reference either: a fresh run must not be handed the object the
  // old one was mutating.
  it('shares no state with the run that just ended', () => {
    const ended = runInProgress()
    const fresh = roomFor({}).gameState

    expect(fresh).not.toBe(ended)
    expect(fresh.inventory).not.toBe(ended.inventory)
    expect(fresh.cooldowns).not.toBe(ended.cooldowns)

    addExp(fresh, 5)
    expect(ended.exp).toBe(37)
  })
})

// The other half: normal room-to-room travel must still carry everything. A fix that
// wiped the run on every door would be worse than the bug.
describe('roomFor - walking into the next room', () => {
  it('carries the same game state object through, not a copy', () => {
    const gameState = runInProgress()

    expect(roomFor(doorPayload(gameState, 4)).gameState).toBe(gameState)
  })

  it('keeps the EXP, the items and the bombs', () => {
    const gameState = runInProgress()
    const room = roomFor(doorPayload(gameState, 4))

    expect(room.gameState.exp).toBe(37)
    expect(countOwned(room.gameState.inventory, 'iron_plating')).toBe(1)
    expect(passiveCounts(room.gameState.inventory).length).toBe(1)
    expect(room.gameState.bombCount).toBe(2)
  })

  it('keeps the damage taken rather than healing on every door', () => {
    expect(roomFor(doorPayload(runInProgress(), 2)).health).toBe(2)
  })

  it('keeps how deep the run is', () => {
    expect(roomFor(doorPayload(runInProgress(), 4)).gameState.roomNumber).toBe(4)
  })

  it('takes the plan and the shape the door chose', () => {
    const room = roomFor(doorPayload(runInProgress(), 4))

    expect(room.plan.tier).toBe('hard')
    expect(room.roomType).toBe('combat')
    expect(room.shapeId).toBe('G')
  })

  // A rectangular room mid-run is a payload with no shape in it, which must read as a
  // rectangle rather than as "start over".
  it('reads a shapeless door payload as a rectangle, not as a fresh run', () => {
    const gameState = runInProgress()
    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'medium' }),
      carried: { gameState, health: 3 }
    })

    expect(room.shapeId).toBe(null)
    expect(room.gameState).toBe(gameState)
    expect(room.gameState.exp).toBe(37)
  })

  it('survives a zero: no EXP left and one HP is still a run in progress', () => {
    const gameState = freshGameState()
    const room = roomFor(doorPayload(gameState, 0))

    expect(room.gameState).toBe(gameState)
    expect(room.health).toBe(0)
  })
})

// The twist budget, booked as the run walks through rooms.
describe('the run twist budget', () => {
  const shop = roomPlanFor({ type: 'shop', tier: 'easy' })
  const combat = roomPlanFor({ type: 'combat', tier: 'easy' })

  it('rolls a cap between 0 and 4 when a run starts', () => {
    for (let i = 0; i < 500; i++) {
      const { twistCap } = freshGameState()

      expect(twistCap).toBeGreaterThanOrEqual(0)
      expect(twistCap).toBeLessThanOrEqual(MAX_TWIST_CAP)
    }

    expect(freshGameState(() => 0.99).twistCap).toBe(MAX_TWIST_CAP)
  })

  it('starts a run having twisted nothing', () => {
    const state = freshGameState()

    expect(state.twistsSoFar).toBe(0)
    expect(state.lastRoomWasTwist).toBe(false)
    // and no ambush line yet, so the first one of a run can be any of the 28
    expect(state.lastTwistLine).toBe(null)
  })

  it('books a twist and remembers it', () => {
    const state = freshGameState(() => 0.99)

    expect(recordTwist(state, shop, true)).toBe(true)
    expect(state.twistsSoFar).toBe(1)
    expect(state.lastRoomWasTwist).toBe(true)
  })

  it('books an untwisted shop and clears the block', () => {
    const state = freshGameState(() => 0.99)

    recordTwist(state, shop, true)
    expect(recordTwist(state, shop, false)).toBe(false)
    expect(state.twistsSoFar).toBe(1)
    expect(state.lastRoomWasTwist).toBe(false)
  })

  // The rule from the spec, and the reason recordTwist takes the plan at all: a room that
  // could never have twisted has nothing to say about whether the last one did. Walking a
  // fight between a twisted puzzle and a shop does not buy the shop the right to twist.
  it('leaves the block alone when the room could not have twisted', () => {
    const state = freshGameState(() => 0.99)

    recordTwist(state, shop, true)
    recordTwist(state, combat, false)

    expect(state.lastRoomWasTwist).toBe(true)
    expect(state.twistsSoFar).toBe(1)
  })

  it('counts twisted rooms, so an untouched room costs nothing', () => {
    const state = freshGameState(() => 0.99)

    expect(state.twistsSoFar).toBe(0)
  })
})

describe('the twist budget across rooms and runs', () => {
  const spent = () => {
    const gameState = freshGameState(() => 0.99)
    recordTwist(gameState, roomPlanFor({ type: 'shop', tier: 'easy' }), true)
    return gameState
  }

  it('survives a door, because the same object goes through', () => {
    const gameState = spent()
    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'easy' }),
      carried: { gameState, health: 4 }
    })

    expect(room.gameState.twistsSoFar).toBe(1)
    expect(room.gameState.lastRoomWasTwist).toBe(true)
    expect(room.gameState.twistCap).toBe(MAX_TWIST_CAP)
  })

  it('dies with the run, and the next one is dealt its own cap', () => {
    const fresh = roomFor({}).gameState

    expect(fresh.twistsSoFar).toBe(0)
    expect(fresh.lastRoomWasTwist).toBe(false)
    expect(fresh.twistCap).toBeGreaterThanOrEqual(0)
    expect(fresh.twistCap).toBeLessThanOrEqual(MAX_TWIST_CAP)
  })
})

describe('roomFor - being told the room twisted', () => {
  it('carries what the door promised, so the room can say it was twisted', () => {
    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'hard' }),
      twisted: { type: 'combat', tier: 'easy' },
      carried: { gameState: freshGameState(), health: 3 }
    })

    expect(room.twisted).toEqual({ type: 'combat', tier: 'easy' })
  })

  it('says nothing was promised on an honest door', () => {
    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'easy' }),
      carried: { gameState: freshGameState(), health: 3 }
    })

    expect(room.twisted).toBe(null)
  })

  it('says nothing was promised in the entrance room, which no door chose', () => {
    expect(roomFor({}).twisted).toBe(null)
  })
})

// A corridor costs a door without costing a room, so the two counters have to be separate
// and both have to die with the run.
describe('doors taken and rooms entered', () => {
  it('starts a run with no doors taken', () => {
    expect(freshGameState().doorsTaken).toBe(0)
  })

  it('rolls the floor corridors when the run starts', () => {
    const { corridorDoors } = freshGameState()

    expect(Array.isArray(corridorDoors)).toBe(true)
    expect(corridorDoors.length).toBeGreaterThan(0)
  })

  it('deals a new set of corridors to a new run', () => {
    const seen = new Set()

    for (let i = 0; i < 200; i++) {
      seen.add(freshGameState().corridorDoors.join(','))
    }

    expect(seen.size).toBeGreaterThan(1)
  })

  it('carries both counters through a door', () => {
    const gameState = freshGameState()

    gameState.doorsTaken = 5
    gameState.roomNumber = 4

    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'easy' }),
      carried: { gameState, health: 3 }
    })

    expect(room.gameState.doorsTaken).toBe(5)
    expect(room.gameState.roomNumber).toBe(4)
  })

  it('resets both when the run ends', () => {
    const fresh = roomFor({}).gameState

    expect(fresh.doorsTaken).toBe(0)
    expect(fresh.roomNumber).toBe(1)
  })
})

describe('roomFor - the room a run opens in', () => {
  it('opens on the entrance plan when no door chose the room', () => {
    const room = roomFor({})

    expect(room.plan).toEqual(ENTRANCE_PLAN)
    expect(room.plan.enemyCount).toBe(1)
  })

  it('opens gently on a fresh restart too, not on the combat table', () => {
    expect(roomFor(undefined).plan.enemyCount).toBe(1)
  })
})

describe('roomFor - a corridor on the way somewhere', () => {
  const destination = {
    plan: roomPlanFor({ type: 'combat', tier: 'hard' }),
    twisted: { type: 'combat', tier: 'easy' },
    shape: 'G'
  }

  it('holds the room the corridor is on the way to', () => {
    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'easy' }),
      shape: 'corridor',
      pending: destination,
      carried: { gameState: freshGameState(), health: 3 }
    })

    expect(room.pending).toEqual(destination)
  })

  it('holds nothing pending in an ordinary room', () => {
    const room = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'easy' }),
      carried: { gameState: freshGameState(), health: 3 }
    })

    expect(room.pending).toBe(null)
  })

  it('holds nothing pending in the entrance room', () => {
    expect(roomFor({}).pending).toBe(null)
  })

  // The lie is announced where it is found out, which is the destination - not in the
  // corridor on the way to it.
  it('keeps the twisted notice with the destination, not the corridor', () => {
    const corridor = roomFor({
      plan: roomPlanFor({ type: 'combat', tier: 'easy' }),
      shape: 'corridor',
      pending: destination,
      carried: { gameState: freshGameState(), health: 3 }
    })

    expect(corridor.twisted).toBe(null)
    expect(corridor.pending.twisted).toEqual(destination.twisted)
  })
})
