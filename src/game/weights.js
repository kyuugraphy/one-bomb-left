import { countOwned } from './inventory.js'

// Spawn weighting for the uncapped passive tier. Passives stack, so nothing stops the
// same item coming up over and over; halving its weight per copy held means a duplicate
// is always possible but never the likely draw, and the odds shift on their own as the
// run goes on rather than through a hard "already owned" filter.
export function weightFor(ownedCount) {
  return 0.5 ** ownedCount
}

// The catalogue, unfiltered, each item paired with what it is now worth to the roll. It
// keeps every item in the pool - ownership moves the odds rather than closing the door -
// and matches the { item, weight } shape rollShopStock and pickWeighted draw from.
export function weightedPassivePool(inventory, passiveCatalogue) {
  return passiveCatalogue.map((item) => ({
    item,
    weight: weightFor(countOwned(inventory, item.id))
  }))
}

// One weighted draw. Same contract as the rest of the roll helpers: the RNG is passed in
// so a test can choose the roll. Returns null on an empty pool, the way the shop's own
// draw simply stops when it runs out.
export function pickWeighted(entries, randomFn) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)

  if (total <= 0) {
    return null
  }

  let roll = randomFn() * total

  for (const entry of entries) {
    roll -= entry.weight
    if (roll < 0) {
      return entry.item
    }
  }

  return entries[entries.length - 1].item
}
