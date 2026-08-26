# one-bomb-left — Status

_Last updated: 2026-08-26_

**Try it:** `npm run dev` → http://localhost:5173 · WASD to move, arrow keys to aim/fire.

## What it is
Top-down twin-stick prototype. Phaser 4 + Vite, plain JS, ES modules. Vitest for pure logic, Playwright installed but unused. Not a git repo yet.

## Done

### Game loop (`src/game/PlayScene.js`, 181 lines)
- Player: green rect, WASD movement (normalized, 320 px/s), collides with world bounds.
- Shooting: arrow keys aim + auto-fire, 180 ms cooldown, yellow bullets at 700 px/s, 1200 ms lifetime.
- Room size: **1344x840** (1.4x the original 960x600). Player/enemy/bullet sizes unchanged.
- Room walls: 5 static rectangles (**56 px = one full grid cell**, slate `0x4b5563`) framing the room — top, left, right, and two bottom stubs flanking a 140 px doorway gap at bottom-center. Built with `physics.add.staticGroup()`. `WALL_THICKNESS = CELL` is deliberate, not a magic number: the wall bodies fill exactly the border ring the grid marks blocked, so physics and pathing agree on which cells are solid (see the wall-pocket fix below).
- Obstacles are generated on a **56 px grid** (24x15 cells), filling **1/4 of the interior** every load:
  | | shape | size roll | color | on foot | bullets |
  |---|---|---|---|---|---|
  | **Rocks** | seed cell that accretes neighbours into a clump | 1-8 cells | `0x6b7280` | blocked | **popped** |
  | **Pits** | run-and-turn walk -> I, L, U, S, G noodles | 3-12 cells | `0x05060a` | blocked | **fly over** |
  Rocks take ~60% of the filled area, pits ~40%. Size is rolled with weight `1/size`, so small shapes are common and big ones rare. **2/3 of shapes seed in the 3-cell band along the wall**, 1/3 further in. Shapes are placed one at a time and a candidate is discarded unless a flood fill from the doorway still reaches every open cell, so the room is never sealed off. The doorway column and walk-in stretch are reserved.
- Colliders: player and enemies vs walls/rocks/pits; player bullets vs walls and rocks; enemy shots vs walls and rocks. Enemy spawns are drawn from the free grid cells at least 260 px from the player.
- Enemy pathing: line-of-sight test against the actual tiles. Clear -> walk straight at the player. Blocked -> **breadth-first search over the free grid cells**, then steer at the furthest waypoint (up to 6 ahead) still in plain sight, which keeps movement off the grid lines. The enemy **always closes the gap**: either end of the route is snapped to the nearest open cell (the grid marks the whole 56 px border ring blocked to keep obstacles off the wall band, but the 24 px walls let both the player and the enemy stand in that ring), and an unreachable player means walking to the reachable cell closest to them rather than giving up.
- Enemy combat: **10 HP** (10 player bullets to kill). Fires a projectile every 1.4 s at **208 px/s = 0.65x the player's 320 px/s move speed**, but only when no rock breaks the line - it will shoot across a pit. Shots pop on walls and rocks.
- Player health: **6 HP = 3 hearts** (1 heart = 2 HP). HUD is a bordered health bar of 6 segments, paired with a wider gap between hearts so it reads as 3 hearts, plus an `n/6 HP` label. Enemy touch *or* shot costs **1 HP**, both sharing one 600 ms i-frame window plus knockback.
- **Game over at 0 HP**: `GAME OVER` / `press R to try again` overlay, player and enemies frozen, live projectiles cleared, all input except R ignored. R runs `scene.restart()` for a fresh room and a full bar.
- Room entry: player starts in the doorway (bottom-center) behind a `Move up to enter the room` prompt. Crossing the entry line (140 px from the bottom) clears the prompt and spawns the enemy — that's the starting moment.
- Enemies: red rects, spawn at a random point at least 260 px from the player, home in at 120 px/s.
- Combat: bullet→enemy overlap deals 1 dmg, flash tween on hit, destroy at 0 HP. Enemy HP = 3 + `enemyStrength`.
- Player damage: enemy touch → knockback (420 px/s, 180 ms) + 600 ms i-frames, `Hits taken` counter on screen.

