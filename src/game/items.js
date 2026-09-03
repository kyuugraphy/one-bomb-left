// Item data. `effect` is the line shown to the player; the numeric fields next to it are
// what computeStats() actually reads, so adding an item never means editing effects.js.
//
// `slot` is the tier: 'trinket' (one unique slot), 'passive' (uncapped, stacks) or
// 'active' (three unique slots). computeStats reads the trinket and the passives; only
// actives carry a cooldown.
export const TRINKET_ITEMS = [
  // The one item that costs something to wear, so the single trinket slot is a real
  // decision rather than a free upgrade.
  {
    id: 'heavy_vest',
    name: 'Heavy Vest',
    slot: 'trinket',
    source: 'treasure',
    effect: '+2 max HP, -10% move speed',
    maxHpBonus: 2,
    moveSpeedMultiplier: 0.9
  }
]

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
  },
  {
    id: 'sharp_rounds',
    name: 'Sharp Rounds',
    slot: 'passive',
    source: 'reward',
    effect: '+0.5 bullet damage',
    damageBonus: 0.5
  },
  {
    id: 'hair_trigger',
    name: 'Hair Trigger',
    slot: 'passive',
    source: 'reward',
    effect: '-35ms fire cooldown',
    fireCooldownBonus: -35
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
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    slot: 'active',
    source: 'reward',
    effect: 'shrug off every hit for 2.5s',
    cooldown: 24000
  },
  {
    id: 'repair_kit',
    name: 'Repair Kit',
    slot: 'active',
    source: 'reward',
    effect: 'heal 2 HP (one heart)',
    cooldown: 45000
  }
]

export const ITEMS = [...TRINKET_ITEMS, ...PASSIVE_ITEMS, ...ACTIVE_ITEMS]

// panic_button + bulwark equipped together sharpen every bullet. The set moved to the
// active rack with the tier restructure: passives are uncapped now, so a set built from
// them would be something you collect rather than something you choose.
export const SET_BONUS = {
  ids: ['panic_button', 'bulwark'],
  damageMultiplier: 1.05
}

export function getItem(id) {
  return ITEMS.find((item) => item.id === id)
}

export function itemsFrom(source) {
  return ITEMS.filter((item) => item.source === source)
}
