// Three tiers, three rules. The trinket is one unique slot, passives are an uncapped list
// that stacks duplicates, and actives are three unique slots.
export function createInventory() {
  return {
    trinket: null,
    passives: [],
    actives: [null, null, null]
  }
}

// One slot, so a second trinket is a replacement rather than a refusal. The displaced one
// is handed back for the scene to drop on the floor, the same as a swapped-out active.
export function setTrinket(inventory, item) {
  const removed = inventory.trinket
  inventory.trinket = item
  return removed
}

// Uncapped and deliberately not unique: duplicate passives stack in computeStats, which
// is the whole point of the tier. It still reports { success: true } so callers can treat
// every add the same way, whether or not the tier it landed in can refuse.
export function addPassive(inventory, item) {
  inventory.passives.push(item)
  return { success: true }
}

// Three unique slots. The first empty one wins, so a gap left by a swap gets reused, and
// a full rack refuses without mutating - that refusal is what raises the swap prompt.
export function addActive(inventory, item) {
  const slot = inventory.actives.indexOf(null)

  if (slot === -1) {
    return { success: false, reason: 'full' }
  }

  inventory.actives[slot] = item

  return { success: true, slot }
}

// No bounds check on slotIndex: the caller picks from rendered slots. Returns the item
// that was there, or null, so the scene knows whether to say "you dropped X".
export function swapActive(inventory, slotIndex, newItem) {
  const removed = inventory.actives[slotIndex]
  inventory.actives[slotIndex] = newItem
  return removed
}

// How many copies of an id the player holds, across all three tiers. Passives stack, so
// this is a count rather than a yes/no - spawn weighting will want the number. For the
// unique tiers it is only ever 0 or 1, which is what the uniqueness checks read.
export function countOwned(inventory, itemId) {
  const held = [inventory.trinket, ...inventory.passives, ...inventory.actives]

  return held.filter((item) => item !== null && item.id === itemId).length
}

// The set moved tiers with the restructure: it is now two equipped actives, so this reads
// the active rack only. An id sitting in the passive list or the trinket slot is not it.
export function hasSetBonus(inventory, itemIdA, itemIdB) {
  const ids = inventory.actives.filter(Boolean).map((item) => item.id)

  return ids.includes(itemIdA) && ids.includes(itemIdB)
}

// The passive tier folded into one row per distinct item, in the order the player first
// picked each one up. countOwned answers "how many of this id" and counts every tier;
// this answers "what is in the passive list, and how many of each", which is what a list
// of held passives has to render.
export function passiveCounts(inventory) {
  const rows = []

  inventory.passives.forEach((item) => {
    const row = rows.find((seen) => seen.item.id === item.id)

    if (row) {
      row.count += 1
      return
    }

    rows.push({ item, count: 1 })
  })

  return rows
}
