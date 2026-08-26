// Item data. `effect` is the line shown to the player; the numeric fields next to it are
// what computeStats() actually reads, so adding an item never means editing effects.js.
export const PASSIVE_ITEMS = [
  {
    id: 'iron_plating',
    name: 'Iron Plating',
    slot: 'passive',
    source: 'reward',
    effect: '+1 max HP (half-heart)',
    maxHpBonus: 1
  },
  {
    id: 'twitchy_trigger',
    name: 'Twitchy Trigger',
    slot: 'passive',
    source: 'reward',
    effect: '-20ms fire cooldown',
    fireCooldownBonus: -20
  },
  {
    id: 'steady_boots',
    name: 'Steady Boots',
    slot: 'passive',
    source: 'treasure',
    effect: '+15% move speed',
    moveSpeedMultiplier: 1.15
  }
]

export const ACTIVE_ITEMS = [
  {
    id: 'panic_button',
    name: 'Panic Button',
    slot: 'active',
    source: 'reward',
    effect: 'damage/push back all enemies in radius',
    cooldown: 12000
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    slot: 'active',
    source: 'reward',
    effect: 'heal 1 HP (half-heart)',
    cooldown: 30000
  }
]

export const ITEMS = [...PASSIVE_ITEMS, ...ACTIVE_ITEMS]

// iron_plating + steady_boots worn together sharpen every bullet.
export const SET_BONUS = {
  ids: ['iron_plating', 'steady_boots'],
  damageMultiplier: 1.05
}

export function getItem(id) {
  return ITEMS.find((item) => item.id === id)
}

export function itemsFrom(source) {
  return ITEMS.filter((item) => item.source === source)
}
