import { createHash } from 'node:crypto';

const routeRoots = new Set(['health']);

/** A Next build tree may contain server code; package only reviewed web surfaces. */
export function isAllowedWebAsset(relative, publicFiles = new Set()) {
  const parts = relative.split('/');
  if (parts.some(part => part.startsWith('.') || part === '..')) return false;
  if (publicFiles.has(relative)) return true;
  if (relative === 'manifest.webmanifest') return true;
  if (relative.startsWith('_next/static/')) return /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico|json)$/.test(relative);
  if (parts.length !== 2 || !routeRoots.has(parts[0])) return false;
  const name = parts.at(-1);
  return name === 'index.html' || name === 'index.txt' || /^__next\..+\.txt$/.test(name);
}

export function assertRootAssetPaths(html, documentPath = 'index.html') {
  const base = new URL(documentPath, 'https://localhost/');
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const reference = (match[1] ?? match[2] ?? match[3]).replaceAll('&amp;', '&');
    const url = new URL(reference, base);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('/_next/') && (url.origin !== base.origin || !pathname.startsWith('/_next/'))) {
      throw new Error(`The native app requires root-relative _next assets: ${documentPath}`);
    }
  }
}

export function protectHtml(html, documentPath = 'index.html') {
  assertRootAssetPaths(html, documentPath);
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error('HTML has no head element');
  if (/<(?:iframe|object|embed)\b/i.test(html)) throw new Error('Embedded frames are not permitted in the native health bridge');
  if (/<base\b/i.test(html)) throw new Error('Remote or alternate document bases are not permitted');
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attribute = match[1].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    const source = attribute && (attribute[1] ?? attribute[2] ?? attribute[3]);
    if (source && (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//'))) {
      throw new Error('Remote scripts cannot run in the native health bridge');
    }
    if (!source && match[2]) hashes.push(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
  // The standalone health module reads native stores only. Remote API/telemetry,
  // images, frames and workers are blocked; web return uses the native fixed URL.
  const policy = [
    "default-src 'self'", `script-src 'self' ${[...new Set(hashes)].join(' ')}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", "connect-src 'self'",
    "media-src 'self' blob:", "frame-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'self'", "worker-src 'none'",
  ].join('; ');
  return html.replace(/<head(?:\s[^>]*)?>/i, head => `${head}<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
