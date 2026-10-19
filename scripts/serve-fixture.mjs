#!/usr/bin/env node
/**
 * Tiny static server for the visual fixture.
 *
 * Serves the repository root so the fixture page can load the BUILT bundle via
 * `../../lib/client.js` and the real DSH token stylesheet from the same origin.
 * It only listens on loopback, only serves files inside this checkout, and adds
 * no caching so a rebuild is picked up on reload.
 *
 * Usage:
 *   node scripts/serve-fixture.mjs                 # pick a free port
 *   node scripts/serve-fixture.mjs --port 8123
 *   node scripts/serve-fixture.mjs --port 0 --quiet
 *
 * Then open (printed on startup):
 *   http://127.0.0.1:<port>/tests/fixtures/fixture.html
 *   http://127.0.0.1:<port>/tests/fixtures/fixture.html?theme=dark
 *
 * Stop with Ctrl+C or SIGTERM. No network access beyond loopback; no writes.
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = '127.0.0.1'
const FIXTURE_PATH = '/tests/fixtures/fixture.html'

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
])

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{port: number, quiet: boolean}} */
  const options = { port: 0, quiet: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port') {
      const raw = argv[index + 1]
      const port = Number(raw)
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`--port needs an integer 0-65535, got ${String(raw)}`)
      }
      options.port = port
      index += 1
    } else if (arg.startsWith('--port=')) {
      const port = Number(arg.slice('--port='.length))
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`--port needs an integer 0-65535, got ${arg}`)
      }
      options.port = port
    } else if (arg === '--quiet') {
      options.quiet = true
    } else if (arg === '--help' || arg === '-h') {
      console.log('usage: node scripts/serve-fixture.mjs [--port <n>] [--quiet]')
      process.exit(0)
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return options
}

/**
 * Resolve a URL path to a file inside ROOT, or null.
 * @param {string} requestPath
 * @returns {Promise<string | null>}
 */
async function resolveFile(requestPath) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(requestPath, `http://${HOST}`).pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null
  const absolute = path.resolve(ROOT, '.' + pathname)
  if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) return null
  try {
    const info = await stat(absolute)
    if (info.isDirectory()) return null
    if (!info.isFile()) return null
    return absolute
  } catch {
    return null
  }
}

const options = parseArgs(process.argv.slice(2))

const server = createServer(async (request, response) => {
  const startedAt = Date.now()
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' })
      response.end('method not allowed\n')
      return
    }

    const requestUrl = request.url || '/'

    // A mini landing page makes the server self-documenting.
    if (requestUrl === '/' || requestUrl === '/index.html' || requestUrl.startsWith('/?')) {
      const body = [
        '<!doctype html><html><head><meta charset="utf-8"><title>serve-fixture</title>',
        '<style>body{font:14px system-ui;margin:40px;line-height:1.7}code{background:#eee;padding:1px 5px;border-radius:4px}</style>',
        '</head><body><h1>dsh-pele-mermaid fixture</h1>',
        `<p><a href="${FIXTURE_PATH}">${FIXTURE_PATH}</a> (light)</p>`,
        `<p><a href="${FIXTURE_PATH}?theme=dark">${FIXTURE_PATH}?theme=dark</a> (dark)</p>`,
        '<p>Serves the repository root; the fixture loads the built <code>lib/client.js</code>.</p>',
        '</body></html>',
      ].join('\n')
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      })
      response.end(request.method === 'HEAD' ? undefined : body)
      return
    }

    const file = await resolveFile(requestUrl)
    if (file === null) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      response.end(`not found: ${requestUrl}\n`)
      if (!options.quiet) console.log(`404 ${requestUrl} (${Date.now() - startedAt} ms)`)
      return
    }

    const info = await stat(file)
    const type = CONTENT_TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream'
    response.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    if (request.method === 'HEAD') {
      response.end()
    } else {
      createReadStream(file).pipe(response)
    }
    if (!options.quiet) {
      const relative = path.relative(ROOT, file).split(path.sep).join('/')
      console.log(`${request.method} /${relative} ${info.size}B ${Date.now() - startedAt}ms`)
    }
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`serve-fixture error: ${error instanceof Error ? error.message : String(error)}\n`)
  }
})

server.listen(options.port, HOST, () => {
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  const base = `http://${HOST}:${port}`
  console.log(`serve-fixture: root ${ROOT}`)
  console.log(`serve-fixture: light ${base}${FIXTURE_PATH}`)
  console.log(`serve-fixture: dark  ${base}${FIXTURE_PATH}?theme=dark`)
  console.log(`serve-fixture: bundle ${base}/lib/client.js`)
})

/** @param {string} signal */
function shutdown(signal) {
  console.log(`serve-fixture: ${signal}, closing`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
