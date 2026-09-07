import Phaser from 'phaser'
import { cooldownRemaining, triggerActive } from './actives.js'
import {
  BULLET_LIFETIME,
  BULLET_RANGE,
  BULLET_SPEED,
  ENEMY_SHOT_LIFETIME,
  ENEMY_SHOT_RANGE
} from './bullets.js'
import { addExp, spendExp } from './currency.js'
import { computeStats } from './effects.js'
import { computeGapNudge } from './gapAssist.js'
import { grantItem } from './grant.js'
import { countOwned, hasSetBonus, passiveCounts } from './inventory.js'
import { ITEMS, SET_BONUS, itemsFrom } from './items.js'
import {
  canAfford,
  priceOf,
  purchaseBlockedReason,
  rollWakeCount,
  STATUE_COUNT,
  rollShopStock,
  sellableItems,
  shelfLabelFor
} from './shop.js'
import {
  BOSS_PLAN,
  DOOR_STYLE,
  ENTRANCE_PLAN,
  TIER_GLOW,
  TWISTED_PLAN,
  assignTwistDispositions,
  pickTwistLine,
  rollTwist,
  roomPlanFor,
  rollDoors
} from './doors.js'
import { BOSS_DOOR, doorPolicyFor } from './floors.js'
import { arenaBossSpawn, arenaEntry, generateArenaObstacles, rollSymmetry } from './arena.js'
import { DEBUFF_DROP, rollRoomDrop } from './drops.js'
import { advanceFloor, recordTwist, roomFor } from './run.js'
import { HEAL_DROP, rollEnemyDrop } from './drops.js'
import { NEIGHBOURS, generateObstacles, rollCoverage } from './obstacles.js'
import { generateCorridorObstacles, generateCorridorRoom } from './corridor.js'
import { ROOM_SHAPES, rollRoomShape } from './shapes.js'
import {
  cellCentre,
  doorCells,
  innerCell,
  roomSize,
  solidGrid,
  splitDoors,
  wallCells
} from './shapeRoom.js'
import { edgePoint } from './pings.js'
import { pickWeighted, weightedPassivePool } from './weights.js'
import { applySwap, needsSwapPrompt, swapOptions } from './swap.js'

// --- WORLD SCALE ---------------------------------------------------------------------
// Back to 1:1. A 24x15 room at 56 px a cell is 1344x840, which is exactly the canvas, so
// the room fills the screen with nothing cropped and nothing to scroll - the arrangement
// the game was originally tuned around, arrived at again from the other direction.
//
// The route here is worth keeping, because each step was ruled out by looking at it: 4x
// made a room six cells of viewport and turned combat into shooting the whole screen;
// 1.68x (a 94 px cell, the player's own size) still overflowed the canvas; 0.56x fit the
// room inside the screen with a wide dead margin around it and shrank the portrait back to
// an unreadable 31 px smudge. Filling the screen is what fixes the last of those, and at
// this grid it pins the cell to 56 exactly.
//
// So every spatial number below is simply its original value. Anything measured in cells
// never moved through any of this - room masks, corridor widths, obstacle coverage.
// --- end world scale -----------------------------------------------------------------

// The grid cell, and the first constant here because the player is measured off it - one
// block is one avatar. It used to sit down beside the pathing numbers, which was fine
// while nothing above it read it.
const CELL = 56
const PLAYER_SPEED = 320
// How hard gap assist leans at full tilt, as a share of walking pace. See gapAssist.js for
// what it is solving; this is the half of it that has to be felt rather than reasoned
// about. It is a ceiling rather than a constant now - the module returns a fraction that
// falls away as she lines up with the gap, so this is only reached while she is actually
// off centre and only inside a one-cell gap.
//
// It is a share of PLAYER_SPEED rather than of this.stats.moveSpeed, so the lean is the
// same shove whatever the player is wearing. A corner catches at a fixed offset - it is
// geometry, not momentum - so the correction that clears it should not shrink because a
// Heavy Vest slowed her down. The cost is that the assist is a slightly larger fraction of
// a slow player's movement than a fast one's, which is the right way round if either.
const GAP_ASSIST_STRENGTH = 0.18
// How far the display outruns what the game draws. A 2x screen presents a 1344x840 canvas
// across 2688x1680 physical pixels and the compositor invents the difference, which is
// invisible standing still and turns to mush the moment the camera scrolls - the whole of
// the "big rooms and corridors are blurry" bug, and the reason nothing about textures or
// pixel-snapping touched it. So the canvas is built RENDER_SCALE times larger and the
// camera is zoomed by the same amount: **the world keeps its 1344x840 coordinate space**,
// every room, hitbox and tuned number stays what it was, and each pixel drawn lands on a
// real one instead of being stretched over four.
//
// Integer, because a fractional zoom resamples everything it draws and hands back some of
// what this buys. Capped at 2 - past that the fill rate quadruples again for a difference
// nobody can see. 1 on an ordinary display, where the whole thing is a no-op.
//
// Two things follow from the zoom and are easy to forget: `this.scale.width/height` are
// canvas pixels rather than world units (see viewSize()), and a Text object's glyphs are a
// texture like any other, so they need rendering at this resolution too (see crispText()).
export const RENDER_SCALE =
  typeof window === 'undefined' ? 1 : Math.min(Math.ceil(window.devicePixelRatio || 1), 2)
// **What is drawn is what collides.** The sprite used to be deliberately wider than the
// body - a 56 px drawing on a 39 px box - on the reasoning below, which is sound and which
// this now gives up: a body narrower than the art means the art overlaps whatever stops
// her, and a standing figure overlapping a wall she is not touching looks broken in a way
// that a slightly generous hitbox never did.
//
// The old reasoning, kept because it is the cost of this: a hitbox that matches the sprite
// is the honest choice right up until the player starts losing half-hearts to shots that
// visibly missed - the corner is the part that gets clipped, and it is the part the eye
// does not count as "you". Expect her to take hits on her hair and her hem now.
//
// This does not reopen the wall-pocket exploit. That was fixed by making the wall bodies
// fill the whole 56 px blocked ring (WALL_THICKNESS = CELL), so a smaller player simply
// stands nearer the wall face - still in an open cell, with nothing to squeeze into.
// One drawing per facing. She turns to whichever way she is shooting, which is the arrow
// keys - movement is WASD and does not turn her, so you can back away from something while
// still facing it.
const PLAYER_FACINGS = ['right', 'left', 'up', 'down']
// Where she looks before anything has been shot. Right, because av_right.png is the pose
// the character was drawn in and the one every earlier build showed.
const PLAYER_FACING_DEFAULT = 'right'
// The loaded key and the trimmed copy she is actually drawn with, per facing - see
// trimTransparent(). Built rather than written out so a facing cannot be added in one
// place and forgotten in the other.
const PLAYER_TEXTURE = Object.fromEntries(
  PLAYER_FACINGS.map((facing) => [facing, `av_${facing}`])
)
const PLAYER_TEXTURE_CUT = Object.fromEntries(
  PLAYER_FACINGS.map((facing) => [facing, `av_${facing}_trimmed`])
)
// Drawn at 94 px - three times the 32 px block it replaces. A face has to be legible to
// read as a face, and 32 px of a 1254 px portrait is a smudge. Unlike every other sprite
// in the game this one is very nearly its own hitbox: 94 drawn against 90 collided with,
// so what you see is what you bump into.
// **Height, and it is the long side.** av_full.png is a standing figure, about 4 wide to 7
// tall once the transparent margin is trimmed off, so height is what decides whether she
// fits through anything. Sized off it at 46 - a little over 4/5 of a cell - which leaves
// 10 px of clearance in a one-cell gap and makes her about 26 px across.
//
// She was one full block wide before, which drew her larger than the block she stood in
// and overlapped every rock and wall she walked up to. Smaller is the point of this.
const PLAYER_SPRITE_HEIGHT = 46
// The player's nominal size, used for the muzzle offset and the reveal ring.
const PLAYER_SIZE = PLAYER_SPRITE_HEIGHT
// How opaque a pixel has to be to count as part of the art when trimming. Not zero: the
// export carries a faint halo of nearly-transparent pixels that reaches almost to the
// canvas edge, and trimming on "any alpha at all" keeps 1157 px of a 1254 px image. At 16
// the figure measures 707x1238, which is what is actually drawn.
const SPRITE_ALPHA_THRESHOLD = 16
const BULLET_RADIUS = 5
const BULLET_TEXTURE = 'bullet'

// Room art. The flat colours these replace are gone with them - there was never a fallback
// path that would have used them, so keeping them would have left three constants
// describing what the room used to look like.
//
// The `wood_` prefix was the first theme's, and the seam a theme pool would have used. The
// tight re-cuts do not carry it, so wall/rock/pit are now plain names and only the exit is
// still prefixed - the seam is half gone rather than deliberately dropped. See zz_todo.md.
const WALL_TEXTURE = 'wall_tight'
// The wall art carries an alpha channel and a ragged silhouette: the planks do not fill
// their tile, and the edges are broken rather than square. Tiled, that leaves the backing
// slab showing through in gaps along every seam.
//
// The slab cannot be removed - without it the room shows through the holes - so the fix is
// to make it stop reading as a hole. Slate `0x4b5563` was the wall's own colour back when
// the wall *was* a flat rectangle, and against wood it reads as a bright slot punched
// through the planks. A dark wood shadow instead: the same gaps become the dark between
// boards, which is what the eye expects to find there, and the wall reads as continuous.
const WALL_BACKING_COLOR = 0x2a2119
// How many grid cells one repeat of a room texture covers - walls, rocks and pits alike.
//
// **One**, so a whole PNG lands on exactly one block. This was 4 for the first art set, on
// the reasoning that repeating per cell made an eight-cell rock clump read as eight
// identical stamps rather than one mass of rock - true of a texture that was cut to be
// zoomed into, and a quarter of the image was all a 56 px block ever showed.
//
// The `_tight` re-cuts are drawn as a block rather than as a surface to sample, so the
// original argument no longer applies to them: at 4 a block showed a quarter of the art
// and the drawing came out larger than the cell it sat in.
const TILE_CELLS = 1
// A few degrees of turn on each rock and pit cell, rolled per cell, so a clump reads as a
// mass of rock rather than the same stamp repeated in a grid - the objection that used to
// be answered by sampling one texture across four cells.
//
// Rotating a square inside its own cell would swing its corners in and leave the cell's
// corners bare, so the tile is drawn oversized by exactly enough to cover them:
// cos(a) + sin(a) is the width a rotated unit square needs. At 5 degrees that is 1.09, so
// a tile spills about 2 px past its cell - into a neighbouring rock, or onto floor at the
// edge of a clump, which is what stops the grid reading as a grid.
//
// Static bodies do not rotate, so nothing here touches what a shot or a foot collides
// with. It is paint.
const TILE_TURN_MAX = 5
const TILE_TURN_COVER =
  Math.cos(Phaser.Math.DegToRad(TILE_TURN_MAX)) + Math.sin(Phaser.Math.DegToRad(TILE_TURN_MAX))

const EXIT_TEXTURE = 'wood_exit'
const ROCK_TEXTURE = 'rock_org'
// rock_org.png is the untrimmed export, and its art stops short of the frame: measured,
// it fills 0.926 of the width and 0.953 of the height, with a hard transparent margin
// rather than a halo. TILE_TURN_COVER is calibrated for a tile whose art reaches the edge,
// so at 0.926 the effective cover falls to 1.0834 x 0.926 = 1.003 - the rolled turn then
// bares the cell's corners and a clump reads as separate stones with floor between them.
//
// 1/0.926 = 1.08 restores what rock_tight.png drew; the rest is deliberate overlap, so
// neighbours meet instead of merely touching.
//
// **Visual only.** paintShape puts the body back to the cell with setSize either way, so
// this cannot change what the player collides with - see the warning down there about
// updateFromGameObject.
const ROCK_OVERDRAW = 1.15
// How much of a tile's width its corner radius is. Two per cent of 1254 px of source is
// about 25 px, which lands as a bit over a pixel once a cell is 56 - just enough to take
// the point off a square corner without the tile reading as a pebble.
const TILE_CORNER_FRACTION = 0.02
const PIT_TEXTURE = 'pit_tight'
// Every room texture gets the same treatment, so the rounding is a property of the room
// rather than of rock in particular. The keys the room is actually drawn with are these
// rounded copies - see roundCorners().
const ROUNDED = {
  [WALL_TEXTURE]: 'wall_tight_round',
  [ROCK_TEXTURE]: 'rock_org_round',
  [PIT_TEXTURE]: 'pit_tight_round'
}
// The sprite is drawn far larger than the shot it stands for. Its hitbox stays the 10 px
// box the old circle had - see fire() - so this size is purely visual.
const BULLET_SPRITE_SIZE = 75
const BULLET_ALPHA = 0.9
// Half the base fire rate, which is double the wait between shots. Items still layer on
// top of this - see computeStats() - so the shop's cooldown rolls scale from here.
const FIRE_COOLDOWN = 360
const MUZZLE_OFFSET = PLAYER_SIZE / 2 + BULLET_RADIUS
const ENEMY_SIZE = 36
const ENEMY_SPEED = 120
const ENEMY_BASE_HP = 10
// Slug Step's enemy. It crawls at a share of the player's *current* speed, so a run that
// buys boots is chased faster and a run that picks up Sluggish is chased slower - the
// debuff scales with you rather than being outrun and forgotten. It never shoots; the
// only way it hurts you is by catching you.
const SLUG_SPEED_SHARE = 0.3
const SLUG_COLOR = 0x9333ea
const EXP_PER_KILL = 2
const ENEMY_SHOT_SPEED = PLAYER_SPEED * 0.65
const ENEMY_SHOT_RADIUS = 7
const ENEMY_SHOT_COLOR = 0xfb923c
const ENEMY_FIRE_COOLDOWN = 1400
const ENEMY_MUZZLE_OFFSET = ENEMY_SIZE / 2 + ENEMY_SHOT_RADIUS
const HIT_COOLDOWN = 600
const DOORWAY_WIDTH = 140
const DOORWAY_MARGIN = 40
const ENTRY_LINE_OFFSET = 140
const MIN_SPAWN_DISTANCE = 260
const MAX_HP = 6
const HP_PER_HEART = 2
// What a heal pickup is worth: half a heart. It used to refill the bar outright, which
// made one lucky drop undo a whole room and left HP with nothing to say between "fine"
// and "dead". Half a heart is a nudge, so healing is something you collect rather than
// something that resets you.
const HEAL_PICKUP_HP = HP_PER_HEART / 2
const DAMAGE_PER_HIT = 1
const HP_SEGMENT_WIDTH = 26
const HP_SEGMENT_HEIGHT = 22
const HP_SEGMENT_GAP = 2
const HP_HEART_GAP = 9
const BAR_PADDING = 5
const HP_FULL_COLOR = 0xf87171
const HP_EMPTY_COLOR = 0x3f3f46
const BAR_TRACK_COLOR = 0x1f2430
const BAR_EDGE_COLOR = 0x565f72
const DETOUR_CLEARANCE = 8
const PATH_LOOKAHEAD = 6
// The wall bodies fill the grid's whole blocked border ring rather than sitting a thin
// strip inside it. Physics and pathing then agree on exactly which cells are solid: with
// a 24 px wall the leftover 32 px of the border cell was a corridor the 32 px player fit
// into and the 36 px enemy did not, so a rock in the next cell in made an invincibility
// pocket - unreachable on foot and, often enough, out of the enemy's shot line too.
const WALL_THICKNESS = CELL
// The rectangle room's dimensions, in cells - the same 24x15 it always was. It was implied
// by the canvas size before, back when one cell was 56 px and 24x15 of them came to
// exactly 1344x840.
const BASE_ROOM_COLS = 24
const BASE_ROOM_ROWS = 15
const PICKUP_SIZE = 24
const PICKUP_CURSED_COLOR = 0xa855f7
const PICKUP_TREASURE_COLOR = 0xfbbf24
const PICKUP_DROPPED_COLOR = 0x94a3b8
const PICKUP_SHOP_ITEM_COLOR = 0x38bdf8
const PICKUP_HP_REFILL_COLOR = 0xf87171
const PICKUP_BOMB_REFILL_COLOR = 0xf97316
// Stock is laid out on one shelf line across the room, at this fraction of the height -
// high enough to read as a counter you walk up to, clear of the exit pad at the top.
const SHOP_SHELF_Y = 0.42
const SHOP_SHELF_MARGIN = WALL_THICKNESS + 60
// Two enemies, not the usual one: a shop is a detour, so the toll for a guarded one is a
// step up.
// The overlap re-fires every frame, so a refused purchase only speaks this often.
const SHOP_DENY_COOLDOWN = 1200
const EXIT_SIZE = CELL - 8
// Doors sit along the top of the room, clear of the walls, spread like the shop shelf.
const DOOR_MARGIN = WALL_THICKNESS + 90
const DOOR_ROW_Y = CELL * 1.5
// How far a door pad may be nudged from where it was aimed. Without a limit the snap to a
// clear cell would walk a pad as far as it had to - measured at two thirds of the way down
// an 840 px room - and a door standing in open floor is taken by anyone who walks over it.
// Two cells keeps it in the wall band it belongs to.
const DOOR_SNAP_LIMIT = CELL * 2
// A door does not work until the player is clear of it. A pad that opens on top of you
// would otherwise fire on the same frame it appeared, taking the choice before it was
// shown - which is the whole point of the door row.
const DOOR_ARM_DISTANCE = 90
// How far in from the wall a shaped room's entry drops the player, and how wide a patch
// around them is kept clear of obstacles - the shaped-room answer to the rectangle's
// doorway channel.
const ENTRY_INSET = 2
const ENTRY_CLEARANCE = 2
// How hard the camera chases the player once a room is bigger than the viewport. Low
// enough to lag behind a sprint and let the room read as somewhere you are moving through.
const CAMERA_LERP = 0.12

