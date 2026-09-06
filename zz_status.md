# one-bomb-left — Status

_Last updated: 2026-09-06_

**Try it:** `npm run dev` → http://localhost:5173 · WASD to move, arrow keys to aim/fire, `1`/`2`/`3` for actives, **`ESC` to pause**.

**Companion file:** `zz_todo.md` holds deferred work — things wanted but not built. This file records what **is**; that one records what is **intended**, so neither has to hedge.

## Latest session (2026-09-06, third pass) — the player has a face
The green block is gone. The player is **`av_head.png`**, drawn at **128 px** — four times the 32 px block it replaces, and about twice the height of a 56 px wall tile. Big enough that the portrait reads as a portrait rather than a smudge, which was the whole point of trying it.

**The art ships without an alpha channel.** `av_head.png` is RGB: the head sits on an opaque black field, so drawing it straight gives a black square with a face in it. `keyOutBlack()` makes a keyed copy once at load — anything darker than a threshold of 40 becomes transparent — and hands back the new key. The threshold is a range rather than an exact match on `0x000000` because the art is anti-aliased against the black, and it is low enough that the near-black in the hair survives. Guarded on the texture key, because `create()` runs again on every room.

**The hitbox is untouched at 22 px.** Same divide-back-out-by-the-scale trick the bullet uses, so the drawn size is a tuning knob that cannot change what the player collides with. **This is now a visible mismatch, not a rounding error:** at 128 drawn against a 22 px body the drawing is nearly six times the thing it stands for, and the head visibly overlaps walls the player is not touching. Kept deliberately - the alternative reopens what the `PLAYER_HITBOX` comment warns about, losing half-hearts to shots that visibly missed.

**Wanted next, not built: scale the rest of the world to match.** Pits, rocks, enemies, items and the space to move in are all still sized against the old 32 px player. Two ways to do it and they are different decisions - zoom the camera, which keeps every tuned number and shows less of the room, or scale the world constants, which keeps the viewport and retunes everything. See `zz_todo.md`.

**The dev-server watcher fix from this morning was wrong, and quietly so.** It stopped the EBUSY crash by ignoring `public/sprites/**`, which also meant Vite never learned about sprites added *after* boot. Every PNG added later - the avatar, and the terrain art from the pass before - 404'd into the SPA fallback, and Phaser reported `Failed to process file` for art sitting right there on disk. Replaced with `awaitWriteFinish`, which waits for a file's size to settle before watching it: the targeted fix for a lock, with nothing hidden from the server. **A loud crash was the better failure of the two.**

## Previous session (2026-09-06, second pass) — a run has floors, and each one has a boss
The biggest structural change so far. A run was an unbroken chain of rooms with no shape and no end; it has a skeleton now.

**Floors.** Floor 1 is a fixed 7 rooms, floor 2 rolls 9-11, everything after 13-15. Floor 7 ends nothing — the rule carries on, so how deep a run gets is a fact about the player rather than a number written down.

**A boss at the end of each.** The last regular room's door choice is replaced outright: one red door, nothing beside it. The room behind it is an empty stub in the same register as the puzzle room, because today's job is proving the trigger and the transition rather than the fight. Beating it opens one plain pad that drops the player into room 1 of the next floor.

**Two guaranteed shop checkpoints per floor**, and **two pre-picked ambush traps** — one ordinary shop door, one puzzle door — that are guaranteed to exist and *not* guaranteed to fire.

**Two long-standing gaps closed as a side effect.** Corridors reach every floor instead of stopping after a run's tenth door, and big rooms reach every floor instead of only the first.

## Previous session (2026-09-06, first pass) — the projectile is art, and it flies slower
The player's shot stops being a drawn circle. It is **a sprite** now — `public/sprites/bullet.png`, the first loaded asset in the project, which is why `PlayScene` has a `preload()` at all. Everything else on screen is still shape primitives.

**Drawn at 75 px, hit at 10.** The sprite is far bigger than the shot it stands for, and the hitbox stays the 10 px box the circle had, so nothing about what a shot connects with changed. That separation takes one deliberate line: Arcade builds a body from the game object's display size, so `fire()` divides back out by the sprite's scale to get its 10 px back. **`BULLET_SPRITE_SIZE` is in pixels, not a multiplier** — it was a scale factor for three rounds of tuning and the arithmetic was done by hand every time.

**The art points right at rest**, so the travel angle is the rotation outright: `setRotation(Math.atan2(aim.y, aim.x))`. Firing up is aim `(0, -1)`, a quarter turn anticlockwise. Diagonals follow, not just the four axes. Alpha is 0.9.

**Speed is 392 px/s, down from 700 in two steps (0.7x then 0.8x), and the fire cooldown is 360 ms, up from 180.** Both are base numbers — `computeStats()` still layers items on the cooldown, so the shop's rolls scale from here. One consequence worth knowing: `fireCooldownBonus` is a flat -20/-35 ms, so against a 360 ms base those items are half the improvement they were against 180.

**Each speed cut costs the same five tests in `bullets.test.js`, which is the point of that module.** The range cap still binds — a shot still dies at 336 px and the 1200 ms timeout is still a backstop — but every margin narrowed at each step, and the assertions were moved to the true figures rather than loosened quietly.

| | 700 px/s | 490 | **392 (shipped)** |
|---|---|---|---|
| cap reached in | 480 ms | 686 ms | **857 ms** |
| timeout headroom | 2.5x | 1.75x | **1.4x** |
| range cleared within | half its lifetime | two thirds | **~71%** |
| dodge asymmetry vs enemy shot | 3x+ | 2.36x | **1.88x** |

**The floor is 280 px/s** — `slowestSpeedRangeStillBinds()` — and at 392 the gap to it is 1.4x. **There is no longer room for another cut of this size:** one more 0.8x lands at 314 and one more 0.7x at 274, which is under the floor and hands the room-ending decision back to the timeout. Slowing the shot further means raising `BULLET_LIFETIME` or shortening `BULLET_RANGE` in the same change. Worth watching too: the dodge asymmetry is the reason a duel feels survivable, and at 1.88x it is half what it was at 700 px/s.

**A colour-flicker effect was built and rejected.** A tween oscillated the projectile between pale blue-white and violet over its lifetime to read as pact instability; it did not survive first sight and is gone, along with its five constants. Worth recording so it is not proposed twice. Note for anything similar later: a `this.add.circle` is an Arc, not a Sprite, so `setTint()` does not exist on it — the fill is `setFillStyle()`. Now that the bullet is a real sprite, `setTint()` is available.

**A sparkle trail was built, seen and reverted the same day.** Small circles shed behind the projectile, fading over 1-3 s. It is wanted, but as part of a future **projectile upgrade** rather than as the base shot - the plain sprite is what an un-upgraded bullet should look like. The trial and its tuning are written up in `zz_todo.md`, including the one number the trial settled: **1.5 s, flat**, because 1-3 s outlived the ~860 ms bullet several times over and left the room glittering. None of it is in git history, so that entry is the only record.

**`vite.config.js` is new**, and exists for one reason: re-exporting the sprite while the dev server runs took the server down twice. Windows holds a lock on the file during the export, Vite's watcher throws `EBUSY`, and the process dies. The config ignores `public/sprites/**` — nothing there needs watching, since `public/` is served from disk and a refresh already picks up a new export.

**Still oversized on disk.** `bullet.png` is 1254x1254 for something drawn at 75 px. It works, but it is a ~17x downsample and about half a megabyte.

## Previous session (2026-09-04, fourth pass) — the ambush reads, and the shop stops selling nothing
Playtest feedback, three rounds of it.

**The ambush says one of 28 lines** instead of one fixed sentence, never the same one twice running. It sits on a dark panel now, because red text over red enemies is the same colour twice and an ambush puts nine of them in the room. And it holds for **3.5 seconds** rather than 0.5 — the original half-second was set when the message was one short string, and it survived the arrival of a 94-character pool without anybody re-checking it.

**Two shop bugs, one real and one worse.** A player was sealed in a shop, unable to buy or leave: the exit gate asked whether anything was *affordable* when the question is whether anything is *buyable*, and those differ. Then it happened again for a different reason — the only thing in reach was a Bomb Refill, and **bombs do nothing yet**, so the shop was holding its doors shut over a purchase that would have changed nothing.

## Previous session (2026-09-04, third pass) — room types merged, and the door stops lying
Two changes, committed separately.

**SAFE and RISKY are one `combat` type.** The split was meant to offer "a small fight for a clean item" against "a big fight for a bargain with a cost", and it never earned that: the clean item was strictly the safer buy, so the cyan door was correct every time and the violet one was what you picked when you were bored. One type, one enemy table, and **the payout rolled on the clear** — 60% a debuff-paired item, 40% a clean one — so the gamble is in what the room gives you rather than in which colour you walked through. Combat wears plain slate, because there is no reward kind left for a colour to name.

**The door lie is gone, replaced by the room twist.** A lie was the *sign* being wrong about a room that was always going to be what it was. A twist is the sign being right and the room changing its mind: a shop or a puzzle turns out to be a hard combat room, hidden completely, announced with **AMBUSH** and the project's first sound. Nothing the player read was false, so nothing they learned is worth unlearning.

## Previous session (2026-09-04, second pass) — corridors reach real runs
A corridor is no longer debug-only. **1-5 of them per floor, banded by how long the floor is**, pre-rolled at the start of the run and spliced in behind an ordinary door. The telegraph never mentions one: the door you took still names the room you are walking toward, and the corridor sits in front of it. It costs a door but not a room number, so a floor's room total is what it was.

Its exit is **a real pad that says nothing** — the same 48 px square as any other door, plain slate, no reward colour, no tier glow, no pulse, no label. It was an invisible trigger for one build, which is what the spec asked for and what it should not have asked for: an exit you cannot see is a wall you happen to pass through.

## Previous session (2026-09-04, first pass) — corridors, finished and walkable
Obstacles and doors both landed, and a corridor can be walked in the browser. The debug `L` key now cycles **L, Z, T, G, corridor**. Playtested: sidestepping obstacles in a 3-wide corridor reads as tension rather than friction. One rendering bug found and fixed with it — a room narrower than the viewport drew against the edge instead of centred.

## Previous session (2026-09-03, thirteenth pass) — corridor rooms, part one
`generateCorridorRoom(randomFn)` is in: a corridor's orientation and dimensions, test-first, pure. It hands back the same shape object the L/Z/T/G masks are, so everything in `shapeRoom.js` reads it unchanged — but it is **rolled rather than hand-authored**, because a corridor has no silhouette worth drawing and its mask would otherwise be sixty lines of hashes.

**Obstacles and doors are deliberately not done.** The shape carries no `entry` or `exits` yet, so it cannot be handed to the scene.

## Previous session (2026-09-03, twelfth pass) — the shop shows what it is selling
Shelf stock wears the item's own icon now, in place of the `PASSIVE  ?` labels. The price stays; the name and the exact effect still wait for the purchase to land. **This reverses the "shop sells blind" call from two passes ago**: spending a real resource deserves an informed choice, while the exact numbers are a surprise worth keeping.

## Previous session (2026-09-03, eleventh pass) — the shop rolls all three slots
A shelf used to be one rolled catalogue item and both refills, every single time — two of its three slots never varied. All three are drawn from one pool now, so a shop can be three items, or two and a refill, or a refill and two items. **The refills are entries in that draw, not fixtures.**

## Previous session (2026-09-03, tenth pass) — placeholder item icons
Every item now carries a placeholder icon: **shape is the tier, colour is the item**. The pause menu's list of passive names and effects is gone, replaced by the icons themselves with a small `xN` under any that stack; a drop on the floor wears the same icon, so what you picked up and what is in your list are visibly the same object.

## Previous session (2026-09-03, ninth pass) — the reveal beat
An item on the floor now shows its colour and nothing else. Touch it and there is a **400 ms beat** — the box swells and turns over inside an expanding ring — and only when it ends does the item land: the grant, the stat change and the name all arrive together, instead of the stats moving silently before you know why.

Shop stock works the same way. The price stays on the shelf, because a cost is something you are entitled to know before committing; the name does not, because the name is what you are buying. A catalogue item's shelf label reads `PASSIVE  ?` over its price. **The refills keep their names** — an HP Refill is what it says on the tin, and hiding it would make a puzzle of the obvious purchase. Heals, EXP and bombs are unchanged and instant.

## Previous session (2026-09-03, eighth pass) — the door lie budget
The telegraph no longer lies on a flat per-door coin flip. **Each run is dealt a lie budget of 0-4** when it starts; past it every door tells the truth, and **two lies can never land back to back**. When a door does mislead you, the room says so on entry by name.

Where the memory lives: **`gameState`**, because it is the only thing with exactly the right lifetime — carried through every door by reference, rebuilt by `freshGameState` on death or Exit. `lieCap`, `liesSoFar` and `lastDoorWasLie` sit beside `roomNumber`.

## Previous session (2026-09-03, seventh pass) — door-choice regression
**Reported:** clearing a room teleported straight to the next one instead of offering the 2-3 doors.

**Not the cause.** The door-wait path is byte-identical to the last good build: filtered to `checkRoomCleared`, `openDoors`, `takeDoor`, `buildDoor`, `pickDoorSpots`, `nearestFreePoint` and the `leaving` guard, the whole diff since `5fcd283` is one added line, `this.payOutRoom()`. The curse/reward deletion never touched any of it, and PUZZLE's behaviour did not leak — SAFE and RISKY still gate on `enemies.getChildren().length > 0`.

**The cause: doors were landing in the middle of the room.** `pickDoorSpots` aims at `DOOR_ROW_Y = 84`, then `nearestFreePoint` snapped each pad to the nearest cell with 3x3 clearance **with no limit on how far it could travel**. In a cluttered room the top band is full, so the snap walked pads deep into the play area. Measured over 156 pads from 60 real clears: **31 (20%) drifted below the wall row, 23 landed at y >= 252, the worst at y = 588** — two thirds of the way down an 840 px room. A pad standing in open floor is taken by anyone who walks over it, and a player who has just finished a fight is moving.

Fixed by capping the snap and by arming doors. Now: **153 of 153 pads land at y=84 or y=140**, hard against the top wall, none in the play area. See the section below.

**Honest caveat:** a *100%* immediate transition was never reproduced here. With the player parked at spawn, 45 of 45 clears waited correctly both before and after. The drift is real, measured and fixed, and the arming guard makes the reported symptom impossible whatever placed the pad — but if it still happens, it is something else and the next clue needed is whether it fires while standing still.

## Previous session (2026-09-03, sixth pass)
1. **The four debuffs are bargains, not punishments.** Each pairs a real bonus with a real cost: Rusty Grip +1 damage / -15% fire rate, Sluggish +1 max HP / -15% move speed, Thin Skin +15% move speed / -1 max HP, Slug Step +1 EXP per kill / a slug in every room. Still uncapped passives, for the reasons already recorded. `expPerKill` is a stat now.
2. **The curse system is deleted.** `rewards.js`, `curses.js` and both their tests are gone, along with `takeReward`, `collectReward`, `riskLevel`, `enemyStrength`, `rewardsCollected`, every `cursedChance` and the whole `isCursed` flag. It had no reachable caller once debuffs replaced it.
3. **`bonusWeight` (0-1) added to every item but one**, as inert data for the boss system to read later. Hair Trigger's is deliberately unassigned — it is `-35ms fire cooldown`, the stronger of the two cooldown passives.

## Previous session (2026-09-03, fifth pass)
Three connected changes plus a shop resize.

1. **A debuff-curse item pool** — Rusty Grip, Sluggish, Thin Skin, Slug Step — living in the **passive tier**, because a curse you can decline is not a curse. See the tier note below.
2. **Room-clear payouts.** Clearing a SAFE room hands over one curse-free item; clearing a RISKY one hands over one debuff. Shop and puzzle rooms pay nothing.
3. **Door types are SHOP, SAFE, RISKY and PUZZLE.** COMBAT is gone — safe and risky already covered "how big a fight is this" — and its enemy counts moved onto RISKY. PUZZLE is a stub: an empty room, pink door, telegraph lies about it like any other.

Also: **a shop shelf is exactly three things** (was five or six).

## Previous session (2026-09-03, fourth pass)
**A kill can no longer drop an item.** Every kill still pays 2 EXP, and one in ten additionally leaves **half a heart** on the floor — that is the whole of the enemy drop table now. The treasure and reward kinds are gone from the roll; items are to come from clearing a room, which is the next thing to build, and from the shop. **The heal is now half a heart rather than a full refill**, which is a real nerf to what was there: one lucky drop used to undo a whole room.

