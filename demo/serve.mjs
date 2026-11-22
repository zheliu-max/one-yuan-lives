// 零依赖静态预览服务器：node serve.mjs
// 直接以磁盘上的文件为准，所以任何改动保存后刷新页面就是最新的 —— 没有构建步骤。
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const PORT = Number(process.env.PORT) || 4173
const HOST = process.env.HOST || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

/** Resolve a request path to a file inside ROOT, or null when it escapes. */
function resolvePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0])
  const target = normalize(join(ROOT, pathname))
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null
  return target
}

async function fileFor(target) {
  try {
    const info = await stat(target)
    if (info.isDirectory()) return fileFor(join(target, 'index.html'))
    return info.isFile() ? target : null
  } catch {
    return null
  }
}

const server = createServer(async (request, response) => {
  const target = resolvePath(request.url || '/')
  if (target === null) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('forbidden')
    return
  }

  let file = await fileFor(target)
  if (file === null && !extname(target)) file = await fileFor(join(ROOT, 'index.html'))
  if (file === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
    return
  }

  const info = await stat(file)
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': info.size,
    // 预览服务器：永远拿最新的文件，不要缓存。
    'cache-control': 'no-store, must-revalidate',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(file).pipe(response)
})

server.listen(PORT, HOST, () => {
  console.log(`一块钱的两万种人生 · demo 已启动 → http://${HOST}:${PORT}/`)
})
