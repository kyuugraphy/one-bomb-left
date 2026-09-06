import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    watch: {
      // Art is re-exported while the server runs, and on Windows the exporting tool holds
      // a lock on the file long enough that chokidar's watch() throws EBUSY and takes the
      // whole dev server down with it. Nothing here needs watching: files under public/
      // are served straight from disk, so a browser refresh already picks up a new export.
      ignored: ['**/public/sprites/**']
    }
  }
})
