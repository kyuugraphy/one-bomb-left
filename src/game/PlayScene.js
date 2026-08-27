import Phaser from 'phaser'
import { cooldownRemaining, triggerActive } from './actives.js'
import { computeStats } from './effects.js'
import { grantItem } from './grant.js'
import { createInventory } from './inventory.js'
import { itemsFrom } from './items.js'
import { collectReward, takeReward } from './rewards.js'
import { applySwap, needsSwapPrompt, swapOptions } from './swap.js'

const PLAYER_SPEED = 320
const PLAYER_SIZE = 32
const BULLET_SPEED = 700
const BULLET_RADIUS = 5
const BULLET_LIFETIME = 1200
const FIRE_COOLDOWN = 180
const MUZZLE_OFFSET = PLAYER_SIZE / 2 + BULLET_RADIUS
const ENEMY_SIZE = 36
const ENEMY_SPEED = 120
const ENEMY_BASE_HP = 10
const ENEMY_SHOT_SPEED = PLAYER_SPEED * 0.65
const ENEMY_SHOT_RADIUS = 7
const ENEMY_SHOT_COLOR = 0xfb923c
const ENEMY_SHOT_LIFETIME = 4000
const ENEMY_FIRE_COOLDOWN = 1400
const ENEMY_MUZZLE_OFFSET = ENEMY_SIZE / 2 + ENEMY_SHOT_RADIUS
const KNOCKBACK_SPEED = 420
const KNOCKBACK_DURATION = 180
const HIT_COOLDOWN = 600
const WALL_COLOR = 0x4b5563
const DOORWAY_WIDTH = 140
const DOORWAY_MARGIN = 40
const ENTRY_LINE_OFFSET = 140
const MIN_SPAWN_DISTANCE = 260
const MAX_HP = 6
const HP_PER_HEART = 2
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
const CELL = 56
// The wall bodies fill the grid's whole blocked border ring rather than sitting a thin
// strip inside it. Physics and pathing then agree on exactly which cells are solid: with
// a 24 px wall the leftover 32 px of the border cell was a corridor the 32 px player fit
// into and the 36 px enemy did not, so a rock in the next cell in made an invincibility
// pocket - unreachable on foot and, often enough, out of the enemy's shot line too.
const WALL_THICKNESS = CELL
const COVERAGE_TARGET = 1 / 4
const ROCK_AREA_SHARE = 0.6
const NEAR_WALL_SHARE = 2 / 3
const WALL_BAND = 3
const ROCK_MIN_CELLS = 1
const ROCK_MAX_CELLS = 8
const PIT_MIN_CELLS = 3
const PIT_MAX_CELLS = 12
const PIT_RUN_MIN = 2
const PIT_RUN_MAX = 5
const PLACEMENT_ATTEMPTS = 600
const ROCK_COLOR = 0x6b7280
const PIT_COLOR = 0x05060a
const PICKUP_SIZE = 24
const PICKUP_REWARD_COLOR = 0x22d3ee
const PICKUP_CURSED_COLOR = 0xa855f7
const PICKUP_TREASURE_COLOR = 0xfbbf24
const PICKUP_DROPPED_COLOR = 0x94a3b8

// ===== DEBUG / TEMPORARY - remove before shipping ===========================
// G drops a reward pickup beside the player through the ordinary spawnRewardPickup path,
// so the whole inventory loop can be played through without farming one enemy per room.
// Real rolls apply: random reward item, the usual cursed chance. Tracked in the cleanup
// TODO in zz_status.md, alongside the five DEBUG_PASSIVE_ITEMS in items.js.
const DEBUG_SPAWN_KEY = true

if (DEBUG_SPAWN_KEY) {
  console.warn(
    '[one-bomb-left] DEBUG: key G drops a random reward pickup, and 5 extra trinkets are ' +
      'in the item pool. Both are temporary - see the cleanup TODO in zz_status.md.'
  )
}
// ===== end DEBUG ============================================================
const DROP_OFFSET = 84
// A declined or just-dropped pickup stays inert until the player is this far from it, so
// the prompt cannot re-open on the spot and a swap cannot be undone by standing still.
const PICKUP_REARM_DISTANCE = 78

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

