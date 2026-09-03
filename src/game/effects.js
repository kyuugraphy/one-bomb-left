import { hasSetBonus } from './inventory.js'
import { SET_BONUS } from './items.js'

// A run can lose max HP now that Thin Skin exists, and the passive tier is uncapped, so
// enough copies would take it to zero or below. That is not a harder run, it is a broken
// one: a health bar with no segments, and a player dead before the room finishes drawing.
// Half a heart is the floor.
export const MIN_MAX_HP = 1

// Recomputed from scratch on every inventory change, so a bonus that stops applying
// (the set broken up by a swap) simply stops being added - nothing to unwind.
export function computeStats(base, inventory) {
  // The trinket carries stat fields like any passive, so it is summed with them. Actives
  // do not - the only thing the rack contributes to stats is the set bonus below.
  const worn = [inventory.trinket, ...inventory.passives].filter(Boolean)

  const sum = (field) => worn.reduce((total, item) => total + (item[field] ?? 0), 0)
  const product = (field) => worn.reduce((total, item) => total * (item[field] ?? 1), 1)

  const [setA, setB] = SET_BONUS.ids

  return {
    maxHp: Math.max(MIN_MAX_HP, base.maxHp + sum('maxHpBonus')),
    // Flat millisecond bonuses first, then rate as a multiplier on what is left. A rate
    // multiplier divides rather than multiplies, because cooldown is the reciprocal of
    // rate: -15% fire rate is 0.85 shots for the same second, which is a cooldown 1/0.85
    // times as long. Multiplying by 0.85 would have been a 15% *faster* gun.
    fireCooldown: (base.fireCooldown + sum('fireCooldownBonus')) / product('fireRateMultiplier'),
    moveSpeed: base.moveSpeed * product('moveSpeedMultiplier'),
    damage:
      (base.damage + sum('damageBonus')) *
      (hasSetBonus(inventory, setA, setB) ? SET_BONUS.damageMultiplier : 1)
  }
}