### Pure logic modules (tested, 66/66 passing)
| Module | Exports | State touched |
|---|---|---|
| `bombs.js` | `useBomb`, `refillBomb` (30% chance, injected RNG) | `bombCount` |
| `curses.js` | `applyCurse('risk' \| 'enemy')` | `riskLevel`, `enemyStrength` |
| `rewards.js` | `takeReward`, `skipReward` | `rewardsCollected`, + curse on 50/50 roll |
| `inventory.js` | `createInventory`, `addPassive`, `addActive`, `swapPassive`, `swapActive`, `hasSetBonus` | its own `{ passives[4], actives[3] }` object |
| `items.js` | `PASSIVE_ITEMS`, `ACTIVE_ITEMS`, `ITEMS`, `SET_BONUS`, `getItem`, `itemsFrom` | none - pure data |
| `effects.js` | `computeStats(base, inventory)` | none - returns a fresh stats object |
| `actives.js` | `triggerActive`, `cooldownRemaining` | `cooldowns` map |
| `grant.js` | `grantItem` | `inventory` |

`inventory.js` is built TDD, one red-green cycle per function:
- **4 passive slots, 3 active slots**, empty is `null`.
- `addPassive`/`addActive` fill the **first** empty slot (so a gap left by a swap gets reused) and return `{ success: true, slot }`. When every slot is full they return `{ success: false, reason: 'full' }` and **mutate nothing** — that's the signal for the UI to raise the swap prompt.
- `swapPassive`/`swapActive` overwrite one slot by index and **return the item that was there**, or `null` if it was empty (skip the "you dropped X" line on `null`). No bounds-checking on `slotIndex`; the caller picks from rendered slots.
- `hasSetBonus(inv, idA, idB)` is **passives-only** by design — an id sitting in an active slot does not count. Items need a stable `id` field.

### Items (`items.js`) — wired into the scene
Each item carries the display strings **and** the numbers `computeStats` reads, so a new item is a data edit, not an `effects.js` edit. `slot` (`'passive' | 'active'`) is what `grantItem` routes on.

| id | name | slot | source | effect | field |
|---|---|---|---|---|---|
| `iron_plating` | Iron Plating | passive | reward | +1 max HP | `maxHpBonus: 1` |
| `twitchy_trigger` | Twitchy Trigger | passive | reward | -20 ms fire cooldown | `fireCooldownBonus: -20` |
| `steady_boots` | Steady Boots | passive | **treasure** | +15% move speed | `moveSpeedMultiplier: 1.15` |
| `panic_button` | Panic Button | active | reward | damage + shove enemies in radius | `cooldown: 12000` |
| `second_wind` | Second Wind | active | reward | heal 1 HP | `cooldown: 30000` |

**Set bonus:** `iron_plating` + `steady_boots` → **+5% damage**. `computeStats(BASE_STATS, inventory)` recomputes every stat from scratch on each inventory change, so breaking the set drops the bonus with no unwind code. Verified live: swapping `steady_boots` out took damage 1.05 → 1 and move speed 368 → 320 in the same frame.

**Actives** cool down in a `{ itemId: readyAtMs }` map on `gameState`, never on the item objects (those are shared module constants). Each item runs its own clock — measured 12.0 s and 30.0 s ticking side by side.

### Pickups + scene wiring (`PlayScene.js`)
- **Treasure pickup** (gold) spawns on room entry at a free cell ≥ 260 px from the player. Always `steady_boots`, always curse-free, granted with `grantItem` — it does **not** count toward `rewardsCollected`.
- **Reward pickup** drops where an enemy dies, rolled from the four reward-sourced items, **50% cursed**. Cursed ones render purple, clean ones cyan. Goes through `takeReward`, so `rewardsCollected` and the existing curse roll still apply — and `enemyStrength` from the 'enemy' curse now actually reaches `enemyHpFor`.
- Touching a pickup takes it. With no take/skip UI yet, **the only way to skip a cursed reward is to walk around it** — that is what the purple tint is for.
- **Full rack does not auto-add.** `addPassive`'s `{ success: false, reason: 'full' }` reaches `onPickup`, which `console.log`s it and shows a `(swap prompt TODO)` toast. Verified: the item was not added and no stat moved.
- **Keys `1` / `2` / `3` fire active slots 1-3.** WASD moves and the arrows aim, so the number row is what scales to three slots — and it leaves `SPACE` free for the bomb button.
- Panic button: 240 px radius, 3 damage, 560 px/s shove held for 260 ms via `enemy.pushedUntil` (which `updateEnemies` honours, or the chase steer would cancel the shove on the next frame), and it clears enemy shots in the air.
- The health bar is **rebuilt**, not resized, when Iron Plating changes `maxHp` — 6 segments → 7, and the extra max HP is handed over as real HP.
- A monospace readout top-right lists passives, actives with live cooldowns, and the set-bonus line. **This is a debug readout, not the real slot UI.**

### Tooling
- `npm run dev` / `build` / `preview` / `test` wired up.
- `npx vitest run` → 8 files, 66 tests, green.

