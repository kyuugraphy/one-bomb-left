import { countOwned } from './inventory.js'
import { pickWeighted } from './weights.js'

// Flat price per category rather than per item: a shop is meant to be read at a glance,
// and one number per category means a new item needs no price of its own.
//
// The trinket is the dearest: one slot, permanent, and taking a second one throws the
// first away. Passives are next, permanent and unconditional but uncapped, so a second
// copy always has somewhere to go. Actives cost less again: they are strong, but gated
// behind a cooldown and a button press. The two refills
// are consumables and sit below both - the bomb cheapest of all, being a single use
// against an HP refill worth up to three hearts.
export const SHOP_PRICES = {
  trinket: 14,
  passive: 10,
  active: 7,
  hp_refill: 5,
  bomb_refill: 3
}

export const HP_REFILL = { kind: 'hp_refill', name: 'HP Refill', effect: 'restore all HP' }
export const BOMB_REFILL = { kind: 'bomb_refill', name: 'Bomb Refill', effect: '+1 bomb' }

// Exactly three things for sale, every visit. It used to roll 3-4 catalogue items on top
// of both refills, so a shelf was 5 or 6 wide and reading it was a chore rather than a
// choice. Three is a shelf you take in at a glance - and since a visit buys exactly one
// thing, a wider shelf was only ever more options to discard.
//
// All three slots are rolled. Both refills used to be stocked unconditionally, which left
// exactly one slot doing any varying - two thirds of every shelf was the same two boxes in
// the same two places, and the only decision was whether to take the item. Now the refills
// are two entries in the same draw as everything else, so a shop can be three items, or
// two and a refill, or a refill and two items.
export const SHELF_SIZE = 3

// What a refill is worth against a catalogue item in that draw. One is the neutral choice:
// an item the player has never held also draws at 1, and an item they have stacked draws
// lower. Raise it if healing turns out to be too scarce - see the note in zz_status.md.
export const REFILL_WEIGHT = 1

// What a shop is allowed to sell. Debuffs are excluded outright: they are what a risky
// room pays you for surviving it, not merchandise, and a shop that sold you Thin Skin
// would be a joke played on the player rather than a choice offered to them. The unique
// tiers drop out once owned, because a shop cannot sell a second trinket or a duplicate
// active and would only have to refuse at the till. Passives stay in at any count - they
// stack, so a second copy always has somewhere to go.
export function sellableItems(items, inventory) {
  return items.filter(
    (item) =>
      item.source !== 'debuff' &&
      (item.slot === 'passive' || countOwned(inventory, item.id) === 0)
  )
}

// What a shelf says about a piece of stock *before* it is bought. The price stays
// visible - a cost is something the player is entitled to know before committing - but a
// catalogue item's name does not, because the name is the thing being bought. It shows
// its tier instead, which the price already implies anyway and which answers the one
// question worth asking before you buy: have I got room for one of those.
//
// The refills keep their names. They are not items and there is nothing to find out about
// them: an HP Refill is what it says on the tin, and hiding it would make a puzzle out of
// something that is meant to be the obvious purchase.
const SLOT_LABEL = { trinket: 'TRINKET', passive: 'PASSIVE', active: 'ACTIVE' }

export function shelfLabelFor(entry) {
  return entry.kind === 'item' ? `${SLOT_LABEL[entry.item.slot]}  ?` : entry.name
}

export function priceOf(entry) {
  return entry.kind === 'item' ? SHOP_PRICES[entry.item.slot] : SHOP_PRICES[entry.kind]
}

export function canAfford(gameState, price) {
  return gameState.exp >= price
}

// A fixed-size shelf, every slot drawn without replacement from one pool: the catalogue on
// whatever weighting the caller handed over - entries are { item, weight }, so a passive
// the player already stacks turns up less often - plus the two refills at REFILL_WEIGHT.
// A short pool simply yields a smaller shop.
//
// There is no size roll - the shelf is always SHELF_SIZE wide - so this spends only the
// rolls the draws themselves need.
export function rollShopStock(entries, randomFn) {
  // pickWeighted works on { item, weight } and hands back the `item`, so the stock entry
  // itself rides in that field: a catalogue item wrapped as { kind: 'item', item }, or a
  // refill, which is already a stock entry.
  const pool = [
    ...entries.map(({ item, weight }) => ({ item: { kind: 'item', item }, weight })),
    ...[HP_REFILL, BOMB_REFILL].map((refill) => ({ item: refill, weight: REFILL_WEIGHT }))
  ]
  const stock = []

  while (stock.length < SHELF_SIZE && pool.length > 0) {
    const drawn = pickWeighted(pool, randomFn)

    pool.splice(
      pool.findIndex((slot) => slot.item === drawn),
      1
    )
    stock.push(drawn)
  }

  return stock
}
