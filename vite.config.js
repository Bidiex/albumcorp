import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'mpa',
  server: {
    historyApiFallback: {
      rewrites: [
        { from: /^\/album$/, to: '/album.html' },
        { from: /^\/editor$/, to: '/editor.html' },
        { from: /^\/join$/, to: '/join.html' },
        { from: /^\/exchange$/, to: '/exchange.html' },
        { from: /^\/$/, to: '/index.html' },
      ]
    }
  },
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
