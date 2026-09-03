import { describe, expect, it } from 'vitest'
import { ENTRANCE_DOOR, roomPlanFor } from './doors.js'
import { addExp } from './currency.js'
import { grantItem } from './grant.js'
import { countOwned, passiveCounts } from './inventory.js'
import { getItem } from './items.js'
import { freshGameState, roomFor } from './run.js'

// A run part-way through: some EXP banked, an item in the rack, curses taken, four rooms
// deep and standing in a hard shaped room.
function runInProgress() {
  const gameState = freshGameState()

  addExp(gameState, 37)
  grantItem(gameState, getItem('iron_plating'))
  gameState.riskLevel = 2
  gameState.enemyStrength = 3
  gameState.rewardsCollected = 5
  gameState.bombCount = 2
  gameState.roomNumber = 4

  return gameState
}

const doorPayload = (gameState, health) => ({
  plan: roomPlanFor({ type: 'risky_reward', tier: 'hard' }),
  shape: 'G',
  carried: { gameState, health }
})

describe('freshGameState', () => {
  it('starts a run with nothing banked and nothing held', () => {
    const state = freshGameState()

    expect(state.exp).toBe(0)
    expect(state.bombCount).toBe(0)
    expect(state.riskLevel).toBe(0)
    expect(state.enemyStrength).toBe(0)
    expect(state.rewardsCollected).toBe(0)
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

  it('drops the curses and the bombs with the rest of it', () => {
    emptyPayloads.forEach((payload) => {
      const { gameState } = roomFor(payload)

      expect(gameState.riskLevel).toBe(0)
      expect(gameState.enemyStrength).toBe(0)
      expect(gameState.rewardsCollected).toBe(0)
      expect(gameState.bombCount).toBe(0)
    })
  })

  it('goes back to the entrance room rather than the room it died in', () => {
    emptyPayloads.forEach((payload) => {
      const room = roomFor(payload)

      expect(room.plan).toEqual(roomPlanFor(ENTRANCE_DOOR))
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

  it('keeps the EXP, the items and the curses', () => {
    const gameState = runInProgress()
    const room = roomFor(doorPayload(gameState, 4))

    expect(room.gameState.exp).toBe(37)
    expect(countOwned(room.gameState.inventory, 'iron_plating')).toBe(1)
    expect(passiveCounts(room.gameState.inventory).length).toBe(1)
    expect(room.gameState.riskLevel).toBe(2)
    expect(room.gameState.enemyStrength).toBe(3)
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
      plan: roomPlanFor({ type: 'safe_reward', tier: 'medium' }),
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
