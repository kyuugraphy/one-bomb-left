import Phaser from 'phaser'
import { PlayScene } from './game/PlayScene.js'

// The entrance room is 1344x840 - 24x15 cells of the 56 px obstacle grid.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 1344,
  height: 840,
  backgroundColor: '#16171d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade'
  },
  scene: [PlayScene]
})