## Previous session (2026-09-03, third pass)
**Shots now have a range, on both sides: 336 px, six cells.** Distance is accumulated per bullet from where it was last frame, so a shot dies at the cap whatever else is going on - and only accrues while it is actually moving, which matters because physics stops during the swap prompt and the pause menu. The wall, rock and enemy hits are unchanged, and the old 1200 ms lifetime stays as a backstop it now never gets to use: at 700 px/s the cap is reached in **480 ms**, two and a half times inside it. `bullets.js` is new and holds that arithmetic with the tests that keep it honest. **Enemy shots carry the same cap**, through the same tracker - their 4 s timeout is even further from binding, since a 208 px/s shot crosses 336 px in about 1.6 s. One consequence to be aware of: enemies still *fire* from beyond their reach, because `hasShotLineTo` asks about rocks and never about distance, so a shot from across a room now evaporates partway. See Not done.

## Previous session (2026-09-03, second pass)
**Big rooms are reachable by playing now, and the restart bug is fixed.** `rollRoomShape()` makes rooms 3 to 7 a coin flip between a rectangle and one of the four shapes, drawn evenly; rooms 1-2 and 8 onward stay rectangles, and a shop is always a rectangle whatever the depth. The run carries a `roomNumber`, shown in the HUD beside the wallet.

`scene.restart()` with no argument was handing `init()` the previous room's payload back, so death and the pause menu's **Exit** resumed the run they claimed to end. Both now call `startFreshRun()`, which passes `{}`. `run.js` is new and holds `freshGameState()` and `roomFor()`, the seam that made "fresh run" versus "next room" testable at all.

## Previous session (2026-09-03, first pass)
**Off-screen enemy arrows for big rooms.** A big room is nearly three times the viewport, so most of its enemies start out of sight and the last one alive can be a forty-second walk away with nothing to say where. Every off-screen enemy now gets a small red arrow on the edge of the screen pointing at it, updated every frame, gone the moment it comes into view. `pings.js` is new and holds the one piece of arithmetic worth testing. Rectangular rooms get none of it - they cannot scroll, so nothing in them is ever off-screen.

While checking it, found a **pre-existing restart bug**: `scene.restart()` with no arguments does not clear the scene's stored data, so "press R to try again" and the pause menu's **Exit** both resume the run they were meant to abandon. See Not done. Nothing to do with the arrows; the shape field just made it visible.

## Previous session (2026-09-02, third pass)
**All four big rooms are wired in and playable.** The L wiring generalised almost untouched — the scene already read whatever shape it was handed — but one thing did not: door placement filled the first exit tip before starting the next, which is invisible on L and Z and would have put **every door T ever offers on its west arm**. `splitDoors()` now rolls the allocation across tips instead. The debug key cycles L → Z → T → G → L. Nothing rolls a shape yet.

## Previous session (2026-09-02, second pass)
**The L big room is wired into the scene and playable**, behind a temporary debug key. `shapeRoom.js` is new: it turns a mask into the solid grid, the wall tiles, an exit tip's wall run and a cell's world coordinates, all pure and tested. `PlayScene` reads it for walls, obstacles, spawns, the entry, the exit doors and pathing, and the camera now follows the player because a big room is larger than the viewport.

## Previous session (2026-09-02, first pass)
One change, and it was data only: **`shapes.js` defines the four big-room templates L, Z, T and G** as hand-authored grid masks with their entry and exit doorways, verified by flood-fill.

## Previous session (2026-09-01)
Six changes, each verified live against the dev server and folded into the sections below:
1. **Door honesty** raised to 0.9/0.9 so the two channels compound to ~81% fully-honest doors (was 68%).
2. **Room clutter** rolled 0-33% per room instead of a fixed quarter — see the obstacle section; `obstacles.js` is new.
3. **Rooms are live from frame one** — the walk-up entry line and its prompt are gone.
4. **Enemy drops** replaced room-start treasure: 10% per kill, split evenly between a heal, a treasure and a reward; `drops.js` is new. (Superseded 2026-09-03: heal only, half a heart.)
5. **Hits no longer move the player** — knockback and its input lockout are gone.
6. **Shops** never spawn guards on entry, sell exactly one thing per visit, and wake their guards on the sale.

## What it is
Top-down twin-stick prototype. Phaser 4 + Vite, plain JS, ES modules. Vitest for pure logic, Playwright for scripted browser runs. Git repo, branch `master`.

## Done

### Game loop (`src/game/PlayScene.js`, 3127 lines)
- Player: green rect, WASD movement (normalized, 320 px/s), collides with world bounds.
- Shooting: arrow keys aim + auto-fire, **360 ms cooldown**, a **75 px sprite at 392 px/s** rotated to its travel angle (alpha 0.9, 10 px hitbox), **336 px range** (1200 ms lifetime behind it as a backstop that never fires).
- Enemy shots: orange, 208 px/s, **the same 336 px range** (4000 ms lifetime, likewise never reached).
- Room size: **1344x840** (1.4x the original 960x600). Player/enemy/bullet sizes unchanged.
- Room walls: 5 static rectangles (**56 px = one full grid cell**, slate `0x4b5563`) framing the room — top, left, right, and two bottom stubs flanking a 140 px doorway gap at bottom-center. Built with `physics.add.staticGroup()`. `WALL_THICKNESS = CELL` is deliberate, not a magic number: the wall bodies fill exactly the border ring the grid marks blocked, so physics and pathing agree on which cells are solid (see the wall-pocket fix below).
- Obstacles are generated on a **56 px grid** (24x15 cells), filling **anywhere from 0 to 1/3 of the interior**, rolled fresh every load:
  | | shape | size roll | color | on foot | bullets |
  |---|---|---|---|---|---|
  | **Rocks** | seed cell that accretes neighbours into a clump | 1-8 cells | `0x6b7280` | blocked | **popped** |
  | **Pits** | run-and-turn walk -> I, L, U, S, G noodles | 3-12 cells | `0x05060a` | blocked | **fly over** |
  Rocks take ~60% of the filled area, pits ~40%. Size is rolled with weight `1/size`, so small shapes are common and big ones rare. **2/3 of shapes seed in the 3-cell band along the wall**, 1/3 further in. Shapes are placed one at a time and a candidate is discarded unless a flood fill from the doorway still reaches every open cell, so the room is never sealed off. The doorway column and walk-in stretch are reserved.

  **Every room rolls its own clutter.** Coverage is drawn uniformly between 0 and `COVERAGE_MAX` (1/3) per generation rather than aimed at one fixed density, so the same generator hands out bare arenas and cluttered warrens. **0% is a real hand, not a failure** — an empty room is generated, kept and walked into like any other. A candidate that would carry the fill past the rolled figure is dropped along with one that would seal the room, so the roll is a true ceiling: a pit is 3 cells at its smallest and used to be able to step over the target by two. **Measured over 5 000 fresh layouts** (24x15 grid, doorway reserved): achieved coverage **0% to 33.2%** against the 33.3% ceiling, mean 16.2% against a rolled mean of 16.7%, flat across all ten deciles (450-594 layouts each), **109 completely empty rooms**, and **0 layouts with an unreachable open cell** — flood fill from the doorway reached every one, sparse and dense alike.
