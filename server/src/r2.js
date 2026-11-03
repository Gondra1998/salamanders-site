/**
 * Cloudflare R2 through its S3-compatible API, signed with AWS SigV4 by hand
 * on node:crypto (no SDK). The only module that talks to R2.
 *
 * put(key, body, { contentType, contentLength, signal }) → uploads one object,
 *   header-signed with an unsigned payload. body is a Uint8Array or a
 *   ReadableStream (sent half-duplex); signal (optional) goes straight to
 *   fetch, so a caller can time the upload out. Resolves on any 2xx; throws
 *   R2Error(status), status 0 when R2 is unreachable, the upload was
 *   aborted, or R2 is not configured.
 * presignGet(key, { expiresSec = 900 }) → a query-signed GET link. Pure
 *   maths over the secret: no request to Cloudflare.
 * Objects live path-style at `${endpoint}/${bucket}/${key}`, region auto,
 * service s3. Errors never carry the secret, the request or R2's reply.
 */
import { createHash, createHmac } from 'node:crypto'

const ALGORITHM = 'AWS4-HMAC-SHA256'
const UNSIGNED = 'UNSIGNED-PAYLOAD'
const REGION = 'auto'
const SERVICE = 's3'
const MAX_EXPIRES = 604800 // SigV4's ceiling: seven days.
// Printable ASCII with no edge spaces, so the value R2 receives is the value signed.
const HEADER_VALUE = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/

export class R2Error extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const hmac = (key, text) => createHmac('sha256', key).update(text).digest()
// encodeURIComponent leaves !'()* bare; SigV4 wants every byte but A-Z a-z 0-9 - _ . ~ escaped.
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const scopeOf = ({ amzDate, region, service }) => `${amzDate.slice(0, 8)}/${region}/${service}/aws4_request`

// The names of the signed headers in canonical (byte) order: the order they are hashed in and the SignedHeaders list.
const namesOf = (headers) => Object.keys(headers).sort()

/** headers: lowercase name → value; all of them are signed. */
export function canonicalRequest({ method, path, query, headers, payloadHash }) {
  const names = namesOf(headers)
  const lines = names.map((n) => `${n}:${String(headers[n]).trim().replace(/\s+/g, ' ')}\n`).join('')
  return [method, path, query, lines, names.join(';'), payloadHash].join('\n')
}

export function stringToSign({ amzDate, region, service, canonical }) {
  return [ALGORITHM, amzDate, scopeOf({ amzDate, region, service }), sha256(canonical)].join('\n')
}

export function signature({ secret, amzDate, region, service, stringToSign: text }) {
  let key = hmac(`AWS4${secret}`, amzDate.slice(0, 8))
  for (const part of [region, service, 'aws4_request']) key = hmac(key, part)
  return createHmac('sha256', key).update(text).digest('hex')
}

/** params: name → value. The canonical query string: sorted by name, every name and value encoded. */
export function canonicalQuery(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join('&')
}

/** The canonical query of a presigned link, before X-Amz-Signature is appended. */
export function presignQuery({ accessKeyId, amzDate, region, service, expiresSec }) {
  return canonicalQuery({
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${scopeOf({ amzDate, region, service })}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': 'host',
  })
}

// An absolute http(s) origin, a trailing slash allowed; a path, query, fragment or credentials would change what is signed.
// → the URL, or null. Exported so galleryConfig.js can say why the gallery is off without a second opinion.
export function parseEndpoint(endpoint) {
  try {
    const u = new URL(endpoint)
    return ['http:', 'https:'].includes(u.protocol) && u.href === `${u.origin}/` ? u : null
  } catch {
    return null
  }
}

export function createR2({ accountId, bucket, accessKeyId, secretAccessKey, endpoint, fetchImpl = fetch, now = Date.now }) {
  const base = parseEndpoint(endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`)
  const configured = base !== null && [accountId, bucket, accessKeyId, secretAccessKey].every((v) => typeof v === 'string' && v !== '')

  // Each key segment encoded once; R2 rebuilds the same canonical path from the URL it receives.
  const pathOf = (key) => `/${encode(bucket)}/${key.split('/').map(encode).join('/')}`
  const context = () => {
    if (!configured) throw new R2Error('R2 is not configured.', 0)
    return { amzDate: new Date(now()).toISOString().replace(/[-:]|\.\d{3}/g, ''), region: REGION, service: SERVICE }
  }
  const sign = (ctx, canonical) => signature({ ...ctx, secret: secretAccessKey, stringToSign: stringToSign({ ...ctx, canonical }) })

  async function put(key, body, { contentType, contentLength, signal }) {
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) throw new TypeError('contentLength must be a whole number of bytes.')
    if (typeof contentType !== 'string' || !HEADER_VALUE.test(contentType)) throw new TypeError('contentType must be a plain header value.')
    const ctx = context()
    const path = pathOf(key)
    const signed = {
      'content-length': String(contentLength),
      'content-type': contentType,
      host: base.host,
      'x-amz-content-sha256': UNSIGNED,
      'x-amz-date': ctx.amzDate,
    }
    const sig = sign(ctx, canonicalRequest({ method: 'PUT', path, query: '', headers: signed, payloadHash: UNSIGNED }))
    const init = {
      method: 'PUT',
      headers: {
        'Content-Length': signed['content-length'],
        'Content-Type': contentType,
        'x-amz-content-sha256': UNSIGNED,
        'x-amz-date': ctx.amzDate,
        Authorization: `${ALGORITHM} Credential=${accessKeyId}/${scopeOf(ctx)}, SignedHeaders=${namesOf(signed).join(';')}, Signature=${sig}`,
      },
      body,
      signal,
    }
    if (body instanceof ReadableStream) init.duplex = 'half'
    let res
    try {
      res = await fetchImpl(`${base.origin}${path}`, init)
    } catch {
      // Network error or abort. Drop the original: its message can carry the request.
      throw new R2Error('R2 is unreachable.', 0)
    }
    // Let go of the reply (an empty body or an XML error) so the connection is freed; it is never surfaced.
    await res.body?.cancel()
    // A 401 or 403 is the token (wrong, rotated or out of scope), not this object: say so, without any value.
    const what = res.status === 401 || res.status === 403 ? 'R2 refused the credentials' : 'R2 refused the upload'
    if (!res.ok) throw new R2Error(`${what} (${res.status}).`, res.status)
  }

  function presignGet(key, { expiresSec = 900 } = {}) {
    if (!Number.isInteger(expiresSec) || expiresSec < 1 || expiresSec > MAX_EXPIRES) throw new TypeError(`expiresSec must be a whole number from 1 to ${MAX_EXPIRES}.`)
    const ctx = context()
    const path = pathOf(key)
    const query = presignQuery({ ...ctx, accessKeyId, expiresSec })
    const sig = sign(ctx, canonicalRequest({ method: 'GET', path, query, headers: { host: base.host }, payloadHash: UNSIGNED }))
    return `${base.origin}${path}?${query}&X-Amz-Signature=${sig}`
  }

  return { configured, put, presignGet }
}
