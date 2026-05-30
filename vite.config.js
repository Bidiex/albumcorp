import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'mpa',
  plugins: [
    {
      name: 'rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/auth/callback')) {
            req.url = req.url.replace('/auth/callback', '/auth-callback.html');
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main:          'index.html',
        login:         'login.html',
        join:          'join.html',
        album:         'album.html',
        exchange:      'exchange.html',
        editor:        'editor.html',
        authCallback:  'auth-callback.html',
      }
    }
  }
})
