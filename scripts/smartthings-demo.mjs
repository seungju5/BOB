import { createServer } from 'node:http';
import { access, readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDemoApi } from '../server/smartthings/demo.mjs';
import { createNodeHandler } from '../server/smartthings/http-adapter.mjs';
import { smartThingsClient } from '../server/smartthings/smartthings.mjs';

const out = fileURLToPath(new URL('../out', import.meta.url));
const demoPage = '/connect/demo/';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
};

export function createDemoServer({ port = 4317, smartthings = smartThingsClient({}) } = {}) {
  const host = '127.0.0.1:' + port;
  const origin = 'http://' + host;
  const api = createDemoApi({ origin, smartthings });
  const serveApi = createNodeHandler({ origin, handle: api.handle, maxBodyBytes: 4096 });
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    if (req.headers.host !== host) { res.writeHead(403).end(); return; }
    if (req.url.startsWith('/api/')) { await serveApi(req, res); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    try {
      const url = new URL(req.url, origin);
      const path = decodeURIComponent(url.pathname);
      if (url.origin !== origin || !path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part.startsWith('.'))) {
        res.writeHead(404).end(); return;
      }
      if (path === '/' || path === '/connect/demo') { res.writeHead(302, { Location: demoPage }).end(); return; }
      const file = await realpath(resolve(out, '.' + path + (path.endsWith('/') ? 'index.html' : '')));
      const type = types[extname(file)];
      if (!file.startsWith(out + sep) || !type) { res.writeHead(404).end(); return; }
      const content = req.method === 'HEAD' ? undefined : await readFile(file);
      res.writeHead(200, { 'Content-Type': type }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  server.on('close', api.clear);
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = 4317;
  try {
    await access(resolve(out, 'connect/demo/index.html'));
    const server = createDemoServer({ port });
    server.on('error', () => { console.error('시연 서버를 시작할 수 없어요. 로컬 4317번 포트를 확인해 주세요.'); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log('밥뭇나 플러그 시연  http://127.0.0.1:4317/connect/demo/'));
  } catch { console.error('먼저 npm run build로 시연 화면을 빌드해 주세요.'); process.exitCode = 1; }
}
