import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { DEVELOPMENT_CLOUD_ENDPOINT } from './src/shared/cloud'

/** Independent browser build: no main/preload/native modules or desktop data. */
export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_')
  const cloudEndpoint = environment.VITE_CLOUD_URL ?? (command === 'serve' ? DEVELOPMENT_CLOUD_ENDPOINT : undefined)
  const cloudOrigin = cloudEndpoint ? new URL(cloudEndpoint).origin : ''
  return {
  root: resolve('src/renderer'),
  base: './',
  publicDir: false,
  server: { host: '127.0.0.1', port: 5174, strictPort: true, open: false },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true, open: false },
  build: {
    outDir: resolve('dist/web'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: { input: { mobile: resolve('src/renderer/mobile/index.html') } },
  },
  plugins: [{
    name: 'browser-entry',
    transformIndexHtml(html) {
      // Permit only the configured save server, not all HTTPS destinations.
      const developmentSockets = command === 'serve' ? 'ws://127.0.0.1:* ws://localhost:*' : ''
      return html.replace("connect-src 'self' ws:", `connect-src 'self' ${cloudOrigin} ${developmentSockets}`)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'index.html', source: '<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./mobile/"><title>はぐれものダンジョン</title></head><body><a href="./mobile/">冒険を始める</a></body></html>' })
      this.emitFile({ type: 'asset', fileName: 'README.txt', source: 'はぐれものダンジョン ブラウザー版\n\nHTTPサーバーでこのフォルダーを配信し、/ または /mobile/ を開いてください。\nHTMLファイルを直接ダブルクリックする起動には対応しません。\n開発PCではプロジェクトルートで pnpm web:preview を実行し、http://127.0.0.1:4174/ を開けます。\nスマホ確認: pnpm web:preview --host 0.0.0.0 を実行し、同じネットワークからPCのIPアドレス:4174へ接続します。\n端末内保存はアクセスしたサイトごとに別です。クラウド接続先の設定後は、同じアカウントでWindows版と手動転送できます。\n本物の購入・Steamマーケットは利用できません。\n' })
    },
  }],
  }
})
