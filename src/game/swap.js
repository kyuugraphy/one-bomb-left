import { swapActive } from './inventory.js'

// A full rack is the only outcome that needs a choice from the player: a successful add
// already found its slot, an item the player owns has nothing to place, and a reward that
// carried no item at all has nothing to say.
export function needsSwapPrompt(grantResult) {
  return Boolean(grantResult) && grantResult.success === false && grantResult.reason === 'full'
}

// Only the active rack can ever be full now - passives are uncapped and the trinket slot
// replaces rather than refuses - so the prompt always offers the three active slots. The
// live rack is handed back rather than a copy, so the UI renders what is really equipped.
export function swapOptions(inventory) {
  return { rack: 'actives', slots: inventory.actives }
}

// Returns whatever was displaced, which the scene drops back on the floor as a pickup. No
// bounds check on slotIndex, the same as inventory.js: the caller picks from rendered slots.
export function applySwap(gameState, item, slotIndex) {
  return swapActive(gameState.inventory, slotIndex, item)
}
