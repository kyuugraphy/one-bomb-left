import { describe, expect, it } from 'vitest'
import {
  BOSS_DOOR,
  TRAP_ORDINAL_MAX,
  FLOOR_BANDS,
  FLOOR_ONE_ROOMS,
  NORMAL_DOORS,
  SHOP_GUARANTEED,
  doorPolicyFor,
  floorSize,
  midFloorRoom,
  preBossRoom,
  rollTrapOrdinal,
  shopCheckpoints
} from './floors.js'

// How long a floor is. Floor 1 is fixed because it is where the game is learned and a
// learning floor that varies is a learning floor that sometimes ends before it has taught
// anything; every floor after it is a rolled range, so a run is not the same shape twice.
describe('floorSize', () => {
  it('makes floor 1 exactly seven rooms, every time', () => {
    ;[0, 0.25, 0.5, 0.75, 0.99].forEach((roll) => {
      expect(floorSize(1, () => roll)).toBe(FLOOR_ONE_ROOMS)
    })
    expect(FLOOR_ONE_ROOMS).toBe(7)
  })

  it('spends no roll on floor 1, because there is nothing to decide', () => {
    let calls = 0

    floorSize(1, () => {
      calls += 1
      return 0.5
    })

    expect(calls).toBe(0)
  })

  it('rolls floor 2 between nine and eleven rooms', () => {
    expect(floorSize(2, () => 0)).toBe(9)
    expect(floorSize(2, () => 0.99)).toBe(11)

    const seen = new Set()

    for (let i = 0; i < 5000; i++) {
      seen.add(floorSize(2, Math.random))
    }

    expect([...seen].sort((a, b) => a - b)).toEqual([9, 10, 11])
  })

  it('rolls floor 3 and everything after it between thirteen and fifteen rooms', () => {
    ;[3, 4, 7, 8, 20].forEach((floor) => {
      expect(floorSize(floor, () => 0)).toBe(13)
      expect(floorSize(floor, () => 0.99)).toBe(15)
    })

    const seen = new Set()

    for (let i = 0; i < 5000; i++) {
      seen.add(floorSize(5, Math.random))
    }

    expect([...seen].sort((a, b) => a - b)).toEqual([13, 14, 15])
  })

  // Floor 7 is not the end of anything yet. A run chains on past it on the same rule, so
  // the deepest floor a player reaches is however far they get rather than a number here.
  it('keeps going past floor 7 rather than running out of floors', () => {
    ;[8, 12, 40].forEach((floor) => {
      expect(floorSize(floor, Math.random)).toBeGreaterThanOrEqual(13)
      expect(floorSize(floor, Math.random)).toBeLessThanOrEqual(15)
    })
  })

  it('never shrinks as a run goes deeper', () => {
    const shallowest = (floor) => floorSize(floor, () => 0)

    expect(shallowest(2)).toBeGreaterThan(shallowest(1))
    expect(shallowest(3)).toBeGreaterThan(shallowest(2))
  })

  it('spends exactly one roll on any floor that has a range', () => {
    ;[2, 3, 9].forEach((floor) => {
      let calls = 0

      floorSize(floor, () => {
        calls += 1
        return 0.5
      })

      expect(calls).toBe(1)
    })
  })

  it('describes every floor in FLOOR_BANDS, so a new band cannot ship unreachable', () => {
    FLOOR_BANDS.forEach((band) => {
      expect(band.min).toBeGreaterThan(0)
      expect(band.max).toBeGreaterThanOrEqual(band.min)
    })
  })
})

// Where the two guaranteed shop offers fall on a floor.
describe('shopCheckpoints', () => {
  it('puts the first at the floor midpoint', () => {
    expect(midFloorRoom(7)).toBe(4)
    expect(midFloorRoom(9)).toBe(5)
    expect(midFloorRoom(13)).toBe(7)
    expect(midFloorRoom(15)).toBe(8)
  })

  // An even floor has no exact middle room, so the tie goes to the later of the two: a
  // checkpoint that arrives a room late is a resupply before the back half, and one that
  // arrives a room early is a resupply you have not needed yet.
  it('rounds an even floor up to the later of the two middle rooms', () => {
    expect(midFloorRoom(10)).toBe(5)
    expect(midFloorRoom(14)).toBe(7)
  })

  // Not the last regular room, which is the one whose doors the boss takes over.
  it('puts the second one room before the boss door, not on it', () => {
    expect(preBossRoom(7)).toBe(6)
    expect(preBossRoom(11)).toBe(10)
    expect(preBossRoom(15)).toBe(14)
  })

  it('offers exactly two checkpoints on every floor a run can deal', () => {
    ;[7, 9, 10, 11, 13, 14, 15].forEach((rooms) => {
      const checkpoints = shopCheckpoints(rooms)

      expect(checkpoints).toHaveLength(2)
      expect(new Set(checkpoints).size).toBe(2)
      expect(checkpoints).toEqual([midFloorRoom(rooms), preBossRoom(rooms)])
    })
  })

  // Both have to be rooms the player actually walks, and neither may be the last one.
  it('keeps both checkpoints inside the floor and clear of the boss door', () => {
    ;[7, 9, 10, 11, 13, 14, 15].forEach((rooms) => {
      shopCheckpoints(rooms).forEach((room) => {
        expect(room).toBeGreaterThanOrEqual(1)
        expect(room).toBeLessThan(rooms)
      })
    })
  })
})

