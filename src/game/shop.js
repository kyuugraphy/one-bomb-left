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

const STOCK_MIN = 3
const STOCK_MAX = 4

export function priceOf(entry) {
  return entry.kind === 'item' ? SHOP_PRICES[entry.item.slot] : SHOP_PRICES[entry.kind]
}

export function canAfford(gameState, price) {
  return gameState.exp >= price
}

// 3-4 items drawn without replacement, plus both refills - so a shop is never only ever
// passive/active items. The caller decides what is in the pool and what each entry is
// worth: entries are { item, weight }, so a passive the player already stacks turns up on
// the shelf less often. A short pool simply yields a smaller shop.
export function rollShopStock(entries, randomFn) {
  const wanted = STOCK_MIN + Math.floor(randomFn() * (STOCK_MAX - STOCK_MIN + 1))
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