## Not done / known gaps
- **No real `gameState`.** Bombs, curses, and rewards are unit-tested in isolation and never called from `PlayScene`. `this.enemyStrength = 0` is a hardcoded stand-in.
- **No bombs in-game** — despite the project name. No bomb input, no AoE, no bomb HUD. `bombs.js` is still unwired; `1`/`2`/`3` are actives and `SPACE` is deliberately left free for it.
- **No take/skip choice UI** — touching a reward pickup takes it. Cursed rewards are only avoidable by not walking into them.
- **No swap prompt** — a full rack logs to the console and drops the item on the floor conceptually (the pickup is consumed and the item is lost). That is the next thing to build.
- **The +5% set bonus is currently invisible in play**: bullets do 1 damage into 10 enemy HP, and `ceil(10 / 1.05)` is still 10 bullets. It is applied and testable, but it will not change a fight until damage or enemy HP scales.
- Only one enemy ever spawns; no waves, no respawn, no difficulty ramp. Room is cleared for good once it dies.
- Pathing is BFS on a coarse 56 px grid, so routes are cell-accurate rather than pixel-optimal.
- Coverage is a target, not a guarantee: the generator stops early if 600 placement attempts run out, though in sampling it always landed within a point of the target.
- Pits are solid underfoot — nothing falls in, they just block movement while bullets pass over.
- No sound, no art (everything is a colored rectangle), no menu.
- Playwright is a dependency with zero tests.

## Wall-pocket invincibility spot — FIXED
Symptom: standing against a wall with a rock in the next cell in, the enemy could neither reach the player nor, about half the time, shoot it.

Cause: the grid's border ring is one 56 px cell wide but the wall bodies were only 24 px thick, leaving a **32 px corridor around the whole room that the grid calls blocked and the 32 px player fits into exactly**. The enemy body (36 px) physically fits there too, but pathing only ever routes to open-cell centres, so it would not follow - a rock in the adjacent cell left it pressing 90-146 px away.

Fix: `WALL_THICKNESS = CELL`, so the wall bodies fill the whole blocked border ring and the corridor stops existing. Expressed as `= CELL` rather than `56` to keep the invariant visible; the constant had to move below `CELL` to avoid a TDZ error. Cost is a band of playable area on each side - interior is now 1232x728 - and the HUD insets (`WALL_THICKNESS + 12`) moved in with it.

Verified in Chrome on the dev server (a temporary `window.__game = ...` in `src/main.js` for the scripted runs, removed again afterwards):
- **The structural invariant now holds**: sampling the whole room on a 4 px lattice across 10 fresh layouts, **every position the 32 px player can legally stand maps to an open grid cell** - zero exceptions outside the doorway. Before the fix that band was the exploit.
- **16/16 wall-hug chases reach contact** (player pressed to each of the four walls at the closest legal offset, enemy spawned at the furthest free cell, up to 16.3 s). The same test was 9/12 before.
- Flood fill still holds: 213-215 open cells per layout, **0 unreachable** from the doorway cell and **0 too tight for a 36 px enemy**, across 10 layouts. The grid itself did not change - the ring was already marked blocked - so generation and coverage are untouched.
- Doorway unaffected: spawn point standable and the straight walk-up to past the entry line clear in all 10 layouts.
- `npx vitest run` 66/66, `npm run build` clean.

_Measurement note:_ the first metric tried - "any spot where the 32 px body fits but the 36 px body does not" - was the wrong layer and reported **zero for the old geometry too**. The old pocket was pathing-unreachable, not body-unreachable: with a 24 px wall the enemy body fits from x=42, it just refuses to path into a blocked cell. Restricting the enemy's reachable set to open-cell centres is what makes the metric see the bug.

_Still true, by design:_ the 140 px doorway channel sits in a blocked grid row, so it is another spot the player can stand where pathing will not go. It is **not** a safe spot - of four positions tested, three are reached on foot and the fourth (deep in the left shoulder, 56 px out) has a clear shot line on **299/299** frames, so the enemy just shoots it. The walk-in stretch above it is reserved from obstacles, so nothing can seal it either.

## Enemy-stalling bug — FIXED
Symptom: with the player across a rock or pit, the enemy would stop and wait instead of routing around.

Cause: `findPath` returned `null` whenever **either** end sat in a `blocked` cell, and `chaseTargetFor` then fell back to walking straight at the player - which just grinds into the obstacle. The grid marks the entire 56 px border ring blocked (so obstacle generation keeps off the wall band), but the walls are only 24 px thick, so a player hugging any wall has its centre at x=40 -> cell col 0 -> blocked. **Any time the player or the enemy touched a wall, pathing switched off completely.** Enemies pushed into the wall band by the panic-button shove hit the same path.

Fix: `nearestOpenCell` snaps either end onto the closest open cell instead of bailing, and an unreachable goal now routes to the reachable cell closest to the player (the BFS has already drained the component, so its queue *is* the reachable set). `chaseTargetFor` also treats a length-1 path as "nothing better than where I stand" and presses on at the player directly.