// What the doors of a given room are allowed to be. One question asked in one place, so
// the boss takeover and the shop guarantee cannot both think they own the same choice.
describe('doorPolicyFor', () => {
  it('hands the last regular room to the boss', () => {
    expect(doorPolicyFor(7, 7)).toBe(BOSS_DOOR)
    expect(doorPolicyFor(15, 15)).toBe(BOSS_DOOR)
  })

  it('guarantees a shop at both checkpoints', () => {
    expect(doorPolicyFor(4, 7)).toBe(SHOP_GUARANTEED)
    expect(doorPolicyFor(6, 7)).toBe(SHOP_GUARANTEED)
  })

  it('leaves every other room to roll its own doors', () => {
    ;[1, 2, 3, 5].forEach((room) => {
      expect(doorPolicyFor(room, 7)).toBe(NORMAL_DOORS)
    })
  })

  // The contradiction this design started with: the pre-boss checkpoint and the boss door
  // both wanted the last regular room. The checkpoint moved a room earlier, so the boss
  // keeps a choice with nothing else in it.
  it('never asks the boss room to also offer a shop', () => {
    ;[7, 9, 10, 11, 13, 14, 15].forEach((rooms) => {
      expect(doorPolicyFor(rooms, rooms)).toBe(BOSS_DOOR)
      expect(shopCheckpoints(rooms)).not.toContain(rooms)
    })
  })

  it('gives every room of every floor exactly one policy', () => {
    ;[7, 9, 10, 11, 13, 14, 15].forEach((rooms) => {
      const policies = []

      for (let room = 1; room <= rooms; room++) {
        policies.push(doorPolicyFor(room, rooms))
      }

      expect(policies.filter((p) => p === BOSS_DOOR)).toHaveLength(1)
      expect(policies.filter((p) => p === SHOP_GUARANTEED)).toHaveLength(2)
      expect(policies.filter((p) => p === NORMAL_DOORS)).toHaveLength(rooms - 3)
    })
  })
})

// One ordinary shop door per floor is a certain ambush rather than a 1% risk. Which one is
// rolled at floor generation, **before anyone knows how many there will be** - doors are
// rolled room by room as the player walks, and a floor offers anywhere from none to seven.
//
// So the trap is "the Nth ordinary shop door of this floor", and if the floor never offers
// N of them, no trap fires. That is why the guarantee is *at most* one per floor and not
// exactly one: exactly one is not placeable without pre-rolling every room's doors, which
// would mean rebuilding when doors are decided at all.
describe('rollTrapOrdinal', () => {
  it('scales its range with the floor, so the trap is not always in the same slot', () => {
    expect(TRAP_ORDINAL_MAX(7)).toBe(2)
    expect(TRAP_ORDINAL_MAX(11)).toBe(3)
    expect(TRAP_ORDINAL_MAX(15)).toBe(4)
  })

  it('never picks the zeroth or a negative shop', () => {
    ;[7, 9, 11, 13, 15].forEach((rooms) => {
      for (let i = 0; i < 2000; i++) {
        expect(rollTrapOrdinal(rooms, Math.random)).toBeGreaterThanOrEqual(1)
      }
    })
  })

  it('stays inside the range for the floor', () => {
    ;[7, 11, 15].forEach((rooms) => {
      expect(rollTrapOrdinal(rooms, () => 0)).toBe(1)
      expect(rollTrapOrdinal(rooms, () => 0.999)).toBe(TRAP_ORDINAL_MAX(rooms))
    })
  })

  it('reaches every ordinal in the range', () => {
    ;[7, 11, 15].forEach((rooms) => {
      const seen = new Set()

      for (let i = 0; i < 5000; i++) {
        seen.add(rollTrapOrdinal(rooms, Math.random))
      }

      expect([...seen].sort((a, b) => a - b)).toEqual(
        Array.from({ length: TRAP_ORDINAL_MAX(rooms) }, (_, i) => i + 1)
      )
    })
  })

  it('spends exactly one roll', () => {
    let calls = 0

    rollTrapOrdinal(7, () => {
      calls += 1
      return 0.5
    })

    expect(calls).toBe(1)
  })

  // A short floor with a wide ordinal range would mostly miss, so the range is deliberately
  // below the number of ordinary shop doors a floor of that length tends to offer.
  it('keeps its range under what a floor of that length actually offers', () => {
    // measured means: 2.15 ordinary shop doors on a 7-room floor, 4.30 on 11, 6.46 on 15
    expect(TRAP_ORDINAL_MAX(7)).toBeLessThanOrEqual(2)
    expect(TRAP_ORDINAL_MAX(11)).toBeLessThanOrEqual(4)
    expect(TRAP_ORDINAL_MAX(15)).toBeLessThanOrEqual(6)
  })
})
