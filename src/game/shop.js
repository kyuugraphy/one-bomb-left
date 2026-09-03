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
// Both refills are always among the three: they are the shop's staple, and the HP refill
// is the only full heal left now that a floor heal is half a heart. That leaves one rolled
// catalogue item per visit.
export const SHELF_SIZE = 3
const ALWAYS_STOCKED = 2

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

export function priceOf(entry) {
  return entry.kind === 'item' ? SHOP_PRICES[entry.item.slot] : SHOP_PRICES[entry.kind]
}

export function canAfford(gameState, price) {
  return gameState.exp >= price
}

// A fixed-size shelf: both refills, plus enough catalogue items drawn without replacement
// to fill it. The caller decides what is in the pool and what each entry is worth: entries
// are { item, weight }, so a passive the player already stacks turns up on the shelf less
// often. A short pool simply yields a smaller shop.
//
// There is no size roll any more - the shelf is always SHELF_SIZE wide - so this spends
// only the rolls the draws themselves need.
export function rollShopStock(entries, randomFn) {
  const wanted = Math.max(0, SHELF_SIZE - ALWAYS_STOCKED)
  const remaining = [...entries]
  const stock = []

  while (stock.length < wanted && remaining.length > 0) {
    const item = pickWeighted(remaining, randomFn)
    remaining.splice(
      remaining.findIndex((entry) => entry.item === item),
      1
    )
    stock.push({ kind: 'item', item })
  }

  return [...stock, HP_REFILL, BOMB_REFILL]
}