- Colliders: player and enemies vs walls/rocks/pits; player bullets vs walls and rocks; enemy shots vs walls and rocks. Enemy spawns are drawn from the free grid cells at least 260 px from the player.
- Enemy pathing: line-of-sight test against the actual tiles. Clear -> walk straight at the player. Blocked -> **breadth-first search over the free grid cells**, then steer at the furthest waypoint (up to 6 ahead) still in plain sight, which keeps movement off the grid lines. The enemy **always closes the gap**: either end of the route is snapped to the nearest open cell (the grid marks the whole 56 px border ring blocked to keep obstacles off the wall band, but the 24 px walls let both the player and the enemy stand in that ring), and an unreachable player means walking to the reachable cell closest to them rather than giving up.
- Enemy combat: **10 HP** (10 player bullets to kill). Fires a projectile every 1.4 s at **208 px/s = 0.65x the player's 320 px/s move speed**, but only when no rock breaks the line - it will shoot across a pit. Shots pop on walls and rocks.
- Player health: **6 HP = 3 hearts** (1 heart = 2 HP). HUD is a bordered health bar of 6 segments, paired with a wider gap between hearts so it reads as 3 hearts, plus an `n/6 HP` label. Enemy touch *or* shot costs **1 HP**, both sharing one 600 ms i-frame window.
- **Game over at 0 HP**: `GAME OVER` / `press R to try again` overlay, player and enemies frozen, live projectiles cleared, all input except R ignored. R runs `scene.restart()` for a fresh room and a full bar.
- Room entry: player starts in the doorway (bottom-center) and **the room is live from the first frame** — `create()` ends in `populateRoom()`, which reads `this.roomPlan` for enemy count and enemy toughness, and fires the toast naming what the room turned out to be. There is no walk-up gate any more: the `Move up to enter the room` prompt, the 140 px entry line and the `roomEntered` flag are gone, and enemies are chasing and shooting while the player is still standing in the doorway. `ENTRY_LINE_OFFSET` survives only as the walk-in stretch `reserveDoorway` keeps clear of obstacles.
- Enemies: red rects, spawn at a random point at least 260 px from the player, home in at 120 px/s.
- Combat: bullet→enemy overlap deals 1 dmg, flash tween on hit, destroy at 0 HP. Enemy HP = `ENEMY_BASE_HP` (10) + `enemyStrength` (the run's accumulated 'enemy' curses) + the room's `enemyStrengthBonus` (0/1/2 by door tier).
- Player damage: enemy touch or shot → 1 HP, 600 ms i-frames and a 60 ms alpha flash. (The old `Hits taken` counter is long gone; the health bar is the only readout.) **A hit never moves the player.** It used to shove them 420 px/s away from whatever hit them and lock the controls out for 180 ms, which meant a hit taken mid-corridor decided where they ended up; `KNOCKBACK_SPEED`, `KNOCKBACK_DURATION` and `knockbackUntil` are gone and `takeHit()` no longer needs to know where the damage came from. The flash is the only thing standing in for the shove — the same one an enemy gives when it is shot.

### Pure logic modules (tested, 500/500 passing across 20 files)
| Module | Exports | State touched |
|---|---|---|
| `bombs.js` | `useBomb`, `refillBomb` (30% chance, injected RNG) | `bombCount` |
| `currency.js` | `addExp`, `spendExp` | `exp` |
| `shop.js` | `SHOP_PRICES`, `HP_REFILL`, `BOMB_REFILL`, `SHELF_SIZE`, `REFILL_WEIGHT`, `priceOf`, `canAfford`, `sellableItems`, `shelfLabelFor`, `rollShopStock`, `purchaseBlockedReason` | none - rolls, prices, what may be sold, what the shelf gives away, and why a purchase cannot land |
| `drops.js` | `rollEnemyDrop`, `DROP_CHANCE`, `HEAL_DROP`, `rollRoomDrop`, `DEBUFF_DROP_SHARE`, `DEBUFF_DROP`, `CLEAN_DROP` | none - rolls whether a kill leaves half a heart, and what clearing a room pays |
| `doors.js` | `rollDoorCount`, `rollDoors`, `roomPlanFor`, `REWARD_TYPES`, `TYPE_WEIGHTS`, `TIERS`, `ENTRANCE_DOOR`, `ENTRANCE_ENEMIES`, `ENTRANCE_PLAN`, `DOOR_STYLE`, `TIER_GLOW`, `rollTwist`, `rollTwistCap`, `mustStaySafe`, `canTwist`, `TWISTABLE_TYPES`, `TWIST_CHANCE`, `MAX_TWIST_CAP`, `TWISTED_PLAN`, `TWIST_LINES`, `pickTwistLine`, `BOSS_PLAN`, `assignTwistDispositions`, `TWIST_NEVER`, `TWIST_TRAP`, `TWIST_ROLLS` | none - rolls the telegraph, the room plan behind it, whether that room twists, and what the ambush says |
| `obstacles.js` | `rollCoverage`, `generateObstacles`, `reachesEveryOpenCell`, `COVERAGE_MAX`, `NEIGHBOURS` | none - takes the grid dimensions and reserved cells, returns the blocked grid and the shapes to paint |
| `bullets.js` | `BULLET_SPEED`, `BULLET_RANGE`, `BULLET_LIFETIME`, `ENEMY_SHOT_RANGE`, `ENEMY_SHOT_LIFETIME`, `rangeReachedAt`, `travelIn`, `limitThatBinds`, `slowestSpeedRangeStillBinds` | none - the numbers behind a shot and which limit ends it |
| `run.js` | `freshGameState`, `roomFor`, `recordTwist`, `advanceFloor` | owns `gameState`'s shape; turns a restart payload into the room to build; books whether a room turned hostile; re-deals the floor at a boundary |
| `floors.js` | `floorSize`, `FLOOR_BANDS`, `FLOOR_ONE_ROOMS`, `midFloorRoom`, `preBossRoom`, `shopCheckpoints`, `doorPolicyFor`, `BOSS_DOOR`, `SHOP_GUARANTEED`, `NORMAL_DOORS`, `TRAP_ORDINAL_MAX`, `rollTrapOrdinal` | none - how long a floor is, which of its rooms are special, and where its traps go |
| `pings.js` | `edgePoint` | none - pure geometry; where a ray out of the middle of the screen crosses the arrow ring |
| `weights.js` | `weightFor`, `weightedPassivePool`, `pickWeighted` | none - reads `inventory` via `countOwned`, returns weights |
| `inventory.js` | `createInventory`, `setTrinket`, `addPassive`, `addActive`, `swapActive`, `countOwned`, `passiveCounts`, `hasSetBonus` | its own `{ trinket, passives[], actives[3] }` object |
| `shapes.js` | `ROOM_SHAPES`, `rollRoomShape`, `doorCapacity`, `isFloor`, `floorCells`, `shapeSize`, `BASE_ROOM_CELLS`, `MAX_DOORS`, `SHAPE_EDGE_ROOMS`, `SHAPE_ROOM_CHANCE` | none - data plus the floor-band roll, RNG injected |
| `corridor.js` | `generateCorridorRoom`, `generateCorridorObstacles`, `corridorReservedCells`, `CORRIDOR_WALKABLE_WIDTH`, `CORRIDOR_MIN_LENGTH`, `CORRIDOR_MAX_LENGTH`, `CORRIDOR_WALL_RING`, `CORRIDOR_COVERAGE_MIN`, `CORRIDOR_COVERAGE_MAX` | none - rolls a whole corridor, RNG injected |
| `shapeRoom.js` | `roomSize`, `cellCentre`, `innerCell`, `solidGrid`, `wallCells`, `wallRun`, `splitDoors`, `doorCells`, `DOOR_INSET` | none - reads a mask, returns grids, cells and world points; `splitDoors` takes an injected RNG |
| `items.js` | `TRINKET_ITEMS`, `PASSIVE_ITEMS`, `ACTIVE_ITEMS`, `DEBUFF_ITEMS`, `ITEMS`, `SET_BONUS`, `getItem`, `itemsFrom` | none - pure data |
| `effects.js` | `computeStats(base, inventory)`, `MIN_MAX_HP` | none - returns a fresh stats object, `expPerKill` among them |
| `actives.js` | `triggerActive`, `cooldownRemaining` | `cooldowns` map |
| `grant.js` | `grantItem` | `inventory` |
| `swap.js` | `needsSwapPrompt`, `swapOptions`, `applySwap` | `inventory` (via the swap it routes) |

#### Inventory: three tiers (rewritten TDD, one red-green cycle per function)
`{ trinket: null, passives: [], actives: [null, null, null] }`. **Uniqueness is per tier, not global** — that is the whole point of the restructure:

| tier | room | unique? | refuses? |
|---|---|---|---|
| **trinket** | 1 slot | yes | never — a second trinket **replaces** and hands back the one it displaced |
| **passives** | uncapped list | **no — duplicates stack** | never |
| **actives** | 3 slots | yes | `{ success: false, reason: 'full' }`, mutating nothing |

- `setTrinket(inv, item)` returns the displaced trinket, or `null` — the scene drops it on the floor, the same as a swapped-out active.
- `addPassive` pushes and always reports `{ success: true }`, so callers can treat every add the same way whether or not the tier can refuse.
- `addActive` fills the **first** empty slot (a gap left by a swap gets reused) and returns `{ success: true, slot }`.
- `swapActive` overwrites one slot by index and **returns the item that was there**, or `null` (skip the "you dropped X" line on `null`). No bounds-checking on `slotIndex`; the caller picks from rendered slots.
- `countOwned(inv, id)` counts copies **across all three tiers**. Passives stack, so spawn weighting will want the number, not a yes/no; for the unique tiers it is only ever 0 or 1, which is what the uniqueness checks read. It replaces `hasItem`.
- `passiveCounts(inv)` folds the passive list into one row per distinct item, `[{ item, count }]`, in the order each was first picked up. `countOwned` answers "how many of this id" across every tier; this answers "what is in the passive list, and how many of each" — which is what rendering a list of held passives needs. Added for the pause menu.
- `hasSetBonus(inv, idA, idB)` is **actives-only** now — the set moved tiers with the restructure. An id in the passive list or the trinket slot does not count.

`grantItem` routes by tier: passives go straight in, the trinket and the actives check `countOwned` first (`'owned'` still outranks `'full'`), and a trinket comes back as `{ success: true, displaced }`. Only the active rack can ever be full, so **`swapOptions(inventory)` always offers the three active slots** — it no longer takes the item.

`computeStats` sums **the trinket together with the passives** (Heavy Vest carries stat fields like any passive); actives contribute nothing but the set bonus.

### Spawn weighting (`weights.js`) — ownership moves the odds
Duplicate passives stack forever, so nothing stopped the same item coming up over and over. Every roll that can hand out an item is weighted now, halving an item's weight per copy already held:

| copies held | weight |
|---|---|
| 0 | 1.0 |
| 1 | 0.5 |
| 2 | 0.25 |
| 3 | 0.125 |

- `weightFor(ownedCount)` is `0.5 ** ownedCount` — it never reaches zero, so a hoarded item stays possible, just unlikely.
- `weightedPassivePool(inventory, catalogue)` pairs every catalogue entry with its weight and **filters nothing out**: ownership moves the odds rather than closing the door. Shape is `[{ item, weight }]`.
- `pickWeighted(entries, randomFn)` is one weighted draw, `null` on an empty pool. It follows the same contract as every other roll helper — **the RNG is injected**, so a test can choose the roll and the scene passes `Math.random`.

**Wired into all three rolls.** Reward and treasure pickups go through a `rollFrom(pool)` helper on the scene instead of `Phaser.Utils.Array.GetRandom`, and `rollShopStock` now takes `{ item, weight }` entries and draws **without replacement, by weight**. `shopPool()` returns the weighted entries. `rollFrom` weights whatever pool it is handed, so an owned *active* is halved too — harmless, since `grantItem` refuses duplicate actives anyway, and an unowned one still draws at full weight.

Built TDD, one red-green cycle per function plus one for the weighted shop draw. The change to `rollShopStock`'s argument shape is the only breaking one; `shop.test.js`'s pool fixture moved to `{ item, weight }` at weight 1, so those existing draws behave exactly as they did.

### Items (`items.js`) — wired into the scene
Each item carries the display strings **and** the numbers `computeStats` reads, so a new item is a data edit, not an `effects.js` edit. `slot` (`'passive' | 'active'`) is what `grantItem` routes on.

| id | name | slot | source | effect | field |
|---|---|---|---|---|---|
| `iron_plating` | Iron Plating | passive | reward | +1 max HP | `maxHpBonus: 1` |
| `twitchy_trigger` | Twitchy Trigger | passive | reward | -20 ms fire cooldown | `fireCooldownBonus: -20` |
| `hair_trigger` | Hair Trigger | passive | reward | -35 ms fire cooldown | `fireCooldownBonus: -35` |
| `sharp_rounds` | Sharp Rounds | passive | reward | +0.5 bullet damage | `damageBonus: 0.5` |
| `steady_boots` | Steady Boots | passive | **treasure** | +15% move speed | `moveSpeedMultiplier: 1.15` |
| `heavy_vest` | Heavy Vest | **trinket** | **treasure** | +2 max HP, **-10% move speed** | `maxHpBonus: 2`, `moveSpeedMultiplier: 0.9` |
| `panic_button` | Panic Button | active | reward | damage + shove enemies in radius | `cooldown: 12000` |
| `bulwark` | Bulwark | active | reward | shrug off every hit for 2.5 s | `cooldown: 24000` |
| `second_wind` | Second Wind | active | reward | heal 1 HP | `cooldown: 30000` |
| `repair_kit` | Repair Kit | active | reward | heal 2 HP | `cooldown: 45000` |

**4 actives for 3 slots** is deliberate, and `items.test.js` asserts it: actives are unique and capped, so the rack can only fill - and the swap prompt only fire - when the catalogue holds more of them than the rack does. The passive tier is uncapped and stacks, so it has no such floor. `hair_trigger` stayed in the passive pool through the restructure: it was not named in either new pool, and deleting game content was not part of the ask.

**Heavy Vest is the one item that costs something to wear**, and it is now the whole trinket pool - one slot, one hard choice. Its penalty composes with Steady Boots exactly as the multipliers imply: 320 x 1.15 x 0.9 = 331.2 px/s, measured.

`damageBonus` is new in `effects.js` - flat damage sums across passives, and the set multiplier applies on top: `(base + sum) * setBonus`. Sharp Rounds plus the set measured 1.575. `onBulletHitEnemy` already read `this.stats.damage`, so nothing in the scene needed changing.

**Bulwark rides the existing i-frame window** rather than adding a second kind of invulnerability: `takeHit` already refuses everything until `nextHitAt`, so pushing that out *is* the effect. Measured: i-frames went from lapsed to 2436 ms and a hit taken during it cost 0 HP. A blue ring follows the player for the duration.

The **treasure chest is a real roll now** - `spawnTreasurePickup` picks from `itemsFrom('treasure')` instead of handing out `steady_boots` every time.

**Items are unique — one copy each, passives *and* actives.** `hasItem(inventory, id)` searches both racks and `grantItem` checks it **before** the rack has room, returning `{ success: false, reason: 'owned' }` and mutating nothing. A duplicate passive would stack numerically (two Iron Platings read as +2 max HP); a duplicate active would be dead weight, because `cooldowns` is keyed by **item id**, so both copies would share one timer - one rule covers both racks, and no new active item can accidentally become a "double charge" later. `'owned'` deliberately outranks `'full'`: there is no new item to place, so it must not raise the swap prompt.

An already-owned reward **costs nothing**: `takeReward` short-circuits before touching `rewardsCollected` and before the curse roll, so walking over a duplicate cursed pickup is not a punishment. And the pickup is **left in the room** rather than eaten - swap the item out and it can still be taken. Since the overlap re-fires every frame while standing on it, `pickup.spec.announcedOwned` keeps the toast to one per pickup.

**Set bonus:** `iron_plating` + `steady_boots` → **+5% damage**. `computeStats(BASE_STATS, inventory)` recomputes every stat from scratch on each inventory change, so breaking the set drops the bonus with no unwind code. Verified live: swapping `steady_boots` out took damage 1.05 → 1 and move speed 368 → 320 in the same frame.

**Actives** cool down in a `{ itemId: readyAtMs }` map on `gameState`, never on the item objects (those are shared module constants). Each item runs its own clock — measured 12.0 s and 30.0 s ticking side by side.

### Pickups + scene wiring (`PlayScene.js`)
- **Treasure pickup** (gold) is **an enemy drop now, not room furniture** — it lands where the enemy died, **weighted-rolled** from the treasure-sourced items (Heavy Vest, Steady Boots), always curse-free, granted with `grantItem`, and does **not** count toward `rewardsCollected`. Rooms no longer lay a treasure out at the start; `spawnTreasurePickup` takes the death coordinates instead of calling `pickSpawnPoint`.
- **Duplicates are refused per tier, not globally.** A second trinket or a repeat active is a no-op: no stat change, no `rewardsCollected`, no curse, no swap prompt, and the pickup stays on the floor with a one-off `already owned` toast. **Passives are the exception** — they stack, so a duplicate is always taken; what a copy costs you is its odds of coming up again (see spawn weighting).
- **Reward pickup** is **weighted-rolled** from the reward-sourced items (4 passives + 4 actives), cursed at **the room's own `cursedChance`** — 0 behind a safe door, 0.9 behind a risky one, 0.5 in an ordinary combat room. Cursed ones render purple, clean ones cyan. Goes through `takeReward`, so `rewardsCollected` and the existing curse roll still apply — and `enemyStrength` from the 'enemy' curse now actually reaches `enemyHpFor`. **Nothing spawns one at present** — a kill used to, and no longer does; see enemy drops below.
- **Heal pickup** (red) is the only thing a kill can leave and the only healing outside the shop. It carries no item, so `onPickup` handles it before anything that reads one. It is worth **half a heart — 1 HP** (`HEAL_PICKUP_HP = HP_PER_HEART / 2`), not the refill it used to be, so the shop's all-or-nothing HP Refill is now the thing worth its price. At full HP it is **left on the floor** rather than eaten for nothing — come back for it after the next hit.

#### Enemy drops (`drops.js`) — EXP and half a heart, nothing else
**A kill pays 2 EXP and, one time in ten, leaves half a heart.** `rollEnemyDrop(randomFn)` returns `HEAL_DROP` or `null` and spends exactly one roll — there is no longer a kind to pick once the chance has passed.

**A kill can no longer drop an item of any kind.** The roll used to be an even three-way split between a heal, a treasure and a reward, so each landed on about 3.3% of kills and killing things was the run's item economy: how many enemies a room happened to hold decided how much the run gave you. Items are to come from clearing a room instead — the next thing to build, where they can be handed over deliberately — and from the shop, which already has its own mechanism. The drop rate itself has not moved, so **healing off the floor is three times as common as it was** (a whole 10% rather than a third of it) even though a kill gives less overall.

**What happened to the old kind constants:** `DROP_KINDS` is **removed**. There is one kind now, so a list of them was a concept with nothing in it; a single `HEAL_DROP` constant replaces it so the scene and the module cannot drift on the spelling. The `'treasure'` and `'reward'` strings survive only as `pickup.spec.kind` values inside `PlayScene`, which is where they always did the real work.

**`spawnTreasurePickup` and `spawnRewardPickup` were deliberately left in place, unreferenced, for the room-clear payout to call.** It landed differently: the payout is `spawnCleanPickup` and `spawnDebuffPickup`, chosen by `rollRoomDrop`.

`roomPlan.treasure` went with it — nothing read the field once room-start treasure was gone, so `ROOM_PLANS` and `roomPlanFor` dropped it. (SAFE and RISKY were then told apart by enemy count and `cursedChance`; both the split and `cursedChance` are gone now.)
- Touching a pickup takes it. With no take/skip UI yet, **the only way to skip a cursed reward is to walk around it** — that is what the purple tint is for.
- **Full rack raises the swap prompt** rather than auto-adding or eating the item; see the Inventory UI section.
- **Keys `1` / `2` / `3` fire active slots 1-3.** WASD moves and the arrows aim, so the number row is what scales to three slots — and it leaves `SPACE` free for the bomb button.
- Panic button: 240 px radius, 3 damage, 560 px/s shove held for 260 ms via `enemy.pushedUntil` (which `updateEnemies` honours, or the chase steer would cancel the shove on the next frame), and it clears enemy shots in the air.
- The health bar is **rebuilt**, not resized, when Iron Plating changes `maxHp` — 6 segments → 7, and the extra max HP is handed over as real HP.

### Door choice (`doors.js` + `PlayScene.js`) — replaced room alternation
**A cleared room offers 2-3 doors along the top wall, and the choice is the run.** Each door says two things: which **kind of room** is behind it by colour, and how hard it will be by glow. Both are true.

> **This section drifted and has been corrected.** It described `cursedChance`, a red COMBAT door and a SAFE/RISKY split, none of which had existed for two sessions — the curse system went in the sixth pass and the types merged in the third pass of 2026-09-04. The living detail is in **Door types: COMBAT, SHOP, PUZZLE** and **The room twist** further down; what is kept here is only what those do not cover.

| door | colour | what is behind it |
|---|---|---|
| **COMBAT** | slate `0xcbd5e1` | the ordinary room. Enemies by tier (4/6/9), and one item on the clear |
| **SHOP** | gold `0xfbbf24` | the shop room. The tier is the **guard**, not the stock: easy 0, medium 2, hard 3 |
| **PUZZLE** | pink `0xf472b6` | a stub — no enemies, no clutter, no payout, doors open on entry |

**Tier does two things at once**: more enemies (the counts above, per easy/medium/hard) and tougher ones — `enemyStrengthBonus` of 0/1/2. It was once stacked on top of a run-wide `enemyStrength` that the curse system fed; that is gone, so the tier bonus is now the only thing that toughens an enemy. Measured: a hard room's enemies at 12 HP against a base 10.

**The room is settled when the doors are built, not on the walk-in**, so nothing can be re-rolled by hovering. Walking into a door **destroys the others in the same frame** and restarts the scene with `{ plan, carried }`; `roomPlanFor` turns the tag into generation parameters and `init` hangs them on `this.roomPlan`. Nothing below that line knows which tag it came from — enemy count and enemy toughness are read off the plan. A toast on entry names what the room is.

**Doors are placed like the shop shelf** — evenly spaced across the top with a `DOOR_MARGIN` of `WALL_THICKNESS + 90`, each snapped by `nearestFreePoint` to the nearest cell the player can stand on, so a door never opens inside a rock. `pickExitSpot` became that general helper. See **Where a door pad goes, and when it works** for the snap limit and the arming rule that came later.

**The entrance room is spelled out, not rolled.** `ENTRANCE_DOOR` is `combat`/`easy` and `ENTRANCE_PLAN` overrides its count to **one** enemy. No door chose it.

**Both temporary scaffolds retired with this.** The `P` debug shop key is gone — doors lead to shops now, which was its stated exit condition — and the 5-enemies-on-entry hack is replaced by the plan's own count. `rollShopHasEnemies` (and its 50/50 `ENEMY_CHANCE`) went with them: the door's tier decides whether a shop is guarded, so a coin flip behind the player's back would only contradict the glow they just read.

### EXP (`currency.js`) — the shop's currency
`gameState.exp`, `+2 per kill` (`EXP_PER_KILL`), spent through `spendExp`, which refuses and mutates nothing when the balance is short. The top wall band shows `EXP n   BOMBS n` at centre. `bombCount` is on `gameState` now too — `bombs.js` always assumed it, and the bomb refill is the first thing that writes it.

### Shop rooms (`shop.js` + `PlayScene.js`)
A second room type, chosen by `init(data)`: `this.roomType` is `'combat'` unless a restart passes `{ roomType: 'shop' }`. `init` also accepts `carried: { gameState, health }`, so a restart can hand the next room the run it is continuing — that is the hook the door system will want, and it is what makes the debug jump usable at all (a plain `restart()` wipes the EXP you were going to spend).

**Stock: 3-4 catalogue items plus both refills, so 5-6 pickups.** Items are drawn without replacement and **by weight**. The pool drops any trinket or active the player already owns — a shop never puts up a duplicate it would have to refuse at the till — but **keeps owned passives**, since those stack; a passive you already hold just carries a halved weight and turns up on the shelf less often. A short pool simply yields a smaller shop; an empty one still sells the two refills.

**Prices are flat per category** (`SHOP_PRICES`), not per item — a shop has to be readable at a glance, and a new item then needs no price of its own:

| category | price | why |
|---|---|---|
| trinket | 14 | one slot, permanent, and a second one throws the first away — the dearest thing on sale |
| passive | 10 | permanent and unconditional, but uncapped, so a second copy always has somewhere to go |
| active | 7 | strong, but gated behind a cooldown and a keypress |
| HP refill | 5 | consumable, but worth up to three hearts |
| bomb refill | 3 | consumable, single use — the cheapest |

At 2 EXP a kill that is 7 kills for a trinket, 5 for a passive and 1-2 for a bomb. The trinket row was **found missing by the shelf**: Heavy Vest moved tiers in the inventory restructure and its label read `undefined EXP`, since `priceOf` keys straight off `slot`. `items.test.js` now asserts every item in the catalogue prices above zero, so a new tier cannot ship unpriced again.

**Whether a shop is guarded is the door's tier, not a coin flip** — easy 0 guards, medium 2, hard 3. It used to be a 50/50 `rollShopHasEnemies`; that was removed with the door system, because rolling it behind the player's back would contradict the glow they had just read to get there. A shop is a detour, so its guards are a real toll.

**A shop is always safe to walk into, and the toll is charged on the way out.** It is the one room the instant-spawn rule does not apply to: `openShop` spawns **no enemies at all**, guarded or not, so the shelf can always be read in peace. A guarded shop says so in its entry toast (`buy one thing and the guards wake up`) rather than proving it with an ambush.

**One purchase per visit.** The success path of `buyFromShop` — past the balance check and past `applyPurchase`, so only a purchase that actually landed — ends in `closeShop()`, which does three things in one synchronous step: sets `shopSpent`, destroys **every remaining shelf pickup and its price tag**, and, if `roomPlan.enemyCount > 0`, spawns the guards right there. That is the whole hook: the guards are not on a timer or an entry trigger, they are the last line of a completed sale. A quiet shop's `closeShop` returns after the shelf clear, so its doors open on the next frame.

**The exit is held shut until the visit is over.** `checkRoomCleared` consults `shopIsDone()` on top of its usual "no doors yet, nothing alive" test, so a guarded shop cannot be walked out of before its guards have been dealt with. The escape hatch is that there is **nothing to buy** — a player with no purchase to make has no way to finish the visit, and EXP only comes from kills, so without it they would be sealed in.

**"Nothing to buy" is not "nothing affordable", and reading it as the latter was a softlock.** Found in play. `applyPurchase` refuses for three reasons that have nothing to do with money — an HP Refill at full health, an item already owned, a full active rack — and the gate had never heard of any of them. So a player at full HP holding *exactly* the price of an HP Refill and not a point more could not buy the refill, could not afford anything else, and could not leave: the affordable item held the doors shut while the refusal held the purchase off.

`purchaseBlockedReason(entry, context)` in `shop.js` answers "why can this not land, or null" **without changing anything**, so the gate can ask it about every item on the shelf on every frame. Both the refusal path and the gate read it now, rather than each working it out — the two disagreeing about what a finished visit is *was* the bug rather than a detail of it.

Reproduced before fixing: 5 EXP, full HP, a shelf of `item@10 item@10 refill@5`, no doors. After: the same shelf and wallet at 6/6 HP opens 3 doors, and at 1/6 HP — where the refill is buyable again — still opens none.

Verified live across three visits: a **hard shop with 999 EXP** browsed for 1.5 s with 6 pieces on the shelf and **0 enemies**, then one 3 EXP bomb refill took the shelf to **0 pieces and 0 price tags with 3 guards on the floor and still no doors**; clearing them opened **2 doors**. The same run through an **easy shop** left 0 enemies and opened **3 doors** the moment the shelf cleared. A **broke player (0 EXP) in a hard shop** got its doors immediately and the shelf stayed standing, unbought.

**Stock is laid out on one shelf line** across the room at 42% of its height, evenly spaced with equal margins — measured 185-223 px apart depending on how many pieces rolled, all on one y. It replaced a random scatter: a line reads as a counter you walk along, every price tag gets the same room as its neighbours, and nothing lands behind a rock. Each piece is an ordinary pickup with its **name over its price on two lines** underneath, because a shop only works if the cost is visible before you walk into it and a long name would otherwise crowd the next slot. Colours: sky for items, red for the HP refill, orange for the bomb refill.

**A shop room is bare floor** — `buildObstacles` returns straight after reserving the doorway when `roomType === 'shop'`, so no rocks and no pits, and `coverage` is 0. They would break the shelf line up and hand a guarded shop cover to shoot you from. The grid itself is still built, so pathing and spawn points work exactly as they do in a combat room.

**Walking into stock buys it, and nothing is charged unless the effect lands.** The order is check the balance, apply the effect, *then* `spendExp` — so a full rack, an already-owned item or a full health bar refuses with a reason and costs nothing. HP refill restores to `stats.maxHp`; bomb refill is `bombCount += 1`; items route through the same `grantItem` as every other pickup.

**A refused purchase says why**: a red toast (`can't buy - 7 EXP - you have 0`) plus a double flash of the box, on a 1.2 s cooldown because the overlap re-fires every frame while you stand on it — the same problem `announcedOwned` solves for duplicate rewards.

Verified in Chrome on the dev server: broke → refused, 0 spent; with 60 EXP all 5 pieces of one shop's stock bought in turn, 60 → 28, each effect landing (item into the right rack, HP 1 → 6/6, bombs 0 → 1).

### Inventory UI (`PlayScene.js`)
**The tier restructure reshaped the bottom-left HUD**: the 4-box passive rack is gone, and so is the written `PASSIVES` abbreviation list that briefly replaced it (`SR x4   SB   TT   HT`). An uncapped tier has no fixed width, so it was never going to sit in a wall band - **the pause menu is the only place passives are listed now**, in full names with counts and effects. The bottom-left band holds the single `TRINKET` box alone, its dark plate cut back to fit it; the rest of that band is bare wall. Actives are unchanged on the right. The `SET +5% dmg` readout now asks `hasSetBonus` instead of inferring from `damage > 1`: stacked passives raise damage on their own, so the old test lit it up with no set equipped.

**The HUD lives on the walls, never over the floor.** Hearts and the `n/m HP` label ride the **top** 56 px wall band at the left, with the set-bonus line at its right end. The item slots sit in the **bottom** wall band, **split around the doorway gap**: the single trinket box to its left, 3 active boxes to its right, with `1` `2` `3` key hints on a line above them. The stretch between the trinket plate and the doorway is bare wall now that the passive strip is gone — free space, with nothing moved into it (the bomb counter is the obvious candidate when it lands). Nothing in the HUD covers a walkable tile, a rock or a pit any more.

Slots are 40 px boxes holding a short abbreviation of the item name (`Iron Plating` -> `IP`; a single-word name keeps its first two letters instead of shrinking to one character, so `Bulwark` -> `BU`), derived at render time so a new item needs no extra data. Empty slots are darker, dim-bordered and hold a `.`; filled ones are lighter with a brighter border. Each group gets a **dark plate** behind it, because the wall is a light slate and the boxes and their labels were unreadable straight on that colour. Every HUD object carries an explicit depth, so pickups and enemies spawned mid-run cannot draw over it.

**Active cooldown state** is readable at a glance: ready means a **green border**, cooling means a slate border, the abbreviation dimmed to 50%, a dark veil filling the box from the bottom in proportion to the time left, and the seconds remaining printed across it. Measured mid-cooldown: veil at 0.70/0.73 of the box with `8.4s` and `22.0s` showing, and each item on its own clock.

**Swap prompt.** A full rack **pauses the game** - `physics.pause()`, so nothing moves, shoots or lands a hit until the player has chosen. That was picked over slowing time because the choice reads five lines of item text; a timer would make it a reflex test. The panel shows the incoming item with its effect (and `(CURSED)` in purple when it is), then one numbered line per slot with what is currently in it, then the way out.

- **Input is the number row again**, `1`-`4` for passives and `1`-`3` for actives, with **`ESC`** to back out. Numbers because `1`/`2`/`3` already mean "active slot n" in play, so "number = slot" is one idea rather than two; the prompt literally reuses those three `Key` objects and adds a fourth. `JustDown` is consumed by whichever handler reads it first and `updateActives` never runs while the prompt is open, so confirming a swap cannot also fire an active.
- **On confirm** the displaced item **drops back on the floor** as a `dropped` pickup 84 px away, rather than vanishing. Nothing else in this game silently destroys an item, it keeps a snap decision reversible, and it makes "walk back for it" a real choice later. Dropped pickups route through `grantItem`, not `takeReward`, so re-taking your own gear is never cursed and never counts as a reward.
- **On decline** nothing at all changes and the pickup stays where it is. To make that literally true, `takeReward` no longer charges for a reward it could not place: the `rewardsCollected` count and the curse roll moved into a new `collectReward`, which the scene calls only once the item is actually placed. Before this, declining still cost a curse.
- A declined pickup - and one just dropped underfoot - is **inert until the player steps more than 78 px away**, so the prompt cannot re-open while standing on it and a swap cannot be undone by not moving.

### Pause menu (`PlayScene.js`)
**`ESC` pauses.** `physics.pause()` freezes every body where it stands and `update()` stops doing anything but reading the menu's own keys — no movement, no firing, no enemy thinking, no pickup rearm.

**ESC is shared with the swap prompt and does not clash**: that prompt reads ESC as "leave it on the floor" and `update()` returns inside its own branch before the pause check is ever reached, so one press can only ever mean one thing. `ENTER`/`SPACE` confirm and `W`/`S`/`UP`/`DOWN` move the cursor — all four were unbound (SPACE is still reserved for the bomb; revisit when it lands).

**Resuming restores the clock, not just the motion.** Every deadline in the run is an absolute `this.time.now` stamp — `nextFireAt`, `nextHitAt`, the `cooldowns` map, per-enemy `nextShotAt`/`pushedUntil`, per-pickup `nextRefusalAt` — and that clock keeps running while the menu is open. `shiftDeadlines()` adds the paused duration back to all of them on the way out, so a 20 s active with 8 s left still has 8 s left however long the menu was up. Without it, every cooldown in the run would silently expire behind the menu. The HUD is painted once with the frozen timestamp too, so the cooldown timers behind the panel stop counting down. **Measured live: menu held open 37.1 s, a 20 000 ms cooldown came back with 19 783 ms left** (the ~200 ms is the keypress itself).

**Contents — Resume, Exit run, and the passives you hold.** No `options` row: a row that does nothing is worse than a row that is not there.
- **Exit** abandons the run and starts a fresh one (`scene.restart()` with no carried state, the same thing the game-over `R` key does). There is no title screen to exit to yet, so that was the only meaning it could carry that is not a no-op — and it is behind highlight-then-`ENTER`, so a stray keypress cannot wipe a run. Point it at a menu scene once one exists.
- **The passives list** is the **only** place the tier is visible: `Sharp Rounds x3  -  +0.5 bullet damage`, full names and effects, one row per distinct item, `none yet` when empty. The bottom-left HUD strip that used to abbreviate them (`SR x3   IP   SB x2`) was removed once this landed — one uncapped tier does not belong in a fixed-width wall band, and two places to read it is one too many.

### Big-room shapes (`shapes.js`) — defined, verified, and **all four wired into the game**
The foundation for non-rectangular "big rooms". Pure data: four hand-authored masks on the same 56 px grid the rectangular rooms use, `#` for floor and `.` for void, each roughly three base rooms (24x15 = 360 cells) of floor. All four sit in a 40x40 bounding box; stroke widths differ per shape because each letter was drawn whatever way was easiest to get right, and the tests measure the geometry rather than assuming a common width.

| Shape | Silhouette | Floor | Ends | Entry | Exits (door capacity) |
|---|---|---|---|---|---|
| L | west arm + south bar, stroke 18 | 1116 (3.10x) | 2 | east tip of the south bar | north tip of the west arm (3) |
| Z | north-east bar, waist, south-west bar, stroke 16 | 1024 (2.84x) | 2 | west tip of the south-west bar | east tip of the north-east bar (3) |
| T | full-width north crossbar + south stem, stroke 16 | 1024 (2.84x) | 3 | south tip of the stem | west tip (3) and east tip (3) of the crossbar |
| G | C open to the east with the letter's inner bar, stroke 10-12 | 1200 (3.33x) | 3 | north-east tip | inner bar's west tip (2) and the shared east wall (3) |

**Doorways carry a span, not a door count.** Each entry/exit is `{ cell, facing, span }` — the floor cell the doorway is cut through, the direction you leave through it, and how far the *wall* runs there. `doorCapacity(span)` converts that to doors: a doorway is 3 cells wide (140 px, rounded up) and needs a 2-cell slab between neighbours, capped at `MAX_DOORS = 3`.

**Shapes with three ends get two exit tips, not three.** T and G each have a spare end, but three tips holding one door each would make the door count a property of the shape and silently override `rollDoorCount`. Instead both put their entry on one end and spread exits over the other two, with capacities summing to 5-6 — so the existing 2-3 roll places itself either way, both doors on one tip or split across them. L and Z have only two ends, so their single exit tip is 16-18 cells wide and seats all three doors on its own, exactly as the north wall of a rectangular room does today.

**A tip stops where the wall stops, not where the floor stops.** G's inner bar dies into the south bar, so along that column the floor keeps running for 20 cells while the west-facing wall is only 10. Measuring the wrong one would have put half a door in open floor. Whatever places doors in the scene needs the same rule: a cell only counts toward a doorway's wall run while the cell on its outward side is void or off the mask.

Verified in `shapes.test.js` (18 tests): masks are rectangular and only `#`/`.`; floor area lands between 2.5x and 3.5x a base room; entry and every exit are floor cells of their own mask, all distinct, each facing out of the shape rather than back into it; each declared `span` equals the wall actually there; and a flood-fill from the entry — **and separately from every exit** — reaches every floor cell exactly, so an isolated pocket fails rather than passing quietly. A negative-control test proves the flood-fill really does detect a cut-off region.

### Wiring a shape into the scene (`shapeRoom.js`)
`shapes.js` says what a shape *is*; `shapeRoom.js` says what a scene has to do about it, and `PlayScene` reads the second. Pure functions, 23 tests, no Phaser.

- **`solidGrid(shape)`** — what starts out impassable. A cell is solid if it is void, or if it is floor with a void or off-mask cell 4-adjacent to it: that second clause is the wall ring, and for a solid rectangular mask the whole thing reduces to exactly the border ring the rectangular room already builds. That equivalence is a test, because it is what keeps ordinary rooms unchanged. L comes out at **961 open cells**, 2.7x a base room's 322.
- **`wallCells(shape)`** — the floor cells the ring ate, one tile each. The void behind them gets **no body at all**: the ring is unbroken, so nothing on foot ever reaches it, and painting L's 484 dead cells would be 484 static bodies bought for nothing. They read as background, which is what being outside the room is. 155 tiles for L.
- **`wallRun(shape, doorway)`** — the run of wall a doorway is cut through, walked out in both directions under the outward-side rule. Tested against every declared `span` on all four shapes, and specifically against G's inner bar, where the floor runs twice as far as the wall.
- **`doorCells` / `innerCell`** — pads spread along a tip with the same `(index + 0.5)` spacing the rectangular room uses across its top wall, then stepped `DOOR_INSET = 2` cells inward, because a doorway's own cell is the hole, not floor.
- **`cellCentre` / `roomSize`** — the cell-to-pixel mapping, tested to round-trip through the scene's own floor-divide. `PlayScene.centreOf()` is now a Phaser wrapper over `cellCentre`, so there is one copy of the arithmetic.

What changed in the scene:
- **`init()` takes a `shape` id.** Absent, the room is a 24x15 rectangle and every branch below is the old code. Nothing rolls one yet.
- **World and camera bounds come off the mask.** L is 40x40 cells = **2240x2240 px** against a 1344x840 viewport, so `startFollow` was unavoidable. Everything screen-anchored — health bar, item slots, EXP and set readouts, toasts, the swap prompt, the pause panel, the game-over text — is `setScrollFactor(0)`. In a rectangular room the world *is* the viewport, so the camera cannot scroll and none of it changes anything.
- **`generateObstacles` takes a `solid` grid.** It used to build its own border ring from the dimensions; now it starts from whatever it is handed and defaults to the ring when it is not, so the existing call and its tests are untouched. `interiorCells` is counted from the open cells rather than computed as `(cols-2)*(rows-2)` — the same number for a rectangle, the right one for a mask, so a coverage roll stays a share of floor you can actually walk.
- **Enemy spawning needed nothing.** `pickSpawnPoint` already sampled the free grid, and the grid now encodes the mask.
- **The player spawns at the entry**, two cells in from `entry.cell` and snapped to the nearest open cell, with a 5x5 patch around it reserved — the shaped-room answer to the rectangle's doorway channel.
- **Doors go on the exit tips**, divided between them by `splitDoors()` and then spread along each tip's wall run. `openDoors` trusts the spots it got back rather than the roll, so a shape whose tips cannot seat three doors offers two.

**`splitDoors()` is the one thing the L wiring got wrong.** It filled the first tip to capacity before starting the next, which is correct-looking on L and Z - one tip each, so there is nothing to divide - and wrong on the shapes that have two. T's tips seat three doors apiece, so greedy filling would have put **every door T ever offers on its west arm and never on its east one**, and G would only ever have spilled onto its east wall at a roll of three. That is precisely what `shapes.js` spread the exits over two tips to avoid: the door count is meant to stay a roll, not become a property of the shape. `splitDoors` now draws uniformly from every valid allocation, so "both here", "both there" and "one each" are three real hands. Sampled 400 rolls per count **through the scene's own placement path**, not just the pure function: T deals `2/0`, `1/1` and `0/2` at roughly a third each, and G reaches every hand its `[2, 3]` capacities allow - including never seating three doors on the inner bar, which only holds two.

**The pathing fix, which was the real risk.** `hasWalkLine` tested rocks and pits and deliberately ignored walls — correct for a rectangle, whose wall is convex: no straight line between two points inside it can cross one. **A mask is concave.** The line from the foot of the L to the top of its arm runs clean through the void, so an unmodified `hasWalkLine` says "walk straight at the player", and the enemy walks into the corner and sticks. The wall tiles now join the blocker list **exactly when a shape is in play**. They are also inflated once at build time and cached (`cacheWalkBlockers`) instead of cloned per frame — 155 wall tiles at ~7 line tests per enemy per frame is not something to re-allocate 60 times a second.

`isClearOfWalls` went with it: testing a 72 px footprint against every wall and obstacle body was O(free cells x bodies) per spawn, which is fine against five long rectangles and not against 155 tiles. It is now `hasClearance(row, col)` — the 3x3 block around the cell must be open, which is what the footprint test worked out to and is what the rectangular room was already getting.

**Verified in the browser, all four shapes**, driven through the real debug key (see the scaffolding section). Every silhouette matches its mask with an unbroken wall ring, and the void reads as background. All four are 40x40 cells / 2240x2240 px.

| | open cells | wall tiles | entry cell | exits (capacity) | paths complete | reached the player |
|---|---|---|---|---|---|---|
| L | 961 (2.98x base) | 155 | `[30, 37]` | north 3 | 6/6 | 6/6 |
| Z | 870 (2.70x) | 154 | `[31, 2]` | east 3 | 6/6 | 6/6 |
| T | 870 (2.70x) | 154 | `[37, 19]` | west 3, east 3 | 6/6 | 6/6 |
| G | 971 (3.02x) | 229 | `[4, 37]` | west 2, east 3 | 6/6 | 6/6 |

In every room the player landed exactly on the entry cell, and **no enemy, rock or pit was ever off the mask**. Every enemy had a complete BFS path to the player with zero cells on void or wall, and stepping the loop until they arrived, **every enemy in all four rooms reached the player** - L's single corner, Z's two staircase bends and T's branch point are all navigated, not merely pathed.

**G is the slow one, and it is distance rather than a stall.** Its longest route is 83 cells - about 4,650 px, ~39 s at 120 px/s - so at 1,400 frames (22 s) only 3 of 6 had arrived. Stepping on in batches, the gaps closed monotonically (1466 -> 548 -> 3 px) and all six arrived with none in the void. Worth knowing before the shapes are rolled in play: a big room can put an enemy most of a minute away, which no rectangular room ever did.

**The G inner-bar case does not come back as a room bug.** Along col 24 the floor runs 30 cells while the west-facing wall runs only 10 (rows 20-29); across 400 rolls every inner-bar pad landed in rows 22-27, strictly inside the wall run, and none below it. A pad below row 29 would have been a door standing in open floor with nothing behind it - the thing the shape data flagged.

Headless as well, 200 generations per shape: every open cell reachable from the entry every time, **no obstacle ever placed on void or wall**, coverage still topping out at the rolled 33%, and the wall ring sealed on all four (no open cell touching a non-floor cell).

### Which rooms are big (`rollRoomShape` in `shapes.js`)
**A share of the floor, not a slice of the run.** A room is eligible for a big shape when it is neither of the first two rooms of its floor nor either of the last two; in between it is a coin flip, and when it comes up big the four shapes draw evenly.

| floor | eligible rooms |
|---|---|
| 7 | 3, 4, 5 |
| 9 | 3-7 |
| 15 | 3-13 |

The first rooms are where a floor is settled into, and a space you can see all of at once is the right place to do that. The last two are the pre-boss shop checkpoint and the room whose doors the boss takes over — neither is a place for a two-minute room.

**It used to be rooms 3-7 of the *run*, and that was quietly broken by floors.** The run counter is past 7 before floor 2 begins, so floor 1 got big rooms and **every floor after it was rectangles all the way down**. Measured against the floor instead, every floor gets the same shape of experience regardless of length. `SHAPE_EDGE_ROOMS = 2` is the whole knob, and it is the same safe-middle band the corridors and the shop checkpoints already use rather than a third convention.

Shops stay rectangular — a shelf needs bare floor along one line — and so does the boss room while it is a stub.

### Fresh run vs. next room (`run.js`)
`scene.restart()` with **no argument at all** does not clear a scene's stored data - Phaser only replaces `settings.data` when you pass something - so `init()` received the previous room's `{ shape, plan, carried }` straight back. Everything that was supposed to be thrown away came with it. Measured before the fix, in a G big room with EXP set to 4242: the "new" run came up **still G, still `combat_heavy`/`medium`, still holding 4242 EXP**, and since `carried.gameState` is the same object, the inventory, the curses (`riskLevel`, `enemyStrength`), the bomb count and `rewardsCollected` all came back with it. Both `endGame()`'s "press R to try again" and the pause menu's **Exit** were affected; the Exit path even carried a comment saying it started a fresh run. Doors were never affected - `takeDoor` passes a payload, which replaces the stored one.

The fix is one method, `startFreshRun()`, calling `restart({})`, used by both. The interesting part was making it testable: `run.js` now owns `freshGameState()` (moved out of `PlayScene`) and `roomFor(data)`, which turns a restart payload into the room to build. That puts "what does an empty payload mean" in a pure function, and `run.test.js` pins both halves - 24 tests:

- **A fresh run banks and keeps nothing**: EXP 0, empty rack, curses and bombs cleared, back to room 1 and the entrance plan, no shape, and health left to the scene so it starts full. `{}`, `undefined` and `null` all read the same. It shares no object with the run that just ended, checked by mutating one and looking at the other.
- **A door still carries everything**: the *same* `gameState` object comes through, EXP, items, curses and bombs intact, damage taken kept rather than healed, depth advanced, and the door's plan and shape applied. A payload with no `shape` reads as a rectangle mid-run, not as "start over" - and `health: 0` survives as 0 rather than being swallowed by a fallback.

Verified end to end in the browser, driven through the real keys. Loaded a run to 250 EXP, 4 bombs, a trinket, a passive, `riskLevel` 3 and `enemyStrength` 2, standing in a G big room on room 4 with 5 HP:
- **Death -> `R`**: back to room 1, 24x15, `safe_reward`/`easy`, 0 EXP, 0 bombs, empty rack, curses cleared, 6/6 HP.
- **`ESC` -> `S` -> `ENTER` (Exit run)**: menu opened at Resume, moved to Exit, confirmed - same result, menu closed.
- **An ordinary door from the same loaded state**: `gameState` carried by reference, EXP, items, curses, bombs and damage all kept, depth advanced by one.

### Debuff curses (`items.js`, source `debuff`)
Four of them, and each is a **bargain rather than a punishment**: a real bonus bolted to a real cost. That is what makes a risky door worth walking through - the fight pays out something you might actually want, and you carry what it costs for the rest of the run.

| | bonus | cost | fields |
|---|---|---|---|
| Rusty Grip | +1 bullet damage | -15% fire rate | `damageBonus: 1`, `fireRateMultiplier: 0.85` |
| Sluggish | +1 max HP | -15% move speed | `maxHpBonus: 1`, `moveSpeedMultiplier: 0.85` |
| Thin Skin | +15% move speed | -1 max HP | `moveSpeedMultiplier: 1.15`, `maxHpBonus: -1` |
| Slug Step | +1 EXP per kill | a slug in every room | `expPerKillBonus: 1`, `spawnsSlug: true` |

They stay **passives**, and the reasoning did not change with the redesign:

- **A cost you can decline is not a cost.** The trinket slot replaces and the active rack refuses when full - and a refusal raises the swap prompt, which the player can walk away from with `ESC`. The uncapped passive list refuses nothing and asks nothing, so the bargain lands whole the instant it is touched, both halves of it.
- **Two should be twice as much of both**, and the passive tier is the only one that can say so.
- They already have a passive's shape: always on, no cooldown, no button.

`source: 'debuff'` still keeps them out of the shop and the safe payout, so clearing a risky room is the only way in.

**`expPerKill` is a stat now**, not the `EXP_PER_KILL` constant. `computeStats` sums `expPerKillBonus` on top of the base 2, and `killEnemy` reads `this.stats.expPerKill` - so Slug Step x2 is 4 EXP a kill and two slugs a room.

**A rate multiplier divides.** `-15% fire rate` is 0.85 shots in the second you used to get one, so the cooldown is 1/0.85 as long - 180 ms becomes 211.8 ms. Multiplying the cooldown by 0.85 would have shipped a 15% *faster* gun. Flat millisecond bonuses land first, so Hair Trigger then Rusty Grip is `(180 - 35) / 0.85`.

**`MIN_MAX_HP = 1`** floors max HP in `computeStats`: the tier is uncapped, so nothing else stopped enough Thin Skins taking it to zero, which is a health bar with no segments rather than a hard run.

**Slug Step's cost** is the one that is not a stat. The scene reads how many copies are held and spawns that many slugs on entering a room. A slug is an ordinary chaser with ordinary HP that **never fires** and crawls at **30% of the player's current move speed** - read off `this.stats` every frame, so it speeds up the moment you put boots on and slows when you pick up Sluggish. It spawns in combat and puzzle rooms but **not in a shop**, for the same reason a shop's own guards hold off.

Verified through the real pickup path, one at a time from a clean rack: Rusty Grip damage 1 -> 2 and cooldown 180 -> 211.8 ms; Sluggish max HP 6 -> 7 and speed 320 -> 272; Thin Skin max HP 6 -> 5 and speed 320 -> 368; Slug Step EXP per kill 2 -> 3, measured over ten real kills, and 3 -> 4 with two copies. Toast reads `Rusty Grip: +1 bullet damage, -15% fire rate (DEBUFF)`.

### `bonusWeight`
Every item carries a 0-1 `bonusWeight` for the boss system to read when it is built. **Nothing consumes it yet** and it changes no stat - there is a test that says so, because inert data quietly becoming live is the failure worth catching.

Heavy Vest 0.4 · Iron Plating 0.2 · Twitchy Trigger 0.3 · Steady Boots 0.25 · Sharp Rounds 0.35 · Rusty Grip 0.3 · Sluggish 0.2 · Thin Skin 0.25 · Slug Step 0.15 · Panic Button 0.5 · Second Wind 0.3 · Bulwark 0.4 · Repair Kit 0.35.

**Hair Trigger has none, on purpose.** Its effect is `-35ms fire cooldown` - the stronger of the two flat cooldown passives, against Twitchy Trigger's -20ms - and its weight is being set deliberately rather than guessed at. `PENDING_BONUS_WEIGHT` in `items.test.js` names it, and a test asserts that list is *exactly* what is missing a weight, so assigning one without removing it from the list fails the suite rather than passing quietly.

### The curse system, deleted
`rewards.js`, `curses.js` and both their test files are gone, and with them `takeReward`, `collectReward`, `skipReward`, `applyCurse`, `riskLevel`, `enemyStrength`, `rewardsCollected`, every `cursedChance` in `ROOM_PLANS`, and the `isCursed` flag that ran through pickups, the swap prompt and the toasts. Nothing had spawned a `kind: 'reward'` pickup since room-clear payouts landed, so none of it was reachable.

Two things it used to do that still happen, by other means: a pickup can still be announced in purple (keyed off `kind === 'debuff'` rather than off a curse roll), and enemies still get tougher with the door's tier - `enemyHpFor` now takes `roomPlan.enemyStrengthBonus` alone, where it used to add the run's accumulated `enemyStrength` on top.

`gameState` is down to `exp`, `bombCount`, `roomNumber`, `inventory` and `cooldowns`.

Swept in the browser over 48 room clears across all four room types: **no `reward` pickup and nothing flagged cursed, ever** - only `treasure`, `debuff`, `heal` and `shop`.

### Corridor rooms (`corridor.js`) — shape and size only
Long, narrow, straight through. Two rolls, **in a fixed order that is part of the contract** — the orientation, then the length — so a test that wants a particular corridor can queue its rolls against it. Obstacles will come third when they land.

**Every number in the spec is a walkable one: the space between the walls, not the mask.** That distinction was worth settling before writing any code. `solidGrid` turns every floor cell that touches the outside into wall, so a mask only 2 cells across would have been **solid wall end to end, with nothing to stand on**. Measured before writing the test: a 2-wide mask yields 0 walkable cells, a 4-wide yields 4. So the mask is always the walk plus `CORRIDOR_WALL_RING` on both axes.

| | walkable | mask | pixels |
|---|---|---|---|
| across | 3 cells | 5 | 168 px |
| along | 12-60 cells | 14-62 | 672-3360 px |

Three across rather than two because a 36 px enemy in a straight run with nowhere to step aside is a wall you shoot through rather than something you dodge. The length range is half a base room to two and a half of them, measured against the base room's 24-cell side.

**16 tests, all measuring off the finished grid rather than off the mask**, so they pin the thing that matters in play and leave the mask free to be whatever holds it: the mask rectangular, non-empty and all floor; orientation one of two, taken off the roll, and about even over 4,000 runs; the layout matching the orientation; the walkable width; the mask carrying a wall ring on both axes; the length range and both its ends; whole-cell snapping; the spread of lengths in between; and a corridor always longer than it is wide.

Verified on the real output: 672 px at the shortest and 3360 px at the longest, 168 px across in both orientations, **50.6% horizontal over 20,000 rolls**, and all 49 walkable lengths reachable.

**Obstacles and doors are done** — see the two sections below.

### A room narrower than the viewport
A vertical corridor drew hard against the **left** of the screen whatever the player did, and a horizontal one against the **top**.

Nothing was computing an offset and getting it wrong — there was no offset. The camera was handed the room's own bounds, and Phaser keeps the camera inside its bounds: when those bounds are smaller than the viewport the clamp has no slack to give, so it pins the camera at the near edge and `scrollX` never leaves zero. 280 px of corridor then sits at screen x 0 of a 1344 px viewport.

`cameraBoundsFor(width, height)` now gives an axis where the room is smaller than the screen the **screen's** size for its bounds, with the slack hung evenly off both sides. The clamp then has exactly one position to settle on, and that position is centred. An axis where the room is at least as big as the screen is untouched.

| room | camera bounds | where it draws |
|---|---|---|
| rectangle 1344x840 | `0,0,1344,840` | unchanged |
| big room 2240x2240 | `0,0,2240,2240` | unchanged |
| vertical corridor 280x2576 | `-532,0,1344,2576` | screen x 532-812, centre 672 |
| horizontal corridor 3024x280 | `0,-280,3024,840` | screen y 280-560, centre 420 |

Measured after the change: all five existing room shapes still report bounds of `0,0` at their own size, so none of them moved.

### Corridor obstacles and doors
**Obstacles are placed uniformly, not by `pickSeed`.** The base-room generator seeds two thirds of every shape into a 3-cell band hugging the wall — and a corridor is 3 cells wide, so the whole width is that band and the bias buys nothing but clustering. It also grows rocks into clumps of up to 8 cells and pits into noodles of up to 12, either of which spans a corridor end to end. So corridor obstacles are **single cells**, drawn uniformly without replacement, tagged rock or pit at the same 0.6 split, at **10-15%** coverage rolled per corridor and rounded rather than floored (a 36-cell corridor cannot land on a tenth exactly).

What it does share is the connectivity check. `keepsRoomWalkable`'s flood fill came out of `obstacles.js` as exported **`reachesEveryOpenCell`**: corridors place by their own rule, but "did that cut the room in half" is the same question wherever it is asked. A candidate that cuts the corridor is dropped and another cell tried, the same way `generateObstacles` rejects a shape rather than a whole layout.

**Rejection rate, measured over 20,000 corridors:** 4.61% of candidate cells thrown away, 42.6% of corridors seeing at least one rejection, worst case 7. Higher than a naive `p³` guess because at 3 wide a **3-cell diagonal staircase blocks under 4-neighbour movement** — you do not need a full column. Per-cell rejection means density is always met; the rate climbs with length (14.5% of corridors affected at length 12, 64.2% at length 60) simply because there are more places to cut.

**Doors sit at the middle of each far end wall, and nowhere else.** A long side is 33 cells of unbroken wall on a middling corridor and would seat three doors if anything let it; a corridor with a side door is a junction.

**Entry at one end, exit at the other, with a roll for which end is the way in.** That was a finding, not a preference: an end wall is 5 cells, `doorCapacity` turns that into exactly **one** door, and one of the two ends has to be the entry because that is where the scene spawns the player. So a corridor offers one door where a room offers two or three, and `openDoors` needed no telling — it already trusts the spots it gets back rather than the roll. A corridor is the bit between choices, not a choice.

**One reserved-cells idea, not two.** `corridorReservedCells` holds back the door pads and the landing spot before any obstacle is placed. It replaced a rule that kept one cell of each *end column* open, which was a proxy for "the door is reachable" and loose in both directions: a pad sits `DOOR_INSET` cells in from the wall, so the end column could be solid without hurting anything, while a rock on the pad itself passed the check and **buried the door in about one corridor in eight**. Now 0 of 5,000.

The test's end-to-end flood fill moved with it: **"end to end" means door pad to door pad**, not first walkable column to last. The old reading failed 0.4% of corridors over a column behind the door that nobody can walk to; the pads themselves connect in 5,000 of 5,000.

**Scene wiring.** `shapeFor` rolls a corridor rather than looking one up — its mask is generated, so there is no `ROOM_SHAPES` entry to find — and it rolls in `init`, so the room is settled before `create` reads it. `buildObstacles` routes corridors to their own generator. The debug `L` key cycles **L, Z, T, G, corridor**. "room clear - 1 doors, pick one" now reads "room clear - one way on".

**Walked in the browser.** A 40x5 vertical corridor, 280x2240 px: spawn at one end, door at the other, 12 obstacles at 10.5% coverage, both enemies pathing the full 39 cells down it. Steered end to end through the real movement keys in 389 frames (6.5 s), dodging rocks, and took the door into room 2. A horizontal one comes out 5x54, 3024x280 px. Note holding a single direction is not enough to cross one — a rock in the middle lane stops you until you sidestep, which is the corridor doing its job.

**Wired into the run** — see the section below. `rollRoomShape` deals only L/Z/T/G; a corridor does not come from there, because it is not one of a room's shapes but a thing that happens *between* rooms.

### Corridors in a run (`rollCorridorDoors` in `corridor.js`, the splice in `PlayScene`)
**Which door-takings have a corridor behind them is rolled once, for the whole floor, up front.** That is sound rather than merely convenient: the number of doors taken on a floor does not depend on *which* doors are taken — one per room, always — so there is nothing to learn by waiting. Two things follow that a per-door probability could not give. The count is exactly the band, where a coin flip aimed at it would sometimes deal none and sometimes twice too many. And **no two corridors can land back to back** as a property of the construction rather than as a retry: pick `count` values out of `doorCount - count + 1`, sort, and add each one's position to it, which maps every plain combination onto exactly one gap-of-two selection and back. The draw stays uniform over the spread-out selections rather than favouring whichever ones a rejection loop finds first.

**The count scales with the floor.** A flat 1-3 was the first design and it did not survive the arithmetic: it left floor 1 at a corridor every 3.5 rooms and a fifteen-room floor at one every 7.5 — the same corridors spread twice as thin, so the pacing quietly drains out of the longer floors. Steps rather than a formula, lined up with the floor sizes themselves:

| floor length | corridors | mean gap |
|---|---|---|
| ≤ 7 rooms | 1-3 | 3.4 |
| 8-11 rooms | 1-4 | 3.6 |
| 12+ rooms | 2-5 | 3.8 |

**The stand-in is retired.** `CORRIDOR_FLOOR_DOORS = 10` was a made-up floor length used because no real one existed; `rollCorridorDoors` always took the count as an argument, and a real floor passes its own now. The constant moved into `corridor.test.js`, where it was the only thing still using it, keeping its "even on purpose" reasoning: reversing a valid selection gives another valid one, so on an odd floor the middle door falls on one side of a halfway split and skews the even-spread test by itself.

**The list is re-rolled at every floor boundary, with `doorsTaken` reset beside it** — the two are one thing, since the list is a set of indices into *this* floor's door-takings. Before floors, it was rolled once per run, which is why a run stopped meeting corridors after its tenth door. **No corridor is ever spliced behind a boss door**: a hallway between the last room and the boss puts a pause exactly where the run should tighten.

**`doorsTaken` is a second counter beside `roomNumber`**, and the two drift apart by exactly the number of corridors walked. That is the whole of "a corridor does not count as a room": `roomNumber` drives the big-room band and the depth display and is not touched, while `doorsTaken` indexes the pre-rolled list.

**The destination is held, not re-rolled.** `takeDoor` resolves the door as it always did — plan, twist, shape — and then, if a corridor is due, restarts into the corridor with that whole resolved destination parked in `pending`. `leaveCorridor` restarts into it on contact. So the corridor cannot change what is on the other side, and an ambush announces itself in the room that twisted rather than in the hallway before it.

**The room-clear gate applies to a corridor too:** its two enemies have to die before the exit opens. A corridor with a way out you can walk straight past is a long empty hallway.

### Placeholder item icons
A coloured geometric shape per item, in the same register as the player, the enemies and everything else on screen. **Shape is the tier, colour is the item**, so one glyph says both what kind of thing this is and which one:

| shape | tier | items |
|---|---|---|
| star | trinket | Heavy Vest amber `#f59e0b` |
| circle | passive | Iron Plating blue `#60a5fa` · Twitchy Trigger yellow `#facc15` · Steady Boots emerald `#34d399` · Sharp Rounds red `#f87171` · Hair Trigger orange `#fb923c` |
| triangle | active | Panic Button lime `#a3e635` · Second Wind cyan `#22d3ee` · Bulwark indigo `#818cf8` · Repair Kit pink `#f472b6` |
| square | debuff | Rusty Grip red `#ef4444` · Sluggish violet `#8b5cf6` · Thin Skin pale yellow `#fde047` · Slug Step olive `#84cc16` |

Debuffs get their own shape rather than the circle their tier would imply: they are the one thing worth recognising on sight before deciding to walk into it.

The four shapes were picked for **needing no base rotation**, so the pickup reveal can spin one through 360 degrees and set it back to 0 without leaving it crooked. `drawItemIcon(x, y, item, size, edgeColor)` is the only place any of them is drawn, and it hands back a Shape — so the caller can give it a physics body, tween it, or leave it sitting in a menu.

**Anything carrying an item wears that item's icon**, on the floor and on a shop shelf alike, and the *kind* colour becomes the outline: a debuff reads purple-edged, a safe drop gold-edged, shop stock blue-edged, while the fill says which item it is. Heals and refills carry no item and keep the plain box they always had.

**In the pause menu**, the row of names and effects is gone. The icons are laid out nine to a line with an `xN` beside any stack. The names were never the point: they are in the notice line when you pick one up, and a wall of text was a worse answer to "what am I running" than a row of shapes.

`items.test.js` pins the data rather than the drawing: every item has an icon, every shape is one the renderer knows, **no two items share a shape and a colour**, no two items of the *same* shape share a colour, and the shape/tier mapping holds. That last set is what stops a later item being added with a duplicate glyph, which would read as information and not be any.

**One consequence worth knowing:** an item on the floor is now identifiable *before* it is touched, by anyone who has learned the icons. The reveal beat still hides the name and the effect text and still gates when the effect lands, but it no longer hides *which item*. That is what the icon brief asked for; if the floor should stay anonymous, the drop can keep its kind-colour box and only the menu use icons.

### The reveal beat
**400 ms**, `REVEAL_MS`. Under about a quarter second it reads as the game stuttering rather than as a moment; much past half a second it starts costing dodges, and the room does not pause for it — a reveal can happen mid-fight with three enemies closing.

**The animation:** the pickup stops its idle loot pulse, then swells to **1.9x** and turns a full **360 degrees** on `Cubic.easeOut`, while a white ring opens outward from it to **2.8x** and fades. No audio yet — there is none in the game at all.

**Nothing happens until it ends.** `beginReveal(pickup, onRevealed)` holds the whole transaction: the `grantItem`, the `refreshStats`, the name and effect line, and for a purchase the EXP too. Measured frame by frame on a Sluggish pickup: max HP stayed 6 and move speed stayed 320 for every frame of the beat, then went to 7 and 272 on the frame it finished, with the name arriving on that same frame.

**What reveals and what does not.** Items do — the safe room-clear drop, the risky room-clear debuff, a shop catalogue item, and an item dropped back on the floor by a swap. EXP, heals and bomb refills do not, because there is no identity to find out: a heal is a heal, and making the player wait to be told so is ceremony rather than information.

**Nothing on the ground names an item.** The only ground label that ever existed was the shop's price tag, and `shelfLabelFor` now returns the tier and a `?` for a catalogue item — `PASSIVE  ?` — and the full name for a refill. It is pure and tested against the whole catalogue: no item name and no item effect can appear on a shelf.

**Three things the beat broke, all found by measuring:**

- **A reveal restarting every frame.** The player stands on the pickup while it plays, so the overlap re-fires. `pickup.spec.revealing` is checked in `onPickup`, and a refused purchase now holds off the whole transaction on the refusal cooldown rather than just its toast.
- **Pickups that survive the beat losing their pulse.** An item already owned, or one the rack has no room for, stays on the floor — so `addLootPulse` was split out of `addPickup` and is put back. An already-owned item also goes `declined` now, so it needs stepping away from rather than replaying the reveal forever.
- **The payoff being wiped by the next toast.** In an unguarded shop the room clears the instant the shelf empties, so `room clear - N doors` overwrote the confirmation the player had just waited 400 ms for. The reveal's line now goes to the `notice` slot above the toast, which is the same slot the door-lied line uses; it outlives the toast and nothing else writes to it.

Verified: 0 name or effect labels on the ground before pickup; stats untouched and no name for every frame of the beat; the effect and the name landing on the same frame at the end; a shop shelf reading `PASSIVE  ?` / `10 EXP` with the refills still named; a refill buying instantly with no beat; and a purchase confirmation surviving the room clearing underneath it.

### The room twist (replaced the door lie)
**A door never lies now.** It says what kind of room is behind it and how hard that room will be, and both are true. `TYPE_ACCURACY`, `TIER_ACCURACY`, `otherThan`, `resolveDoor`, `isLie`, `mustBeHonest`, `rollLieCap` and the three lie fields on `gameState` are all **deleted**, not renamed — and `buildDoor` lost its `actual` argument, because a door and what is behind it can no longer differ.

The reason for removing rather than tuning: a telegraph that misreports is one the player learns to ignore, and an ignored telegraph is three coloured squares with no game in them. That pressure got worse with the merge, not better — once colour named a room type rather than a reward, an amber door that opened onto a fight was not a gamble the player could price, it was the amber door meaning nothing.

**What replaces it moves the surprise from the sign to the room.** A shop or a puzzle has a 1% chance of turning out to be a hard combat room. Nothing at the door hints at it: the pad is the ordinary amber or pink, the glow is the tier the room would have had, and there is no fourth colour and no extra mark. A twisted room is an ordinary hard combat room in every respect — same enemies, same 60/40 clear payout.

**Combat rooms are never twisted.** A fight that becomes a fight is not a surprise, and the entrance is a combat room, so without this a run could open on an ambush.

**The fairness structure was kept and retargeted, not reinvented.** A run is dealt 0-4 twists by `rollTwistCap`, and two twists never land back to back — the same two rules the lie budget had, for the same reason: some runs never twist at all, and the player cannot know which run they are in until it is over.

**`recordTwist` takes the plan**, and that is the rule rather than an implementation detail: a room that could never have twisted leaves the block alone. Twist a puzzle, walk a fight, and the next shop is still a real shop. Had a combat room cleared the flag the rule would almost never fire, since combat is well over half of all doors.

**Resolved at the door, not on arrival.** `rollTwist` runs in `takeDoor` beside the plan and the shape, so a room is settled before the scene starts and the roll stays in the tested layer rather than in `PlayScene`. The shape is rolled off the **pre-twist** plan, so a twisted shop is still the rectangle the player thought they were walking into.

**Being told.** `announceTwist()` stops the room and puts **AMBUSH** across the middle of the screen, over a camera shake and a sting.

- **One line of 28**, drawn per twist, never the same one twice running. `pickTwistLine(lastLine, randomFn)` excludes by value rather than by index, so a stale or later-rewritten line excludes nothing instead of silently dropping a real line from the draw; filtering rather than rerolling keeps it to one roll with the remaining 27 exactly equally likely. The memory is `gameState.lastTwistLine` — each room is a new scene, so a scene-held value would forget between ambushes and "no repeats" would mean nothing. The four tonal registers in the source are for editing only: nothing marks, tags or styles them, and the player cannot tell which block a line came from.
- **On a panel.** `0x0f172a` at 0.3 alpha, sized at runtime off what the wrapped text actually laid out to. Red text on red enemies is one colour twice, and an ambush drops nine of them into the room the message is trying to be read in — measured at **5 of 9 sitting behind the panel** in the worst case caught. Panel at `HUD_DEPTH + 1`, text at `+2`, and the panel goes into the same freeze list so it dies with the words.
- **Screen-pinned**, not room-placed, so a big room does not scroll it away.
- **3.5 seconds**, flat. It was 0.5 when the message was one short fixed string and stayed 0.5 when the pool arrived — reading a 94-character line in half a second is not a thing a person does. Briefly scaled per character; that only ever moved between 2.2 and 3.4 s and the short lines were never the problem, so a single number set by the worst case is simpler and reads the same. **The shake does not scale with it** and is pinned at 300 ms: the shake is the hit, the freeze is the reading, and they only ever shared a number by accident.

It keeps the before-`populateRoom` reasoning the lied line had, though the call now sits at the *end* of `populateRoom` so the freeze happens over a room that exists. That is safe because a twisted room is always a combat room and never takes the shop's early return.

**The sting is the project's first sound, and it carries no asset.** Two detuned sawtooths sliding down an octave through a closing lowpass, built from oscillators at the moment it plays. Synthesised because there is no audio pipeline here at all — no files, no preload, no Phaser sound manager — and introducing one for a single sound would be a bigger change than the mechanic it announces. Wrapped in a try/catch, because audio can fail for reasons outside the game and a missing sound must not take the ambush down with it. Verified by splicing an analyser in front of the destination: **peak amplitude 0.085**, so it is real output rather than silence.

**Measured over 5,000,000 rooms:**

| | |
|---|---|
| twistable rooms (shop/puzzle) | 43.6% |
| rooms that twisted | 0.344% |
| runs with at least one twist | 3.4% — one run in 29 |
| runs with two | 0.027% |

**The no-consecutive rule fired 118 times in 5,000,000 rooms.** It is correct and tested, but at 1% it is insurance against a future tuning change rather than something the game does. The cap does slightly more (0.088%), almost all of it the 1-in-5 runs dealt `twistCap: 0`, which is why the observed per-twistable-room rate is 0.789% rather than the nominal 1%.

### Where a door pad goes, and when it works
Two rules, and the second is the one that makes the guarantee.

**A pad may only be nudged `DOOR_SNAP_LIMIT` (two cells) from where it was aimed.** `nearestFreePoint` now weighs three candidates in order: a cell with 3x3 room around it within reach; failing that **any open cell within reach**, because a door pressed against a rock is still a door on the wall; and only then the nearest roomy cell at any distance, which is what it used to do unconditionally and what put pads in the arena. In practice the middle tier is what catches a cluttered room: pads settle on row 1 (y=84, the row it actually aims at) or row 2 (y=140) instead of walking off looking for space.

**A door does not work until the player has been clear of it.** `door.armed` starts false and `updateDoorArming` flips it once the player is more than `DOOR_ARM_DISTANCE` (90 px) away; `takeDoor` refuses an unarmed door. This is the pickup re-arm rule applied to doors: standing where something appears must not count as reaching for it. A door that opens across the room arms on its first frame, so it costs nothing in the ordinary case — but a pad that somehow opened underfoot can no longer take the choice before it is shown.

**Verified across all three room types**, clearing each and then holding a movement key for four seconds:

| | doors | pad rows | took a door on clear |
|---|---|---|---|
| SAFE | 3 | 140, 140, 140 | no |
| RISKY | 3 | 84, 84, 140 | no |
| PUZZLE | 3 | 140, 140, 140 | no |

The puzzle room took a door after 138 frames — 2.3 s of deliberately walking into one, which is the point of a door. A wider sweep of all three types across all five room shapes: **15 of 15 clears offered 2-3 doors and none transitioned**, closest pad 661 px from the player. Re-running the measurement that found the bug: **0 of 153 pads in the play area, worst y = 140** (was 588).

### Room-clear payouts
Clearing a combat room pays exactly one item, and **which kind is rolled** rather than read off the door:

| room | on clear |
|---|---|
| COMBAT | 60% one debuff-paired item, 40% one clean item |
| SHOP | nothing — it already sold you something |
| PUZZLE | nothing — it is a stub |
| corridor | nothing — it is the bit between rooms |

It used to be a lookup: a safe room always paid clean, a risky one always paid a debuff, so the payout was settled the moment the player picked a colour. With safe and risky merged there is no colour to read it off, and paying the same thing every time would leave clearing a room worth nothing in particular. `rollRoomDrop` lives in `drops.js` beside the enemy drop table; `payOutRoom` gates on `roomType === 'combat'`. Measured **59.9 / 40.1 over 2,000 real clears** through the scene.

The clean payout pools **treasure and reward together**. Treasure lost its only source when kills stopped dropping items, and from the player's side the distinction that matters is "curse-free", not which internal list it came off. It is still weighted, so a passive already stacked twice comes up at a quarter of the odds of one never seen.

`payOutRoom()` runs from `checkRoomCleared` just before `openDoors`, which is what stops it coming round twice. The pickup lands at `freeSpotNear(player)` rather than at a fixed point, so in a 2240 px big room it is not left across the map.

### Door types: COMBAT, SHOP, PUZZLE
**SAFE and RISKY are one `combat` type**, and both old names are gone rather than aliased, so a stale caller breaks loudly instead of working by accident. `type` and `roomType` are now the same word for a fight, which is one name for one thing.

**Combat keeps the old risky counts, 4/6/9** — not averaged with the safe table it absorbed, because the safe counts (1/2/3) existed to be the fight you took when you did not want a fight, and that is not a choice on offer any more. **An explicit placeholder:** a real enemy pool with ranks is planned, and when it lands it replaces this one entry of `ROOM_PLANS` and nothing else.

**The entrance is exempt.** `ENTRANCE_PLAN` holds **one** enemy. The entrance was a `safe_reward`/easy room and the merge would have handed it the risky table's four — fallout rather than a decision, and a run should open with something to shoot at rather than with a fight. Spelled out rather than looked up, exactly as `CORRIDOR_PLAN` is and for the same reason: no door chose either of them. A fourth tier or an is-this-the-entrance flag would have put a branch in the path of every ordinary combat room to serve one room in the game; this way `roomPlanFor` is untouched and **every other easy combat room still holds four**.

**Combat draws at double weight** (`TYPE_WEIGHTS`), and shop and puzzle leave the pool once drawn so neither can appear twice. Combat may fill any number of slots — the old no-repeat rule was right for four types and wrong for three, where it would make every three-door room exactly one of each. Uniform it came out at 44% of doors with **one room in six offering no fight at all**, so "skip the fight" was a strategy the draw handed out for free. Weighted, over 200,000 rooms:

| | uniform | weighted 2:1:1 |
|---|---|---|
| combat | 44.1% of doors | **57.0%** |
| shop | 27.9% | 21.5% |
| puzzle | 28.0% | 21.5% |
| rooms with no combat door | 16.8% | **8.4%** |

8.4% is where the old four-type draw had it. A room offering only a shop and a puzzle is still a real hand, just an uncommon one.

**Colour stopped naming a reward**, because there is no reward kind left to name. It is a label now rather than a signal — always true, so reading it is free — and **glow is the only channel carrying anything at stake**. Combat is **slate `0xcbd5e1`**: amber and pink mean something specific and rare, and the ordinary room should not compete with them for the eye. It is the same grey the corridor exit wears, which is the same idea twice; the two are still told apart, because a combat door pulses with its tier and a corridor exit does not. Violet and cyan are free and left free.

**PUZZLE is a stub** and deliberately looks like one: `roomType: 'puzzle'`, zero enemies at every tier, no rolled clutter, no payout for clearing it. Its doors open the moment you walk in. Pink, `0xf472b6`. Red stays out of the door vocabulary as it always has — it is what damage and enemies are painted in.

### What a shelf gives away
The shelf shows the item's **icon** and its **price**, and nothing else. `shelfLabelFor` returns the empty string for a catalogue item — its icon is already saying which item it is, so a word above the price would be repeating the picture — and the refill's own name for a refill, which is not an item and has nothing to find out about.

It read `PASSIVE  ?` before, from a pass where the shop deliberately sold blind. **That call is reversed.** Spending EXP is committing a real resource, and a purchase you cannot identify is a slot machine rather than a decision; the exact effect text is a fine thing to hold back, the identity is not. What still waits for the purchase is the name and the effect line, which arrive together at the end of the same reveal beat a floor pickup uses.

This needed three changes beyond the label function:

- **The price tag composes conditionally.** With the label empty, `label
price` would have left a blank first line, so it is `label ? label + newline + price : price`.
- **Shop stock carries its item.** `spawnShopPickup` puts `entry.item` on the pickup spec so `addPickup` can find it. `onPickup` branches on `kind === 'shop'` before it ever reads `spec.item`, so nothing about buying changed.
- **`addPickup` stopped excluding shop pickups** from the icon path. The condition was `spec.item && spec.kind !== 'shop'`; it is now just `spec.item`.

**The reveal beat needed nothing.** `buyFromShop` already routed catalogue items through `beginReveal` and refills straight to `completePurchase`. Confirmed by measurement rather than by reading: during the beat, EXP unspent, stats untouched, and neither the name nor the effect on screen; at the end, `bought Bulwark: shrug off every hit for 2.5s (-7 EXP)`, 7 EXP gone and the item in the rack. A Bomb Refill still buys with no beat at all.

Verified on a live shelf: an indigo triangle at 7 EXP, an orange circle at 10, an emerald circle at 10 — every icon matching its item's shape and colour, every outline the shop blue, no label leaking a name or an effect, and `Bomb Refill` still written out in full when one is stocked.

### Shop shelf: three slots, all of them rolled
`SHELF_SIZE = 3`. It used to roll 3-4 catalogue items **on top of** both refills, so a shelf was five or six wide — and since a visit buys exactly one thing, the extra width was only ever more options to discard.

**The Bomb Refill is not stocked at all.** `STOCKED_REFILLS` holds only `HP_REFILL`, because **a bomb does nothing**: `bombs.js` is imported by nothing outside its own test, `useBomb` has never been called, and `bombCount` only ever goes up and gets printed on the HUD. Found in play, a second time the shop appeared stuck — 6 EXP in hand, a Bomb Refill at 3 and everything else out of reach, so the doors correctly stayed shut over an offer of "pay 3 EXP for a counter that does not do anything, or stand here".

Fixed on the shelf rather than at the exit gate on purpose: a gate that ignored bombs would still leave the shop selling one. Selling a thing that does nothing is the defect; the stuck-feeling door was only how it got noticed. `BOMB_REFILL` stays exported and priced, so the day bombs are wired this is one line. **The figures below predate that change** and counted both refills.

**Every slot is drawn**, without replacement, from one pool: the catalogue on its ownership weighting, plus the stocked refills at `REFILL_WEIGHT = 0.9`.

**0.9 rather than the neutral 1, to undo an accident.** Removing the Bomb Refill left the HP Refill as the only refill in the draw, and one fewer competitor is a larger share for the survivor: it went from **24.89%** of shelves to **27.26%** without anyone choosing that. The HP Refill is the game's only full heal, so a quiet 2.4-point buff to how often it appears is a difficulty change made by omission.

| | HP Refill on a shelf |
|---|---|
| both refills, weight 1 (the original) | 24.89% |
| HP alone, weight 1 (the accident) | 27.26% |
| HP alone, **weight 0.9** | **25.04%** |

300,000 shelves per figure, against the real `rollShopStock` and the real pool `shopPool()` builds, with the baseline re-measured rather than taken from the older note below. `shop.test.js` pins the rate, because a rate that drifts silently is exactly how it moved in the first place. **If the Bomb Refill returns to `STOCKED_REFILLS`, this goes back to 1 with it** - the two are one change, and leaving 0.9 behind would cut healing by omission the same way it was raised. One is the neutral figure — an item the player has never held also draws at 1, and one they have stacked draws lower. Stocking both refills unconditionally left exactly one slot doing any varying: two thirds of every shelf was the same two boxes in the same two places, and the only decision was whether to take the item.

Measured over 4,000 shelves against the scene's own pool (10 sellable items, empty rack):

| | |
|---|---|
| three catalogue items | 55.5% |
| two items and a refill | 39.9% |
| one item and both refills | 4.7% |
| HP Refill on the shelf | **25.1%** (was 100%) |
| Bomb Refill on the shelf | 24.1% (was 100%) |
| any refill at all | 44.5% |

**That is a real difficulty change, not just a shuffle.** The HP Refill is the only full heal in the game — a floor heal is half a heart — and it now appears in one shop in four rather than in every one. `REFILL_WEIGHT` is the single knob: raising it to 2 roughly doubles a refill's share of each draw. Left at 1 because "random three" was the ask; see Not done.

`sellableItems(items, inventory)` moved out of `PlayScene` into `shop.js` so the guarantee is testable: **a debuff is never for sale at any price**, the unique tiers drop out once owned, and passives stay in at any count.

### Shot range (`bullets.js`)
A shot dies at **336 px** - six cells of the 56 px grid - unless a wall, a rock or something it hits takes it first. Baseline, not an item or a curse: every shot, always, **on both sides**. It replaces nothing; the existing despawns all still run, whichever comes first.

Distance is accumulated per shot from where it was **last frame**, not measured from the muzzle. Displacement would give the same answer for anything flying straight, which these do - but accruing per frame means a shot only spends range while it is actually moving, and physics stops dead during the swap prompt and the pause menu. A shot held through a pause comes out of it with its reach intact rather than having quietly aged.

Both sides go through one `trackRange(group, range)` and one `armRange(shot)`, so the rule cannot drift between the player's bullets and the enemy's. `ENEMY_SHOT_RANGE` is its own constant that happens to equal `BULLET_RANGE`: a duel should be symmetric, and a room where the thing shooting back outranged you would make walking in the wrong move - but either side can now be tuned without the other silently following.

**Does the 1200 ms lifetime still ever fire first? No - and it cannot, at any speed above 280 px/s.** At 700 px/s a bullet covers 336 px in **480 ms**, so the cap always wins with 2.5x to spare. `limitThatBinds()` says which rule is really in charge and is tested at the shipped numbers, either side of the crossover, and on the tie; `slowestSpeedRangeStillBinds()` names the 280 px/s threshold below which the timeout would start cutting shots short of their advertised range.

**Left in as a backstop rather than simplified away.** It is one line, it costs nothing, and it is the only thing that would ever clean up a bullet whose distance stopped accruing. More usefully, the pair is now self-documenting: an item that slowed bullets below 280 px/s would silently shorten range, and the test is what would catch that rather than a playtester wondering why their gun felt wrong. If it is ever removed, remove `travelIn` and the crossover test with it - they exist to justify keeping it.

The enemy's timeout is even further from binding. At 208 px/s - 0.65 of the player's move speed - a shot crosses 336 px in about **1.6 s** against a 4 s timeout, and the timeout would only start cutting shots short below **84 px/s**. The reach is symmetric but the threat is not: the same distance takes an enemy shot three times longer to cover, which is three times as long to walk out of the way.

**Measured in the browser**, obstacles cleared, firing from open floor:

| | player bullet | enemy shot |
|---|---|---|
| cap | 336 px | 336 px |
| last drawn distance | 326.7 - 338.3 px | 329.3 - 336.3 px |
| spread | 11.7 px | 7.0 px |
| one physics frame | 11.7 px at 700 px/s | 3.3 px at 208 px/s |
| time alive | 496 - 528 ms | 1616 - 1648 ms |
| lifetime, never reached | 1200 ms | 4000 ms |

The spread on each side is frame quantisation, and is not removable without clamping a shot's final position on the crossing frame - not worth a stuck frame of rendering. Wall hits still win when they come first: fired from 150 px out, a player shot died at 58 px. Held down, the player's stream now visibly stops about a quarter of the way across a 1344 px room instead of reaching the far wall, and in a three-enemy fight the two enemies 750-800 px away threw shots that trailed off well short while the one at 278 px connected.

### Off-screen enemy arrows (`pings.js`)
A big room is 40x40 cells against a 24x15 viewport, so on entry four or five of a room's six enemies are outside the camera, and the last one alive can be minutes of screen away. One small red triangle per off-screen enemy sits on a ring inset 30 px from the edge of the screen, positioned and rotated at the bearing from the camera's centre to that enemy, repainted every frame from `update()` and hidden the frame its enemy comes into view.

- **One arrow per off-screen enemy, uncapped.** The most a room ever spawns is nine (`combat_heavy`/hard), so nine is the ceiling. Capping was considered and dropped: an arrow you cannot trust to mean "one enemy" is worse than a crowded edge, and the crowd only happens in the first seconds of a room, when everything is far away anyway.
- **Big rooms only.** A rectangular room *is* the viewport - its camera cannot scroll and nothing in it is ever off-screen - so `updateEnemyPings()` returns immediately when there is no shape, and no arrow object is ever allocated. Verified: 0 allocated in the entrance room, 6 in a big one.
- **Pooled, not rebuilt.** Arrows are created on demand up to the number needed and then reused; surplus ones are hidden rather than destroyed, so a kill and a respawn cost no allocation.
- **Drawn over the HUD** (`HUD_DEPTH + 3`), because the ring crosses both wall bands and an arrow half-swallowed by the health bar reads as a glitch. Still below `PROMPT_DEPTH`, so the pause and swap veils cover them - and `update()` returns early while either is open, so they freeze with everything else.

`edgePoint(angle, halfWidth, halfHeight)` is the only part worth testing on its own, and it is where a ray-rectangle intersection goes wrong: a diagonal has to stop at the **nearer** of the two edges it is heading for or the arrow lands off-screen, and a ray running flat along an axis must not be handed the edge it is parallel to. Dividing by the zero component gives `Infinity`, which is the right answer rather than a special case - that edge simply loses the `min()`. Eight tests: the four axis directions, the exact corner, on-the-edge for all 360 whole-degree bearings, all four edges reached, bearing preserved, and scaling with the rectangle.

**Verified in the browser** in all four big rooms. Arrow count equalled the off-screen enemy count on **2,595 of 2,600 consecutive frames**; the five misses are one-frame lags at the instant an enemy crosses the screen edge, because the camera lerps in `preRender` after `update()` has already placed the arrows - one enemy, one crossing, five enemies. Measured in the same frame as the placement, every arrow's bearing matched the direction to its enemy to 6e-14 degrees, and every arrow sat on the ring in exactly the direction it pointed. Watched through a full chase: 5 arrows on entry, falling to 3, then 2, then 0 as the enemies arrived, never more than the number off-screen.

### Tooling
- `npm run dev` / `build` / `preview` / `test` wired up.
- `npx vitest run` → 19 files, 394 tests, green.
- **Driving the game from a browser-automation tool has three traps**, all hit while verifying the pause menu:
  1. A tool's instant key *press* is too fast for Phaser's per-frame `JustDown` — the key goes down and up inside one frame. Dispatch `keydown`, wait ~120 ms (or a few `requestAnimationFrame`s), then `keyup`.
  2. **Dispatch each keydown to one target only.** Firing the same event at `window`, `document`, `body` and the canvas in one go leaves `justDown` *false*: Phaser treats the 2nd-4th as auto-repeat of a key that is already down.
  3. **A backgrounded tab is a frozen game.** Chrome throttles `requestAnimationFrame` to zero when `document.hidden` is true, so Phaser's loop stops, keys queue up unread and nothing happens — while screenshots keep returning the last painted frame, which looks exactly like a bug in your code. Check `document.hidden` before concluding anything.
  4. **The extension's screenshot does not foreground the tab.** `document.hidden` stayed `true` through every screenshot in the L-room session, so waiting for the tab to become visible never resolves. Two things still work from there: a screenshot pumps roughly one frame, which is enough to land a held keypress; and `game.loop.step(t)` drives the loop as fast as you like from the console, which is how 1300 frames of chasing were watched in one call. **Hold the key down across the screenshot** — `keydown`, screenshot, `keyup` — rather than trying to time a press.
  5. **`scene.restart(data)` from the console silently drops `data`.** Called on a scene fetched with `game.scene.getScene('play')` it restarts into the default room with no plan and no shape, which reads as the feature being broken. The same call from inside `update()` passes `data` correctly, so drive a restart through its real key binding and read the result afterwards.
- Reading run state from the console needs the same `window.__game = new Phaser.Game(...)` hook as the Playwright harness — added for a session, reverted after. `src/main.js` is unchanged.
- **Playwright is wired up now** as a scripted-run harness, not as a test suite: `npx playwright install chromium` once, then a throwaway script against the dev server. It needs `window.__game = new Phaser.Game(...)` in `src/main.js`, added for the run and removed after. Two gotchas found: `keyboard.press(k)` is too fast for Phaser's per-frame `JustDown` (hold with `down`/`waitForTimeout`/`up` instead), and the headless browser needs the download above or `launch()` throws.

## Not done / known gaps
- **The boss room is an empty stub.** It has no enemies and clears on the frame it opens; beating it means walking into it. It exists to prove the trigger and the floor transition, and it should eventually open a **cutscene and a memory unlock** — deliberately not stubbed, because a half-built cutscene hook is harder to replace than a plain door. See `zz_todo.md`.
- **A run still has no end.** Floors keep dealing past floor 7 on the floors-3+ rule, so a run chains for as long as the player survives. A victory condition is its own piece of work.
- **The trap mechanic is bounded by the twist cap, not by itself.** A run gets roughly its `twistCap` in ambushes however many traps are placed, so the two trap systems decide *where* an ambush can happen rather than *how many* there are. Measured: traps placed on 94.6% / 97.7% of floors, entered ~40% of the time, and **about three fifths of entered traps fizzle**. Front-loading is severe — the first trap a run meets fires 79.6% of the time, the sixth 1.2%. 20.3% of runs see no ambush at all, almost exactly the runs dealt `twistCap: 0`.
- **`roomOnFloor` passes the floor's length in the boss room.** The boss sits past the last numbered room, so the counter reads 8 on a 7-room floor. The HUD prints the word BOSS instead of the number, but anything else reading `roomOnFloor` should expect it to exceed `floorRooms` by one there.
- **`bombs.js` is unwired, and now visibly so.** `useBomb` and `refillBomb` have no caller, `bombCount` only increments, and the HUD prints a number that nothing can spend. The shop no longer sells bombs because of it. This is the project's name and it is still not in the game.
- **A 3.5 s freeze every ambush has no skip.** Rare enough not to matter at `TWIST_CHANCE = 0.01`, but on a second or third encounter the player has already read the line and is waiting out an animation. Dismiss-on-keypress is the fix if it starts to grate; deliberately not built, because a skippable freeze needs input handling inside a state whose whole point is that input is dead.
- **The ambush panel is a flat rectangle at 0.3 alpha.** It dims what is behind it by 30%, which is enough to read over but not enough to hide a red enemy sitting directly behind a red letter. Raising `AMBUSH_PANEL_ALPHA` trades readability against seeing the room you have been dropped into. See `zz_todo.md` for the PNG window meant to replace it.
- **A twist is so rare you will not meet one by playing.** 0.344% of rooms, one run in 29, and two in a run about once in 3,700. The mechanic is built, tested and verified in the browser, but playtesting will not show it to you — raise `TWIST_CHANCE` while evaluating it, or force one. Whether 1% is the right number is untested by anything but arithmetic.
- **The twist's fairness rules barely fire at 1%.** The no-consecutive rule blocked 118 twists in 5,000,000 rooms and the cap 4,411, nearly all of the latter from `twistCap: 0` runs. They are insurance against the rate going up rather than something the game currently does. Nothing is wrong with them — but do not read a green test as evidence the rules matter in play yet.
- **The ambush sting is the only sound in the game, and it is synthesised.** No asset, no loader, no Phaser sound manager. It is a placeholder in the same register as the coloured rectangles, and the whole of `playAmbushSting` is replaceable by one `this.sound.play()` once the project takes on real audio. Until then a browser that blocks audio silently drops it — the try/catch is deliberate, and the message carries the moment on its own.
- **The shop got more common and perfectly honest at once.** Shop doors are 21.5% of doors, and since the type is never lied about an amber door is now reliably a shop. Both are straight buffs to the item economy that fell out of the merge rather than being chosen; the shop is already the main item source, and nothing has measured what this does over a long run.
- **The corridor exit's plain slate is a placeholder, not final art.** It is a coloured rectangle like everything else on screen and is to be replaced with a PNG. What has to survive that swap is what the colour is carefully *not* saying: no reward type, no difficulty tier, nothing that reads as a second choice.
- **A risky room's payout is still refusable, though it is now worth taking.** Each debuff carries a real bonus, so walking around one costs the player something - which is the fix for "why would anyone touch this". But with no take/skip UI, refusing is still just a matter of not walking into it, so a player who does not want *that particular* trade pays nothing to skip it. Live with it, or make the payout land on the player rather than on the floor.
- **Healing is now a coin flip you do not control.** The HP Refill turns up on 25% of shelves since all three slots became rolled, and it is the only full heal in the game. A run that draws three item-only shops in a row has no way to top up beyond half-heart floor drops. `REFILL_WEIGHT` in `shop.js` is the knob if that plays too thin; a floor rule ("at least one refill per shelf") would be the other answer, at the cost of the varying shelf this change was for.
- **A puzzle room is not empty if you carry Slug Step.** The room generates nothing, but the slug is something the player brought with them, so it follows them in. Correct as far as it goes, but worth revisiting once a puzzle room has actual contents.
- **Enemies fire from outside their own range.** `hasShotLineTo` asks whether a rock is in the way and never how far the player is, so an enemy with a clear line shoots from anywhere - and now that shots stop at 336 px, one fired from 900 px away dies 539 px short. Measured. It reads as "out of range" rather than as a bug, and it is symmetric with the player's auto-fire, which wastes shots the same way. But the enemy is spending a 1.4 s fire cooldown on nothing, so a distant enemy is harmless in a way it was not before, and in a big room that is most of them. The fix is a distance check in `updateEnemyFiring` - deliberately not done here, because it changes how dangerous a room is and that is a balance call, not a bug fix.
- **A big room can leave an enemy 40 s away.** G's longest route is 83 cells. Nothing is wrong with the pathing - it walks the whole way - and the off-screen arrows now at least say *where* the straggler is, but "clear the room" can still mean waiting on one enemy crossing a room and a half. A minimap, or a leash that pulls the last enemy in, is the next thing to try.
- **A big room's entry is a spawn point, not a doorway.** The mask's entry cell is part of the wall ring and stays solid; the player is placed two cells inside it. There is no opening drawn, so nothing marks where you came in - the same complaint the rectangular room's bottom doorway already has.
- **The HUD no longer rides a wall band in a big room.** The bar and the item plates are pinned to the screen, which is right, but the room scrolls under them, so they sit over open floor rather than over the wall they were laid out on. Readable - they carry their own dark plates - but it is not the design.
- **`bombs.js` is the last unwired module.** Everything else reaches the scene through `gameState`: curses arrive via cursed reward pickups, `enemyStrength` really does feed `enemyHpFor`, and `exp` is earned on kills and spent in shops. `bombCount` exists and the shop raises it, but `useBomb`/`refillBomb` are still uncalled.
- **There is still no map.** Doors choose the next room, but nothing shows where the run has been or how deep it is, and a run is an unbounded chain of rooms with no end condition.
- **The bottom doorway is still decorative.** The doors are pads at the top of the room, not the doorway you walked in through.
- **`endGame()` does not pause physics**, so overlaps still fire after death: a corpse can still walk into a pickup if something moves it. Only spotted because a scripted run teleported the player; harmless in play, since input is dead.
- **No bombs in-game** — despite the project name. No bomb input, no AoE, no bomb HUD. `bombs.js` is still unwired; `1`/`2`/`3` are actives and `SPACE` is deliberately left free for it.
- **No take/skip choice UI** — touching a reward pickup takes it. Cursed rewards are only avoidable by not walking into them.
- **The +5% set bonus is still invisible in play.** Even with Sharp Rounds the arithmetic swallows it: `ceil(10 / 1.5)` and `ceil(10 / 1.575)` are both 7 bullets. Applied and tested, but it changes no fight until enemy HP or damage scales.
- No waves and no respawn: a room is cleared for good once its enemies die. There **is** a difficulty ramp now, but it is per-room off the door tier, not a curve over the run — a hard room at room 2 is the same as a hard room at room 20.
- **The active rack is now very slow to fill in play.** The inventory survives a room change (the door carries it), so the swap prompt is reachable — but it needs four *different* actives to turn up, and the only sources are a 3.3%-per-kill reward drop and one purchase per shop. It used to be a reward from every kill. The shop is effectively the item economy now; whether that is the right balance is untested in a long run.
- **The doorway is no longer a grace period.** With the room live from frame one, a hard `combat_heavy` door drops the player into nine enemies opening fire while they are still in the 140 px channel. Nothing staggers the first volley — delaying `enemy.nextShotAt` by a beat is the cheap fix if it plays badly.
- **A shop's exit can open without a purchase.** `shopIsDone()` treats "nothing on the shelf is affordable" as a finished visit, because a broke player has no purchase to make and no way to earn EXP in a shop. It is a softlock guard, not a designed exit — a player who arrives with 2 EXP and a 3 EXP cheapest item gets the doors handed to them.
- Pathing is BFS on a coarse 56 px grid, so routes are cell-accurate rather than pixel-optimal.
- Coverage is a ceiling, not a guarantee: the generator stops early if 600 placement attempts run out. Over 5 000 sampled layouts the achieved figure trails the rolled one by **0.5 points on average** and never exceeds it.
- Pits are solid underfoot — nothing falls in, they just block movement while bullets pass over.
- No sound, no art (everything is a colored rectangle). There is a pause menu now, but no title screen — which is why Exit restarts the run rather than leaving it.
- Playwright is a dependency with zero tests.
- **The pause menu is not tested** — deliberately, it is UI/feel work, and `PlayScene` has no test file at all. `weightFor`/`weightedPassivePool`/`pickWeighted` and `passiveCounts` behind it are TDD'd; the panel, the cursor and `shiftDeadlines` are verified by hand only.
- **Tweens keep running while paused.** `physics.pause()` and the `update()` early-return stop the world, but the toast's fade tween is on the scene's tween manager and plays on regardless. Harmless today (a toast fading behind the menu is arguably right); worth knowing before anything with a tweened timer lands.
- **The pause menu was verified before the HUD strip came out, not after.** The removal touches nothing the menu reads, and the tests and build are green, but the last live Esc check predates it — the browser tab went background mid-check and froze the game loop.

## Wall-pocket invincibility spot — FIXED
Symptom: standing against a wall with a rock in the next cell in, the enemy could neither reach the player nor, about half the time, shoot it.

Cause: the grid's border ring is one 56 px cell wide but the wall bodies were only 24 px thick, leaving a **32 px corridor around the whole room that the grid calls blocked and the 32 px player fits into exactly**. The enemy body (36 px) physically fits there too, but pathing only ever routes to open-cell centres, so it would not follow - a rock in the adjacent cell left it pressing 90-146 px away.

Fix: `WALL_THICKNESS = CELL`, so the wall bodies fill the whole blocked border ring and the corridor stops existing. Expressed as `= CELL` rather than `56` to keep the invariant visible; the constant had to move below `CELL` to avoid a TDZ error. Cost is a band of playable area on each side - interior is now 1232x728 - and the HUD insets (`WALL_THICKNESS + 12`) moved in with it.

Verified in Chrome on the dev server (a temporary `window.__game = ...` in `src/main.js` for the scripted runs, removed again afterwards):
- **The structural invariant now holds**: sampling the whole room on a 4 px lattice across 10 fresh layouts, **every position the 32 px player can legally stand maps to an open grid cell** - zero exceptions outside the doorway. Before the fix that band was the exploit.
- **16/16 wall-hug chases reach contact** (player pressed to each of the four walls at the closest legal offset, enemy spawned at the furthest free cell, up to 16.3 s). The same test was 9/12 before.
- Flood fill still holds: 213-215 open cells per layout, **0 unreachable** from the doorway cell and **0 too tight for a 36 px enemy**, across 10 layouts. The grid itself did not change - the ring was already marked blocked - so generation and coverage are untouched.
- Doorway unaffected: spawn point standable and the straight walk-up out of the doorway clear in all 10 layouts.
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

## Temporary play-test scaffolding — ONE LIVE
- **`DEBUG_SHAPE_KEY` in `PlayScene.js` — LIVE.** Pressing **`L`** rebuilds the room as a big room, carrying the run's items and health across, on a `combat_heavy`/`medium` plan so there are six enemies to watch find their way round the shape. Each press moves on to the next: **L → Z → T → G → corridor → L**. Take a door or press `R` to get back to an ordinary rectangular room. It is the only way into a big room: nothing rolls a shape yet. Fenced in `DEBUG` banners, warns on startup. **Remove it, `DEBUG_SHAPE_CYCLE`, and the key binding in `create()` and `update()`, once a door can lead to a big room.**
- Retired: the 5-enemies-on-entry hack is now the room plan's own count, the `P` debug shop key is unnecessary now that a gold door leads to one, and the `G` reward-drop key and its five extra trinkets were reverted.

## TODO — next features
- [x] ~~Introduce a single `gameState` object~~ — `freshGameState()` in `PlayScene` now holds `riskLevel`, `enemyStrength`, `rewardsCollected`, `inventory`, `cooldowns`. `bombs.js` is the last module still unwired.
- [ ] Implement the bomb: input binding (`SPACE` is held for it), AoE clear, refill-on-kill hook, and a HUD count — the bottom-left band has an empty stretch where the passive strip used to be.
- [x] ~~feed `enemyStrength` back into `enemyHpFor`~~ — done, via cursed reward pickups.
- [ ] Reward pickups with take/skip choice (the pickup exists; the choice UI does not).
- [x] ~~Inventory UI: 4+3 slot HUD, swap prompt, "you dropped X"~~ — done; the prompt needs more items before it can fire in play.
- [x] ~~More items~~ — 10 items now (6 passives, 4 actives), both racks fillable, treasure is a 2-way roll.
- [ ] Scale enemy HP or damage so the **set bonus** stops being invisible, and add a second set worth chasing.
- [ ] Enemy waves and multiple rooms (death/restart is done).
- [ ] A run that ends: depth counter, a boss or a final room. Doors chain forever right now.
- [ ] Title screen, so the pause menu's **Exit** has somewhere to go other than a fresh run.
- [x] ~~Room exit~~ — a cleared room opens the door row that carries the run into the next room.
- [x] ~~**Door telegraph**~~ — `doors.js`; 2-3 doors, colour = room type and always honest, glow = tier and also honest. The lie system it shipped with is deleted; the surprise is the room twist instead.
- [x] ~~Spawn weighting off `countOwned`~~ — `weights.js`; weight halves per copy held, wired into reward, treasure and shop rolls.
- [x] ~~EXP currency and a shop to spend it in~~ — `currency.js`, `shop.js`, shop room type, both refills, price table; guards come off the door tier, hold off until a purchase lands, and a visit buys exactly one thing.
- [x] ~~Vary room density~~ — `obstacles.js`; coverage rolled 0-33% per room instead of a fixed quarter, empty rooms included.
- [x] ~~Make drops rare~~ — `drops.js`; one kill in ten leaves half a heart, and nothing else. Rooms no longer start with treasure on the floor either.
- [ ] **Room-clear payout**: give a cleared room the treasure/reward drop that kills no longer make. `spawnTreasurePickup` and `spawnRewardPickup` are waiting, unreferenced, for exactly this.
- [x] ~~**Wire the big rooms into the scene**~~ — done for L: walls built from the mask, the mask fed to `generateObstacles` as the solid grid, the wall joined to the walk-line test so BFS routes round the concave corner, entry and exit doorways placed off the mask's own data, and the camera following the player. Z, T and G are still unreached.
- [x] ~~**Reach the big rooms in play**~~ - `rollRoomShape()`; a coin flip in the middle band of each floor, the four shapes draw evenly, shops and the boss room stay rectangular.
- [ ] **Tune the big-room band.** 3-7 at 50/50 is a first guess made without a long run behind it: it can deal five big rooms in a row, or none at all, and nothing scales the band with how a run is going.
- [ ] Rebalance the item economy around the 10% drop rate — four different actives is a long way off at 3.3% each.
