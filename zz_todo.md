# one-bomb-left — TODO

_Deferred work, kept out of `zz_status.md` because that file records what **is**, and this
one records what is **wanted**. Status stays a description of the build; this stays a list
of intentions. An item that lands moves out of here and into the status file as prose._

---

## Art

### Replace the ambush panel with a PNG window

**Now:** the AMBUSH message draws as a flat rectangle behind two text objects — near-black
navy `0x0f172a` at 0.3 alpha, sized at runtime to whatever the wrapped line laid out to.
It exists to stop red-on-red: an ambush drops nine red enemies into the room, and the red
message was landing on top of the very thing it was warning about.

**Wanted:** a real PNG window — a framed panel with the text drawn on top of it, rather
than a coloured rectangle.

**What the replacement has to keep:**

- **Screen-pinned, not room-placed.** `setScrollFactor(0)`. A big room scrolls, and the
  message belongs in front of the player's eyes rather than somewhere in the level.
- **Readable over red.** The whole reason the panel exists. Whatever the art does, the
  words have to survive nine `0xef4444` squares behind them.
- **The room still visible through it.** 0.3 was chosen so the player can see what they
  have walked into while reading what they walked into. A fully opaque window would take
  that away — worth deciding deliberately rather than by accident of the asset.
- **Sized to the text, not the other way round.** The line pool runs to 94 characters and
  wraps; the panel is measured off `displayWidth`/`displayHeight` after layout. A
  fixed-size window needs either a nine-slice or a guarantee that every line fits.
- **Under the text, over everything else.** Panel at `HUD_DEPTH + 1`, text at
  `HUD_DEPTH + 2`.
- **Gone on release.** It is handed to `freezeForAmbush`, which destroys everything it was
  given when the 500 ms freeze lifts. An asset that outlives the freeze is a bug.

**What this needs:** nothing structural any more. **The bullet sprite paid for the asset
pipeline** on 2026-09-06 — `PlayScene.preload()` exists, `public/sprites/` is served, and
`this.load.image()` is a line you can copy. This item is now just the art plus the sizing
decision above. (The ambush sting is still synthesised; audio has its own gap, below.)

**Where:** `announceTwist()` in `PlayScene.js`, and the `AMBUSH_PANEL_*` constants above it.

---

### Sparkle trail behind the projectile

**Built, seen, and reverted on 2026-09-06** — wanted, but not now. It is part of a future
**projectile upgrade**, not a change to the base shot: the plain sprite is what an
un-upgraded bullet should look like, and the sparkles are what earning the upgrade buys.

**Lifetime is settled: 1.5 s.** The trial ran a random 1-3 s and that was too long — a
bullet only lives ~690 ms, so the trail outlasted the shot by several times over and
sustained fire left the room glittering. 1.5 s still outlives the bullet, which is the
point of a trail, without the room holding onto it. **Use a flat 1.5 s, not a range.**

**What the trial did, and what to keep of it:**

- One small circle shed **every 35 ms** along the flight, not per frame — at 490 px/s a
  bullet covers ~17 px between frames, so per-frame spawning draws a solid line and puts
  three times the sparkles on screen for no more effect.
- Radius rolled **1-3.5 px**, position offset up to **8 px off the line of travel** so the
  trail has width instead of reading as a drawn stroke.
- Colour drawn from white, pale blue `0xe0f0ff`, and two violets — the same pale/violet
  pairing as the abandoned tint flicker, which is the palette the pact instability idea
  keeps arriving at.
- Fades **and shrinks** together, drifting up to 16 px as it goes. Fading alone leaves a
  full-size ghost.
- Depth **-1**, behind bullets, enemies and pickups.

**Two things that are not optional when it comes back:**

- **Kill the tween before destroying the sparkle.** A fade tween holds a reference and
  will go on writing `x`/`y` to a destroyed circle. The trial cleared sparkles on game
  over through a `clearSparkles()` that killed tweens first.
- **Nothing else reaps these.** They are not in `this.bullets`, so `endGame()` and any
  other projectile clear has to be told about them explicitly.

**Cosmetic, so `Math.random()` is fine** — it feeds no decision a test could pin down. Same
reasoning as the rest of the render-only code.

**Where:** `fire()` and `updateProjectiles()` in `PlayScene.js`. The trial was written as a
self-contained block tagged `SPARKLE TRAIL (preview)`; it is not in git history, so it
starts from this description.

---

## Narrative

### Beating a boss should open a cutscene and a memory unlock

**Deliberately not stubbed.** Clearing a boss currently opens one plain pad - the same
neutral visual the corridor exit uses - which calls `advanceFloor` and drops the player into
room 1 of the next floor. That is the whole of it, and it is honest about being the whole of
it: a half-built cutscene hook is harder to replace than a door.

What it should eventually be: beating a boss triggers a **cutscene** and unlocks a
**memory**. That is lore and narrative content and needs its own design pass before any of
it is built - what a memory is, where they are held, whether they persist across runs, and
what the cutscene is actually made of are all open questions that the floor structure has no
business answering.

**Where:** `openFloorExit()` and `descend()` in `PlayScene.js`, both tagged with a TODO
pointing here. The boss room itself is `BOSS_PLAN` in `doors.js` - an empty stub, in the
same register as the puzzle room, with no enemies and nothing to clear.

---

## Audio

### Replace the synthesised sting with a real file

`playAmbushSting()` builds a tritone organ chord out of eight oscillators at call time
because there was nowhere to put an `.ogg`. There is a loader now — see the item above —
so the whole method is replaceable by one `this.sound.play()` plus a `this.load.audio()`.

Keep the try/catch when it goes: audio fails for reasons outside the game — a blocked
browser, no output device, a context suspended before the first gesture — and a missing
sound must not take the ambush down with it.