Verified in Chrome on the dev server, driving `game.loop.step` with the player pinned so knockback could not skew the metric (enemy shots were shoving the player mid-measurement on the first pass - a confounded run, not a pathing failure):
- The reported case: player at the left wall, cell `[7,0]`, `blocked` -> the old code returned `null`; the new code snaps to `[7,1]` and returns a 34-cell route.
- **12/12 fresh layouts**, player on a random free cell, enemy spawned at the furthest free cell (730-1328 px away): contact every time, 7.2-13.8 s.
- **9/12 fresh layouts** with the player pressed against a wall. All 3 misses were the 32 px wall pocket a 36 px enemy cannot enter (see Not done) - in those the enemy still walked to the nearest reachable cell and pressed.
- `npx vitest run` 66/66, `npm run build` clean.

## Black-screen bug — FIXED
Cause: `this.enemies.children.each(...)` in `updateEnemies()`. In **Phaser 4 `Group.children` is a native `Set`**, which has no `.each` (that was Phaser 3's `Structs.Set`). It threw on the first `update()` tick and killed the render loop. Now uses `getChildren().forEach(...)`.

Verified in Chrome on the dev server: scene creates, entry trigger fires, enemy spawns clear of walls, chases, takes 10 bullets and dies. Player stops exactly at every wall, rock and pit face; enemies shoved inside one get ejected; bullets pop at wall/rock faces with no tunnelling (~11.6 px/frame vs 24 px min thickness) and fly clean over pits. Generator sampled over 10 fresh layouts: coverage 25-26% every time, flood fill connected every time, ~71% of shapes touching the wall band, size histogram falling off steeply from 1-cell upward. Pathing measured over 10 chases from random free cells (300-1064 px apart): **10/10 reached the player**, the full-room diagonal taking 10.6 s - the greedy corner-hugging it replaced managed 2/7 at this density. Enemy shot speed measured at 209 px/s against a 208 target. Health verified hit by hit: 6/6 down to 0/6, one HP per hit, bar segments and label tracking each step, game over firing exactly at zero - and once over, holding move and fire keys for 2 s moved player and enemy 0 px and spawned no projectiles. R restarts to a full 6/6. `npm run build` is clean; 31/31 tests pass.

_Note for future browser testing:_ an unfocused/background tab gets no `requestAnimationFrame`, so the game looks frozen there - bring the tab to the foreground to drive it. The diagnostics block that used to expose `window.__game` (and let a script step the loop with `game.loop.step(t)`) is gone; re-add a one-line `window.__game = game` in `src/main.js` if a scripted run is needed again.

## Cleanup — DONE
- Boot diagnostics gone: the overlay, `say`, `window.__diag`, `window.__game` and the error/rejection listeners are out of `src/main.js`, and the `step()` tracing + try/catch are out of `PlayScene.create()`. `src/main.js` was **rewritten rather than restored** - `src/main.js.bak` was stale at the old 960x600, and the room is 1344x840. The `.bak` is deleted.
- Vite starter leftovers deleted: `src/counter.js`, `src/style.css`, `src/assets/` (`javascript.svg`, `vite.svg`, `hero.png`) and `public/icons.svg`. Nothing in `src` or `index.html` referenced any of them; `public/favicon.svg` is the intended icon and stays.
- `git init` + first commit done. `.gitignore` shipped with the starter already covers `node_modules` and `dist`.

Verified after the cleanup: `npx vitest run` 66/66, `npm run build` clean, and a fresh load in Chrome renders the full 1344x840 room with the health bar now unobstructed in the top-left - console shows Phaser v4.2.1 booting with no errors and no leftover diag output.

## TODO — next features
- [x] ~~Introduce a single `gameState` object~~ — `freshGameState()` in `PlayScene` now holds `riskLevel`, `enemyStrength`, `rewardsCollected`, `inventory`, `cooldowns`. `bombs.js` is the last module still unwired.
- [ ] Implement the bomb: input binding, AoE clear, HUD count, refill-on-kill hook.
- [x] ~~feed `enemyStrength` back into `enemyHpFor`~~ — done, via cursed reward pickups.
- [ ] Reward pickups with take/skip choice (the pickup exists; the choice UI does not).
- [ ] Inventory UI: 4+3 slot HUD replacing the text readout, swap prompt on a `{ success: false, reason: 'full' }` add, "you dropped X" line from the item `swapPassive`/`swapActive` returns.
- [ ] More items — the catalogue is 5 deep and `treasure` has exactly one entry, so the chest is not a roll yet.
- [ ] Enemy waves and multiple rooms (death/restart is done).
