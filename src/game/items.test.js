import { describe, expect, test } from 'vitest'
import { computeStats } from './effects.js'
import { createInventory } from './inventory.js'
import {
  ACTIVE_ITEMS,
  DEBUFF_ITEMS,
  ITEMS,
  PASSIVE_ITEMS,
  SET_BONUS,
  TRINKET_ITEMS,
  getItem,
  itemsFrom
} from './items.js'

describe('item data', () => {
  // Actives are unique and capped, so the rack can only fill - and the swap prompt only
  // fire - if the catalogue holds more of them than the rack does. The passive tier is
  // uncapped and stacks, so it has no such floor.
  test('there are enough actives to fill 3 slots and still find another', () => {
    expect(ACTIVE_ITEMS.length).toBeGreaterThanOrEqual(4)
  })

  test('there is at least one trinket to put in the one trinket slot', () => {
    expect(TRINKET_ITEMS.length).toBeGreaterThanOrEqual(1)
  })

  test('the tiers and the debuffs make up the whole catalogue and do not overlap', () => {
    expect(
      TRINKET_ITEMS.length + PASSIVE_ITEMS.length + ACTIVE_ITEMS.length + DEBUFF_ITEMS.length
    ).toBe(ITEMS.length)
  })

  test('the original five items are still in the catalogue', () => {
    const ids = ITEMS.map((item) => item.id)

    expect(ids).toContain('iron_plating')
    expect(ids).toContain('twitchy_trigger')
    expect(ids).toContain('steady_boots')
    expect(ids).toContain('panic_button')
    expect(ids).toContain('second_wind')
  })

  test('every item has a unique id, a name and a source', () => {
    const ids = ITEMS.map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
    ITEMS.forEach((item) => {
      expect(item.name).toBeTruthy()
      expect(['reward', 'treasure', 'debuff']).toContain(item.source)
    })
  })

  test('every item is marked with its own tier', () => {
    TRINKET_ITEMS.forEach((item) => expect(item.slot).toBe('trinket'))
    PASSIVE_ITEMS.forEach((item) => expect(item.slot).toBe('passive'))
    ACTIVE_ITEMS.forEach((item) => expect(item.slot).toBe('active'))
  })

  test('heavy vest is the trinket', () => {
    expect(getItem('heavy_vest').slot).toBe('trinket')
  })

  // The set moved to the active rack with the tier restructure.
  test('the set bonus is a pair of actives', () => {
    SET_BONUS.ids.forEach((id) => expect(getItem(id).slot).toBe('active'))
  })

  test('every active item has a cooldown, and second wind is the longer one', () => {
    const panic = getItem('panic_button')
    const secondWind = getItem('second_wind')

    expect(panic.cooldown).toBeGreaterThan(0)
    expect(secondWind.cooldown).toBeGreaterThan(panic.cooldown)
  })

  test('getItem finds an item by id and returns undefined for an unknown one', () => {
    expect(getItem('steady_boots').name).toBe('Steady Boots')
    expect(getItem('no_such_item')).toBeUndefined()
  })

  test('the treasure pool is a real roll', () => {
    // more than one, so the chest is an actual roll rather than a fixed handout
    expect(itemsFrom('treasure').length).toBeGreaterThanOrEqual(2)
    expect(itemsFrom('treasure').map((item) => item.id)).toContain('steady_boots')
  })

  test('the three sources partition the catalogue with no overlap', () => {
    const reward = itemsFrom('reward').map((item) => item.id)
    const treasure = itemsFrom('treasure').map((item) => item.id)
    const debuff = itemsFrom('debuff').map((item) => item.id)

    expect(reward.length + treasure.length + debuff.length).toBe(ITEMS.length)
    expect(reward.some((id) => treasure.includes(id))).toBe(false)
    expect(debuff.some((id) => reward.includes(id) || treasure.includes(id))).toBe(false)
    expect(reward).toContain('panic_button')
  })
})

