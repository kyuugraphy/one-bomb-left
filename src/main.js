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
    // ===== TEMPORARY DIAGNOSTIC - revert after testing =======================
    // Testing whether the blur while the camera scrolls is the FIT rescale. FIT keeps the
    // canvas at 1344x840 and CSS-scales it to the window by a non-integer factor, so the
    // browser resamples every frame; NONE renders it at native size with no rescale at all.
    // If scrolling goes crisp with this, the scale mode is the culprit, not the camera.
    // Cost while testing: no fitting, so a window under 1344x840 clips instead of shrinking.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade'
  },
  scene: [PlayScene]
})
