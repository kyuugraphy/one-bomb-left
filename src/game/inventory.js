export function createInventory() {
  return {
    passives: [null, null, null, null],
    actives: [null, null, null],
  }
}

function addToSlots(slots, item) {
  const slot = slots.indexOf(null)
  if (slot === -1) {
    return { success: false, reason: 'full' }
  }
  slots[slot] = item
  return { success: true, slot }
}

export function addPassive(inventory, item) {
  return addToSlots(inventory.passives, item)
}

export function addActive(inventory, item) {
  return addToSlots(inventory.actives, item)
}

export function swapPassive(inventory, slotIndex, newItem) {
  const removed = inventory.passives[slotIndex]
  inventory.passives[slotIndex] = newItem
  return removed
}

export function swapActive(inventory, slotIndex, newItem) {
  const removed = inventory.actives[slotIndex]
  inventory.actives[slotIndex] = newItem
  return removed
}

export function hasSetBonus(inventory, itemIdA, itemIdB) {
  const ids = inventory.passives.filter(Boolean).map((item) => item.id)
  return ids.includes(itemIdA) && ids.includes(itemIdB)
}

// Both racks are searched: an id lives in one or the other, never both, and every item
// in the game is unique to the player who holds it.
export function hasItem(inventory, itemId) {
  return [...inventory.passives, ...inventory.actives].some(
    (item) => item !== null && item.id === itemId
  )
}
