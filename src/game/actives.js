// Cooldowns live in a plain { itemId: readyAtMs } map on gameState rather than on the
// item objects, which are shared constants - two runs must not share a timer.
export function triggerActive(inventory, slotIndex, now, cooldowns) {
  const item = inventory.actives[slotIndex]

  if (!item) {
    return { fired: false, reason: 'empty' }
  }

  if (now < (cooldowns[item.id] ?? 0)) {
    return { fired: false, reason: 'cooling', item }
  }

  cooldowns[item.id] = now + item.cooldown

  return { fired: true, item }
}


export function cooldownRemaining(item, now, cooldowns) {
  return Math.max(0, (cooldowns[item.id] ?? 0) - now)
}
