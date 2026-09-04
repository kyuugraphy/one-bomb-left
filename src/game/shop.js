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

// Which refills a shelf may actually offer. **The Bomb Refill is held back**, because a
// bomb does nothing yet: bombs.js is imported by nothing outside its own test, useBomb has
// never been called, and bombCount only ever goes up and gets printed on the HUD.
//
// Found in play. A shop with 6 EXP in hand, a Bomb Refill at 3 and everything else out of
// reach held its doors shut - correctly, by the rule, because something on the shelf was
// both affordable and buyable. But the offer was "pay 3 EXP for a counter that does not do
// anything, or stand here", which is not a choice worth holding a door shut over.
//
// Fixed on the shelf rather than at the exit gate on purpose: a gate that ignored bombs
// would still leave the shop selling one. Selling a thing that does nothing is the defect;
// the stuck-feeling door was only how it got noticed.
//
// BOMB_REFILL stays exported and priced, so the day bombs are wired this is one line.
const STOCKED_REFILLS = [HP_REFILL]

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

// What a shelf writes *above* the price. A refill gets its name; a catalogue item gets
// nothing, because its icon is now on the shelf and says which item it is far better than
// a word would - shape for the tier, colour for the item, the same glyph it will have in
// the pause menu once bought.
//
// This used to read `PASSIVE  ?`, from a spell where the shop sold blind. Spending a real
// resource deserves to be an informed choice: the identity is on the shelf, and what stays
// back until the purchase lands is the exact effect, which is a surprise worth keeping
// rather than a thing being withheld.
//
// The refills keep their names either way. They are not items, there is nothing to find
// out about them, and an icon alone would make a puzzle of the obvious purchase.
export function shelfLabelFor(entry) {
  return entry.kind === 'item' ? '' : entry.name
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
    ...STOCKED_REFILLS.map((refill) => ({ item: refill, weight: REFILL_WEIGHT }))
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

// Why a purchase cannot land, or null if it can. **Asks without doing**: nothing here
// mutates, so the exit gate can ask it about every item on the shelf every frame.
//
// It exists because affordable and buyable are not the same thing, and a softlock found in
// play proved it. A shop holds its doors shut until the visit is over, and "over" was read
// as "nothing here is affordable" - so a player at full HP, holding exactly the price of an
// HP Refill and not a point more, could not buy the refill, could not afford anything else,
// and could not leave. The affordable item held the doors shut; the refusal held the
// purchase off; nothing in the room could break the tie.
//
// Both the refusal path and the exit gate read this, rather than each working it out, so
// the two cannot drift into disagreeing about what a finished visit is - which is exactly
// how the softlock got in.
export function purchaseBlockedReason(entry, { gameState, health, maxHp }) {
  if (entry.kind === 'hp_refill') {
    return health >= maxHp ? 'already at full HP' : null
  }

  // Bombs stack with no ceiling.
  if (entry.kind !== 'item') {
    return null
  }

  const { item } = entry

  // Passives are uncapped and stack in computeStats, so holding one is never a reason not
  // to buy another - which is the point of the tier.
  if (item.slot === 'passive') {
    return null
  }

  // Checked before the rack, the same order grantItem uses: a duplicate is not a placement
  // problem, so it must not report itself as one.
  if (countOwned(gameState.inventory, item.id) > 0) {
    return 'already owned'
  }

  // One slot, so a trinket replaces rather than refuses.
  if (item.slot === 'trinket') {
    return null
  }

  return gameState.inventory.actives.includes(null) ? null : 'no room - free a slot first'
}
