import Phaser from 'phaser'
import { PlayScene, RENDER_SCALE } from './game/PlayScene.js'

// The entrance room is 1344x840 - 24x15 cells of the 56 px obstacle grid.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  // The room is 1344x840 in world units and always will be; RENDER_SCALE only decides how
  // many real pixels that is drawn with. The camera is zoomed to match in PlayScene, so
  // nothing downstream sees a different world. See RENDER_SCALE for why.
  width: 1344 * RENDER_SCALE,
  height: 840 * RENDER_SCALE,
  backgroundColor: '#16171d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: false
  },
  // Every texture in this project is drawn far smaller than it is stored - the 1024 px
  // tiles land on a 56 px cell, the 1254 px avatar on 46 px - so each screen pixel covers
  // something like 15x15 source texels while plain bilinear filtering samples only four of
  // them. Standing still that picks a fixed set and looks fine; while the camera scrolls
  // the sample points shift every frame, the chosen texels change with them, and the whole
  // surface crawls. That is why the blur only ever showed in big rooms and long corridors -
  // a standard room is exactly the viewport and never scrolls at all - and why a paused
  // frame taken mid-scroll is perfectly crisp.
  //
  // Mipmaps are the fix for minification: the GPU keeps pre-shrunk copies and samples the
  // one that matches the size actually being drawn.
  //
  // **This only helps power-of-two textures.** Phaser's generateMipmap returns without
  // side effects otherwise, so the 1024 px wall/rock/pit tiles are covered - which is most
  // of the screen - and the 1254 px avatar, bullet and wood art are not. Those want
  // re-exporting at a power of two near their drawn size; see zz_todo.md.
  render: {
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR'
  },
  physics: {
    default: 'arcade'
  },
  scene: [PlayScene]
})
