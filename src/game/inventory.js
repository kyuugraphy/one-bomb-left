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