// Debuffs are the risky room's payout, so what matters about them as data is that they
// are passives - the one tier that cannot refuse an item or be walked away from - and
// that no other roll can reach them.
describe('debuff items', () => {
  test('there are four of them, matching the design', () => {
    expect(DEBUFF_ITEMS.map((item) => item.id).sort()).toEqual([
      'rusty_grip',
      'slug_step',
      'sluggish',
      'thin_skin'
    ])
  })

  test('every one is a passive, so it can never be declined for want of a slot', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.slot).toBe('passive'))
  })

  test('every one is sourced debuff, so no other pool can draw it', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.source).toBe('debuff'))
    expect(itemsFrom('debuff')).toEqual(DEBUFF_ITEMS)
  })

  test('none of them is in the reward, treasure or shop-facing pools', () => {
    const safe = [...itemsFrom('reward'), ...itemsFrom('treasure')].map((item) => item.id)

    DEBUFF_ITEMS.forEach((item) => expect(safe).not.toContain(item.id))
  })

  // The fields are what computeStats reads, so the pairing has to be in the data.
  test('each one carries both the field that helps and the field that hurts', () => {
    expect(getItem('rusty_grip').damageBonus).toBe(1)
    expect(getItem('rusty_grip').fireRateMultiplier).toBeLessThan(1)

    expect(getItem('sluggish').maxHpBonus).toBe(1)
    expect(getItem('sluggish').moveSpeedMultiplier).toBeLessThan(1)

    expect(getItem('thin_skin').moveSpeedMultiplier).toBeGreaterThan(1)
    expect(getItem('thin_skin').maxHpBonus).toBeLessThan(0)

    expect(getItem('slug_step').expPerKillBonus).toBe(1)
    expect(getItem('slug_step').spawnsSlug).toBe(true)
  })

  // Each one is a bargain, not a punishment: it has to give something as well as take
  // something, or a risky door is a fight you are paid nothing for.
  test('each one carries a bonus as well as a cost', () => {
    const bonuses = {
      rusty_grip: (item) => item.damageBonus > 0,
      sluggish: (item) => item.maxHpBonus > 0,
      thin_skin: (item) => item.moveSpeedMultiplier > 1,
      slug_step: (item) => item.expPerKillBonus > 0
    }
    const costs = {
      rusty_grip: (item) => item.fireRateMultiplier < 1,
      sluggish: (item) => item.moveSpeedMultiplier < 1,
      thin_skin: (item) => item.maxHpBonus < 0,
      slug_step: (item) => item.spawnsSlug === true
    }

    DEBUFF_ITEMS.forEach((item) => {
      expect(bonuses[item.id](item)).toBe(true)
      expect(costs[item.id](item)).toBe(true)
    })
  })

  test('the effect line names both halves of the bargain', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.effect).toMatch(/,|but/))
  })

  test('none of them carries a cooldown, so nothing treats one as an active', () => {
    DEBUFF_ITEMS.forEach((item) => expect(item.cooldown).toBeUndefined())
  })
})