// Initials read better than a truncated name in a 40 px box: Iron Plating -> IP. A
// single-word name has no initials to take, so it keeps its first two letters instead of
// shrinking to one lonely character: Bulwark -> BU.
const abbreviate = (name) => {
  const words = name.split(' ')
  const initials = words.length > 1 ? words.map((word) => word[0]).join('') : name.slice(0, 2)

  return initials.slice(0, 3).toUpperCase()
}
const CURSED_CHANCE = 0.5
const PANIC_RADIUS = 240
const PANIC_DAMAGE = 3
const PANIC_PUSH_SPEED = 560
const PANIC_PUSH_DURATION = 260
const SECOND_WIND_HEAL = 1
const REPAIR_KIT_HEAL = 2
const BULWARK_DURATION = 2500
const TOAST_LIFETIME = 2800

// right, down, left, up - growNoodle turns by rotating this index
const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0]
]

// The unmodified player. Items are layered on top of this by computeStats().
const BASE_STATS = {
  maxHp: MAX_HP,
  fireCooldown: FIRE_COOLDOWN,
  moveSpeed: PLAYER_SPEED,
  damage: 1
}

// Enemy toughness scales with the 'enemy' curse, which cursed rewards now actually apply.
function enemyHpFor(enemyStrength) {
  return ENEMY_BASE_HP + enemyStrength
}

