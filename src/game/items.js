// Item data. `effect` is the line shown to the player; the numeric fields next to it are
// what computeStats() actually reads, so adding an item never means editing effects.js.
//
// `slot` is the tier: 'trinket' (one unique slot), 'passive' (uncapped, stacks) or
// 'active' (three unique slots). computeStats reads the trinket and the passives; only
// actives carry a cooldown.
//
// `bonusWeight` is a 0-1 figure the boss system will read to decide how much an item is
// worth when it is handed out or paid for. **Nothing consumes it yet** - it is data laid
// down ahead of the system that will use it. Hair Trigger has none on purpose; see
// PENDING_BONUS_WEIGHT in items.test.js.
//
// `rank` is an actives-only 1-4 integer, and it says two things at once: what the item
// costs in the 6-slot shared inventory that is coming, and how strong it is relative to
// the other actives. One number for both, so a rank 4 active is the powerful one *and*
// the one that eats most of the rack. **Nothing reads it yet** - inventory.js and
// actives.js still know only about three unique slots; items.test.js pins the values so
// they are right on the day something does read them.
//
// `icon` is placeholder art, in the same register as everything else on screen: a
// coloured geometric shape. **Shape is the tier and colour is the item**, so one glyph
// says both what kind of thing this is and which one:
//
//   star      trinket      circle    passive
//   triangle  active       square    debuff
//
// Every (shape, colour) pair is unique across the catalogue, which items.test.js pins.
// The four shapes were chosen for needing no base rotation, so the pickup reveal can spin
// one through 360 degrees and set it back to 0 without any of them ending up crooked.
// Swap the whole block for real art later; nothing reads it but the icon drawing.
export const TRINKET_ITEMS = [
  // The one item that costs something to wear, so the single trinket slot is a real
  // decision rather than a free upgrade.
  {
    id: 'heavy_vest',
    name: 'Heavy Vest',
    slot: 'trinket',
    source: 'treasure',
    icon: { shape: 'star', color: 0xf59e0b },
    effect: '+2 max HP, -10% move speed',
    bonusWeight: 0.4,
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
    icon: { shape: 'circle', color: 0x60a5fa },
    effect: '+1 max HP (half-heart)',
    bonusWeight: 0.2,
    maxHpBonus: 1
  },
  {
    id: 'twitchy_trigger',
    name: 'Twitchy Trigger',
    slot: 'passive',
    source: 'reward',
    icon: { shape: 'circle', color: 0xfacc15 },
    effect: '-20ms fire cooldown',
    bonusWeight: 0.3,
    fireCooldownBonus: -20
  },
  {
    id: 'steady_boots',
    name: 'Steady Boots',
    slot: 'passive',
    source: 'treasure',
    icon: { shape: 'circle', color: 0x34d399 },
    effect: '+15% move speed',
    bonusWeight: 0.25,
    moveSpeedMultiplier: 1.15
  },
  {
    id: 'sharp_rounds',
    name: 'Sharp Rounds',
    slot: 'passive',
    source: 'reward',
    icon: { shape: 'circle', color: 0xf87171 },
    effect: '+0.5 bullet damage',
    bonusWeight: 0.35,
    damageBonus: 0.5
  },
  {
    // No bonusWeight yet - deliberately left to be assigned rather than guessed at.
    id: 'hair_trigger',
    name: 'Hair Trigger',
    slot: 'passive',
    source: 'reward',
    icon: { shape: 'circle', color: 0xfb923c },
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
    icon: { shape: 'triangle', color: 0xa3e635 },
    effect: 'damage/push back all enemies in radius',
    bonusWeight: 0.5,
    rank: 3,
    cooldown: 12000
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    slot: 'active',
    source: 'reward',
    icon: { shape: 'triangle', color: 0x22d3ee },
    effect: 'heal 1 HP (half-heart)',
    bonusWeight: 0.3,
    rank: 2,
    cooldown: 30000
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    slot: 'active',
    source: 'reward',
    icon: { shape: 'triangle', color: 0x818cf8 },
    effect: 'shrug off every hit for 2.5s',
    bonusWeight: 0.4,
    rank: 1,
    cooldown: 24000
  },
  {
    id: 'repair_kit',
    name: 'Repair Kit',
    slot: 'active',
    source: 'reward',
    icon: { shape: 'triangle', color: 0xf472b6 },
    effect: 'heal 2 HP (one heart)',
    bonusWeight: 0.35,
    rank: 4,
    cooldown: 45000
  }
]

// The risky room's payout. Each one is a **bargain, not a punishment**: a real upside
// bolted to a real cost, so taking it is a decision rather than damage. That is what
// makes a risky door worth walking through - the fight pays out something you might
// actually want, and you carry what it costs for the rest of the run.
//
// They are **passives**, and that is deliberate rather than incidental:
//
// - A cost you can decline is not a cost. The trinket slot replaces and the active rack
//   refuses when full - and a refusal raises the swap prompt, which the player can walk
//   away from with ESC. The uncapped passive list refuses nothing and asks nothing, so
//   the bargain lands whole the instant it is touched, both halves of it.
// - Two should be twice as much of both, and the passive tier is the only one that can
//   say so: computeStats sums and multiplies duplicates.
// - They already have a passive's shape - always on, no cooldown, no button.
//
// `source: 'debuff'` keeps them out of every other roll: the shop and the safe room-clear
// payout both filter on it, so clearing a risky room is the only way to be handed one.
export const DEBUFF_ITEMS = [
  {
    id: 'rusty_grip',
    name: 'Rusty Grip',
    slot: 'passive',
    source: 'debuff',
    icon: { shape: 'square', color: 0xef4444 },
    effect: '+1 bullet damage, -15% fire rate',
    bonusWeight: 0.3,
    damageBonus: 1,
    fireRateMultiplier: 0.85
  },
  {
    id: 'sluggish',
    name: 'Sluggish',
    slot: 'passive',
    source: 'debuff',
    icon: { shape: 'square', color: 0x8b5cf6 },
    effect: '+1 max HP (half-heart), -15% move speed',
    bonusWeight: 0.2,
    maxHpBonus: 1,
    moveSpeedMultiplier: 0.85
  },
  {
    id: 'thin_skin',
    name: 'Thin Skin',
    slot: 'passive',
    source: 'debuff',
    icon: { shape: 'square', color: 0xfde047 },
    effect: '+15% move speed, -1 max HP (half-heart)',
    bonusWeight: 0.25,
    moveSpeedMultiplier: 1.15,
    maxHpBonus: -1
  },
  {
    // The only one whose cost is not a stat: the scene reads how many copies are held and
    // spawns that many slugs on entering a room. See SLUG_SPEED_SHARE in PlayScene.
    id: 'slug_step',
    name: 'Slug Step',
    slot: 'passive',
    source: 'debuff',
    icon: { shape: 'square', color: 0x84cc16 },
    effect: '+1 EXP per kill, but every room spawns a slug that chases you',
    bonusWeight: 0.15,
    expPerKillBonus: 1,
    spawnsSlug: true
  }
]

export const ITEMS = [...TRINKET_ITEMS, ...PASSIVE_ITEMS, ...ACTIVE_ITEMS, ...DEBUFF_ITEMS]

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
