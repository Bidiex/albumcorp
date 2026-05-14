import { defineConfig } from 'vite'

export default defineConfig({
  // Múltiples entry points — una página por HTML
  build: {
    rollupOptions: {
      input: {
        main:     'index.html',
        join:     'join.html',
        album:    'album.html',
        exchange: 'exchange.html',
        editor:   'editor.html',
      }
    }
  }
})