// A 0-1 figure the boss system will read to decide what an item is worth. **Nothing
// consumes it yet** - these tests exist so the data is correct and complete on the day
// something does, rather than being discovered wrong then.
describe('bonusWeight', () => {
  // Hair Trigger's weight is being set deliberately rather than guessed at. When it is
  // assigned, delete it from here - the second test below fails until you do, which is
  // the point: the hole should not be able to go quiet.
  const PENDING_BONUS_WEIGHT = ['hair_trigger']

  test('every item that has been given a weight has a sane one', () => {
    ITEMS.filter((item) => !PENDING_BONUS_WEIGHT.includes(item.id)).forEach((item) => {
      expect(typeof item.bonusWeight, item.id).toBe('number')
      expect(item.bonusWeight, item.id).toBeGreaterThan(0)
      expect(item.bonusWeight, item.id).toBeLessThanOrEqual(1)
    })
  })

  test('the only items still missing a weight are the ones known to be pending', () => {
    const missing = ITEMS.filter((item) => item.bonusWeight === undefined).map((item) => item.id)

    expect(missing).toEqual(PENDING_BONUS_WEIGHT)
  })

  test('carries the weights that were specified, item by item', () => {
    const expected = {
      heavy_vest: 0.4,
      iron_plating: 0.2,
      twitchy_trigger: 0.3,
      steady_boots: 0.25,
      sharp_rounds: 0.35,
      rusty_grip: 0.3,
      sluggish: 0.2,
      thin_skin: 0.25,
      slug_step: 0.15,
      panic_button: 0.5,
      second_wind: 0.3,
      bulwark: 0.4,
      repair_kit: 0.35
    }

    Object.entries(expected).forEach(([id, weight]) =>
      expect(getItem(id).bonusWeight, id).toBe(weight)
    )
  })

  // It is inert on purpose: nothing should have started reading it behind our backs.
  test('changes no stat, being data for a system that does not exist yet', () => {
    const base = { maxHp: 6, fireCooldown: 180, moveSpeed: 320, damage: 1, expPerKill: 2 }
    const withWeight = createInventory()
    const withoutWeight = createInventory()

    withWeight.passives.push({ ...getItem('iron_plating') })
    withoutWeight.passives.push({ ...getItem('iron_plating'), bonusWeight: undefined })

    expect(computeStats(base, withWeight)).toEqual(computeStats(base, withoutWeight))
  })
})

// Placeholder art, but the data still has to hold: an icon nobody can tell apart from
// another icon is worse than no icon, because it reads as information and is not.
describe('item icons', () => {
  const SHAPE_FOR_TIER = { trinket: 'star', passive: 'circle', active: 'triangle' }

  test('every item has one', () => {
    ITEMS.forEach((item) => {
      expect(item.icon, item.id).toBeDefined()
      expect(typeof item.icon.shape, item.id).toBe('string')
      expect(typeof item.icon.color, item.id).toBe('number')
    })
  })

  test('every shape is one the renderer knows how to draw', () => {
    ITEMS.forEach((item) =>
      expect(['star', 'circle', 'triangle', 'square']).toContain(item.icon.shape)
    )
  })

  // The whole point: no two items may look the same.
  test('no two items share a shape and a colour', () => {
    const pairs = ITEMS.map((item) => `${item.icon.shape}:${item.icon.color}`)

    expect(new Set(pairs).size).toBe(ITEMS.length)
  })

  // Within a shape, colour is the only thing telling two items apart, so those are the
  // collisions that actually matter.
  test('no two items of the same shape share a colour', () => {
    const byShape = {}

    ITEMS.forEach((item) => {
      byShape[item.icon.shape] = byShape[item.icon.shape] ?? []
      byShape[item.icon.shape].push(item.icon.color)
    })

    Object.entries(byShape).forEach(([shape, colors]) =>
      expect(new Set(colors).size, shape).toBe(colors.length)
    )
  })

  test('shape says which tier it is', () => {
    ITEMS.filter((item) => item.source !== 'debuff').forEach((item) =>
      expect(item.icon.shape, item.id).toBe(SHAPE_FOR_TIER[item.slot])
    )
  })

  // Debuffs are passives by tier but get their own shape: they are the one thing the
  // player might want to recognise on sight before deciding to walk into it.
  test('a debuff is a square, whatever tier it technically sits in', () => {
    itemsFrom('debuff').forEach((item) => expect(item.icon.shape).toBe('square'))
  })

  test('every colour is a real 24-bit colour', () => {
    ITEMS.forEach((item) => {
      expect(item.icon.color, item.id).toBeGreaterThanOrEqual(0)
      expect(item.icon.color, item.id).toBeLessThanOrEqual(0xffffff)
    })
  })
})