// ===== DEBUG / TEMPORARY - remove before shipping ===========================
// L rebuilds the room as a big room from shapes.js, carrying the run's items and health
// across, and each press moves on to the next shape: L, Z, T, G, then round to L again.
// Nothing rolls a shape yet - this key is the only way into one. Take a door or press R
// to get back to an ordinary rectangular room. Tracked in the cleanup TODO in
// zz_status.md.
const DEBUG_SHAPE_KEY = true
const DEBUG_SHAPE_CYCLE = ['L', 'Z', 'T', 'G', 'corridor']
// A packed room, not the entrance's single enemy: the point of walking the L is watching
// several of them find their way round its corner.
const DEBUG_SHAPE_PLAN = { type: 'combat', tier: 'medium' }

if (DEBUG_SHAPE_KEY) {
  console.warn(
    '[one-bomb-left] DEBUG: key L rebuilds the room as the L-shaped big room. ' +
      'Temporary - see the cleanup TODO in zz_status.md.'
  )
}
// ===== end DEBUG ============================================================
// A corridor has no kind - no safe or risky or shop variant - so it does not go through
// roomPlanFor and never appears in REWARD_TYPES. It is the same connector every time: a
// couple of enemies, which in a hallway three cells wide is a real obstacle rather than a
// fight, and nothing to hand out at the end of it.
const CORRIDOR_PLAN = {
  type: 'corridor',
  tier: 'easy',
  roomType: 'corridor',
  enemyCount: 2,
  enemyStrengthBonus: 0
}

// The corridor's way on. A pad the size and shape of any other door, so it reads as
// somewhere to walk into - and deliberately nothing else. No reward colour, no tier glow,
// no pulse, no label: the telegraph already spoke when the player took the door that led
// into this corridor, and the room it named is still the room they are walking toward. A
// badge here would be that promise made twice, or worse, a second choice that is not
// really on offer. Plain slate, the colour of the walls rather than of any door type.
// The ambush sting. A low A, and every voice above it drawn from the tritone - the
// interval the medieval church is supposed to have called the devil in music - so the
// chord cannot resolve and does not want to. Root, tritone, octave, tritone again an
// octave up: an organ stack that is deliberately wrong.
//
// It was a plain octave drop first, which read as a UI error tone rather than as a
// threat. What makes this one gothic is the dissonance and the length: it swells instead
// of clicking, holds while the player reads the word, and sinks a little flat as it goes.
const AMBUSH_STING_HZ = 55
const AMBUSH_STING_MS = 1600
// Ratios off the root. 1.4142 is the tritone; the pair of them an octave apart is what
// gives the chord its howl rather than a hum.
const AMBUSH_STING_VOICES = [1, 1.4142, 2, 2.8284]
// Each voice is doubled a few cents out, so the two beat against each other. A single
// clean oscillator per note sounds synthetic; a pair sounds like something breathing.
const AMBUSH_STING_DETUNE = 0.006
// Everything slides this far flat over the sting's length. A pitch that sags reads as
// something failing rather than as a note being played.
const AMBUSH_STING_SAG = 0.92

// The freeze. The room stops while the word is on screen, so an ambush is a beat rather
// than a line of text you read while being shot at.
//
// **One length for every line, set by the longest.** It was 500 ms when the message was a
// single short fixed string, then scaled per character once the pool arrived - but the
// scaling bought little: the pool runs 28 to 94 characters, so it only ever moved between
// 2.2 and 3.4 seconds, and the short lines were never the ones anybody struggled with. A
// flat number long enough for the worst case is simpler and reads the same.
//
// Deliberately generous. This is a surprise: the player is not braced to read, has just
// been told they were tricked, and is looking at nine enemies. Reaction time comes out of
// the same budget as reading time.
const AMBUSH_FREEZE_MS = 3500

// The shake does **not** scale with it. It is the hit, not the reading - a jolt that lasted
// three seconds would be motion sickness rather than impact.
const AMBUSH_SHAKE_MS = 300

const AMBUSH_TEXT_SIZE = '52px'
const AMBUSH_SUBTEXT_SIZE = '20px'
// Room to breathe either side of the wrapped line, so it never runs to the wall.
const AMBUSH_TEXT_MARGIN = 240

// A panel behind the words. Red text over red enemies is the same colour twice, and an
// ambush drops nine of them into the room the message is trying to be read in - so the
// letters were landing on top of the very thing they were warning about.
//
// Near-black navy rather than pure black: it sits in the same slate family as the walls
// and the HUD plates, so it reads as part of the interface rather than as a hole. Light
// enough at 0.3 that the room stays visible through it - the player should be able to see
// what they have walked into while they read what they walked into.
const AMBUSH_PANEL_COLOR = 0x0f172a
const AMBUSH_PANEL_ALPHA = 0.3
const AMBUSH_PANEL_PAD = 24

// Statues: the shop's guardians before they are guardians. Stone rather than enemy red,
// because an enemy that is not going to move yet must not read as one that is - and
// deliberately not scenery either, so the player can see what buying will wake.
const STATUE_COLOR = 0x7c7f8a
const STATUE_ALPHA = 0.85

const CORRIDOR_EXIT_COLOR = 0xcbd5e1
const CORRIDOR_EXIT_ALPHA = 0.22
const CORRIDOR_EXIT_STROKE = 3

const DROP_OFFSET = 84
// A declined or just-dropped pickup stays inert until the player is this far from it, so
// the prompt cannot re-open on the spot and a swap cannot be undone by standing still.
const PICKUP_REARM_DISTANCE = 78

// The reveal beat. An item on the floor shows its colour and nothing else; what it *is*
// arrives a moment after you touch it, along with the effect itself, so what you see and
// what you get land together instead of the stats moving silently before you know why.
//
// 400 ms: under about a quarter second it reads as the game stuttering rather than as a
// moment, and much over half a second it starts costing dodges - the room does not pause
// for this, and it can happen mid-fight.
const REVEAL_MS = 400
const REVEAL_SCALE = 1.9
const REVEAL_RING_SCALE = 2.8
const REVEAL_RING_COLOR = 0xf8fafc

// Placeholder icons. Shape is the tier and colour is the item - see the icon note in
// items.js. One drawing routine, used both on the floor and in the pause menu, so the
// thing you picked up and the thing in your list are visibly the same object.
const ICON_EDGE_COLOR = 0xf8fafc
const PAUSE_ICON_SIZE = 24
const PAUSE_ICON_STEP = 46
const PAUSE_ICON_PER_ROW = 9
const PAUSE_ICON_ROW_HEIGHT = 42

// Off-screen enemy arrows. Only a big room can hide an enemy - a rectangular room is the
// viewport - so these only ever appear in one. The ring is inset far enough that a whole
// arrow fits on screen, and they draw over the HUD rather than under it: an arrow half
// swallowed by the health bar reads as a glitch, and the ring crosses both wall bands.
const PING_SIZE = 15
const PING_MARGIN = 30
const PING_COLOR = 0xef4444
const PING_ALPHA = 0.9

const SLOT_SIZE = 40
const SLOT_GAP = 6
const HUD_EDGE_MARGIN = 14
const SLOT_EMPTY_FILL = 0x161b26
const SLOT_EMPTY_EDGE = 0x39414f
const SLOT_FILLED_FILL = 0x2b3444
const SLOT_FILLED_EDGE = 0x8792a6
const SLOT_READY_EDGE = 0xa3e635
const SLOT_VEIL_COLOR = 0x05070c
const HUD_DEPTH = 20
const PROMPT_DEPTH = 100
const SWAP_PANEL_WIDTH = 700
const PAUSE_PANEL_WIDTH = 620

// Resume and Exit only. No 'options' entry until there are options to put behind it - a
// row that does nothing is worse than a row that is not there.
const PAUSE_ENTRIES = [
  { id: 'resume', label: 'Resume' },
  { id: 'exit', label: 'Exit run' }
]

// Initials read better than a truncated name in a 40 px box: Iron Plating -> IP. A
// single-word name has no initials to take, so it keeps its first two letters instead of
// shrinking to one lonely character: Bulwark -> BU.
const abbreviate = (name) => {
  const words = name.split(' ')
  const initials = words.length > 1 ? words.map((word) => word[0]).join('') : name.slice(0, 2)

  return initials.slice(0, 3).toUpperCase()
}

const PANIC_RADIUS = 240
const PANIC_DAMAGE = 3
const PANIC_PUSH_SPEED = 560
const PANIC_PUSH_DURATION = 260
const SECOND_WIND_HEAL = 1
const REPAIR_KIT_HEAL = 2
const BULWARK_DURATION = 2500
const TOAST_LIFETIME = 2800
// A second line above the ordinary toast, for the two things the player must not miss:
// what a door lied about, and what an item turned out to be. It needs its own slot
// because the toast is a single shared one and gets overwritten - a room with nothing
// left in it fires "room clear - N doors" on its first frame, which was swallowing both
// of these, including the confirmation the player had just waited out a reveal for.
const NOTICE_OFFSET = 104
const NOTICE_LIFETIME = 5200

// The unmodified player. Items are layered on top of this by computeStats().
const BASE_STATS = {
  maxHp: MAX_HP,
  fireCooldown: FIRE_COOLDOWN,
  moveSpeed: PLAYER_SPEED,
  damage: 1,
  expPerKill: EXP_PER_KILL
}

