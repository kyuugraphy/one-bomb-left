// Three tiers, three rules. The trinket is one unique slot, passives are an uncapped list
// that stacks duplicates, and actives are three unique slots.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
export function createInventory() {
  return {
    trinket: null,
    passives: [],
    actives: [null, null, null]
  }
}

// One slot, so a second trinket is a replacement rather than a refusal. The displaced one
// is handed back for the scene to drop on the floor, the same as a swapped-out active.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
export function setTrinket(inventory, item) {
  const removed = inventory.trinket
  inventory.trinket = item
  return removed
}

// Uncapped and deliberately not unique: duplicate passives stack in computeStats, which
// is the whole point of the tier. It still reports { success: true } so callers can treat
// every add the same way, whether or not the tier it landed in can refuse.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
export function addPassive(inventory, item) {
  inventory.passives.push(item)
  return { success: true }
}

// Three unique slots. The first empty one wins, so a gap left by a swap gets reused, and
// a full rack refuses without mutating - that refusal is what raises the swap prompt.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
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
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
export function swapActive(inventory, slotIndex, newItem) {
  const removed = inventory.actives[slotIndex]
  inventory.actives[slotIndex] = newItem
  return removed
}

// How many copies of an id the player holds, across all three tiers. Passives stack, so
// this is a count rather than a yes/no - spawn weighting will want the number. For the
// unique tiers it is only ever 0 or 1, which is what the uniqueness checks read.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
export function countOwned(inventory, itemId) {
  const held = [inventory.trinket, ...inventory.passives, ...inventory.actives]

  return held.filter((item) => item !== null && item.id === itemId).length
}

// The set moved tiers with the restructure: it is now two equipped actives, so this reads
// the active rack only. An id sitting in the passive list or the trinket slot is not it.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
export function hasSetBonus(inventory, itemIdA, itemIdB) {
  const ids = inventory.actives.filter(Boolean).map((item) => item.id)

  return ids.includes(itemIdA) && ids.includes(itemIdB)
}

// The passive tier folded into one row per distinct item, in the order the player first
// picked each one up. countOwned answers "how many of this id" and counts every tier;
// this answers "what is in the passive list, and how many of each", which is what a list
// of held passives has to render.
// @deprecated - superseded by the 6-slot rack, remove once PlayScene migrates
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

// ---------------------------------------------------------------------------------------
// The 6-slot shared rack. Trinkets and the active share one pool of six slots, so wearing
// a third trinket is paid for out of the same budget that a rank 4 active wants all of.
// One active is held at a time; its `rank` (1-4, see items.js) is what it costs.
//
// This lives **alongside** createInventory rather than replacing it: nothing in the game
// reads a rack yet, and PlayScene still drives the three-tier shape above. When it
// migrates, the functions marked @deprecated go with it.
//
// A consumed slot holds the item reference itself, repeated across every slot it paid
// for. That is what makes "free the slots this active held" a filter by identity rather
// than bookkeeping kept somewhere else.

export function createRack() {
  return {
    slots: Array(6).fill(null),
    active: null
  }
}

export function freeSlotCount(rack) {
  return rack.slots.filter((slot) => slot === null).length
}

// Trinkets do not stack the way passives do: one copy of an id, costing exactly one slot.
// Both refusals leave the rack alone - a refusal is what will raise the swap prompt, the
// same as the old three-slot rack's did.
//
// Duplicate is checked first, on the addActiveToRack precedent: the more specific reason
// wins. A second Heavy Vest is refused for being a second Heavy Vest, and saying 'full'
// there would send the player off to make room for something that would be refused again.
// The scan covers every occupied slot, so the slots an active is paying for count too.
export function addTrinket(rack, item) {
  const held = rack.slots.some((slot) => slot !== null && slot.id === item.id)

  if (held) {
    return { success: false, reason: 'duplicate' }
  }

  const slot = rack.slots.indexOf(null)

  if (slot === -1) {
    return { success: false, reason: 'full' }
  }

  rack.slots[slot] = item

  return { success: true }
}

// One active at a time, costing `rank` slots. The two refusals are checked in that order
// on purpose: already holding an active is the more specific answer, and it is the one
// that means "offer a swap" rather than "make room".
export function addActiveToRack(rack, item) {
  if (rack.active !== null) {
    return { success: false, reason: 'active-held' }
  }

  if (freeSlotCount(rack) < item.rank) {
    return { success: false, reason: 'no-space' }
  }

  occupy(rack, item)

  return { success: true }
}

// The second-active pickup. The old one is released first - that is the whole point, its
// slots are what the new one is meant to be paid for with.
//
// It can still fail: freeing a rank 1 active does not pay for a rank 4 one if trinkets
// hold the rest of the rack. When it does, the old active is already gone and the new one
// never landed, so the player holds no active until they free trinket space. Not ideal,
// but `freedOldActive: true` says so out loud rather than leaving the caller to guess.
export function swapActiveInRack(rack, newItem) {
  if (rack.active === null) {
    return { success: false, reason: 'no-active' }
  }

  release(rack, rack.active)
  rack.active = null

  if (freeSlotCount(rack) < newItem.rank) {
    return { success: false, reason: 'no-space', freedOldActive: true }
  }

  occupy(rack, newItem)

  return { success: true }
}

// Both halves of the slot bookkeeping, kept together so they cannot drift apart. Slots
// need not be contiguous: the first `rank` free ones win, wherever they are.
function occupy(rack, item) {
  let paid = 0

  for (let i = 0; i < rack.slots.length && paid < item.rank; i++) {
    if (rack.slots[i] === null) {
      rack.slots[i] = item
      paid += 1
    }
  }

  rack.active = item
}

function release(rack, item) {
  rack.slots.forEach((slot, i) => {
    if (slot === item) {
      rack.slots[i] = null
    }
  })
}
