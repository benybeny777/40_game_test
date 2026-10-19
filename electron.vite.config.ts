import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {},
  preload: { build: { rollupOptions: { output: { format: 'cjs' } } } },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          strip: resolve('src/renderer/strip/index.html'),
          panel: resolve('src/renderer/panel/index.html'),
        },
      },
    },
  },
})