// Enemy toughness comes off the door's tier and nothing else, now that the curse system
// that used to stack on top of it is gone.
function enemyHpFor(strengthBonus) {
  return ENEMY_BASE_HP + strengthBonus
}

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('play')
  }

  // The only loaded asset in the game - everything else is drawn with shape primitives.
  preload() {
    this.load.image(BULLET_TEXTURE, 'sprites/bullet.png')
    PLAYER_FACINGS.forEach((facing) =>
      this.load.image(PLAYER_TEXTURE[facing], `sprites/av_${facing}.png`))
    this.load.image(WALL_TEXTURE, 'sprites/wall_tight.png')
    this.load.image(EXIT_TEXTURE, 'sprites/wood_exit.png')
    this.load.image(ROCK_TEXTURE, 'sprites/rock_org.png')
    this.load.image(PIT_TEXTURE, 'sprites/pit_tight.png')
  }

  // A world-anchored tiled surface. **The anchoring is the point**: a tileSprite starts
  // its texture at its own top-left by default, so every piece would begin the pattern
  // again - four slabs around a rectangular room, one per cell in a shaped one, one per
  // cell of a rock clump - each showing the same corner of the same tile. Offsetting by
  // world position makes them all windows onto one continuous surface, so a clump of rock
  // reads as a mass and a wall reads as a wall rather than as a row of stamps.
  tiledSurface(x, y, width, height, texture) {
    const tile = this.add.tileSprite(x, y, width, height, texture)
    const scale = this.tileScaleFor(texture) * TILE_CELLS

    tile.setTileScale(scale)
    tile.setTilePosition((x - width / 2) / scale, (y - height / 2) / scale)

    return tile
  }

  // How far a source image has to shrink to draw one grid cell. The art is authored large -
  // 1254 px square, the same convention the bullet uses - and the game is a 56 px grid, so
  // everything that fills a cell is scaled by this rather than by a number typed in.
  tileScaleFor(texture) {
    return CELL / this.textures.get(texture).getSourceImage().width
  }

  // A restart hands the next room the plan the chosen door resolved to, plus the state
  // to keep. Plain restart() passes nothing and starts a fresh run in the entrance room.
  init(data) {
    // Everything about which room this is comes out of the payload in one place, so
    // "continue the run" and "start a new one" are one decision rather than four.
    const room = roomFor(data)

    this.roomPlan = room.plan
    this.roomType = room.roomType
    // A corridor is rolled rather than looked up: its mask is generated, so there is no
    // entry in ROOM_SHAPES to find. Rolled once here, in init, so it is settled before
    // create() reads it and stays the same room for as long as the player is in it.
    this.shape = this.shapeFor(room.shapeId)
    // A boss arena is generated rather than looked up, so its symmetry is rolled here in
    // init - settled before create() reads it, the same way a corridor's mask is. The last
    // one is remembered on the run so two arenas running do not come out the same shape.
    this.symmetry =
      room.roomType === 'boss'
        ? rollSymmetry(this.gameState.lastArenaSymmetry, Math.random)
        : null

    if (this.symmetry) {
      this.gameState.lastArenaSymmetry = this.symmetry
    }
    this.gameState = room.gameState
    this.startHealth = room.health
    this.twisted = room.twisted
    // The room this corridor is on the way to, if this is one.
    this.pending = room.pending
  }

  // Where the camera is allowed to look, which is not the same as where the room is.
  //
  // Phaser keeps the camera inside its bounds, and a clamp with nothing to give pins it at
  // the near edge: hand it a 280 px wide corridor and the camera sticks at scrollX 0, so
  // the room draws hard against the left of a 1344 px viewport however the player moves.
  // Nothing here was computing an offset and getting it wrong - there was no offset.
  //
  // So an axis where the room is smaller than the screen gets the *screen's* size for its
  // bounds, with the slack hung evenly off both sides; the clamp then has exactly one
  // position to settle on, and that position is centred. An axis where the room is at
  // least as big as the screen is untouched and scrolls as it always did - which is every
  // axis of every rectangular and big room, so none of them move.
  // The viewport in **world units**. `this.scale.width/height` are canvas pixels, which
  // RENDER_SCALE times overstates the world the camera actually shows - so anything laying
  // out against the edge of the screen has to come through here rather than off the canvas.
  // Text at the display's real resolution. A zoomed camera scales a Text object's texture
  // like any other sprite, so glyphs rasterised at 1x would come out softer than they were
  // before the zoom existed. Phaser forces resolution to 1 when it is left at 0 and has no
  // game-wide setting for it, so every text object in the scene is built through here.
  crispText(x, y, message, style) {
    return this.add.text(x, y, message, { ...style, resolution: RENDER_SCALE })
  }

  viewSize() {
    return {
      width: this.scale.width / RENDER_SCALE,
      height: this.scale.height / RENDER_SCALE
    }
  }

  cameraBoundsFor(width, height) {
    const view = this.viewSize()

    return [
      Math.min(0, (width - view.width) / 2),
      Math.min(0, (height - view.height) / 2),
      Math.max(width, view.width),
      Math.max(height, view.height)
    ]
  }

  shapeFor(shapeId) {
    if (!shapeId) {
      return null
    }

    return shapeId === 'corridor' ? generateCorridorRoom(Math.random) : ROOM_SHAPES[shapeId]
  }

  // Takes the point off a texture's corners, once, and hands back the key of the rounded
  // copy. The rounding is cut out of the alpha channel rather than drawn on, so whatever is
  // behind the tile shows through the corner instead of a colour that has to be guessed.
  //
  // The tile repeats once per cell, so this rounds every stamp rather than the mass as a
  // whole: inside a rock clump the neighbouring corners round away from each other and
  // leave a small dark pinch at the junction, which is the join between two rocks and reads
  // as one. That only works while the radius is small - this is not a knob to turn up far.
  //
  // The wall is the one to watch. It is a long slab rather than a grid of cells, so its
  // repeats round against each other along its length and put a pinch every 56 px into a
  // surface that is meant to read as continuous. At two per cent that is about a pixel and
  // it passes for a join between boards; turned up it will look like the gaps that the
  // backing colour was darkened to hide.
  roundCorners(sourceKey, roundedKey, fraction) {
    if (this.textures.exists(roundedKey)) {
      return roundedKey
    }

    const source = this.textures.get(sourceKey).getSourceImage()
    const canvas = this.textures.createCanvas(roundedKey, source.width, source.height)
    const { context } = canvas

    context.drawImage(source, 0, 0)
    context.globalCompositeOperation = 'destination-in'
    context.beginPath()
    context.roundRect(0, 0, source.width, source.height, source.width * fraction)
    context.fill()
    context.globalCompositeOperation = 'source-over'
    canvas.refresh()

    return roundedKey
  }

  // Trims a texture to the part of it that is actually drawn, once, and hands back the key
  // of the trimmed copy.
  //
  // This used to key out black as well, because the first avatar export was RGB with the
  // head sitting on an opaque black field. **The art carries a real alpha channel now, and
  // keying black would be actively destructive** - av_full.png is 13.6% near-black opaque
  // pixels, which is her hair and her dress, and cutting on colour would punch holes
  // straight through the character. Alpha is the only thing consulted here.
  //
  // The trim is what matters for how the game feels. The figure sits in the middle of a
  // 1254 px square with a wide transparent margin; without trimming, a 56 px sprite is
  // maybe 34 px of character inside 22 px of nothing, and the player stops a visible gap
  // short of every wall she is flush against. Trimming makes the drawn size mean the
  // character.
  //
  // One pass over the pixels at load, guarded on the key because create() runs per room.
  trimTransparent(sourceKey, trimmedKey) {
    if (this.textures.exists(trimmedKey)) {
      return trimmedKey
    }

    const source = this.textures.get(sourceKey).getSourceImage()
    const scratch = document.createElement('canvas')

    scratch.width = source.width
    scratch.height = source.height

    const context = scratch.getContext('2d')

    context.drawImage(source, 0, 0)

    const { data } = context.getImageData(0, 0, source.width, source.height)

    let minX = source.width
    let minY = source.height
    let maxX = -1
    let maxY = -1

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < SPRITE_ALPHA_THRESHOLD) {
        continue
      }

      const pixel = (i - 3) / 4
      const x = pixel % source.width
      const y = (pixel - x) / source.width

      if (x < minX) { minX = x }
      if (x > maxX) { maxX = x }
      if (y < minY) { minY = y }
      if (y > maxY) { maxY = y }
    }

    // Nothing solid enough to measure means there is no box to trim to - keep the image
    // whole rather than building a zero-sized texture, and let it be obvious on screen.
    const width = maxX < 0 ? source.width : maxX - minX + 1
    const height = maxY < 0 ? source.height : maxY - minY + 1
    const offsetX = maxX < 0 ? 0 : minX
    const offsetY = maxY < 0 ? 0 : minY

    const canvas = this.textures.createCanvas(trimmedKey, width, height)

    canvas.context.drawImage(scratch, -offsetX, -offsetY)
    canvas.refresh()

    return trimmedKey
  }
  create() {
    // Before anything is painted. The room's walls and clutter are built further down this
    // method and read these keys, so deriving them beside the player - which is where the
    // player's own trimmed texture is made - was late enough to hand every tile Phaser's
    // missing-texture placeholder.
    Object.entries(ROUNDED).forEach(([texture, rounded]) =>
      this.roundCorners(texture, rounded, TILE_CORNER_FRACTION))


    // Pays for the larger canvas: RENDER_SCALE times the pixels, zoomed RENDER_SCALE
    // times, so the visible world is the same 1344x840 it has always been.
    this.cameras.main.setZoom(RENDER_SCALE)

    // A shaped room is measured by its mask rather than by the canvas, so the world can
    // be larger than what is on screen. For a rectangle the two are the same size and
    // everything below - world bounds, camera bounds, the follow - is a no-op.
    // A rectangle room used to be exactly the canvas, which is why this fell back to the
    // viewport. At CELL 224 the canvas is under six cells across - not a room, a corridor.
    // It is measured in cells now like every other room, and scrolls like the shaped ones.
    const { width, height } = this.shape
      ? roomSize(this.shape, CELL)
      : { width: BASE_ROOM_COLS * CELL, height: BASE_ROOM_ROWS * CELL }

    this.physics.world.setBounds(0, 0, width, height)
    this.cameras.main.setBounds(...this.cameraBoundsFor(width, height))

    this.stats = computeStats(BASE_STATS, this.gameState.inventory)
    this.nextFireAt = 0
    this.nextHitAt = 0
    this.health = this.startHealth ?? this.stats.maxHp
    this.gameOver = false

    this.doors = []
    // What openDoors rolled, kept so a shop can put the *same* doors back after its
    // guardians are down. Re-rolling would deal a different choice than the one the player
    // was looking at before they bought - and worse, assignTwistDispositions advances the
    // floor's shop and puzzle counters, so a second roll in one room would drift the
    // floor's trap ordinal by a door.
    this.doorPlan = null
    this.statues = []
    this.corridorExit = null
    // Reset for the same reason corridorExit is: Phaser reuses the scene instance across
    // restart, so a pad left over from the last room would have the next one reporting
    // its boss already beaten before the player had taken a step.
    this.floorExit = null
    this.leaving = false

    this.buildWalls(width, height)
    this.buildObstacles(width, height)
    this.cacheWalkBlockers()

    // An arena's way in is chosen by its symmetry rather than fixed at the bottom, so that
    // the doorway sits on the axis instead of being the one asymmetric thing in the room.
    const start = this.symmetry
      ? this.arenaStart()
      : this.shape
        ? this.centreOf(this.entryCell)
        : new Phaser.Math.Vector2(width / 2, height - DOORWAY_MARGIN)

    PLAYER_FACINGS.forEach((facing) =>
      this.trimTransparent(PLAYER_TEXTURE[facing], PLAYER_TEXTURE_CUT[facing]))

    this.facing = PLAYER_FACING_DEFAULT
    this.player = this.add.sprite(start.x, start.y, PLAYER_TEXTURE_CUT[this.facing])
    this.sizePlayer()
    // The player is built before the room is painted, and nothing here sets a depth, so at
    // depth 0 she drew underneath every rock and pit laid down after her. It never showed
    // while a rock was 56 px and she was a 32 px block in a sparse room; at 224 px a single
    // clump swallows her whole. One step up is enough - enemies, pickups and shots are all
    // created after the terrain and already sit above it, and the HUD is up at HUD_DEPTH.
    this.player.setDepth(1)
    this.physics.add.existing(this.player)
    // The body is sized in sizePlayer(), which runs again on every turn - the four poses
    // do not trim to the same box, so the body has to follow the drawing rather than be
    // set once here.
    this.sizePlayer()
    this.player.body.setCollideWorldBounds(true)
    // The `false` is roundPixels, and it used to be true. **Pixel-snapping the camera was
    // buying nothing and costing smooth motion.** It only pays off when the canvas maps 1:1
    // to device pixels at an integer zoom; Scale.FIT rescales 1344x840 by whatever
    // non-integer factor the window happens to need, so the crispness it protects is
    // resampled away one step later regardless.
    //
    // What it cost: a lerped scroll chasing a slowly drifting player changes by a fraction
    // of a pixel per frame, and rounding turns that into the whole scene jumping a pixel at
    // irregular intervals. Gap assist is what made it visible - it is the first thing that
    // moves her perpendicular during ordinary straight-line walking, and it only showed in
    // big rooms, because a standard room is exactly the viewport and the camera never
    // scrolls in one at all.
    //
    // Nothing here is pixel art to protect anyway: tiles are drawn rotated a rolled few
    // degrees and oversized, and the avatar is scaled to a held height per facing, so every
    // one of them is linearly filtered already. Sub-pixel scroll is the consistent choice.
    this.cameras.main.startFollow(this.player, false, CAMERA_LERP, CAMERA_LERP)

    this.bullets = this.add.group()
    this.enemyShots = this.add.group()
    this.enemies = this.add.group()
    this.pickups = this.add.group()

    // rocks stop bullets, pits let them fly over - both stop anything on foot
    this.physics.add.collider(this.bullets, this.walls, (bullet) => bullet.destroy())
    this.physics.add.collider(this.bullets, this.rocks, (bullet) => bullet.destroy())
    this.physics.add.collider(this.enemyShots, this.walls, (shot) => shot.destroy())
    this.physics.add.collider(this.enemyShots, this.rocks, (shot) => shot.destroy())
    this.physics.add.overlap(this.player, this.enemyShots, this.onShotHitPlayer, null, this)
    this.physics.add.collider(this.player, [this.walls, this.rocks, this.pits])
    this.physics.add.collider(this.enemies, [this.walls, this.rocks, this.pits])
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this)
    this.physics.add.overlap(this.player, this.enemies, this.onEnemyTouchPlayer, null, this)
    this.physics.add.overlap(this.player, this.pickups, this.onPickup, null, this)

    this.buildHealthBar()
    this.buildItemHud()

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D')
    // 1/2/3 map to active slots 1-3. WASD moves and the arrows aim, so the number row is
    // what is left that scales to three slots - and it keeps SPACE free for the bomb.
    this.activeKeys = [
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE)
    ]

    // The swap prompt reuses those three Key objects and adds a fourth, so a number means
    // "slot n" everywhere. JustDown is consumed by whichever handler reads it first, and
    // updateActives never runs while the prompt is open, so the two cannot both fire.
    this.slotKeys = [
      ...this.activeKeys,
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR)
    ]
    // ESC is shared: the swap prompt reads it as "leave it on the floor" and returns from
    // update() before the pause check ever runs, so the two never both see one press.
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    // Confirm keys for the pause menu. ENTER is unbound elsewhere and SPACE is still free
    // (it is reserved for the bomb, which does not exist yet) - revisit when it lands.
    this.confirmKeys = [
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    ]
    this.swap = null
    this.pauseMenu = null
    this.pings = []

    // DEBUG / TEMPORARY - see DEBUG_SHAPE_KEY above.
    if (DEBUG_SHAPE_KEY) {
      this.debugShapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L)
    }

    this.populateRoom()
  }

  buildWalls(width, height) {
    this.walls = this.physics.add.staticGroup()

    if (this.shape) {
      this.buildShapeWalls()
      return
    }

    const half = WALL_THICKNESS / 2
    const doorwayStart = (width - DOORWAY_WIDTH) / 2

    // top, left, right, then the two stubs flanking the bottom doorway
    this.addWall(width / 2, half, width, WALL_THICKNESS)
    this.addWall(half, height / 2, WALL_THICKNESS, height)
    this.addWall(width - half, height / 2, WALL_THICKNESS, height)
    this.addWall(doorwayStart / 2, height - half, doorwayStart, WALL_THICKNESS)
    this.addWall(width - doorwayStart / 2, height - half, doorwayStart, WALL_THICKNESS)
  }

  // One tile per floor cell on the mask's edge, so the silhouette the mask draws is the
  // silhouette you walk. The void behind them gets no tile: the ring is unbroken, so
  // nothing on foot ever reaches it, and the L's 484 dead cells would be 484 bodies
  // bought for nothing. They read as the background, which is what being outside is.
  buildShapeWalls() {
    wallCells(this.shape).forEach(([row, col]) => {
      const { x, y } = cellCentre([row, col], CELL)

      this.addWall(x, y, CELL, CELL)
    })
  }

  // Obstacles are laid out on a CELL grid so rocks can clump and pits can snake.
  // Every candidate shape is rejected unless the room stays fully walkable afterwards.
  buildObstacles(width, height) {
    this.rocks = this.physics.add.staticGroup()
    this.pits = this.physics.add.staticGroup()

    this.cols = Math.floor(width / CELL)
    this.rows = Math.floor(height / CELL)

    // What starts out impassable: a rectangle's border ring, or - for a shaped room - the
    // mask's own wall ring and every void cell behind it. Everything downstream reads the
    // grid rather than the room's dimensions, so nothing else has to know which it got.
    const solid = this.shape
      ? solidGrid(this.shape)
      : Array.from({ length: this.rows }, (_, row) =>
          Array.from(
            { length: this.cols },
            (_, col) =>
              row === 0 || col === 0 || row === this.rows - 1 || col === this.cols - 1
          )
        )

    this.solid = solid
    this.blocked = solid.map((line) => [...line])
    this.reserved = solid.map((line) => [...line])

    if (this.shape) {
      this.reserveEntry()
    } else {
      this.reserveDoorway(width, height)
    }

    // A shop is bare floor: the stock is laid out on one line, and rocks and pits would
    // only break that line up and give a guarded shop cover to shoot you from. A puzzle
    // room is bare for now because it is a stub - whatever goes in it will bring its own
    // geometry, and rolled clutter would only be in the way of it.
    if (this.roomType === 'shop' || this.roomType === 'puzzle') {
      this.coverage = 0
      return
    }

    // A boss arena is generated whole rather than laid over a rectangle: its clutter is
    // mirrored into the symmetry the room was built on, and the doorway and the middle are
    // held open before anything is placed. See arena.js for why it does not go through
    // generateObstacles.
    if (this.symmetry) {
      const arena = generateArenaObstacles(this.symmetry, Math.random)

      this.blocked = arena.blocked
      this.coverage = arena.coverage
      arena.shapes.forEach(({ cells, asRock }) => this.paintShape(cells, asRock))
      return
    }

    // A corridor lays its own clutter: it is three cells wide, so the shape-growing
    // generator would span it end to end with a single rock, and the near-wall seeding
    // bias means nothing when the whole width is the wall band. Uniform single cells at a
    // tenth to a seventh instead, with the door pads and the landing spot held back.
    if (this.shape?.id === 'corridor') {
      const corridor = generateCorridorObstacles(this.shape, Math.random)

      this.blocked = corridor.blocked
      this.coverage = corridor.coverage
      corridor.shapes.forEach(({ cells, asRock }) => this.paintShape(cells, asRock))
      return
    }

    // Every room rolls its own clutter, from bare floor up to a third of the interior, so
    // the same generator hands out open arenas and warrens instead of one fixed density.
    const randomFn = () => Phaser.Math.FloatBetween(0, 1)
    const layout = generateObstacles({
      cols: this.cols,
      rows: this.rows,
      reserved: this.reserved,
      solid: this.solid,
      doorwayCell: this.doorwayCell,
      coverage: rollCoverage(randomFn),
      randomFn
    })

    this.blocked = layout.blocked
    this.coverage = layout.coverage
    layout.shapes.forEach(({ cells, asRock }) => this.paintShape(cells, asRock))
  }

  reserveDoorway(width, height) {
    const left = Math.floor((width - DOORWAY_WIDTH) / 2 / CELL)
    const right = Math.floor((width + DOORWAY_WIDTH) / 2 / CELL)
    const top = Math.floor((height - ENTRY_LINE_OFFSET) / CELL) - 1

    for (let row = Math.max(1, top); row < this.rows - 1; row++) {
      for (let col = Math.max(1, left); col <= Math.min(this.cols - 2, right); col++) {
        this.reserved[row][col] = true
      }
    }

    this.doorwayCell = [this.rows - 2, Math.floor(this.cols / 2)]
  }

  // The shaped-room answer to the doorway channel. The mask's entry cell is part of the
  // wall ring - it is the hole, not the floor beside it - so the player lands the same
  // couple of cells inward that a door pad does, and the patch around them is held clear
  // so nobody starts the room boxed in by a rock.
  reserveEntry() {
    this.entryCell = this.nearestOpenCell(innerCell(this.shape.entry, ENTRY_INSET))
    this.doorwayCell = this.entryCell

    for (let r = this.entryCell[0] - ENTRY_CLEARANCE; r <= this.entryCell[0] + ENTRY_CLEARANCE; r++) {
      for (let c = this.entryCell[1] - ENTRY_CLEARANCE; c <= this.entryCell[1] + ENTRY_CLEARANCE; c++) {
        if (this.reserved[r]?.[c] === false) {
          this.reserved[r][c] = true
        }
      }
    }
  }

  // One cell-sized window onto the same world-anchored surface the walls use. A rock clump
  // runs to 8 adjacent cells and a pit to 12, so sharing one continuous surface means a
  // clump reads as a mass cut out of rock rather than as that many stamps side by side.
  //
  // The edges are still square, and squares on a grid is what they look like. An outline
  // tracer that would round them off is written and tested in outline.js, and is **not
  // wired in**: drawing a clump as one surface cut to a wobbling outline needs masking, and
  // Phaser 4 removed geometry masks from the WebGL renderer - setMask warns and does
  // nothing. Its filter replacement did not clip in the shape this needs. See zz_todo.md.
  paintShape(shape, asRock) {
    const group = asRock ? this.rocks : this.pits
    const texture = ROUNDED[asRock ? ROCK_TEXTURE : PIT_TEXTURE]

    const drawn = CELL * TILE_TURN_COVER * (asRock ? ROCK_OVERDRAW : 1)

    shape.forEach(([row, col]) => {
      const tile = this.tiledSurface(
        col * CELL + CELL / 2,
        row * CELL + CELL / 2,
        drawn,
        drawn,
        texture
      )

      tile.setAngle(Phaser.Math.FloatBetween(-TILE_TURN_MAX, TILE_TURN_MAX))

      this.physics.add.existing(tile, true)
      // The body is built from the oversized tile, so it has to be put back to the cell it
      // stands for - the grid is what everything else in the room agrees on. setSize on a
      // static body centres it on the game object, which is already the cell centre, so
      // this is the whole job.
      //
      // **Do not follow this with updateFromGameObject().** It rebuilds width and height
      // from displayWidth/displayHeight - the oversized ones - and silently throws the
      // resize away. That left every rock and pit with a body 5 px wider than its cell,
      // sticking 2.5 px into each neighbour, and a player walking along a row of them
      // caught on the overhangs and stopped.
      tile.body.setSize(CELL, CELL)
      group.add(tile)
    })
  }

  // A tileSprite rather than an image, because a rectangular room's walls are five long
  // slabs - the top one is the full 1344 px width - and an image would stretch one tile
  // across the whole span. The tile scale makes the texture repeat every CELL, so a wall
  // reads as 24 tiles rather than one smeared one, and matches the per-cell walls a shaped
  // room builds.
  addWall(x, y, width, height) {
    // Added first, so it sits under the planks rather than over them.
    this.add.rectangle(x, y, width, height, WALL_BACKING_COLOR)

    const wall = this.tiledSurface(x, y, width, height, ROUNDED[WALL_TEXTURE])

    this.physics.add.existing(wall, true)
    this.walls.add(wall)
    return wall
  }

  update(time) {
    if (this.gameOver) {
      return
    }

    // Frozen on arrival in an ambushed room. Nothing reads input, nothing thinks and
    // nothing shoots - including the nine enemies that were waiting - until the word has
    // had its half second. Checked before the pause menu, so ESC cannot open one inside
    // the freeze and leave two pauses fighting over physics.resume().
    if (this.ambush) {
      if (time < this.ambush.until) {
        return
      }

      this.releaseAmbush()
    }

    // The prompt owns the moment: physics is paused, so nothing moves, shoots or is hit
    // until the player has chosen. Only the HUD keeps painting.
    if (this.swap) {
      this.updateSwapPrompt()
      this.refreshItemHud(time)
      return
    }

    // Paused: nothing but the menu's own keys is read, and update() does no work at all -
    // no movement, no firing, no enemy thinking - on top of the frozen physics world.
    if (this.pauseMenu) {
      this.updatePauseMenu()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.openPauseMenu()
      return
    }

    // DEBUG / TEMPORARY - see DEBUG_SHAPE_KEY above.
    if (DEBUG_SHAPE_KEY && Phaser.Input.Keyboard.JustDown(this.debugShapeKey)) {
      const at = DEBUG_SHAPE_CYCLE.indexOf(this.shape?.id)

      this.scene.restart({
        shape: DEBUG_SHAPE_CYCLE[(at + 1) % DEBUG_SHAPE_CYCLE.length],
        plan: roomPlanFor(DEBUG_SHAPE_PLAN),
        carried: { gameState: this.gameState, health: this.health }
      })
      return
    }

    this.checkRoomCleared()
    this.updateDoorArming()
    this.updateMovement()
    this.updateEnemies(time)
    this.updateEnemyPings()
    this.updateProjectiles()
    this.updateFiring(time)
    this.updateActives(time)
    this.updatePickupRearm()
    this.refreshItemHud(time)

    if (this.bulwarkRing) {
      if (this.bulwarkRing.active) {
        this.bulwarkRing.setPosition(this.player.x, this.player.y)
      } else {
        this.bulwarkRing = null
      }
    }
  }

  updateMovement() {
    // The raw -1/0/1 pair, kept unnormalized: gap assist reads it as a direction rather
    // than a speed, and normalize would turn a diagonal into 0.707s it cannot classify.
    const input = new Phaser.Math.Vector2(
      (this.wasd.D.isDown ? 1 : 0) - (this.wasd.A.isDown ? 1 : 0),
      (this.wasd.S.isDown ? 1 : 0) - (this.wasd.W.isDown ? 1 : 0)
    )

    const velocity = input.clone().normalize().scale(this.stats.moveSpeed)

    // Added after the normalize on purpose. Folded in before it, the lean would be one
    // component of a vector scaled back to walking pace - so it would steer by turning the
    // player rather than by sliding her, and cost forward speed to do it. On top, it is
    // what it says: full speed at the gap, plus a shove towards the middle of it.
    //
    // **Fractional cells, not cellAt.** cellAt floors and clamps, which is right for the
    // pathing and spawn checks that ask "which tile is this" - but computeGapNudge reads
    // the fraction as how far off the gap's centreline she is, and a floored position
    // reports everyone as sitting exactly half a cell off centre. That is a constant
    // full-strength lean, which is the bug this pass exists to fix. Same axis convention
    // cellAt uses - y is the row, x is the column - just without the rounding.
    //
    // Unclamped is safe: gapAssist reads anything off the edge of the grid as wall.
    const playerRow = this.player.y / CELL
    const playerCol = this.player.x / CELL
    // Vector x is the column axis and y the row axis, so the bias crosses over. No guard
    // for standing still or moving diagonally: computeGapNudge answers both with no bias.
    const nudge = computeGapNudge({
      playerRow,
      playerCol,
      moveDirRow: input.y,
      moveDirCol: input.x,
      blocked: this.blocked
    })

    velocity.x += nudge.col * GAP_ASSIST_STRENGTH * PLAYER_SPEED
    velocity.y += nudge.row * GAP_ASSIST_STRENGTH * PLAYER_SPEED

    this.player.body.setVelocity(velocity.x, velocity.y)
  }

  // The room is live from the first frame. It used to wait for the player to walk up past
  // an entry line, which handed them a free look at the layout and a doorway to read it
  // from; now the fight starts where they are standing.
  populateRoom() {
    if (this.roomType === 'shop') {
      this.openShop()
      return
    }

    // Everything in the room comes off the plan the door resolved to: how many enemies and
    // how tough they are. A puzzle room's plan says none, which is the whole of the stub.
    // Nothing below this line knows which tag it came from.
    for (let i = 0; i < this.roomPlan.enemyCount; i++) {
      this.spawnEnemy()
    }

    // Slug Step is carried, not rolled: one slug per copy held, in every room the player
    // fights in - including an otherwise empty puzzle room, because the slug is something
    // they brought with them rather than something the room generated. The shop is the
    // exception, for the same reason its own guards hold off: a shop is safe to walk into.
    for (let i = 0; i < countOwned(this.gameState.inventory, 'slug_step'); i++) {
      this.spawnSlug()
    }

    this.announceRoom()
    // Last, and after the enemies exist, because the ambush freezes the room and the
    // player should be looking at the room it froze. It used to run at the top of this
    // method, so that a shop - which returns early - still announced; a twisted room is
    // always a combat room, so it never takes that branch and the reason is gone.
    this.announceTwist()
  }

  updateEnemies(time) {
    this.enemies.getChildren().forEach((enemy) => {
      // a panic-button shove owns the velocity until it lapses
      if (time < (enemy.pushedUntil ?? 0)) {
        return
      }

      const target = this.chaseTargetFor(enemy)
      // Read off this.stats every frame rather than stored at spawn, so a slug speeds up
      // the moment the player puts boots on and slows when they pick up Sluggish.
      const speed = enemy.isSlug ? this.stats.moveSpeed * SLUG_SPEED_SHARE : ENEMY_SPEED

      this.physics.moveTo(enemy, target.x, target.y, speed)
      this.updateEnemyFiring(enemy, time)
    })
  }

  // ---- off-screen enemy pings ----------------------------------------------

  // One arrow per off-screen enemy, on the edge of the screen, pointing at it. A big room
  // is nearly three times the viewport, so on entry most of the room's enemies are out of
  // sight and the last one alive can be a forty-second walk away with nothing to say where.
  // Uncapped deliberately: the most a room ever spawns is nine, and hiding some of them
  // would make the arrows a thing you cannot trust rather than a readout of what is left.
  //
  // Rectangular rooms never scroll, so nothing in them can be off-screen and they get
  // none of this - not even the per-frame check.
  updateEnemyPings() {
    if (!this.shape) {
      return
    }

    const view = this.cameras.main.worldView
    const offScreen = this.enemies
      .getChildren()
      .filter((enemy) => !Phaser.Geom.Rectangle.Contains(view, enemy.x, enemy.y))

    offScreen.forEach((enemy, index) => {
      const angle = Phaser.Math.Angle.Between(view.centerX, view.centerY, enemy.x, enemy.y)
      const offset = edgePoint(
        angle,
        view.width / 2 - PING_MARGIN,
        view.height / 2 - PING_MARGIN
      )

      // Pinned with setScrollFactor(0), so this is screen space measured in world units -
      // and worldView's size is exactly that, the camera's extent after the zoom.
      this.pingAt(index)
        .setPosition(view.width / 2 + offset.x, view.height / 2 + offset.y)
        .setRotation(angle)
        .setVisible(true)
    })

    // The arrows outlive their enemies by a frame at most: whatever is not claimed above
    // is hidden rather than destroyed, so a kill and a respawn cost no allocation.
    for (let index = offScreen.length; index < this.pings.length; index++) {
      this.pings[index].setVisible(false)
    }
  }

  // Grown on demand and kept. Drawn pointing along +x so the rotation is the bearing to
  // the enemy with nothing added to it.
  pingAt(index) {
    if (!this.pings[index]) {
      this.pings[index] = this.add
        .triangle(0, 0, 0, 0, 0, PING_SIZE, PING_SIZE, PING_SIZE / 2, PING_COLOR, PING_ALPHA)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH + 3)
    }

    return this.pings[index]
  }

  updateEnemyFiring(enemy, time) {
    if (enemy.isSlug || time < enemy.nextShotAt || !this.hasShotLineTo(enemy)) {
      return
    }

    this.fireEnemyShot(enemy)
    enemy.nextShotAt = time + ENEMY_FIRE_COOLDOWN
  }

  // Rocks stop shots, pits do not - so the enemy only bothers firing over a pit.
  hasShotLineTo(enemy) {
    const sightline = new Phaser.Geom.Line(enemy.x, enemy.y, this.player.x, this.player.y)

    return !this.rocks
      .getChildren()
      .some((rock) => Phaser.Geom.Intersects.LineToRectangle(sightline, rock.getBounds()))
  }

  fireEnemyShot(enemy) {
    const aim = new Phaser.Math.Vector2(
      this.player.x - enemy.x,
      this.player.y - enemy.y
    ).normalize()

    const shot = this.add.circle(
      enemy.x + aim.x * ENEMY_MUZZLE_OFFSET,
      enemy.y + aim.y * ENEMY_MUZZLE_OFFSET,
      ENEMY_SHOT_RADIUS,
      ENEMY_SHOT_COLOR
    )
    this.physics.add.existing(shot)
    shot.body.setVelocity(aim.x * ENEMY_SHOT_SPEED, aim.y * ENEMY_SHOT_SPEED)
    this.enemyShots.add(shot)
    this.armRange(shot)

    this.time.delayedCall(ENEMY_SHOT_LIFETIME, () => shot.destroy())
  }

  // Walk straight at the player when the line is clear. Otherwise breadth-first search
  // the free cells for a route and steer at the furthest waypoint still in plain sight,
  // which keeps the movement off the grid lines. Greedy corner-hugging was enough when
  // the room held a handful of separated rectangles; at a third coverage it gets stuck.
  chaseTargetFor(enemy) {
    if (this.hasWalkLine(enemy.x, enemy.y, this.player.x, this.player.y)) {
      return this.player
    }

    const path = this.findPath(
      this.cellAt(enemy.x, enemy.y),
      this.cellAt(this.player.x, this.player.y)
    )

    // Nothing better than the current cell to walk to - press on at the player directly.
    if (!path || path.length < 2) {
      return this.player
    }

    return this.furthestVisibleOn(path, enemy)
  }

  cellAt(x, y) {
    return [
      Phaser.Math.Clamp(Math.floor(y / CELL), 0, this.rows - 1),
      Phaser.Math.Clamp(Math.floor(x / CELL), 0, this.cols - 1)
    ]
  }

  // Where the player stands on arriving in an arena. The entry cell for a single-cell
  // doorway, and the seam between the pair when the axis falls between two columns - 24 is
  // even, so left/right mirroring and the half turn both put the way in on a boundary
  // rather than on a cell.
  arenaStart() {
    const { reserved } = arenaEntry(this.symmetry)
    const cells = reserved.filter(([row]) => row === reserved[0][0])
    const cols = cells.map(([, col]) => col)
    const left = Math.min(...cols)
    const right = Math.max(...cols)

    return new Phaser.Math.Vector2(
      ((left + right) / 2) * CELL + CELL / 2,
      reserved[0][0] * CELL + CELL / 2
    )
  }

  // The middle of the boss's reserved block, not the anchor cell - the arena's true centre
  // falls between two columns, so standing on the anchor would put the boss half a cell off
  // centre in a room whose whole point is being symmetric.
  //
  // Nothing spawns here yet: the boss room is an empty stub, and this is the point a real
  // boss will be placed at when there is one.
  arenaBossPoint() {
    const { reserved } = arenaBossSpawn()
    const rows = reserved.map(([row]) => row)
    const cols = reserved.map(([, col]) => col)

    return new Phaser.Math.Vector2(
      ((Math.min(...cols) + Math.max(...cols)) / 2) * CELL + CELL / 2,
      ((Math.min(...rows) + Math.max(...rows)) / 2) * CELL + CELL / 2
    )
  }

  centreOf(cell) {
    const { x, y } = cellCentre(cell, CELL)

    return new Phaser.Math.Vector2(x, y)
  }

  // Always hand back somewhere to walk. The grid marks the whole 56 px border ring
  // blocked to keep obstacles off the wall band, but the 24 px walls let the player and
  // the enemy stand in that ring - so snap either end onto the nearest open cell rather
  // than giving up. And when the player's cell still is not reachable, head for the
  // reachable cell that gets closest to them: the enemy closes the gap either way
  // instead of parking behind cover.
  findPath(from, to) {
    const source = this.nearestOpenCell(from)
    const target = this.nearestOpenCell(to)

    if (!source || !target) {
      return null
    }

    const cameFrom = new Map()
    const start = source.join(',')
    const goal = target.join(',')
    const queue = [source]
    cameFrom.set(start, null)

    for (let head = 0; head < queue.length; head++) {
      const [row, col] = queue[head]

      if (`${row},${col}` === goal) {
        break
      }

      NEIGHBOURS.forEach(([dRow, dCol]) => {
        const next = [row + dRow, col + dCol]
        const key = next.join(',')

        if (
          cameFrom.has(key) ||
          next[0] < 0 ||
          next[1] < 0 ||
          next[0] > this.rows - 1 ||
          next[1] > this.cols - 1 ||
          this.blocked[next[0]][next[1]]
        ) {
          return
        }

        cameFrom.set(key, [row, col])
        queue.push(next)
      })
    }

    // Unreachable goal means the BFS drained the whole component, so `queue` holds every
    // cell the enemy can actually stand on - walk to whichever of those is closest.
    const end = cameFrom.has(goal) ? target : this.closestTo(queue, to)

    const path = []
    for (let step = end; step; step = cameFrom.get(step.join(','))) {
      path.unshift(step)
    }

    return path
  }

  // Nearest walkable cell to a point that may sit in the blocked border ring or, after a
  // shove, inside an obstacle. Rings outward so the snap is always the shortest one.
  nearestOpenCell([row, col]) {
    if (!this.blocked[row][col]) {
      return [row, col]
    }

    const seen = new Set([`${row},${col}`])
    const queue = [[row, col]]

    for (let head = 0; head < queue.length; head++) {
      const [atRow, atCol] = queue[head]

      for (const [dRow, dCol] of NEIGHBOURS) {
        const next = [atRow + dRow, atCol + dCol]
        const key = next.join(',')

        if (
          seen.has(key) ||
          next[0] < 0 ||
          next[1] < 0 ||
          next[0] > this.rows - 1 ||
          next[1] > this.cols - 1
        ) {
          continue
        }

        seen.add(key)

        if (!this.blocked[next[0]][next[1]]) {
          return next
        }

        queue.push(next)
      }
    }

    return null
  }

  closestTo(cells, [row, col]) {
    const distSq = ([atRow, atCol]) => (atRow - row) ** 2 + (atCol - col) ** 2

    return cells.reduce((best, cell) => (distSq(cell) < distSq(best) ? cell : best))
  }

  furthestVisibleOn(path, enemy) {
    let target = this.centreOf(path[Math.min(1, path.length - 1)])

    for (let i = Math.min(path.length - 1, PATH_LOOKAHEAD); i >= 1; i--) {
      const candidate = this.centreOf(path[i])

      if (this.hasWalkLine(enemy.x, enemy.y, candidate.x, candidate.y)) {
        target = candidate
        break
      }
    }

    return target
  }

  // What stops something enemy-sized from walking a straight line, inflated by its own
  // half-width once and kept: every tile here is static, so re-cloning them per frame was
  // only ever buying the same answer again.
  //
  // Rocks and pits are the whole list in a rectangular room - its wall is convex, so no
  // line between two points inside it can cross one. A shaped room's wall is not: the
  // straight line from the foot of the L to the top of its arm runs through the void, and
  // an enemy that trusted it would walk into the corner and stick there. So the wall
  // joins the list exactly when the mask makes it able to lie.
  cacheWalkBlockers() {
    const margin = ENEMY_SIZE / 2 + DETOUR_CLEARANCE
    const tiles = [...this.rocks.getChildren(), ...this.pits.getChildren()]

    if (this.shape) {
      tiles.push(...this.walls.getChildren())
    }

    this.walkBlockers = tiles.map((tile) => {
      const bounds = Phaser.Geom.Rectangle.Clone(tile.getBounds())
      Phaser.Geom.Rectangle.Inflate(bounds, margin, margin)

      return bounds
    })
  }

  // Line of sight for something the size of an enemy, tested against the actual tiles.
  hasWalkLine(fromX, fromY, toX, toY) {
    const line = new Phaser.Geom.Line(fromX, fromY, toX, toY)

    return !this.walkBlockers.some((bounds) =>
      Phaser.Geom.Intersects.LineToRectangle(line, bounds)
    )
  }

  updateFiring(time) {
    // Read before the cooldown check, not after. Facing is about where she is aiming, not
    // about when a shot happens to leave - gating it on the cooldown would leave her
    // looking the old way for up to 360 ms after you turned.
    const aim = new Phaser.Math.Vector2(
      (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0),
      (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0)
    )

    if (aim.length() === 0) {
      return
    }

    this.faceAim(aim)

    if (time < this.nextFireAt) {
      return
    }

    this.fire(aim.normalize())
    this.nextFireAt = time + this.stats.fireCooldown
  }

  // There are four drawings and eight directions the arrows can make, so a diagonal has to
  // resolve to one of them. The larger component wins, and a true diagonal - both keys,
  // equal parts - ties to the horizontal, because the left and right poses read as facing
  // far more strongly than the up one does.
  faceAim(aim) {
    const facing = Math.abs(aim.x) >= Math.abs(aim.y)
      ? (aim.x < 0 ? 'left' : 'right')
      : (aim.y < 0 ? 'up' : 'down')

    if (facing === this.facing) {
      return
    }

    this.facing = facing
    this.player.setTexture(PLAYER_TEXTURE_CUT[facing])
    this.sizePlayer()
  }

  // Scale and body, together, because they have to agree. The four poses do not trim to the
  // same box - a figure with an arm out is wider than one square on - so both the scale and
  // the body have to be recomputed from whatever texture is now on her, or she would change
  // size as she turned and her hitbox would drift off the drawing.
  //
  // Height is what is held constant, since it is the long side and the one that decides
  // what she fits through.
  sizePlayer() {
    this.player.setScale(PLAYER_SPRITE_HEIGHT / this.player.height)

    // Called once before the body exists, to get the scale on before physics reads it.
    if (this.player.body) {
      this.player.body.setSize(this.player.width, this.player.height, true)
    }
  }

  spawnEnemy(at = null) {
    const spawn = at ?? this.pickSpawnPoint()
    const enemy = this.add.rectangle(
      spawn.x,
      spawn.y,
      ENEMY_SIZE,
      ENEMY_SIZE,
      0xef4444
    )
    this.physics.add.existing(enemy)
    enemy.hp = enemyHpFor(this.roomPlan.enemyStrengthBonus)
    enemy.nextShotAt = this.time.now + ENEMY_FIRE_COOLDOWN
    this.enemies.add(enemy)
  }

  // Slug Step's enemy: an ordinary chaser that never fires and crawls. Same HP as anything
  // else, so it is killable rather than a permanent tax - but killing it costs the time it
  // was built to cost you.
  spawnSlug() {
    const spawn = this.pickSpawnPoint()
    const slug = this.add.rectangle(spawn.x, spawn.y, ENEMY_SIZE, ENEMY_SIZE, SLUG_COLOR)

    this.physics.add.existing(slug)
    slug.hp = enemyHpFor(this.roomPlan.enemyStrengthBonus)
    slug.isSlug = true
    slug.nextShotAt = Infinity
    this.enemies.add(slug)
  }

  // With a third of the room filled, sample the free grid cells rather than raw
  // coordinates - that way a spawn is always somewhere the enemy can actually stand.
  pickSpawnPoint() {
    const open = []

    for (let row = 1; row < this.rows - 1; row++) {
      for (let col = 1; col < this.cols - 1; col++) {
        if (this.blocked[row][col]) {
          continue
        }

        if (this.hasClearance(row, col)) {
          open.push(this.centreOf([row, col]))
        }
      }
    }

    const far = open.filter(
      (point) => Phaser.Math.Distance.BetweenPoints(point, this.player) >= MIN_SPAWN_DISTANCE
    )

    return Phaser.Utils.Array.GetRandom(far.length ? far : open)
  }

  // Room for something enemy-sized to stand. Its 72 px footprint reaches into all eight
  // neighbouring cells, so a cell is clear exactly when its 3x3 block is open - which is
  // what testing the footprint against every wall and obstacle body worked out to. Read
  // off the grid now instead: a shaped room's wall is a hundred and fifty tiles rather
  // than five long rectangles, and this runs once per free cell per spawn.
  hasClearance(row, col) {
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (this.blocked[r]?.[c] !== false) {
          return false
        }
      }
    }

    return true
  }

  fire(aim) {
    const bullet = this.add.sprite(
      this.player.x + aim.x * MUZZLE_OFFSET,
      this.player.y + aim.y * MUZZLE_OFFSET,
      BULLET_TEXTURE
    )

    bullet.setDisplaySize(BULLET_SPRITE_SIZE, BULLET_SPRITE_SIZE)
    bullet.setAlpha(BULLET_ALPHA)
    // The art points right at rest, so the travel angle is the rotation outright: firing
    // up is aim (0, -1), which is a quarter turn anticlockwise on screen.
    bullet.setRotation(Math.atan2(aim.y, aim.x))

    this.physics.add.existing(bullet)

    // Arcade sizes a new body from the display size, which would hand a shot this big a
    // hitbox ten times what it had. setSize works in source pixels and multiplies by the
    // sprite's scale, so dividing back out by that scale restores the original 10 px box,
    // centred on the sprite. Bodies do not rotate, which is what we want: a shot's reach
    // should not depend on whether it was fired along an axis or a diagonal.
    const hitbox = (BULLET_RADIUS * 2) / bullet.scaleX

    bullet.body.setSize(hitbox, hitbox)
    bullet.body.setVelocity(aim.x * BULLET_SPEED, aim.y * BULLET_SPEED)
    this.bullets.add(bullet)

    this.armRange(bullet)

    this.time.delayedCall(BULLET_LIFETIME, () => bullet.destroy())
  }

  // Range is a baseline rule on both sides of the fight: a shot dies at its range unless a
  // wall, a rock or something it hit takes it first. The timeouts in fire() and
  // fireEnemyShot() outlive it at the shipped speeds - the player's by 1.4x, the enemy's
  // by far more - and never get to fire. See bullets.js, which holds that arithmetic and
  // the tests that keep it true.
  updateProjectiles() {
    this.trackRange(this.bullets, BULLET_RANGE)
    this.trackRange(this.enemyShots, ENEMY_SHOT_RANGE)
  }

  // Distance is accrued from where a shot was last frame rather than measured from its
  // muzzle. The two agree for anything flying straight, which these do - but accruing per
  // frame means a shot only spends range while it is actually moving, and physics stops
  // dead during the swap prompt and the pause menu. A shot held through a pause comes out
  // of it with its reach intact rather than having quietly aged.
  armRange(shot) {
    shot.travelled = 0
    shot.lastX = shot.x
    shot.lastY = shot.y
  }

  trackRange(group, range) {
    // slice: destroying inside the loop mutates the group's own child array
    group.getChildren().slice().forEach((shot) => {
      shot.travelled += Phaser.Math.Distance.Between(shot.lastX, shot.lastY, shot.x, shot.y)
      shot.lastX = shot.x
      shot.lastY = shot.y

      if (shot.travelled >= range) {
        shot.destroy()
      }
    })
  }

  onBulletHitEnemy(bullet, enemy) {
    bullet.destroy()
    this.damageEnemy(enemy, this.stats.damage)
  }

  damageEnemy(enemy, amount) {
    enemy.hp -= amount

    if (enemy.hp <= 0) {
      this.killEnemy(enemy)
      return
    }

    this.tweens.add({ targets: enemy, alpha: 0.3, duration: 60, yoyo: true })
  }

  // A kill always pays EXP, and one in ten additionally leaves half a heart behind. It
  // never leaves an item: a kill used to be able to drop a treasure or a reward, which
  // made killing things the run's item economy. Items come from clearing a room and from
  // the shop now, so what an enemy leaves is healing or nothing.
  killEnemy(enemy) {
    const { x, y } = enemy
    enemy.destroy()
    addExp(this.gameState, this.stats.expPerKill)

    if (rollEnemyDrop(Math.random) === HEAL_DROP) {
      this.spawnHealPickup(x, y)
    }
  }

  onEnemyTouchPlayer(player, enemy) {
    this.takeHit()
  }

  onShotHitPlayer(player, shot) {
    shot.destroy()
    this.takeHit()
  }

  // Touches and shots cost the same 1 HP and share one i-frame window. A hit costs health
  // and nothing else: it used to shove the player 420 px/s away from what hit them and
  // lock out the controls for 180 ms, which meant a hit taken mid-corridor decided where
  // they ended up. The player now keeps whatever line they were walking, so the only
  // trace of a hit is the HP bar and the flash.
  takeHit() {
    const time = this.time.now
    if (this.gameOver || time < this.nextHitAt) {
      return
    }

    this.nextHitAt = time + HIT_COOLDOWN

    // The same flash an enemy gives when it is shot - with the shove gone this is the
    // only thing that reads as a hit in the moment.
    this.tweens.add({ targets: this.player, alpha: 0.3, duration: 60, yoyo: true })

    this.damagePlayer(DAMAGE_PER_HIT)
  }

  // Health bar: one segment per HP, paired up so two segments read as one heart. Rebuilt
  // rather than resized when Iron Plating changes the segment count.
  buildHealthBar() {
    ;(this.hpNodes ?? []).forEach((node) => node.destroy())

    const maxHp = this.stats.maxHp

    // The bar rides the top wall band rather than the room, so it hides no floor, rock or
    // pit. The band is WALL_THICKNESS tall and the bar is centred in it.
    const left = HUD_EDGE_MARGIN
    const top = (WALL_THICKNESS - (HP_SEGMENT_HEIGHT + BAR_PADDING * 2)) / 2

    // Walk the layout once to measure it - a closed form stops being obvious the moment
    // maxHp can be odd.
    const offsets = []
    let cursor = 0
    for (let i = 0; i < maxHp; i++) {
      if (i > 0) {
        cursor += i % HP_PER_HEART === 0 ? HP_HEART_GAP : HP_SEGMENT_GAP
      }
      offsets.push(cursor)
      cursor += HP_SEGMENT_WIDTH
    }
    const innerWidth = cursor

    const track = this.add
      .rectangle(
        left,
        top,
        innerWidth + BAR_PADDING * 2,
        HP_SEGMENT_HEIGHT + BAR_PADDING * 2,
        BAR_TRACK_COLOR
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, BAR_EDGE_COLOR)

    this.hpSegments = offsets.map((offset) =>
      this.add
        .rectangle(
          left + BAR_PADDING + offset,
          top + BAR_PADDING,
          HP_SEGMENT_WIDTH,
          HP_SEGMENT_HEIGHT,
          HP_FULL_COLOR
        )
        .setOrigin(0, 0)
    )

    this.hpLabel = this.crispText(left + innerWidth + BAR_PADDING * 2 + 12, top + BAR_PADDING, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f87171'
      })
      .setOrigin(0, 0)

    this.hpNodes = [track, ...this.hpSegments, this.hpLabel]
    this.hpNodes.forEach((node) => node.setDepth(HUD_DEPTH).setScrollFactor(0))

    this.refreshHealthBar()
  }

  refreshHealthBar() {
    this.hpSegments.forEach((segment, i) => {
      segment.setFillStyle(i < this.health ? HP_FULL_COLOR : HP_EMPTY_COLOR)
    })

    this.hpLabel.setText(`${this.health}/${this.stats.maxHp} HP`)
  }

  damagePlayer(amount) {
    this.health = Math.max(0, this.health - amount)
    this.refreshHealthBar()
    console.log('[one-bomb-left] hp', this.health)

    if (this.health === 0) {
      this.endGame()
    }
  }


  // ---- pickups -------------------------------------------------------------

  updatePickupRearm() {
    this.pickups.getChildren().forEach((pickup) => {
      if (!pickup.spec.declined) {
        return
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        pickup.x,
        pickup.y
      )

      if (distance > PICKUP_REARM_DISTANCE) {
        pickup.spec.declined = false
      }
    })
  }

  // A displaced item lands back on the floor rather than vanishing: nothing else in this
  // game silently destroys an item, and it keeps a snap decision reversible. It starts
  // inert so it is not re-taken from under the player's feet on the next frame.
  dropItem(item) {
    const spot = this.freeSpotNear(this.player.x, this.player.y)

    this.addPickup(spot.x, spot.y, {
      kind: 'dropped',
      item,
      color: PICKUP_DROPPED_COLOR,
      declined: true
    })
  }

  freeSpotNear(x, y) {
    for (const degrees of [0, 90, 180, 270, 45, 135, 225, 315]) {
      const radians = Phaser.Math.DegToRad(degrees)
      const spotX = x + Math.cos(radians) * DROP_OFFSET
      const spotY = y + Math.sin(radians) * DROP_OFFSET
      const [row, col] = this.cellAt(spotX, spotY)

      if (!this.blocked[row][col]) {
        return new Phaser.Math.Vector2(spotX, spotY)
      }
    }

    // boxed in - drop it underfoot, the re-arm distance still keeps it inert for a step
    return new Phaser.Math.Vector2(x, y)
  }

  // The safe room's payout. Drawn from every source that is not a debuff, and never
  // cursed - which is the whole promise of the door. Treasure and reward are pooled
  // together rather than kept apart: treasure lost its only source when kills stopped
  // dropping items, and from the player's side "curse-free" is the distinction that
  // matters, not which internal list it came off.
  //
  // Weighted, not even: a passive already stacked twice comes up at a quarter of the odds
  // of one never seen, so the pool keeps opening up as the run goes on.
  spawnCleanPickup(x, y) {
    this.addPickup(x, y, {
      kind: 'treasure',
      item: this.rollFrom([...itemsFrom('treasure'), ...itemsFrom('reward')]),
      color: PICKUP_TREASURE_COLOR
    })
  }

  // The risky room's payout, and the only way into the debuff pool. Purple, the colour a
  // curse has always been - though what it hands over is a bargain rather than a
  // punishment: every one of them carries a real upside alongside its cost.
  spawnDebuffPickup(x, y) {
    this.addPickup(x, y, {
      kind: 'debuff',
      item: this.rollFrom(itemsFrom('debuff')),
      color: PICKUP_CURSED_COLOR
    })
  }

  // The only healing outside the shop. It carries no item, so onPickup handles it before
  // anything that reads one.
  spawnHealPickup(x, y) {
    this.addPickup(x, y, { kind: 'heal', color: PICKUP_HP_REFILL_COLOR })
  }

  // ---- shop room -----------------------------------------------------------

  // Stock is rolled from what the player does not already own, so a shop never sells a
  // duplicate it would have to refuse at the till.
  // A shop is always safe to walk into, guarded or not - the one room the instant-spawn
  // rule does not apply to. Its guards are held back until the player takes something.
  openShop() {
    const stock = rollShopStock(this.shopPool(), Math.random)

    this.shelfSpots(stock.length).forEach((spot, index) =>
      this.spawnShopPickup(spot, stock[index])
    )

    this.shopSpent = false
    this.raiseStatues(STATUE_COUNT)

    this.toast('SHOP - browse freely, leave freely; buying wakes the statues', '#38bdf8')
  }

  // The guardians before they are guardians. Stone-coloured blocks standing where the
  // enemies will stand, with no body and no behaviour - they cannot be hit, cannot hit
  // back, and do not move. **They are visible from the moment the player walks in**, so
  // the cost of buying is on the table before the decision rather than after it.
  raiseStatues(count) {
    for (let i = 0; i < count; i++) {
      const spot = this.pickSpawnPoint()
      const statue = this.add.rectangle(spot.x, spot.y, ENEMY_SIZE, ENEMY_SIZE, STATUE_COLOR)

      statue.setAlpha(STATUE_ALPHA)
      this.statues.push(statue)
    }
  }

  // Buying wakes some of them. **Which ones is a shuffle, and how many includes none** -
  // so a purchase is a gamble against four visible statues rather than a fixed toll.
  //
  // A woken statue is replaced by an enemy standing exactly where it stood, so the fight
  // starts from the arrangement the player has been looking at rather than from a fresh roll
  // of spawn points. The ones that stay asleep stay standing, as a reminder of what the
  // next purchase might cost.
  wakeStatues(count) {
    const order = [...this.statues]

    // Fisher-Yates: which statues wake has to be a fair draw, or the same corner of the room
    // comes alive every time and the other two are scenery.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }

    const waking = order.slice(0, count)

    waking.forEach((statue) => {
      this.spawnEnemy({ x: statue.x, y: statue.y })
      statue.destroy()
    })

    this.statues = this.statues.filter((statue) => !waking.includes(statue))

    return waking.length
  }

  // One purchase per visit. The rest of the shelf goes the moment the first thing is
  // taken, and that same moment is what the guards were waiting for - a guarded shop
  // charges its toll on the way out, not on the way in.
  closeShop() {
    this.shopSpent = true

    this.pickups.getChildren().forEach((pickup) => {
      if (pickup.spec.kind !== 'shop') {
        return
      }

      pickup.spec.priceTag.destroy()
      pickup.destroy()
    })

    const woken = this.wakeStatues(rollWakeCount(Math.random))

    // **Nothing woke, so nothing changes.** The doors are left open and the player walks out
    // with what they bought. Closing them for a frame and reopening them on the next would
    // be a flicker that said something happened when it did not.
    if (woken === 0) {
      this.toast('you take it - and nothing stirs', '#86efac')
      return
    }

    // The way out shuts behind the purchase. The doors were open the whole visit - a player
    // who buys nothing walks out freely - so this is the moment the shop stops being safe,
    // and it has to take the doors with it or the player simply leaves mid-wake.
    this.doors.forEach((door) => this.closeDoor(door))
    this.doors = []

    this.toast(
      `${woken} statue${woken === 1 ? '' : 's'} wake${woken === 1 ? 's' : ''} - clear them to leave`,
      '#fb923c'
    )
  }

  // Only the unique tiers can be sold out from under the player. Passives stack, so a
  // shop is happy to sell a second copy of one you are already wearing.
  shopPool() {
    const { inventory } = this.gameState

    return weightedPassivePool(inventory, sellableItems(ITEMS, inventory))
  }

  // One weighted draw from a catalogue slice. Ownership is the only thing that moves the
  // odds, so an item the player has never held draws at full weight, exactly as before.
  rollFrom(pool) {
    return pickWeighted(weightedPassivePool(this.gameState.inventory, pool), Math.random)
  }

  // One evenly spaced line across the room, so the stock reads as a shelf you walk along
  // and every price tag has the same room as its neighbours. The room is bare floor in a
  // shop, so there is nothing to place around.
  shelfSpots(count) {
    const { width } = this.scale
    const left = SHOP_SHELF_MARGIN
    const span = width - SHOP_SHELF_MARGIN * 2
    const y = this.viewSize().height * SHOP_SHELF_Y
    const step = span / count

    return Array.from(
      { length: count },
      (_, index) => new Phaser.Math.Vector2(left + step * (index + 0.5), y)
    )
  }

  spawnShopPickup(spot, entry) {
    const price = priceOf(entry)
    const colors = {
      item: PICKUP_SHOP_ITEM_COLOR,
      hp_refill: PICKUP_HP_REFILL_COLOR,
      bomb_refill: PICKUP_BOMB_REFILL_COLOR
    }

    const pickup = this.addPickup(spot.x, spot.y, {
      kind: 'shop',
      entry,
      price,
      // Catalogue stock hands its item up so addPickup can draw the icon. onPickup
      // branches on kind === 'shop' before it ever reads spec.item, so this changes
      // nothing about how buying works.
      item: entry.kind === 'item' ? entry.item : undefined,
      color: colors[entry.kind]
    })

    // The price rides under the box: a shop only works if the cost is visible before you
    // walk into it, and there is no room for it inside a 24 px pickup. A refill puts its
    // name on the line above; a catalogue item has no line above at all, because its icon
    // is already saying which item it is - see shelfLabelFor.
    const label = shelfLabelFor(entry)

    pickup.spec.priceTag = this.crispText(spot.x, spot.y + PICKUP_SIZE, label ? `${label}\n${price} EXP` : `${price} EXP`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e2e8f0',
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(HUD_DEPTH)
  }

  // Walking into stock buys it. Nothing is charged unless the effect actually lands, so a
  // full rack or a full health bar costs nothing - it just says why.
  buyFromShop(pickup) {
    const { entry, price } = pickup.spec

    // A refusal holds off the whole transaction, not just its toast: without this, a
    // player standing on stock they cannot use replays the reveal every frame.
    if (this.time.now < (pickup.spec.nextRefusalAt ?? 0)) {
      return
    }

    if (!canAfford(this.gameState, price)) {
      this.refusePurchase(pickup, `${price} EXP - you have ${this.gameState.exp}`)
      return
    }

    // A refill says what it is on the shelf, so it lands at once. A catalogue item is
    // bought blind - the shelf shows its tier and its price and no more - so the beat
    // goes between paying and finding out.
    if (entry.kind !== 'item') {
      this.completePurchase(pickup)
      return
    }

    this.beginReveal(pickup, () => this.completePurchase(pickup))
  }

  completePurchase(pickup) {
    const { entry, price } = pickup.spec
    const result = this.applyPurchase(entry)

    if (!result.success) {
      this.addLootPulse(pickup)
      this.refusePurchase(pickup, result.message)
      return
    }

    spendExp(this.gameState, price)
    pickup.spec.priceTag.destroy()
    pickup.destroy()
    this.refreshStats()

    this.notice(`bought ${result.message} (-${price} EXP)`, '#a3e635')
    console.log('[one-bomb-left] bought', entry.kind, 'exp left', this.gameState.exp)

    // Only a purchase that actually landed closes the shop - a refusal above returns
    // before this, so a full rack or an empty wallet leaves the shelf standing.
    this.closeShop()
  }

  applyPurchase(entry) {
    // Asked here and in shopIsDone from the same place, so the exit gate and the refusal
    // can never disagree about what a finished visit is. They did once, and it sealed a
    // player in - see purchaseBlockedReason.
    const blocked = purchaseBlockedReason(entry, this.purchaseContext())

    if (blocked) {
      return { success: false, message: blocked }
    }

    if (entry.kind === 'hp_refill') {
      this.health = this.stats.maxHp
      this.refreshHealthBar()

      this.refreshHealthBar()

      return { success: true, message: 'HP Refill: back to full' }
    }

    if (entry.kind === 'bomb_refill') {
      this.gameState.bombCount += 1

      return { success: true, message: 'Bomb Refill: +1 bomb' }
    }

    grantItem(this.gameState, entry.item)

    return { success: true, message: `${entry.item.name}: ${entry.item.effect}` }
  }

  // What purchaseBlockedReason needs to answer: the run, and the health it is measured
  // against. maxHp comes off this.stats rather than the inventory, because a trinket or a
  // passive can have moved it since the room was built.
  purchaseContext() {
    return { gameState: this.gameState, health: this.health, maxHp: this.stats.maxHp }
  }

  // The overlap re-fires every frame while standing on the stock, so the refusal speaks on
  // a cooldown. The box flashes with it - the toast alone reads as nothing having happened.
  refusePurchase(pickup, message) {
    if (this.time.now < (pickup.spec.nextRefusalAt ?? 0)) {
      return
    }

    pickup.spec.nextRefusalAt = this.time.now + SHOP_DENY_COOLDOWN

    this.tweens.add({ targets: pickup, alpha: 0.25, duration: 90, yoyo: true, repeat: 1 })
    this.toast(`can't buy - ${message}`, '#f87171')
  }

  // ---- room exit -----------------------------------------------------------

  // The exit opens the moment the room has nothing alive in it - and, in a shop, not
  // before the visit is over: browsing is not the same as being finished.
  checkRoomCleared() {
    if (this.doors.length > 0 || this.enemies.getChildren().length > 0) {
      return
    }

    if (!this.shopIsDone()) {
      return
    }

    // A corridor or a beaten boss opened its way on already; nothing else to do until it
    // is walked into.
    if (this.corridorExit || this.floorExit) {
      return
    }

    // A shop that has been bought from puts back the doors it already rolled rather than
    // rolling new ones: the player picked their next room before shopping, and a fresh roll
    // would both take that away and advance the floor's shop and puzzle counters a second
    // time, drifting its trap ordinal.
    if (this.doorPlan) {
      this.reopenDoors()
      return
    }

    this.payOutRoom()

    if (this.roomType === 'corridor') {
      this.openCorridorExit()
      return
    }

    if (this.roomType === 'boss') {
      this.openFloorExit()
      return
    }

    this.openDoors()
  }

  // The way down, once the boss is beaten. The same plain pad the corridor's exit uses and
  // for the same reason: there is nothing to choose here, so there is nothing to telegraph.
  //
  // **The boss room is a stub** - empty, cleared on the frame it opens - so this is really
  // proving the trigger and the transition rather than rewarding a fight. That is the whole
  // of what it is meant to do today.
  //
  // TODO: beating a boss should eventually open a **cutscene and a memory unlock**, not
  // just a door to the next floor. That is lore and narrative content and needs its own
  // design pass before anything is built - deliberately not stubbed here, because a
  // half-built cutscene hook is harder to replace than an honest plain door. See the entry
  // in zz_todo.md.
  openFloorExit() {
    const spot = this.freeSpotNear(this.player.x, this.player.y)

    this.floorExit = this.add.image(spot.x, spot.y, EXIT_TEXTURE).setDisplaySize(
      EXIT_SIZE,
      EXIT_SIZE
    )
    this.physics.add.existing(this.floorExit)
    this.floorExit.body.setAllowGravity(false)
    this.floorExit.body.setImmovable(true)
    this.physics.add.overlap(this.player, this.floorExit, () => this.descend(), null, this)

    this.toast(`floor ${this.gameState.floorNumber} cleared - the way down is open`, '#86efac')
  }

  // Down a floor. advanceFloor re-deals everything belonging to the floor - its length, its
  // two traps, its corridors - and leaves the run's own counters alone, so the inventory,
  // the EXP and the twist budget all come with you.
  descend() {
    if (this.leaving) {
      return
    }

    this.leaving = true

    advanceFloor(this.gameState, Math.random)

    this.scene.restart({
      plan: ENTRANCE_PLAN,
      carried: { gameState: this.gameState, health: this.health }
    })
  }

  // The far end of a corridor, once its enemies are down. Not a door: no pad, no colour,
  // no tier glow, nothing to read and nothing to choose. The telegraph already spoke when
  // the player took the door that led here, and the room it promised is the room they are
  // still on their way to - saying it twice would turn a pause into a second decision.
  //
  // Unarmed, unlike a real door. Arming exists so a pad appearing underfoot cannot take a
  // *choice* away, and there is no choice here: walking on is the only thing a corridor
  // offers. A player standing at the end when the last enemy dies should simply continue.
  //
  // It was an invisible trigger first, which matched the brief and felt wrong to walk into
  // - an exit you cannot see is a wall you happen to pass through. It is a pad now, and
  // still says nothing.
  openCorridorExit() {
    const [cell] = doorCells(this.shape, this.shape.exits[0], 1)
    const spot = this.centreOf(cell)

    this.corridorExit = this.add.rectangle(
      spot.x,
      spot.y,
      EXIT_SIZE,
      EXIT_SIZE,
      CORRIDOR_EXIT_COLOR,
      CORRIDOR_EXIT_ALPHA
    )
    this.corridorExit.setStrokeStyle(CORRIDOR_EXIT_STROKE, CORRIDOR_EXIT_COLOR)
    this.physics.add.existing(this.corridorExit)
    this.corridorExit.body.setAllowGravity(false)
    this.corridorExit.body.setImmovable(true)

    this.physics.add.overlap(this.player, this.corridorExit, () => this.leaveCorridor(), null, this)

    this.toast('the way ahead is clear', '#86efac')
  }

  // Reaching the end hands over the room the corridor was always on the way to, resolved
  // when the door was taken rather than now - so a corridor cannot change where you were
  // going, only how long it takes to get there.
  leaveCorridor() {
    if (this.leaving) {
      return
    }

    this.leaving = true

    this.scene.restart({
      ...this.pending,
      carried: { gameState: this.gameState, health: this.health }
    })
  }

  // Clearing a combat room pays exactly one item, and **which kind is rolled here rather
  // than settled by the door**. It used to be read straight off the door type - a safe
  // room paid clean, a risky one paid a debuff - so the payout was decided the moment the
  // player picked a colour. With safe and risky merged there is no colour to read it off,
  // and the gamble moves from which door you took to what the room turns out to give you.
  //
  // Gated on roomType rather than on the plan's type so a shop, a puzzle and a corridor
  // all still pay nothing: a shop has already sold you what it was going to, a puzzle is a
  // stub, and a corridor is the bit between rooms. Runs once, because openDoors() is what
  // stops checkRoomCleared coming back round.
  payOutRoom() {
    if (this.roomType !== 'combat') {
      return
    }

    const spot = this.freeSpotNear(this.player.x, this.player.y)

    if (rollRoomDrop(Math.random) === DEBUFF_DROP) {
      this.spawnDebuffPickup(spot.x, spot.y)
    } else {
      this.spawnCleanPickup(spot.x, spot.y)
    }
  }

  // **A shop never holds its exit shut.** The doors are open from the moment the player
  // walks in, and buying nothing is a real way to leave - browsing costs nothing and
  // declining costs nothing either.
  //
  // It used to hold the exit until the visit was "over", with an escape hatch for a shelf
  // with nothing buyable on it. That hatch was a softlock waiting to happen and had already
  // been one twice: affordable is not the same as buyable, and a bomb refill was not the
  // same as something worth buying. Opening the doors outright deletes the whole class of
  // problem rather than patching its next instance.
  //
  // What closes them is buying, and only until the statues that wakes are down - see
  // closeShop.
  shopIsDone() {
    return true
  }

  // 2-3 doors along the top wall, each advertising a reward type by colour and a
  // difficulty by glow - and every one of them telling the truth. A door used to resolve
  // to something possibly different from what it advertised; it no longer can, so what is
  // painted here is simply what is behind it.
  openDoors() {
    // What this room of this floor is allowed to offer: the boss takes the last regular
    // room's choice outright, the two checkpoints guarantee a shop beside a real door, and
    // everything else rolls freely.
    const policy = doorPolicyFor(this.gameState.roomOnFloor, this.gameState.floorRooms)
    // Tagged after rolling, not during: the tagging reads and advances the floor's shop and
    // puzzle counters, and a roll should not be the thing that moves state.
    const rolled = assignTwistDispositions(
      rollDoors(Math.random, policy),
      this.gameState,
      policy
    )
    // Kept so a shop can rebuild exactly these after its guardians fall.
    this.doorPlan = rolled

    const spots = this.pickDoorSpots(rolled.length)

    // The spots are the truth: a shaped room's exit tips seat what doorCapacity() said
    // they would, so a roll of three onto a pair of narrow tips comes out as two.
    this.doors = rolled
      .slice(0, spots.length)
      .map((door, index) => this.buildDoor(door, spots[index]))

    // A corridor offers one door, and "1 doors, pick one" is not a sentence.
    const choice =
      this.doors.length === 1 ? 'one way on' : `${this.doors.length} doors, pick one`

    this.toast(`room clear - ${choice}`, '#86efac')
  }

  // The same doors again, from the roll that already happened. No new roll, no second pass
  // over the floor's counters.
  reopenDoors() {
    const spots = this.pickDoorSpots(this.doorPlan.length)

    this.doors = this.doorPlan
      .slice(0, spots.length)
      .map((door, index) => this.buildDoor(door, spots[index]))

    this.toast('the way on is open again', '#86efac')
  }

  buildDoor(advertised, spot) {
    const { color, label } = DOOR_STYLE[advertised.type]
    const glow = TIER_GLOW[advertised.tier]

    const pad = this.add.rectangle(spot.x, spot.y, EXIT_SIZE, EXIT_SIZE, color, glow.alpha)
    pad.setStrokeStyle(glow.stroke, color)
    this.physics.add.existing(pad)
    pad.body.setAllowGravity(false)
    pad.body.setImmovable(true)

    const text = this.crispText(spot.x, spot.y + EXIT_SIZE / 2 + 4, `${label}
${advertised.tier}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e2e8f0',
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(HUD_DEPTH)

    // The pulse is the glow's other half: a hard door beats faster than an easy one.
    const pulse = this.tweens.add({
      targets: pad,
      alpha: Math.min(1, glow.alpha + 0.35),
      duration: glow.pulse,
      yoyo: true,
      repeat: -1
    })

    // Unarmed until the player is clear of it - see updateDoorArming. A door that opened
    // under the player's feet would otherwise be taken on the frame it appeared.
    const door = { advertised, disposition: advertised.disposition, pad, text, pulse, armed: false }

    this.physics.add.overlap(this.player, pad, () => this.takeDoor(door), null, this)

    return door
  }

  // A door only becomes takeable once the player has been clear of it, so the choice is
  // always shown before it can be made. The same idea as the pickup re-arm rule: standing
  // where something appears must not count as reaching for it. A door that opens across
  // the room arms on its first frame, so this costs nothing in the ordinary case.
  updateDoorArming() {
    this.doors.forEach((door) => {
      if (door.armed) {
        return
      }

      const gap = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        door.pad.x,
        door.pad.y
      )

      if (gap > DOOR_ARM_DISTANCE) {
        door.armed = true
      }
    })
  }

  // Evenly spaced across the top of the room, the same idea as the shop shelf, each pad
  // snapped to the nearest cell the player can actually stand on.
  pickDoorSpots(count) {
    if (this.shape) {
      return this.pickShapeDoorSpots(count)
    }

    const { width } = this.scale
    const span = width - DOOR_MARGIN * 2
    const step = span / count

    return Array.from({ length: count }, (_, index) =>
      this.nearestFreePoint(DOOR_MARGIN + step * (index + 0.5), DOOR_ROW_Y)
    )
  }

  // A shaped room has its doors where the mask says they go: split between its exit tips
  // by splitDoors(), then spread along each tip's wall run. L and Z have one tip and take
  // whatever was rolled on it, exactly as the top wall of a rectangular room does; T and
  // G have two, and the split is what lets a pair of doors land on either one or straddle
  // both instead of always piling onto the first.
  pickShapeDoorSpots(count) {
    const split = splitDoors(this.shape, count, Math.random)

    return this.shape.exits.flatMap((exit, index) =>
      doorCells(this.shape, exit, split[index]).map((cell) => {
        const { x, y } = this.centreOf(cell)

        return this.nearestFreePoint(x, y)
      })
    )
  }

  // Snapped to the nearest cell the player can actually stand on, so a door never opens
  // inside a rock or hard against a wall.
  // Three candidates, in order of preference: a cell with room around it within reach of
  // where we aimed; failing that any open cell within reach, because a door pressed up
  // against a rock is still a door on the wall; and only then the nearest roomy cell at
  // any distance, which is what this used to do unconditionally and what put pads in the
  // middle of the arena.
  nearestFreePoint(x, y, limit = DOOR_SNAP_LIMIT) {
    const target = new Phaser.Math.Vector2(x, y)
    let roomyNear = null
    let roomyNearAt = Infinity
    let anyNear = null
    let anyNearAt = Infinity
    let roomyAnywhere = null
    let roomyAnywhereAt = Infinity

    for (let row = 1; row < this.rows - 1; row++) {
      for (let col = 1; col < this.cols - 1; col++) {
        if (this.blocked[row][col]) {
          continue
        }

        const point = this.centreOf([row, col])
        const distance = Phaser.Math.Distance.BetweenPoints(point, target)
        const roomy = this.hasClearance(row, col)

        if (roomy && distance < roomyAnywhereAt) {
          roomyAnywhere = point
          roomyAnywhereAt = distance
        }
        if (distance > limit) {
          continue
        }
        if (distance < anyNearAt) {
          anyNear = point
          anyNearAt = distance
        }
        if (roomy && distance < roomyNearAt) {
          roomyNear = point
          roomyNearAt = distance
        }
      }
    }

    return roomyNear ?? anyNear ?? roomyAnywhere ?? target
  }

  // Physics keeps firing the overlap while the player stands in it, and scene.restart()
  // does not take effect until the end of the tick - so this has to be one-shot. The
  // doors not taken are torn down first: the choice is made, there is no walking back.
  takeDoor(door) {
    if (this.leaving || !door.armed) {
      return
    }

    this.leaving = true
    this.doors.forEach((other) => this.closeDoor(other))

    // The boss is spelled out rather than looked up - no roll produced it, so roomPlanFor
    // has no entry for it, the same as the entrance and the corridor.
    const plan = door.advertised.type === 'boss' ? BOSS_PLAN : roomPlanFor(door.advertised)

    // Whether this room turns hostile. Rolled here rather than on arrival, alongside the
    // plan and the shape, so the room is settled before the scene starts - the same place
    // and the same moment as every other property of a room. Booked here too rather than
    // when the doors were rolled: two or three doors were offered and this is the only one
    // the player will ever stand in, so charging the budget for the others would spend it
    // on rooms nobody saw.
    const twisted = rollTwist(plan, this.gameState, Math.random, door.disposition)

    recordTwist(this.gameState, plan, twisted)

    this.gameState.roomNumber += 1
    // Beside roomNumber rather than instead of it. roomNumber is how deep the run is;
    // roomOnFloor is where you stand on this floor, and the boss and the checkpoints are
    // measured against the second one.
    this.gameState.roomOnFloor += 1

    const destination = {
      plan: twisted ? TWISTED_PLAN : plan,
      // What the door said, kept only so the room can name it when it turns. null on an
      // ordinary room, which is nearly all of them.
      twisted: twisted ? door.advertised : null,
      // Rolled off the **pre-twist** plan on purpose. A shop lays its stock along one line
      // and needs bare floor to do it, so it stays a rectangle however deep the run is -
      // see shelfSpots, which measures in screens - and a shop that turns into a fight
      // stays the room the player thought they were walking into. Reading the twisted plan
      // here would hand a twisted shop a big-room silhouette it never advertised.
      // A shop lays its stock along one line and a boss room is a stub, so neither takes a
      // silhouette. Everything else is measured against its position on the floor, so a
      // deep floor is as varied as the first one.
      shape:
        plan.roomType === 'shop' || plan.roomType === 'boss'
          ? null
          : rollRoomShape(
              this.gameState.roomOnFloor,
              this.gameState.floorRooms,
              Math.random
            )
    }

    // Whether a corridor sits behind this door was decided when the floor was rolled, and
    // the door itself knows nothing about it: its colour and its glow are the destination's
    // and always were. The corridor is spliced in front, and the destination waits.
    // **Never behind the boss door.** A hallway between the last room and the boss would
    // put a pause exactly where the run should be tightening, and the boss door is the one
    // door that is not a choice - there is nothing for a corridor to delay the reveal of.
    const corridorAhead =
      door.advertised.type !== 'boss' &&
      this.gameState.corridorDoors.includes(this.gameState.doorsTaken)

    this.gameState.doorsTaken += 1

    this.scene.restart({
      ...(corridorAhead
        ? { plan: CORRIDOR_PLAN, shape: 'corridor', pending: destination }
        : destination),
      carried: { gameState: this.gameState, health: this.health }
    })
  }

  closeDoor(door) {
    door.pulse.stop()
    door.pad.destroy()
    door.text.destroy()
  }

  // What the room turned out to be, said once on entry - the only way the player learns
  // whether the door they read was telling the truth.
  announceRoom() {
    // A corridor has no door style to read a label off, because no door type leads to one.
    if (this.roomType === 'corridor') {
      this.toast('a corridor', '#94a3b8')
      return
    }

    if (this.roomType === 'boss') {
      this.toast(`FLOOR ${this.gameState.floorNumber} BOSS`, '#f87171')
      return
    }

    const { label } = DOOR_STYLE[this.roomPlan.type]
    // A big room says which shape it is, because it is the first thing about it that
    // matters and the silhouette takes a walk to read from inside. A corridor just says
    // corridor: "corridor big room" is not a thing, and a corridor is not big anyway.
    const shape = !this.shape
      ? ''
      : this.shape.id === 'corridor'
        ? ' - corridor'
        : ` - ${this.shape.id} big room`
    this.toast(`${label} room - ${this.roomPlan.tier}${shape}`, '#cbd5e1')
  }

  // A twist the player does not recognise as a twist is just the game misbehaving, so it
  // is announced loudly and in the game's own vocabulary. AMBUSH in capitals reads as a
  // mechanic rather than a glitch; naming the room type says exactly which promise was
  // broken; and the sting gives it a beat that a line of text cannot.
  //
  // This gets its own line rather than sharing the toast slot, and it is called before
  // populateRoom branches, for two reasons found the hard way with the system this
  // replaced: a shop returns from populateRoom before announceRoom is ever reached, so an
  // announcement about a shop was silent; and a room with nothing in it clears on its
  // first frame, so the "room clear" toast overwrote the line before it could be read.
  announceTwist() {
    if (!this.twisted) {
      return
    }

    // One line out of 28, never the one the last ambush used. The memory is on gameState
    // rather than here because each room is a new scene: a scene-held value would forget
    // between ambushes and the no-repeat rule would mean nothing.
    const line = pickTwistLine(this.gameState.lastTwistLine, Math.random)

    this.gameState.lastTwistLine = line

    const { width, height } = this.scale

    // Screen-centred and screen-pinned, not room-centred: a big room scrolls, and the
    // word belongs in front of the player's eyes rather than somewhere in the level.
    const word = this.crispText(width / 2, height / 2 - 18, 'AMBUSH', {
        fontFamily: 'monospace',
        fontSize: AMBUSH_TEXT_SIZE,
        color: '#f87171',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2)

    // Wrapped, because the pool runs to 96 characters and a single line of it would
    // overrun a 1344 px room and be cut off at both ends.
    const said = this.crispText(width / 2, height / 2 + 30, line, {
        fontFamily: 'monospace',
        fontSize: AMBUSH_SUBTEXT_SIZE,
        color: '#fca5a5',
        align: 'center',
        wordWrap: { width: width - AMBUSH_TEXT_MARGIN }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2)

    // Measured off what the two texts actually laid out to, rather than off a guessed
    // size: the line is wrapped, so how tall it ends up is not known until it exists.
    // displayWidth/Height rather than getBounds() because these are screen-pinned, and
    // bounds would be reported against a camera that has scrolled.
    const top = word.y - word.displayHeight / 2 - AMBUSH_PANEL_PAD
    const bottom = said.y + said.displayHeight + AMBUSH_PANEL_PAD
    const panel = this.add
      .rectangle(
        width / 2,
        (top + bottom) / 2,
        Math.max(word.displayWidth, said.displayWidth) + AMBUSH_PANEL_PAD * 2,
        bottom - top,
        AMBUSH_PANEL_COLOR,
        AMBUSH_PANEL_ALPHA
      )
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1)

    this.playAmbushSting()
    this.cameras.main.shake(AMBUSH_SHAKE_MS, 0.006)
    this.freezeForAmbush([panel, word, said])
  }

  // The room stops for as long as the word is up. Physics is paused rather than the scene,
  // so the camera keeps shaking and the sting keeps sounding - the beat is the point, and a
  // fully stopped scene would take the shake with it.
  //
  // The same trick the pause menu uses, and the same debt: cooldowns are wall-clock
  // timestamps and the clock does not stop, so the frozen time is added back to every
  // deadline on the way out. Without it the player would spend half a second of their fire
  // cooldown, and every enemy half a second of theirs, standing still.
  freezeForAmbush(objects) {
    this.player.body.setVelocity(0, 0)
    this.physics.pause()

    this.ambush = { until: this.time.now + AMBUSH_FREEZE_MS, at: this.time.now, objects }
  }

  releaseAmbush() {
    this.ambush.objects.forEach((object) => object.destroy())
    this.shiftDeadlines(this.time.now - this.ambush.at)
    this.ambush = null
    this.physics.resume()
  }

  // The project's only sound, and it carries no asset: an organ chord built out of the
  // tritone, swelling and then sagging flat over a second and a half.
  //
  // Synthesised rather than loaded because there is no audio pipeline here at all - no
  // files, no preload, no Phaser sound manager - and introducing one for a single sting
  // would be a bigger change than the mechanic it announces. It is a placeholder in the
  // same register as the coloured rectangles everything else is drawn with, and the whole
  // of it is replaceable by one this.sound.play() when the project takes on real audio.
  //
  // Wrapped in a try/catch because audio is the one thing here that can fail for reasons
  // outside the game: a browser that blocks it, a tab with no output device, a context
  // suspended because nothing has been clicked yet. A missing sound must not take the
  // ambush down with it - the word on screen is the part that matters.
  playAmbushSting() {
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext

      if (!Ctx) {
        return
      }

      this.audio = this.audio ?? new Ctx()

      // Autoplay policy suspends a context created before the first gesture. By the time a
      // room can twist the player has been pressing keys for a while, so this resolves.
      if (this.audio.state === 'suspended') {
        this.audio.resume()
      }

      const now = this.audio.currentTime
      const seconds = AMBUSH_STING_MS / 1000
      const gain = this.audio.createGain()
      const filter = this.audio.createBiquadFilter()

      // A resonant lowpass closing as it goes: the chord starts open and is swallowed.
      // The resonance is what turns a filter sweep into a howl rather than a fade.
      filter.type = 'lowpass'
      filter.Q.value = 7
      filter.frequency.setValueAtTime(1400, now)
      filter.frequency.exponentialRampToValueAtTime(160, now + seconds)

      // Swells rather than snaps. A fast attack reads as a button click; 90 ms of rise
      // reads as something arriving, and the long tail lets it sit under the word.
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.09)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)

      filter.connect(gain)
      gain.connect(this.audio.destination)

      AMBUSH_STING_VOICES.forEach((ratio) =>
        [1 - AMBUSH_STING_DETUNE, 1 + AMBUSH_STING_DETUNE].forEach((detune) => {
          const osc = this.audio.createOscillator()
          const from = AMBUSH_STING_HZ * ratio * detune

          // Sawtooth for the harmonics an organ pipe has and a sine does not - the filter
          // above is what shapes them into something with a body.
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(from, now)
          osc.frequency.exponentialRampToValueAtTime(from * AMBUSH_STING_SAG, now + seconds)
          osc.connect(filter)
          osc.start(now)
          osc.stop(now + seconds)
        })
      )
    } catch {
      // no sound, and the ambush still reads
    }
  }

  // The line above the toast. Only one at a time - a later notice replaces an earlier one,
  // because both are one-off tellings and the newer one is the one being reacted to.
  notice(message, color) {
    if (this.noticeText) {
      this.noticeText.destroy()
    }

    const { width, height } = this.scale

    this.noticeText = this.crispText(width / 2, height - NOTICE_OFFSET, message, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)

    this.tweens.add({
      targets: this.noticeText,
      alpha: 0,
      delay: NOTICE_LIFETIME - 600,
      duration: 600
    })
  }

  addPickup(x, y, spec) {
    // Anything carrying an item wears that item's icon - on the floor and on a shop shelf
    // alike - so what you are looking at, what you picked up, and what is later listed in
    // the pause menu are recognisably the same thing. The kind colour does not go to
    // waste: it becomes the outline, so a debuff reads purple-edged, a safe drop
    // gold-edged and shop stock blue-edged, while the fill says which item it is.
    //
    // Heals and refills carry no item, so they keep the plain box they always had.
    const pickup = spec.item
      ? this.drawItemIcon(x, y, spec.item, PICKUP_SIZE, spec.color).setStrokeStyle(3, spec.color)
      : this.add.rectangle(x, y, PICKUP_SIZE, PICKUP_SIZE, spec.color).setStrokeStyle(2, ICON_EDGE_COLOR)

    pickup.spec = spec

    this.physics.add.existing(pickup)
    pickup.body.setAllowGravity(false)
    pickup.body.setImmovable(true)
    this.pickups.add(pickup)

    this.addLootPulse(pickup)

    return pickup
  }

  // A slow pulse so a pickup reads as loot rather than another bit of level geometry. Its
  // own method because the reveal has to stop it and then put it back, for the pickups
  // that survive being revealed - one already owned, or one the rack has no room for.
  // The one place a placeholder icon is drawn. Returns a Shape, so the caller can give it
  // physics, tween it, or just leave it sitting in a menu.
  //
  // Four shapes, none of which needs a base rotation - which is what lets the pickup
  // reveal spin one through 360 degrees and set it back to 0 without leaving it crooked.
  drawItemIcon(x, y, item, size, edgeColor = ICON_EDGE_COLOR) {
    const { shape, color } = item.icon
    const half = size / 2
    const shapes = {
      circle: () => this.add.circle(x, y, half, color),
      square: () => this.add.rectangle(x, y, size, size, color),
      triangle: () => this.add.triangle(x, y, 0, size, size, size, half, 0, color),
      star: () => this.add.star(x, y, 5, half * 0.48, half, color)
    }

    return shapes[shape]().setStrokeStyle(2, edgeColor)
  }

  addLootPulse(pickup) {
    this.tweens.add({
      targets: pickup,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 700,
      yoyo: true,
      repeat: -1
    })
  }

  // The beat between touching an item and finding out what it was. Nothing about the run
  // changes until `onRevealed` runs: the grant, the stat recompute and the name all wait
  // for the end of it. A ring opens outward while the box swells and turns over.
  //
  // Only items go through here. EXP, heals and bomb refills stay instant, because there
  // is no identity to find out - a heal is a heal, and making the player wait to be told
  // so would be ceremony rather than information.
  beginReveal(pickup, onRevealed) {
    pickup.spec.revealing = true
    this.tweens.killTweensOf(pickup)
    pickup.setScale(1)

    const ring = this.add
      .circle(pickup.x, pickup.y, PICKUP_SIZE * 0.75)
      .setStrokeStyle(2, REVEAL_RING_COLOR, 0.9)

    this.tweens.add({
      targets: ring,
      scale: REVEAL_RING_SCALE,
      alpha: 0,
      duration: REVEAL_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    })

    this.tweens.add({
      targets: pickup,
      scaleX: REVEAL_SCALE,
      scaleY: REVEAL_SCALE,
      angle: 360,
      duration: REVEAL_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        pickup.spec.revealing = false

        // A restart mid-beat takes the pickup with it; nothing to reveal to.
        if (!pickup.active) {
          return
        }

        pickup.setScale(1)
        pickup.setAngle(0)
        onRevealed()
      }
    })
  }

  // Touching a pickup takes it - the take/skip choice is still to come, so a debuff is
  // shown in purple and the only way to skip one is to walk around it.
  onPickup(player, pickup) {
    // declined pickups, items just dropped underfoot, and anything already mid-beat all
    // stay inert - the last one is what stops a reveal restarting every frame while the
    // player stands on top of it
    if (this.swap || pickup.spec.declined || pickup.spec.revealing) {
      return
    }

    if (pickup.spec.kind === 'shop') {
      this.buyFromShop(pickup)
      return
    }

    if (pickup.spec.kind === 'heal') {
      this.takeHeal(pickup)
      return
    }

    this.beginReveal(pickup, () => this.applyItemPickup(pickup))
  }

  // What the beat resolves to. Everything the pickup does to the run happens here, at the
  // end of it, so the HP bar moving and the name appearing are the same moment.
  applyItemPickup(pickup) {
    const { kind, item } = pickup.spec

    // Every pickup goes into the rack the same way. There used to be a second path for a
    // reward, which counted itself and rolled a curse; the debuff items carry their own
    // cost in their own stat fields now, so there is nothing extra to charge.
    const result = grantItem(this.gameState, item)

    // Already held: nothing was placed and no curse was paid, so the pickup is left in
    // the room rather than eaten for nothing - swap something out and it can be taken.
    // The overlap re-fires every frame while standing on it, so announce it just once.
    if (result && result.reason === 'owned') {
      this.toast(`${item.name} - already owned`, '#94a3b8')
      console.log('[one-bomb-left] already owned, left in the room:', item.id)
      // Now that it is known, it goes inert until stepped away from - otherwise standing
      // on it would replay the beat, and the reveal, over and over.
      pickup.spec.declined = true
      this.addLootPulse(pickup)
      return
    }

    // A full rack is a choice, not a loss: the pickup stays in the room until the player
    // either picks a slot or backs out.
    if (needsSwapPrompt(result)) {
      this.addLootPulse(pickup)
      this.openSwapPrompt(item, pickup)
      return
    }

    pickup.destroy()
    this.refreshStats()

    // One trinket slot: the one it replaced goes back on the floor rather than vanishing,
    // the same as an active displaced through the swap prompt.
    if (result && result.displaced) {
      this.dropItem(result.displaced)
    }

    // A debuff is announced in the curse colour and named as what it is - it carries a
    // cost as well as a gift, and the toast should not read like an unqualified win.
    const debuff = kind === 'debuff'

    // The notice slot, not the toast: this is what the reveal was for, and an empty room
    // firing "room clear" on the next frame would otherwise wipe it.
    this.notice(
      `${item.name}: ${item.effect}${debuff ? ' (DEBUFF)' : ''}`,
      debuff ? '#c084fc' : '#67e8f9'
    )
    console.log('[one-bomb-left] picked up', item.id, 'stats', this.stats)
  }

  // Half a heart, not a refill. At full HP it is left on the floor rather than eaten for
  // nothing - come back for it after the next hit. The shop's HP Refill is still the
  // all-or-nothing one, which is now the thing that makes it worth its price.
  takeHeal(pickup) {
    if (this.health >= this.stats.maxHp) {
      if (!pickup.spec.announcedOwned) {
        pickup.spec.announcedOwned = true
        this.toast('heal - already at full HP', '#94a3b8')
      }
      return
    }

    this.healPlayer(HEAL_PICKUP_HP)
    pickup.destroy()
    this.toast('heal - half a heart', '#f87171')
  }

  // Every stat is recomputed from the inventory, so a set bonus that no longer holds
  // simply stops being included. Extra max HP is handed over as real HP too.
  refreshStats() {
    const before = this.stats
    this.stats = computeStats(BASE_STATS, this.gameState.inventory)

    const gained = this.stats.maxHp - before.maxHp
    if (gained !== 0) {
      this.health = Phaser.Math.Clamp(this.health + Math.max(0, gained), 0, this.stats.maxHp)
      this.buildHealthBar()
    } else {
      this.refreshHealthBar()
    }
  }

  // ---- active items --------------------------------------------------------

  updateActives(time) {
    this.activeKeys.forEach((key, slot) => {
      if (!Phaser.Input.Keyboard.JustDown(key)) {
        return
      }

      const result = triggerActive(this.gameState.inventory, slot, time, this.gameState.cooldowns)

      if (!result.fired) {
        if (result.reason === 'cooling') {
          const left = cooldownRemaining(result.item, time, this.gameState.cooldowns)
          this.toast(`${result.item.name} on cooldown (${(left / 1000).toFixed(1)}s)`, '#94a3b8')
        }
        return
      }

      this.useActive(result.item)
    })
  }

  useActive(item) {
    if (item.id === 'panic_button') {
      this.usePanicButton()
    }
    if (item.id === 'second_wind') {
      this.healPlayer(SECOND_WIND_HEAL)
    }
    if (item.id === 'repair_kit') {
      this.healPlayer(REPAIR_KIT_HEAL)
    }
    if (item.id === 'bulwark') {
      this.useBulwark()
    }

    this.toast(`${item.name}!`, '#a3e635')
  }

  usePanicButton() {
    const ring = this.add.circle(this.player.x, this.player.y, PANIC_RADIUS, 0xa3e635, 0.18)
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 320,
      onComplete: () => ring.destroy()
    })

    this.enemies.getChildren().slice().forEach((enemy) => {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y
      )

      if (distance > PANIC_RADIUS) {
        return
      }

      const away = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y)
      if (away.length() === 0) {
        away.set(0, -1)
      }
      away.normalize().scale(PANIC_PUSH_SPEED)

      enemy.body.setVelocity(away.x, away.y)
      // hold the shove for a moment - updateEnemies would steer straight back otherwise
      enemy.pushedUntil = this.time.now + PANIC_PUSH_DURATION

      this.damageEnemy(enemy, PANIC_DAMAGE)
    })

    // shots already in the air are part of the panic
    this.enemyShots.getChildren().slice().forEach((shot) => shot.destroy())
  }

  // Rides the existing i-frame window rather than adding a second kind of invulnerability:
  // takeHit already refuses everything until nextHitAt, so pushing it out is the whole
  // effect. A ring shows how long is left.
  useBulwark() {
    this.nextHitAt = Math.max(this.nextHitAt, this.time.now + BULWARK_DURATION)

    const ring = this.add.circle(this.player.x, this.player.y, PLAYER_SIZE, 0x60a5fa, 0.28)
    ring.setStrokeStyle(2, 0x93c5fd)

    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: BULWARK_DURATION,
      onComplete: () => ring.destroy()
    })

    // the shield travels with the player for as long as it lasts
    this.bulwarkRing = ring
  }

  healPlayer(amount) {
    this.health = Math.min(this.stats.maxHp, this.health + amount)
    this.refreshHealthBar()
  }

  // ---- item slots ----------------------------------------------------------

  // One trinket box and a running list of passives on the left, 3 active boxes on the
  // right. Everything is a rectangle plus a short abbreviation - no art yet, but enough to
  // read what is equipped, in which slot, and whether an active is ready.
  buildItemHud() {
    const { width, height } = this.scale

    // Both groups live in the bottom wall band, split around the doorway gap: the trinket
    // and the passive list to the left of it, actives to the right. Nothing here covers a
    // walkable tile.
    const keyHintY = height - WALL_THICKNESS + 2
    const rowY = height - WALL_THICKNESS + 16 + SLOT_SIZE / 2

    const label = (x, y, text, origin) =>
      this.crispText(x, y, text, { fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1' })
        .setOrigin(origin, 0.5)
        .setDepth(HUD_DEPTH)
        .setScrollFactor(0)

    // The wall is a light slate, so each group gets a dark plate behind it - the boxes
    // and their dim labels are unreadable straight on the wall colour.
    const plate = (left, right) =>
      this.add
        .rectangle(
          (left + right) / 2,
          height - WALL_THICKNESS / 2,
          right - left,
          WALL_THICKNESS - 6,
          0x0b0e14,
          0.88
        )
        .setDepth(HUD_DEPTH - 1)
        .setScrollFactor(0)

    // Only the trinket lives on the left now. The passive tier is uncapped and unbounded
    // in width, so it was never going to read on a wall band - the pause menu spells it
    // out in full names instead, and the plate here is cut back to the one slot it holds.
    plate(HUD_EDGE_MARGIN - 6, HUD_EDGE_MARGIN + 138)
    label(HUD_EDGE_MARGIN, rowY, 'TRINKET', 0)
    this.hudTrinketSlot = this.buildSlotRow(HUD_EDGE_MARGIN + 130, rowY, keyHintY, 1, false)[0]

    const activeRowWidth = 3 * SLOT_SIZE + 2 * SLOT_GAP
    const activeRight = width - HUD_EDGE_MARGIN - 66
    plate(activeRight - activeRowWidth - 8, width - HUD_EDGE_MARGIN + 6)
    label(width - HUD_EDGE_MARGIN, rowY, 'ACTIVES', 1)
    this.hudActiveSlots = this.buildSlotRow(activeRight, rowY, keyHintY, 3, true)

    // EXP rides the middle of the top band: clear of the hearts on the left and the
    // status text on the right.
    this.hudExpText = this.crispText(width / 2, WALL_THICKNESS / 2, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#fbbf24'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0)

    // Status text goes in the top band beside the hearts, where there is room to spare.
    this.hudSetText = this.crispText(width - HUD_EDGE_MARGIN, WALL_THICKNESS / 2, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a3e635'
      })
      .setOrigin(1, 0.5)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0)
  }

  buildSlotRow(right, centreY, keyHintY, count, withKeyHints) {
    const slots = []

    for (let index = 0; index < count; index++) {
      const x = right - (count - 1 - index) * (SLOT_SIZE + SLOT_GAP) - SLOT_SIZE / 2

      const box = this.add
        .rectangle(x, centreY, SLOT_SIZE, SLOT_SIZE, SLOT_EMPTY_FILL)
        .setDepth(HUD_DEPTH)
        .setScrollFactor(0)
      box.setStrokeStyle(2, SLOT_EMPTY_EDGE)

      // drawn from the bottom edge up, then scaled to whatever is left of the cooldown
      const veil = this.add
        .rectangle(
          x,
          centreY + SLOT_SIZE / 2 - 1,
          SLOT_SIZE - 4,
          SLOT_SIZE - 4,
          SLOT_VEIL_COLOR,
          0.74
        )
        .setOrigin(0.5, 1)
        .setDepth(HUD_DEPTH + 1)
        .setScrollFactor(0)
      veil.setScale(1, 0)

      const text = this.crispText(x, centreY - 5, '.', {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#64748b'
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH + 2)
        .setScrollFactor(0)

      const timer = this.crispText(x, centreY + SLOT_SIZE / 2 - 3, '', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#e2e8f0'
        })
        .setOrigin(0.5, 1)
        .setDepth(HUD_DEPTH + 2)
        .setScrollFactor(0)

      // the key that fires this slot, on its own line above the boxes
      if (withKeyHints) {
        this.crispText(x, keyHintY, String(index + 1), {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#94a3b8'
          })
          .setOrigin(0.5, 0)
          .setDepth(HUD_DEPTH)
          .setScrollFactor(0)
      }

      slots.push({ box, veil, text, timer })
    }

    return slots
  }

  refreshItemHud(time) {
    const { inventory, cooldowns } = this.gameState

    this.paintSlot(this.hudTrinketSlot, inventory.trinket)

    inventory.actives.forEach((item, index) => {
      const slot = this.hudActiveSlots[index]
      this.paintSlot(slot, item)

      if (!item) {
        return
      }

      // dimmed and veiled while cooling, green-edged the moment it is usable again
      const left = cooldownRemaining(item, time, cooldowns)
      const cooling = left > 0

      slot.veil.setScale(1, cooling ? left / item.cooldown : 0)
      slot.timer.setText(cooling ? (left / 1000).toFixed(1) + 's' : '')
      slot.text.setAlpha(cooling ? 0.5 : 1)
      slot.box.setStrokeStyle(2, cooling ? SLOT_FILLED_EDGE : SLOT_READY_EDGE)
    })

    // How deep the run is, beside the wallet. Big rooms only happen in a band of the run,
    // so "which room is this" stopped being trivia the moment the band existed.
    this.hudExpText.setText(
      // The boss room sits past the floor's last numbered room, so counting it would read
      // as 8/7. It gets the word instead of the number.
      `FLOOR ${this.gameState.floorNumber}` +
        (this.roomType === 'boss'
          ? '  BOSS'
          : `-${this.gameState.roomOnFloor}/${this.gameState.floorRooms}`) +
        `   ROOM ${this.gameState.roomNumber}   EXP ${this.gameState.exp}` +
        `   BOMBS ${this.gameState.bombCount}`
    )
    // Asked of the inventory rather than inferred from damage > 1: stacked passives raise
    // damage on their own now, so that test lit the readout up with no set equipped.
    const set = hasSetBonus(inventory, ...SET_BONUS.ids)
    this.hudSetText.setText(set ? 'SET  +5% dmg' : '')
  }

  paintSlot(slot, item) {
    slot.text.setText(item ? abbreviate(item.name) : '.')
    slot.text.setColor(item ? '#e2e8f0' : '#64748b')
    slot.text.setAlpha(1)
    slot.box.setFillStyle(item ? SLOT_FILLED_FILL : SLOT_EMPTY_FILL)
    slot.box.setStrokeStyle(2, item ? SLOT_FILLED_EDGE : SLOT_EMPTY_EDGE)

    if (!item) {
      slot.veil.setScale(1, 0)
      slot.timer.setText('')
    }
  }

  // ---- swap prompt ---------------------------------------------------------

  openSwapPrompt(item, pickup) {
    const { slots } = swapOptions(this.gameState.inventory)
    const { width, height } = this.scale

    this.player.body.setVelocity(0, 0)
    this.physics.pause()
    this.swap = { item, pickup, count: slots.length, objects: [] }

    const debuff = pickup.spec.kind === 'debuff'
    const rows = [
      {
        text: 'ACTIVE SLOTS FULL',
        size: 25,
        color: '#fbbf24',
        gap: 44
      },
      { text: item.name, size: 22, color: debuff ? '#c084fc' : '#67e8f9', gap: 27 },
      {
        text: item.effect + (debuff ? '   (DEBUFF)' : ''),
        size: 15,
        color: '#cbd5e1',
        gap: 42
      },
      { text: 'replace which slot?', size: 15, color: '#94a3b8', gap: 32 }
    ]

    slots.forEach((held, index) => {
      rows.push({
        text:
          '[' +
          (index + 1) +
          ']   ' +
          (held ? held.name + '  -  ' + held.effect : '(empty)'),
        size: 17,
        color: '#e2e8f0',
        gap: 30,
        // the slot list reads as a list: left-aligned so every [n] lines up, while the
        // headings above and below stay centred
        left: true
      })
    })

    rows.push({ text: '[ESC]   leave it on the floor', size: 15, color: '#94a3b8', gap: 0 })

    const panelHeight = rows.reduce((total, row) => total + row.gap, 0) + 74

    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x05070c, 0.74)
      .setDepth(PROMPT_DEPTH)
    const panel = this.add
      .rectangle(width / 2, height / 2, SWAP_PANEL_WIDTH, panelHeight, 0x111725)
      .setDepth(PROMPT_DEPTH + 1)
    panel.setStrokeStyle(2, 0x8792a6)
    this.swap.objects.push(veil, panel)

    let y = height / 2 - panelHeight / 2 + 34

    const listLeft = width / 2 - SWAP_PANEL_WIDTH / 2 + 46

    rows.forEach((row) => {
      this.swap.objects.push(
        this.crispText(row.left ? listLeft : width / 2, y, row.text, {
            fontFamily: 'monospace',
            fontSize: row.size + 'px',
            color: row.color
          })
          .setOrigin(row.left ? 0 : 0.5, 0.5)
          .setDepth(PROMPT_DEPTH + 2)
      )
      y += row.gap
    })

    this.pinToScreen(this.swap.objects)
  }

  updateSwapPrompt() {
    for (let index = 0; index < this.swap.count; index++) {
      if (Phaser.Input.Keyboard.JustDown(this.slotKeys[index])) {
        this.confirmSwap(index)
        return
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.declineSwap()
    }
  }

  confirmSwap(slotIndex) {
    const { item, pickup } = this.swap
    const debuff = pickup.spec.kind === 'debuff'
    const displaced = applySwap(this.gameState, item, slotIndex)

    pickup.destroy()
    this.closeSwapPrompt()
    this.refreshStats()

    if (displaced) {
      this.dropItem(displaced)
    }

    const dropNote = displaced ? ' - dropped ' + displaced.name : ''
    this.toast('slot ' + (slotIndex + 1) + ': ' + item.name + dropNote, debuff ? '#c084fc' : '#67e8f9')
  }

  declineSwap() {
    const { item, pickup } = this.swap

    pickup.spec.declined = true
    this.closeSwapPrompt()
    this.toast('left ' + item.name + ' on the floor', '#94a3b8')
  }

  closeSwapPrompt() {
    this.swap.objects.forEach((object) => object.destroy())
    this.swap = null
    this.physics.resume()
  }

  // ---- pause menu ----------------------------------------------------------

  // A real pause, not a hidden overlay: physics.pause() freezes every body where it
  // stands, and update() stops doing anything but reading the menu's keys. Cooldowns are
  // wall-clock timestamps, though, and the clock keeps running while the menu is open -
  // so the time spent paused is added back to every deadline on the way out, and the run
  // picks up exactly where it left off rather than with everything suddenly off cooldown.
  openPauseMenu() {
    this.player.body.setVelocity(0, 0)
    this.physics.pause()

    this.pauseMenu = { index: 0, pausedAt: this.time.now, objects: [], entryTexts: [] }

    this.buildPausePanel()
    // Painted once with the frozen timestamp, so the cooldown timers stop counting down
    // on the HUD behind the menu instead of running out while the game is not running.
    this.refreshItemHud(this.pauseMenu.pausedAt)
  }

  buildPausePanel() {
    const { width, height } = this.scale
    const held = passiveCounts(this.gameState.inventory)

    const rows = [
      { text: 'PAUSED', size: 25, color: '#e2e8f0', gap: 46 }
    ]

    PAUSE_ENTRIES.forEach((entry, index) => {
      rows.push({ text: entry.label, size: 19, color: '#e2e8f0', gap: 32, left: true, entry: index })
    })

    rows.push({ text: 'PASSIVES HELD', size: 14, color: '#94a3b8', gap: 30, left: true })

    if (held.length === 0) {
      rows.push({ text: 'none yet', size: 15, color: '#64748b', gap: 26, left: true })
    }

    // Icons, not a list of names. The row reserves the height and the icons are drawn
    // into it after the text layout has settled, because their x positions do not come
    // off the same cursor the text rows use.
    if (held.length > 0) {
      const lines = Math.ceil(held.length / PAUSE_ICON_PER_ROW)

      rows.push({ text: '', size: 12, color: '#000000', gap: lines * PAUSE_ICON_ROW_HEIGHT, icons: true })
    }

    rows.push({ text: '', size: 12, color: '#000000', gap: 12 })
    rows.push({
      text: '[W/S or UP/DOWN] select   [ENTER] confirm   [ESC] resume',
      size: 13,
      color: '#94a3b8',
      gap: 0
    })

    const panelHeight = rows.reduce((total, row) => total + row.gap, 0) + 74

    const veil = this.add
      .rectangle(width / 2, height / 2, width, height, 0x05070c, 0.74)
      .setDepth(PROMPT_DEPTH)
    const panel = this.add
      .rectangle(width / 2, height / 2, PAUSE_PANEL_WIDTH, panelHeight, 0x111725)
      .setDepth(PROMPT_DEPTH + 1)
    panel.setStrokeStyle(2, 0x8792a6)
    this.pauseMenu.objects.push(veil, panel)

    let y = height / 2 - panelHeight / 2 + 34
    const listLeft = width / 2 - PAUSE_PANEL_WIDTH / 2 + 52

    rows.forEach((row) => {
      const text = this.crispText(row.left ? listLeft : width / 2, y, row.text, {
          fontFamily: 'monospace',
          fontSize: row.size + 'px',
          color: row.color
        })
        .setOrigin(row.left ? 0 : 0.5, 0.5)
        .setDepth(PROMPT_DEPTH + 2)

      this.pauseMenu.objects.push(text)

      if (row.entry !== undefined) {
        this.pauseMenu.entryTexts[row.entry] = text
      }

      if (row.icons) {
        this.buildPassiveIcons(held, listLeft, y)
      }

      y += row.gap
    })

    this.pinToScreen(this.pauseMenu.objects)
    this.paintPauseSelection()
  }

  // What the player is carrying, as the same icons they picked up off the floor, with a
  // small xN under any that stack. It replaced a list of names and effects: the names are
  // in the toast when you take one, and a wall of text was a worse answer to "what am I
  // running" than a row of shapes.
  buildPassiveIcons(held, left, top) {
    held.forEach(({ item, count }, index) => {
      const x = left + (index % PAUSE_ICON_PER_ROW) * PAUSE_ICON_STEP + PAUSE_ICON_SIZE / 2
      const y = top + Math.floor(index / PAUSE_ICON_PER_ROW) * PAUSE_ICON_ROW_HEIGHT

      const icon = this.drawItemIcon(x, y, item, PAUSE_ICON_SIZE).setDepth(PROMPT_DEPTH + 2)

      this.pauseMenu.objects.push(icon)

      if (count < 2) {
        return
      }

      this.pauseMenu.objects.push(
        this.crispText(x + PAUSE_ICON_SIZE / 2 + 2, y + 6, `x${count}`, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#e2e8f0'
          })
          .setOrigin(0, 0.5)
          .setDepth(PROMPT_DEPTH + 2)
      )
    })
  }

  // The cursor is redrawn rather than moved: two rows, so re-labelling both is simpler
  // than keeping a marker object in step with them.
  paintPauseSelection() {
    this.pauseMenu.entryTexts.forEach((text, index) => {
      const selected = index === this.pauseMenu.index

      text.setText((selected ? '>  ' : '   ') + PAUSE_ENTRIES[index].label)
      text.setColor(selected ? '#67e8f9' : '#94a3b8')
    })
  }

  updatePauseMenu() {
    const down = Phaser.Input.Keyboard.JustDown(this.wasd.S) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.down)
    const up = Phaser.Input.Keyboard.JustDown(this.wasd.W) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up)

    if (down || up) {
      const step = down ? 1 : -1
      this.pauseMenu.index =
        (this.pauseMenu.index + step + PAUSE_ENTRIES.length) % PAUSE_ENTRIES.length
      this.paintPauseSelection()
      return
    }

    // ESC is the way out as well as the way in, so the menu never traps the player on a
    // highlighted Exit they did not mean to reach.
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closePauseMenu()
      return
    }

    if (this.confirmKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.choosePauseEntry(PAUSE_ENTRIES[this.pauseMenu.index].id)
    }
  }

  choosePauseEntry(id) {
    if (id === 'resume') {
      this.closePauseMenu()
      return
    }

    // There is no title screen to exit to yet, so Exit abandons the run and starts a new
    // one from the entrance room. It is behind a highlight-then-ENTER, so it cannot be hit
    // by a stray keypress. Point it at a menu scene once one exists.
    this.closePauseMenu()
    this.startFreshRun()
  }

  closePauseMenu() {
    this.shiftDeadlines(this.time.now - this.pauseMenu.pausedAt)
    this.pauseMenu.objects.forEach((object) => object.destroy())
    this.pauseMenu = null
    this.physics.resume()
  }

  // Every deadline in the run is an absolute this.time.now stamp, so pushing them all
  // forward by the paused duration is what "resume where you left off" means here: a
  // 20 s active with 8 s left still has 8 s left, however long the menu was open.
  shiftDeadlines(elapsed) {
    this.nextFireAt += elapsed
    this.nextHitAt += elapsed

    const { cooldowns } = this.gameState
    Object.keys(cooldowns).forEach((id) => {
      cooldowns[id] += elapsed
    })

    this.enemies.getChildren().forEach((enemy) => {
      if (enemy.nextShotAt !== undefined) {
        enemy.nextShotAt += elapsed
      }
      if (enemy.pushedUntil !== undefined) {
        enemy.pushedUntil += elapsed
      }
    })

    this.pickups.getChildren().forEach((pickup) => {
      if (pickup.spec.nextRefusalAt !== undefined) {
        pickup.spec.nextRefusalAt += elapsed
      }
    })
  }

  // Anything that belongs to the screen rather than to the room: the HUD, the prompts,
  // the game-over text. A shaped room is bigger than the viewport and the camera scrolls
  // across it, so these have to sit still while it does. In a rectangular room the camera
  // never moves and this changes nothing.
  pinToScreen(objects) {
    objects.forEach((object) => object.setScrollFactor(0))
  }

  // Throwing the run away, as against walking into the next room. The empty payload is
  // load-bearing: `restart()` with no argument at all leaves the scene's stored data in
  // place, so Phaser hands init() the *previous* room's { shape, plan, carried } back and
  // the run everyone thought had ended carries on with its EXP, its items, its difficulty
  // and its shape. Passing `{}` replaces that data, and roomFor() then falls back to a
  // fresh game state and the entrance room.
  startFreshRun() {
    this.scene.restart({})
  }

  toast(message, color) {
    if (this.toastText) {
      this.toastText.destroy()
    }

    const view = this.viewSize()

    this.toastText = this.crispText(view.width / 2, view.height - 70, message, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color
      })
      .setOrigin(0.5)
      .setScrollFactor(0)

    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: TOAST_LIFETIME - 500,
      duration: 500
    })
  }

  endGame() {
    this.gameOver = true

    this.player.body.setVelocity(0, 0)
    this.enemies.getChildren().forEach((enemy) => enemy.body.setVelocity(0, 0))
    this.bullets.getChildren().forEach((bullet) => bullet.destroy())
    this.enemyShots.getChildren().forEach((shot) => shot.destroy())

    const { width, height } = this.scale

    this.crispText(width / 2, height / 2 - 20, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#f87171'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)

    this.crispText(width / 2, height / 2 + 40, 'press R to try again', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#94a3b8'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)

    this.input.keyboard.once('keydown-R', () => this.startFreshRun())
  }
}