function freshGameState() {
  return {
    riskLevel: 0,
    enemyStrength: 0,
    rewardsCollected: 0,
    inventory: createInventory(),
    cooldowns: {}
  }
}

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('play')
  }

  create() {
    const { width, height } = this.scale

    this.gameState = freshGameState()
    this.stats = computeStats(BASE_STATS, this.gameState.inventory)
    this.nextFireAt = 0
    this.nextHitAt = 0
    this.knockbackUntil = 0
    this.health = this.stats.maxHp
    this.gameOver = false

    this.entryLine = height - ENTRY_LINE_OFFSET
    this.roomEntered = false

    this.buildWalls(width, height)
    this.buildObstacles(width, height)

    this.player = this.add.rectangle(
      width / 2,
      height - DOORWAY_MARGIN,
      PLAYER_SIZE,
      PLAYER_SIZE,
      0x4ade80
    )
    this.physics.add.existing(this.player)
    this.player.body.setCollideWorldBounds(true)

    this.bullets = this.add.group()
    this.enemyShots = this.add.group()
    this.enemies = this.add.group()
    this.pickups = this.add.group()

    this.entryText = this.add
      .text(width / 2, height / 2, 'Move up to enter the room', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#94a3b8'
      })
      .setOrigin(0.5)

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
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.swap = null

    // DEBUG / TEMPORARY - see DEBUG_SPAWN_KEY above.
    if (DEBUG_SPAWN_KEY) {
      this.debugSpawnKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G)
    }
  }

  buildWalls(width, height) {
    this.walls = this.physics.add.staticGroup()

    const half = WALL_THICKNESS / 2
    const doorwayStart = (width - DOORWAY_WIDTH) / 2

    // top, left, right, then the two stubs flanking the bottom doorway
    this.addWall(width / 2, half, width, WALL_THICKNESS)
    this.addWall(half, height / 2, WALL_THICKNESS, height)
    this.addWall(width - half, height / 2, WALL_THICKNESS, height)
    this.addWall(doorwayStart / 2, height - half, doorwayStart, WALL_THICKNESS)
    this.addWall(width - doorwayStart / 2, height - half, doorwayStart, WALL_THICKNESS)
  }

  // Obstacles are laid out on a CELL grid so rocks can clump and pits can snake.
  // Every candidate shape is rejected unless the room stays fully walkable afterwards.
  buildObstacles(width, height) {
    this.rocks = this.physics.add.staticGroup()
    this.pits = this.physics.add.staticGroup()

    this.cols = Math.floor(width / CELL)
    this.rows = Math.floor(height / CELL)
    this.blocked = []
    this.reserved = []

    for (let row = 0; row < this.rows; row++) {
      this.blocked[row] = []
      this.reserved[row] = []
      for (let col = 0; col < this.cols; col++) {
        const isBorder = row === 0 || col === 0 || row === this.rows - 1 || col === this.cols - 1
        this.blocked[row][col] = isBorder
        this.reserved[row][col] = isBorder
      }
    }

    this.reserveDoorway(width, height)

    const interiorCells = (this.cols - 2) * (this.rows - 2)
    const targetCells = Math.floor(interiorCells * COVERAGE_TARGET)
    const rockTarget = Math.floor(targetCells * ROCK_AREA_SHARE)
    let rockCells = 0
    let filled = 0

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && filled < targetCells; attempt++) {
      const asRock = rockCells < rockTarget
      const remaining = targetCells - filled
      const shape = asRock ? this.growChunk(remaining) : this.growNoodle(remaining)

      if (!shape || !this.keepsRoomWalkable(shape)) {
        continue
      }

      shape.forEach(([row, col]) => {
        this.blocked[row][col] = true
      })
      this.paintShape(shape, asRock)

      filled += shape.length
      if (asRock) {
        rockCells += shape.length
      }
    }

    this.coverage = filled / interiorCells
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

  // Small shapes are common, big ones rare: weight each size by 1/size.
  pickSize(min, max, cap) {
    const top = Math.min(max, Math.max(min, cap))
    let total = 0

    for (let size = min; size <= top; size++) {
      total += 1 / size
    }

    let roll = Phaser.Math.FloatBetween(0, total)

    for (let size = min; size <= top; size++) {
      roll -= 1 / size
      if (roll <= 0) {
        return size
      }
    }

    return min
  }

  // Two thirds of the shapes start in the band hugging the wall, the rest further in.
  pickSeed() {
    const nearWall = Phaser.Math.FloatBetween(0, 1) < NEAR_WALL_SHARE

    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Phaser.Math.Between(1, this.rows - 2)
      const col = Phaser.Math.Between(1, this.cols - 2)
      const depth = Math.min(row - 1, col - 1, this.rows - 2 - row, this.cols - 2 - col)

      if (nearWall !== depth < WALL_BAND) {
        continue
      }
      if (this.isFree(row, col)) {
        return [row, col]
      }
    }

    return null
  }

  isFree(row, col) {
    return (
      row > 0 &&
      col > 0 &&
      row < this.rows - 1 &&
      col < this.cols - 1 &&
      !this.blocked[row][col] &&
      !this.reserved[row][col]
    )
  }

  // Rocks: a seed cell that accretes neighbours into a clump.
  growChunk(cap) {
    const seed = this.pickSeed()
    if (!seed) {
      return null
    }

    const size = this.pickSize(ROCK_MIN_CELLS, ROCK_MAX_CELLS, cap)
    const cells = [seed]
    const taken = new Set([seed.join(',')])

    for (let guard = 0; cells.length < size && guard < size * 12; guard++) {
      const [row, col] = Phaser.Utils.Array.GetRandom(cells)
      const [dRow, dCol] = Phaser.Utils.Array.GetRandom(NEIGHBOURS)
      const next = [row + dRow, col + dCol]
      const key = next.join(',')

      if (taken.has(key) || !this.isFree(next[0], next[1])) {
        continue
      }

      taken.add(key)
      cells.push(next)
    }

    return cells
  }

  // Pits: a run-and-turn walk, so they come out as I, L, U, S or G noodles.
  growNoodle(cap) {
    const seed = this.pickSeed()
    if (!seed) {
      return null
    }

    const size = this.pickSize(PIT_MIN_CELLS, PIT_MAX_CELLS, cap)
    const turn = Phaser.Utils.Array.GetRandom([-1, 1, 0])
    const cells = [seed]
    const taken = new Set([seed.join(',')])
    let heading = Phaser.Math.Between(0, 3)
    let [row, col] = seed

    while (cells.length < size) {
      const run = Math.min(Phaser.Math.Between(PIT_RUN_MIN, PIT_RUN_MAX), size - cells.length)
      const [dRow, dCol] = NEIGHBOURS[heading]
      let stepped = 0

      for (let i = 0; i < run; i++) {
        const next = [row + dRow, col + dCol]
        const key = next.join(',')

        if (taken.has(key) || !this.isFree(next[0], next[1])) {
          break
        }

        taken.add(key)
        cells.push(next)
        row = next[0]
        col = next[1]
        stepped += 1
      }

      if (stepped === 0) {
        break
      }

      // a fixed turn direction curls into U and G, a random one zigzags
      heading = (heading + (turn === 0 ? Phaser.Math.Between(1, 3) : turn) + 4) % 4
    }

    return cells.length >= PIT_MIN_CELLS ? cells : null
  }

  // Flood fill from the doorway: if any open cell would be cut off, drop the shape.
  keepsRoomWalkable(shape) {
    shape.forEach(([row, col]) => {
      this.blocked[row][col] = true
    })

    let open = 0
    for (let row = 1; row < this.rows - 1; row++) {
      for (let col = 1; col < this.cols - 1; col++) {
        if (!this.blocked[row][col]) {
          open += 1
        }
      }
    }

    const seen = new Set([this.doorwayCell.join(',')])
    const queue = [this.doorwayCell]
    let reached = 0

    while (queue.length) {
      const [row, col] = queue.pop()
      reached += 1

      NEIGHBOURS.forEach(([dRow, dCol]) => {
        const next = [row + dRow, col + dCol]
        const key = next.join(',')

        if (
          seen.has(key) ||
          next[0] < 1 ||
          next[1] < 1 ||
          next[0] > this.rows - 2 ||
          next[1] > this.cols - 2 ||
          this.blocked[next[0]][next[1]]
        ) {
          return
        }

        seen.add(key)
        queue.push(next)
      })
    }

    shape.forEach(([row, col]) => {
      this.blocked[row][col] = false
    })

    return reached === open
  }

  paintShape(shape, asRock) {
    const group = asRock ? this.rocks : this.pits
    const color = asRock ? ROCK_COLOR : PIT_COLOR

    shape.forEach(([row, col]) => {
      const tile = this.add.rectangle(
        col * CELL + CELL / 2,
        row * CELL + CELL / 2,
        CELL,
        CELL,
        color
      )
      this.physics.add.existing(tile, true)
      group.add(tile)
    })
  }

  addWall(x, y, width, height) {
    const wall = this.add.rectangle(x, y, width, height, WALL_COLOR)
    this.physics.add.existing(wall, true)
    this.walls.add(wall)
    return wall
  }

  update(time) {
    if (this.gameOver) {
      return
    }

    // The prompt owns the moment: physics is paused, so nothing moves, shoots or is hit
    // until the player has chosen. Only the HUD keeps painting.
    if (this.swap) {
      this.updateSwapPrompt()
      this.refreshItemHud(time)
      return
    }

    this.checkRoomEntry()
    this.updateMovement(time)
    this.updateEnemies(time)
    this.updateFiring(time)
    this.updateActives(time)
    this.updatePickupRearm()
    this.refreshItemHud(time)

    // DEBUG / TEMPORARY - see DEBUG_SPAWN_KEY above.
    if (DEBUG_SPAWN_KEY && Phaser.Input.Keyboard.JustDown(this.debugSpawnKey)) {
      this.debugDropCount = (this.debugDropCount ?? 0) + 1
      const spot = this.freeSpotNear(this.player.x, this.player.y, this.debugDropCount)
      this.spawnRewardPickup(spot.x, spot.y)
    }

    if (this.bulwarkRing) {
      if (this.bulwarkRing.active) {
        this.bulwarkRing.setPosition(this.player.x, this.player.y)
      } else {
        this.bulwarkRing = null
      }
    }
  }

  updateMovement(time) {
    if (time < this.knockbackUntil) {
      return
    }

    const velocity = new Phaser.Math.Vector2(
      (this.wasd.D.isDown ? 1 : 0) - (this.wasd.A.isDown ? 1 : 0),
      (this.wasd.S.isDown ? 1 : 0) - (this.wasd.W.isDown ? 1 : 0)
    )

    velocity.normalize().scale(this.stats.moveSpeed)

    this.player.body.setVelocity(velocity.x, velocity.y)
  }

  checkRoomEntry() {
    if (this.roomEntered || this.player.y > this.entryLine) {
      return
    }

    this.roomEntered = true
    this.entryText.destroy()
    this.spawnEnemy()
    this.spawnTreasurePickup()
  }

  updateEnemies(time) {
    this.enemies.getChildren().forEach((enemy) => {
      // a panic-button shove owns the velocity until it lapses
      if (time < (enemy.pushedUntil ?? 0)) {
        return
      }

      const target = this.chaseTargetFor(enemy)
      this.physics.moveTo(enemy, target.x, target.y, ENEMY_SPEED)
      this.updateEnemyFiring(enemy, time)
    })
  }

  updateEnemyFiring(enemy, time) {
    if (time < enemy.nextShotAt || !this.hasShotLineTo(enemy)) {
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

  centreOf([row, col]) {
    return new Phaser.Math.Vector2(col * CELL + CELL / 2, row * CELL + CELL / 2)
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

  // Line of sight for something the size of an enemy, tested against the actual tiles.
  hasWalkLine(fromX, fromY, toX, toY) {
    const line = new Phaser.Geom.Line(fromX, fromY, toX, toY)
    const margin = ENEMY_SIZE / 2 + DETOUR_CLEARANCE

    return !this.obstacleBodies().some((tile) => {
      const bounds = Phaser.Geom.Rectangle.Clone(tile.getBounds())
      Phaser.Geom.Rectangle.Inflate(bounds, margin, margin)

      return Phaser.Geom.Intersects.LineToRectangle(line, bounds)
    })
  }

  obstacleBodies() {
    return [...this.rocks.getChildren(), ...this.pits.getChildren()]
  }

  updateFiring(time) {
    if (time < this.nextFireAt) {
      return
    }

    const aim = new Phaser.Math.Vector2(
      (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0),
      (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0)
    )

    if (aim.length() === 0) {
      return
    }

    this.fire(aim.normalize())
    this.nextFireAt = time + this.stats.fireCooldown
  }

  spawnEnemy() {
    const spawn = this.pickSpawnPoint()
    const enemy = this.add.rectangle(
      spawn.x,
      spawn.y,
      ENEMY_SIZE,
      ENEMY_SIZE,
      0xef4444
    )
    this.physics.add.existing(enemy)
    enemy.hp = enemyHpFor(this.gameState.enemyStrength)
    enemy.nextShotAt = this.time.now + ENEMY_FIRE_COOLDOWN
    this.enemies.add(enemy)
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

        const point = new Phaser.Math.Vector2(
          col * CELL + CELL / 2,
          row * CELL + CELL / 2
        )

        if (this.isClearOfWalls(point)) {
          open.push(point)
        }
      }
    }

    const far = open.filter(
      (point) => Phaser.Math.Distance.BetweenPoints(point, this.player) >= MIN_SPAWN_DISTANCE
    )

    return Phaser.Utils.Array.GetRandom(far.length ? far : open)
  }

  isClearOfWalls(point) {
    const footprint = new Phaser.Geom.Rectangle(
      point.x - ENEMY_SIZE,
      point.y - ENEMY_SIZE,
      ENEMY_SIZE * 2,
      ENEMY_SIZE * 2
    )

    const solids = [...this.walls.getChildren(), ...this.obstacleBodies()]

    return !solids.some((solid) =>
      Phaser.Geom.Intersects.RectangleToRectangle(footprint, solid.getBounds())
    )
  }

  fire(aim) {
    const bullet = this.add.circle(
      this.player.x + aim.x * MUZZLE_OFFSET,
      this.player.y + aim.y * MUZZLE_OFFSET,
      BULLET_RADIUS,
      0xfacc15
    )
    this.physics.add.existing(bullet)
    bullet.body.setVelocity(aim.x * BULLET_SPEED, aim.y * BULLET_SPEED)
    this.bullets.add(bullet)

    this.time.delayedCall(BULLET_LIFETIME, () => bullet.destroy())
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

  // Every death drops a reward pickup where the enemy stood - the only reward source
  // for now, since there is one enemy and no waves yet.
  killEnemy(enemy) {
    const { x, y } = enemy
    enemy.destroy()
    this.spawnRewardPickup(x, y)
  }

  onEnemyTouchPlayer(player, enemy) {
    this.takeHit(enemy.x, enemy.y)
  }

  onShotHitPlayer(player, shot) {
    shot.destroy()
    this.takeHit(shot.x, shot.y)
  }

  // Touches and shots cost the same 1 HP and share one i-frame window.
  takeHit(fromX, fromY) {
    const time = this.time.now
    if (this.gameOver || time < this.nextHitAt) {
      return
    }

    this.nextHitAt = time + HIT_COOLDOWN
    this.knockbackUntil = time + KNOCKBACK_DURATION

    const away = new Phaser.Math.Vector2(this.player.x - fromX, this.player.y - fromY)
    if (away.length() === 0) {
      away.set(0, -1)
    }
    away.normalize().scale(KNOCKBACK_SPEED)
    this.player.body.setVelocity(away.x, away.y)

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

    this.hpLabel = this.add
      .text(left + innerWidth + BAR_PADDING * 2 + 12, top + BAR_PADDING, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f87171'
      })
      .setOrigin(0, 0)

    this.hpNodes = [track, ...this.hpSegments, this.hpLabel]
    this.hpNodes.forEach((node) => node.setDepth(HUD_DEPTH))

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
      isCursed: false,
      color: PICKUP_DROPPED_COLOR,
      declined: true
    })
  }

  // startIndex rotates which direction is tried first, so several drops in a row fan out
  // around the player instead of stacking on one spot.
  freeSpotNear(x, y, startIndex = 0) {
    const angles = [0, 90, 180, 270, 45, 135, 225, 315]

    for (let step = 0; step < angles.length; step++) {
      const degrees = angles[(startIndex + step) % angles.length]
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

  spawnRewardPickup(x, y) {
    const pool = itemsFrom('reward')
    const item = Phaser.Utils.Array.GetRandom(pool)
    const isCursed = Phaser.Math.FloatBetween(0, 1) < CURSED_CHANCE

    this.addPickup(x, y, {
      kind: 'reward',
      item,
      isCursed,
      color: isCursed ? PICKUP_CURSED_COLOR : PICKUP_REWARD_COLOR
    })
  }

  // Rolled from the treasure pool, never cursed.
  spawnTreasurePickup() {
    const spot = this.pickSpawnPoint()

    this.addPickup(spot.x, spot.y, {
      kind: 'treasure',
      item: Phaser.Utils.Array.GetRandom(itemsFrom('treasure')),
      isCursed: false,
      color: PICKUP_TREASURE_COLOR
    })
  }

  addPickup(x, y, spec) {
    const pickup = this.add.rectangle(x, y, PICKUP_SIZE, PICKUP_SIZE, spec.color)
    pickup.setStrokeStyle(2, 0xf8fafc)
    pickup.spec = spec

    this.physics.add.existing(pickup)
    pickup.body.setAllowGravity(false)
    pickup.body.setImmovable(true)
    this.pickups.add(pickup)

    // a slow pulse so a pickup reads as loot rather than another bit of level geometry
    this.tweens.add({
      targets: pickup,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 700,
      yoyo: true,
      repeat: -1
    })

    return pickup
  }

  // Touching a pickup takes it - the take/skip choice is still to come, so a cursed
  // reward is shown in purple and the only way to skip one is to walk around it.
  onPickup(player, pickup) {
    // declined pickups and items just dropped underfoot stay inert until stepped off
    if (this.swap || pickup.spec.declined) {
      return
    }

    const { kind, item, isCursed } = pickup.spec

    // only a reward carries a curse and counts toward rewardsCollected; treasure and
    // items the player dropped themselves go straight into the rack
    const result =
      kind === 'reward'
        ? takeReward(this.gameState, { isCursed, item }, Math.random)
        : grantItem(this.gameState, item)

    // Already held: nothing was placed and no curse was paid, so the pickup is left in
    // the room rather than eaten for nothing - swap something out and it can be taken.
    // The overlap re-fires every frame while standing on it, so announce it just once.
    if (result && result.reason === 'owned') {
      if (!pickup.spec.announcedOwned) {
        pickup.spec.announcedOwned = true
        this.toast(`${item.name} - already owned`, '#94a3b8')
        console.log('[one-bomb-left] already owned, left in the room:', item.id)
      }
      return
    }

    // A full rack is a choice, not a loss: the pickup stays in the room until the player
    // either picks a slot or backs out.
    if (needsSwapPrompt(result)) {
      this.openSwapPrompt(item, pickup)
      return
    }

    pickup.destroy()
    this.refreshStats()

    const curseNote = isCursed ? ' (CURSED)' : ''
    this.toast(`${item.name}: ${item.effect}${curseNote}`, isCursed ? '#c084fc' : '#67e8f9')
    console.log('[one-bomb-left] picked up', item.id, 'stats', this.stats)
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

  // 4 passive boxes over 3 active ones, top-right. Everything is a rectangle plus a
  // short abbreviation - no art yet, but enough to read what is equipped, in which slot,
  // and whether an active is ready.
  buildItemHud() {
    const { width, height } = this.scale

    // Both rows live in the bottom wall band, split around the doorway gap: passives to
    // the left of it, actives to the right. Nothing here covers a walkable tile.
    const keyHintY = height - WALL_THICKNESS + 2
    const rowY = height - WALL_THICKNESS + 16 + SLOT_SIZE / 2
    const doorwayStart = (width - DOORWAY_WIDTH) / 2

    const label = (x, y, text, origin) =>
      this.add
        .text(x, y, text, { fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1' })
        .setOrigin(origin, 0.5)
        .setDepth(HUD_DEPTH)

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

    const passiveRowWidth = 4 * SLOT_SIZE + 3 * SLOT_GAP
    const passiveLeft = HUD_EDGE_MARGIN + 74
    plate(HUD_EDGE_MARGIN - 6, passiveLeft + passiveRowWidth + 8)
    label(HUD_EDGE_MARGIN, rowY, 'PASSIVES', 0)
    this.hudPassiveSlots = this.buildSlotRow(
      passiveLeft + passiveRowWidth,
      rowY,
      keyHintY,
      4,
      false
    )

    const activeRowWidth = 3 * SLOT_SIZE + 2 * SLOT_GAP
    const activeRight = width - HUD_EDGE_MARGIN - 66
    plate(activeRight - activeRowWidth - 8, width - HUD_EDGE_MARGIN + 6)
    label(width - HUD_EDGE_MARGIN, rowY, 'ACTIVES', 1)
    this.hudActiveSlots = this.buildSlotRow(activeRight, rowY, keyHintY, 3, true)

    // Status text goes in the top band beside the hearts, where there is room to spare.
    this.hudSetText = this.add
      .text(width - HUD_EDGE_MARGIN, WALL_THICKNESS / 2, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#a3e635'
      })
      .setOrigin(1, 0.5)
      .setDepth(HUD_DEPTH)

    if (passiveLeft + passiveRowWidth + 8 > doorwayStart) {
      console.warn('[one-bomb-left] item HUD overruns the doorway gap')
    }
  }

  buildSlotRow(right, centreY, keyHintY, count, withKeyHints) {
    const slots = []

    for (let index = 0; index < count; index++) {
      const x = right - (count - 1 - index) * (SLOT_SIZE + SLOT_GAP) - SLOT_SIZE / 2

      const box = this.add
        .rectangle(x, centreY, SLOT_SIZE, SLOT_SIZE, SLOT_EMPTY_FILL)
        .setDepth(HUD_DEPTH)
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
      veil.setScale(1, 0)

      const text = this.add
        .text(x, centreY - 5, '.', {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#64748b'
        })
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH + 2)

      const timer = this.add
        .text(x, centreY + SLOT_SIZE / 2 - 3, '', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#e2e8f0'
        })
        .setOrigin(0.5, 1)
        .setDepth(HUD_DEPTH + 2)

      // the key that fires this slot, on its own line above the boxes
      if (withKeyHints) {
        this.add
          .text(x, keyHintY, String(index + 1), {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#94a3b8'
          })
          .setOrigin(0.5, 0)
          .setDepth(HUD_DEPTH)
      }

      slots.push({ box, veil, text, timer })
    }

    return slots
  }

  refreshItemHud(time) {
    const { inventory, cooldowns } = this.gameState

    inventory.passives.forEach((item, index) => this.paintSlot(this.hudPassiveSlots[index], item))

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

    this.hudSetText.setText(this.stats.damage > 1 ? 'SET  +5% dmg' : '')
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
    const { rack, slots } = swapOptions(this.gameState.inventory, item)
    const { width, height } = this.scale

    this.player.body.setVelocity(0, 0)
    this.physics.pause()
    this.swap = { item, pickup, count: slots.length, objects: [] }

    const cursed = pickup.spec.isCursed
    const rows = [
      {
        text: (rack === 'actives' ? 'ACTIVE' : 'PASSIVE') + ' SLOTS FULL',
        size: 25,
        color: '#fbbf24',
        gap: 44
      },
      { text: item.name, size: 22, color: cursed ? '#c084fc' : '#67e8f9', gap: 27 },
      {
        text: item.effect + (cursed ? '   (CURSED)' : ''),
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
        this.add
          .text(row.left ? listLeft : width / 2, y, row.text, {
            fontFamily: 'monospace',
            fontSize: row.size + 'px',
            color: row.color
          })
          .setOrigin(row.left ? 0 : 0.5, 0.5)
          .setDepth(PROMPT_DEPTH + 2)
      )
      y += row.gap
    })
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
    const { kind, isCursed } = pickup.spec
    const displaced = applySwap(this.gameState, item, slotIndex)

    // the reward is only charged for now that the item is actually placed
    if (kind === 'reward') {
      collectReward(this.gameState, { isCursed }, Math.random)
    }

    pickup.destroy()
    this.closeSwapPrompt()
    this.refreshStats()

    if (displaced) {
      this.dropItem(displaced)
    }

    const dropNote = displaced ? ' - dropped ' + displaced.name : ''
    this.toast('slot ' + (slotIndex + 1) + ': ' + item.name + dropNote, isCursed ? '#c084fc' : '#67e8f9')
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

  toast(message, color) {
    if (this.toastText) {
      this.toastText.destroy()
    }

    this.toastText = this.add
      .text(this.scale.width / 2, this.scale.height - 70, message, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color
      })
      .setOrigin(0.5)

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

    this.add
      .text(width / 2, height / 2 - 20, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#f87171'
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height / 2 + 40, 'press R to try again', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#94a3b8'
      })
      .setOrigin(0.5)

    this.input.keyboard.once('keydown-R', () => this.scene.restart())
  }
}
