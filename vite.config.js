import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      // Art is re-exported while the server runs, and on Windows the exporting tool holds a
      // lock on the file long enough that chokidar's watch() throws EBUSY and takes the
      // whole dev server down with it.
      //
      // This waits for a file's size to stop changing before watching it, which is the
      // targeted fix. The first attempt simply ignored public/sprites, and that traded the
      // crash for something quieter and worse: the watcher never learned about sprites
      // added after boot, so every new PNG 404'd into the SPA fallback and Phaser reported
      // "Failed to process file" for art that was sitting right there on disk.
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100
      }
    }
  }
})
