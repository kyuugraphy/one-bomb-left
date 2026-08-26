import { swapActive, swapPassive } from './inventory.js'

// A full rack is the only outcome that needs a choice from the player: a successful add
// already found its slot, an item the player owns has nothing to place, and a reward that
// carried no item at all has nothing to say.
export function needsSwapPrompt(grantResult) {
  return Boolean(grantResult) && grantResult.success === false && grantResult.reason === 'full'
}

// Which rack an incoming item would go into, and the slots the player picks from. The
// live rack is handed back rather than a copy, so the UI renders what is really equipped.
export function swapOptions(inventory, item) {
  const rack = item.slot === 'active' ? 'actives' : 'passives'

  return { rack, slots: inventory[rack] }
}

// Routes to the right rack by the item's own `slot` and returns whatever was displaced,
// which the scene drops back on the floor as a pickup. No bounds check on slotIndex, the
// same as inventory.js: the caller picks from rendered slots.
export function applySwap(gameState, item, slotIndex) {
  const swap = item.slot === 'active' ? swapActive : swapPassive

  return swap(gameState.inventory, slotIndex, item)
}
