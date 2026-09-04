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

**What this needs that does not exist yet:** the project has **no asset pipeline at all** —
no image files, no `preload()`, no loader. This is the same gap the ambush sting has, which
is why that sound is synthesised from oscillators rather than loaded. Whichever of the two
lands first pays for the pipeline; the other becomes a one-line change.

**Where:** `announceTwist()` in `PlayScene.js`, and the `AMBUSH_PANEL_*` constants above it.

---

## Audio

### Replace the synthesised sting with a real file

Same root cause as the item above — no asset pipeline. `playAmbushSting()` builds a tritone
organ chord out of eight oscillators at call time precisely because there is nowhere to put
an `.ogg`. The whole method is replaceable by one `this.sound.play()` once a loader exists.

Keep the try/catch when it goes: audio fails for reasons outside the game — a blocked
browser, no output device, a context suspended before the first gesture — and a missing
sound must not take the ambush down with it.
