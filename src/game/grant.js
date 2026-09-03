import { addActive, addPassive, countOwned, setTrinket } from './inventory.js'

// Routes an item to its tier by the `slot` field, and returns the tier's own result
// untouched - so a { success: false, reason: 'full' } active still reaches the caller and
// can raise the swap prompt rather than being swallowed here.
//
// Uniqueness is per tier, not global. The trinket and the actives are unique: a duplicate
// active would be dead weight, because cooldowns are keyed by item id, so both copies
// would share one timer. Passives are deliberately not unique - duplicates stack in
// computeStats, which is the point of an uncapped tier.
//
// 'owned' is checked before the rack is: there is no new item to place, so this must not
// raise the swap prompt that a genuinely full rack does.
export function grantItem(gameState, item) {
  const inventory = gameState.inventory

  if (item.slot === 'passive') {
    return addPassive(inventory, item)
  }

  if (countOwned(inventory, item.id) > 0) {
    return { success: false, reason: 'owned' }
  }

  // One slot, so a trinket is never refused - it replaces, and hands back what it
  // displaced for the scene to drop on the floor.
  if (item.slot === 'trinket') {
    return { success: true, displaced: setTrinket(inventory, item) }
  }

  return addActive(inventory, item)
}
