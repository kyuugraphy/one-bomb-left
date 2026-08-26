import { addActive, addPassive } from './inventory.js'

// Routes an item to the right rack by its `slot` field. Returns the add result untouched,
// so a { success: false, reason: 'full' } still reaches the caller and can raise the
// swap prompt rather than being swallowed here.
export function grantItem(gameState, item) {
  const add = item.slot === 'active' ? addActive : addPassive

  return add(gameState.inventory, item)
}
