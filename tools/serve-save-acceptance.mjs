// Isolated loopback fixture controls around the unmodified production Web build.
// Open /_qa/ in Codex IAB, explicitly seed a case, then test the real /mobile/ UI.
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { port: { type: 'string', default: '4178' }, export: { type: 'string' } } })
if (!values.export) throw new Error('Pass --export with the JSON exported by the test game')
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback port')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/web')
if (!existsSync(resolve(root, 'mobile/index.html'))) throw new Error('Build the production Web app first')
const profile = JSON.parse(readFileSync(resolve(values.export), 'utf8'))
const future = JSON.stringify({ format: 1, profile: { ...profile, version: profile.version + 1 } })
const fixture = JSON.stringify({ corrupt: '{broken isolated acceptance fixture', future }).replaceAll('<', '\\u003c')
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Isolated save recovery fixture</title>
<body><h1>Isolated save recovery fixture</h1><p>Test-only origin. These buttons replace only this origin's test save. The source export is retained.</p>
<button id="corrupt">Seed corrupt test save and open game</button><button id="future">Seed future-version test save and open game</button>
<p id="state">Ready</p><script>const cases=${fixture};for(const id of ['corrupt','future'])document.getElementById(id).onclick=()=>{localStorage.setItem('hyakkiko.web.save',cases[id]);document.getElementById('state').textContent=id+' seeded';location.href='/mobile/';};</script></body></html>`
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
  try {
    const url = new globalThis.URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/_qa/') { res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' }); res.end(html); return }
    let path = decodeURIComponent(url.pathname)
    if (path.endsWith('/')) path += 'index.html'
    const file = resolve(root, '.' + path)
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return }
    const bytes = readFileSync(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes)
  } catch (error) {
    if (error.code === 'ENOENT') { res.writeHead(404); res.end('Not found'); return }
    console.error(error); res.writeHead(500); res.end('Fixture server failed')
  }
}).listen(port, '127.0.0.1', () => console.log('Save acceptance fixture: http://127.0.0.1:' + port + '/_qa/'))
