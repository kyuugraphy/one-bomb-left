import { hasSetBonus } from './inventory.js'
import { SET_BONUS } from './items.js'

// Recomputed from scratch on every inventory change, so a bonus that stops applying
// (the set broken up by a swap) simply stops being added - nothing to unwind.
export function computeStats(base, inventory) {
  const worn = inventory.passives.filter(Boolean)

  const sum = (field) => worn.reduce((total, item) => total + (item[field] ?? 0), 0)
  const product = (field) => worn.reduce((total, item) => total * (item[field] ?? 1), 1)

  const [setA, setB] = SET_BONUS.ids

  return {
    maxHp: base.maxHp + sum('maxHpBonus'),
    fireCooldown: base.fireCooldown + sum('fireCooldownBonus'),
    moveSpeed: base.moveSpeed * product('moveSpeedMultiplier'),
    damage: base.damage * (hasSetBonus(inventory, setA, setB) ? SET_BONUS.damageMultiplier : 1)
  }
}
