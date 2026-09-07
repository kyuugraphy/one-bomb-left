import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      // Art is re-exported while the server runs, and on Windows the exporting tool holds a
      // lock on the file. Three attempts, and the trade is not free in any direction:
      //
      //   1. Ignoring public/sprites stopped the EBUSY crash and blinded the running server
      //      to sprites added after boot - every new PNG 404'd into the SPA fallback and
      //      Phaser reported "Failed to process file" for art sitting right there on disk.
      //      The worst of the three: a silent failure that looked like broken code.
      //   2. usePolling never calls fs.watch() at all, so a locked file cannot throw. It is
      //      also the heaviest watch mode - it stats on a timer - and the dev server was
      //      killed twice for low memory within a day of turning it on.
      //   3. awaitWriteFinish, below: wait for a file's size to settle before watching it.
      //      Cheap, and it discovers new files. It is not airtight - chokidar still calls
      //      fs.watch() in the end, and a file the exporter is still holding throws EBUSY
      //      from inside an FSWatcher error event that Vite does not handle, which takes the
      //      server down.
      //
      // Three is the one to live with. A re-export may still kill the server, but it fails
      // loudly and a restart fixes it, which is a better deal than a silent 404 or a
      // machine running out of memory.
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100
      }
    }
  }
})
