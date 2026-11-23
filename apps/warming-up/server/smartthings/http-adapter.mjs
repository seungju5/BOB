export const MAX_REQUEST_BYTES = 1024 * 1024;

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function trustedOrigin(value) {
  const origin = new URL(value);
  if (
    origin.origin !== value ||
    origin.username ||
    origin.password ||
    !['http:', 'https:'].includes(origin.protocol)
  )
    throw Error('A fixed public origin is required.');
  return origin.origin;
}

// Only the origin-form path is taken from Node. Host and proxy headers never
// choose the OAuth callback origin, nor the origin used by the service.
function requestUrl(target, origin) {
  if (
    typeof target !== 'string' ||
    !target.startsWith('/') ||
    target.startsWith('//') ||
    /[\\#\r\n]/.test(target)
  )
    throw new RequestError(400, 'invalid_request');
  const url = new URL(target, origin);
  // Do not silently normalize a path that is part of Samsung's signature.
  if (url.origin !== origin || url.pathname + url.search !== target)
    throw new RequestError(400, 'invalid_request');
  return url;
}

async function rawBody(req, limit) {
  const declared = req.headers?.['content-length'];
  if (declared !== undefined && (!/^(0|[1-9]\d*)$/.test(String(declared)) || Array.isArray(declared)))
    throw new RequestError(400, 'invalid_request');
  if (declared !== undefined && Number(declared) > limit)
    throw new RequestError(413, 'request_too_large');
  let size = 0;
  const chunks = [];
  // Do not destroy the socket before the caller can send a bounded 413 reply.
  const stream = typeof req.iterator === 'function' ? req.iterator({ destroyOnReturn: false }) : req;
  for await (const part of stream) {
    if (!Buffer.isBuffer(part) && !(part instanceof Uint8Array))
      throw new RequestError(400, 'invalid_request');
    size += part.byteLength;
    if (size > limit) throw new RequestError(413, 'request_too_large');
    chunks.push(part);
  }
  if (declared !== undefined && Number(declared) !== size)
    throw new RequestError(400, 'invalid_request');
  return Buffer.concat(chunks, size);
}

function requestHeaders(input = {}) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
  }
  return headers;
}

export function sendUnavailable(res) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(503, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  res.end('{"error":"temporarily_unavailable"}');
}

export function createNodeHandler({ origin, handle, maxBodyBytes = MAX_REQUEST_BYTES }) {
  const fixedOrigin = trustedOrigin(origin);
  if (
    typeof handle !== 'function' ||
    !Number.isSafeInteger(maxBodyBytes) ||
    maxBodyBytes < 1 ||
    maxBodyBytes > MAX_REQUEST_BYTES
  )
    throw Error('Invalid HTTP adapter configuration.');
  return async (req, res) => {
    try {
      const url = requestUrl(req.url, fixedOrigin),
        method = req.method || 'GET';
      const raw = await rawBody(req, maxBodyBytes);
      if (['GET', 'HEAD'].includes(method) && raw.length) throw new RequestError(400, 'invalid_request');
      const request = new Request(url, {
        method,
        headers: requestHeaders(req.headers),
        body: ['GET', 'HEAD'].includes(method) ? undefined : raw,
      });
      const result = await handle(request);
      const body = method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer());
      const headers = Object.fromEntries(result.headers),
        cookies = result.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(result.status, headers);
      res.end(body);
    } catch (error) {
      if (error instanceof RequestError && !res.headersSent) {
        res.writeHead(error.status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        });
        // Drain without retaining rejected bytes. Destroying the socket here
        // can turn a valid 413 into EPIPE before the client reads the response.
        req.resume?.();
        res.end(JSON.stringify({ error: error.code }));
      } else sendUnavailable(res);
      // Exceptions may contain tokens or Firebase credentials: never log them.
    }
  };
}
