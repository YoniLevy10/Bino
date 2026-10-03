/**
 * Tiny local mock for authenticated dashboard API load when LOAD_AUTH_COOKIE is unset
 * and LOAD_USE_AUTH_MOCK=1. Does not talk to Supabase or production.
 *
 * Listens on 127.0.0.1 only.
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = 3099

/**
 * @param {{ port?: number }} [opts]
 * @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>}
 */
export function startMockAuthServer(opts = {}) {
  const port = opts.port ?? Number(process.env.LOAD_AUTH_MOCK_PORT || DEFAULT_PORT)

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const reqPath = url.pathname
    if (reqPath === '/login') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><title>mock login</title><h1>login</h1>')
      return
    }
    if (reqPath.startsWith('/api/') || reqPath === '/dashboard') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, mock: true, path: reqPath, ts: Date.now() }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'not_found' }))
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => (err ? rejClose(err) : resClose()))
          }),
      })
    })
  })
}

const thisFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const { baseUrl } = await startMockAuthServer()
  console.log(`[load-mock] listening on ${baseUrl}`)
}
