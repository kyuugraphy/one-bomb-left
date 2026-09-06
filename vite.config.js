import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      // Art is re-exported while the server runs, and on Windows the exporting tool holds a
      // lock on the file. Two earlier fixes failed here, both worth remembering:
      //
      //   1. Ignoring public/sprites stopped the crash and traded it for something quieter
      //      and worse - the watcher never learned about sprites added after boot, so every
      //      new PNG 404'd into the SPA fallback and Phaser reported "Failed to process
      //      file" for art sitting right there on disk.
      //   2. awaitWriteFinish alone was not enough. It delays the watch, but chokidar still
      //      calls fs.watch() on the file eventually, and a still-locked file throws EBUSY
      //      from inside an FSWatcher error event that Vite does not handle - which takes
      //      the whole dev server down.
      //
      // Polling never calls fs.watch() at all: it stats the file instead, and a stat on a
      // locked file is fine. Slower to notice a change and a little more CPU, which is a
      // trade worth making for a server that stays up while the art is being worked on.
      usePolling: true,
      interval: 300,
      binaryInterval: 600,
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100
      }
    }
  }
})
