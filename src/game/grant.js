import { addActive, addPassive, hasItem } from './inventory.js'

// Routes an item to the right rack by its `slot` field. Returns the add result untouched,
// so a { success: false, reason: 'full' } still reaches the caller and can raise the
// swap prompt rather than being swallowed here.
//
// Items are unique. A duplicate passive would stack numerically (two Iron Platings read
// as +2 max HP), and a duplicate active would be dead weight, because cooldowns are keyed
// by item id - both copies would share one timer. So one rule covers both racks.
//
// 'owned' is checked before the rack is: there is no new item to place, so this must not
// raise the swap prompt that a genuinely full rack does.
export function grantItem(gameState, item) {
  if (hasItem(gameState.inventory, item.id)) {
    return { success: false, reason: 'owned' }
  }

  const add = item.slot === 'active' ? addActive : addPassive

  return add(gameState.inventory, item)
}
