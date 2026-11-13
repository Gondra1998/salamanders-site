import { describe, it, expect } from 'vitest'
import { createR2, R2Error, canonicalRequest, canonicalQuery, stringToSign, signature, presignQuery } from './r2'

// The AWS SigV4 test suite's published example credentials, not a real account.
const AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

// Invented R2 settings.
const SETTINGS = { accountId: 'acct0123', bucket: 'relics', accessKeyId: 'KEYID0123', secretAccessKey: 'not-a-real-secret/xyz+0' }
const NOW = Date.UTC(2026, 10, 2, 12, 34, 56, 789)
const AMZ_DATE = '20261102T123456Z'
const CTX = { amzDate: AMZ_DATE, region: 'auto', service: 's3' }

const make = (over = {}) => {
  const calls = []
  const fetchImpl =
    over.fetchImpl ??
    (async (url, init) => {
      calls.push([url, init])
      return over.response ? over.response() : new Response(null, { status: 200 })
    })
  return { calls, r2: createR2({ ...SETTINGS, now: () => NOW, ...over, fetchImpl }) }
}
const sign = (canonical) => signature({ ...CTX, secret: SETTINGS.secretAccessKey, stringToSign: stringToSign({ ...CTX, canonical }) })

describe('SigV4 known answers', () => {
  // The AWS SigV4 test suite: GET / on example.amazonaws.com, 20150830T123600Z, us-east-1, service "service".
  const VANILLA = { amzDate: '20150830T123600Z', region: 'us-east-1', service: 'service' }
  const vanilla = (query) =>
    canonicalRequest({
      method: 'GET',
      path: '/',
      query,
      headers: { host: 'example.amazonaws.com', 'x-amz-date': VANILLA.amzDate },
      payloadHash: EMPTY_SHA256,
    })

  it('signs the AWS get-vanilla-query vector (empty query)', () => {
    const canonical = vanilla('')
    expect(canonical).toBe(`GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\n${EMPTY_SHA256}`)
    const sts = stringToSign({ ...VANILLA, canonical })
    expect(sts).toBe(
      'AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/service/aws4_request\nbb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63',
    )
    expect(signature({ ...VANILLA, secret: AWS_SECRET, stringToSign: sts })).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
  })

  it('signs the AWS get-vanilla-query-order-key-case vector (query parameters sorted by name)', () => {
    const query = canonicalQuery({ Param2: 'value2', Param1: 'value1' })
    expect(query).toBe('Param1=value1&Param2=value2')
    const sts = stringToSign({ ...VANILLA, canonical: vanilla(query) })
    expect(signature({ ...VANILLA, secret: AWS_SECRET, stringToSign: sts })).toBe('b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500')
  })

  it('signs the AWS S3 presigned-URL example (query signing, unsigned payload)', () => {
    // docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const ctx = { amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3' }
    const query = presignQuery({ ...ctx, accessKeyId: 'AKIAIOSFODNN7EXAMPLE', expiresSec: 86400 })
    expect(query).toBe(
      'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host',
    )
    const canonical = canonicalRequest({
      method: 'GET',
      path: '/test.txt',
      query,
      headers: { host: 'examplebucket.s3.amazonaws.com' },
      payloadHash: 'UNSIGNED-PAYLOAD',
    })
    const sts = stringToSign({ ...ctx, canonical })
    expect(signature({ ...ctx, secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', stringToSign: sts })).toBe(
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })

  it('encodes every query name and value per AWS rules', () => {
    expect(canonicalQuery({ 'b c': "!'()*", a: 'é/+=~' })).toBe('a=%C3%A9%2F%2B%3D~&b%20c=%21%27%28%29%2A')
  })

  it('sorts headers by name and trims and folds their values', () => {
    const canonical = canonicalRequest({ method: 'PUT', path: '/a', query: '', headers: { 'x-b': '  two   words ', host: 'h' }, payloadHash: 'P' })
    expect(canonical).toBe('PUT\n/a\n\nhost:h\nx-b:two words\n\nhost;x-b\nP')
  })
})

describe('configured', () => {
  it('is true with all four values', () => {
    expect(make().r2.configured).toBe(true)
  })

  it.each(['accountId', 'bucket', 'accessKeyId', 'secretAccessKey'])('is false when %s is missing, empty or not a string', (name) => {
    for (const v of [undefined, '', 42]) expect(make({ [name]: v }).r2.configured).toBe(false)
  })

  it.each(['ftp://r2.test', 'not a url', 'https://r2.test/prefix', 'https://r2.test?x=1', 'https://r2.test#x', 'https://user:pw@r2.test'])(
    'is false for an unusable endpoint %s',
    (endpoint) => {
      expect(make({ endpoint }).r2.configured).toBe(false)
    },
  )

  it('refuses every call when not configured, without touching the network', async () => {
    const { r2, calls } = make({ bucket: '' })
    const err = await r2.put('k', new Uint8Array(1), { contentType: 'image/png', contentLength: 1 }).catch((e) => e)
    expect(err).toBeInstanceOf(R2Error)
    expect(err.status).toBe(0)
    expect(err.message).toBe('R2 is not configured.')
    expect(() => r2.presignGet('k')).toThrow(R2Error)
    expect(() => r2.presignGet('k')).toThrow('R2 is not configured.')
    const gone = await r2.remove('k').catch((e) => e)
    expect(gone).toBeInstanceOf(R2Error)
    expect(gone.message).toBe('R2 is not configured.')
    expect(calls).toHaveLength(0)
  })
})

describe('presignGet', () => {
  it('builds a path-style link on the default endpoint, signed for 15 minutes', () => {
    const url = make().r2.presignGet('clips/1/2.mp4')
    const u = new URL(url)
    expect(u.origin).toBe('https://acct0123.r2.cloudflarestorage.com')
    expect(u.pathname).toBe('/relics/clips/1/2.mp4')
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')
    expect(url).toContain('X-Amz-Credential=KEYID0123%2F20261102%2Fauto%2Fs3%2Faws4_request')
    expect(url).toContain(`X-Amz-Date=${AMZ_DATE}`)
    expect(url).toContain('X-Amz-Expires=900')
    expect(url).toContain('X-Amz-SignedHeaders=host')
    expect(url).toMatch(/&X-Amz-Signature=[0-9a-f]{64}$/)
  })

  it('carries the signature of exactly the canonical request R2 will rebuild', () => {
    const url = make().r2.presignGet('clips/1/2.mp4', { expiresSec: 60 })
    const query = presignQuery({ ...CTX, accessKeyId: SETTINGS.accessKeyId, expiresSec: 60 })
    const canonical = canonicalRequest({
      method: 'GET',
      path: '/relics/clips/1/2.mp4',
      query,
      headers: { host: 'acct0123.r2.cloudflarestorage.com' },
      payloadHash: 'UNSIGNED-PAYLOAD',
    })
    expect(url).toBe(`https://acct0123.r2.cloudflarestorage.com/relics/clips/1/2.mp4?${query}&X-Amz-Signature=${sign(canonical)}`)
  })

  it('encodes each key segment once, per AWS rules, and the URL parser leaves it alone', () => {
    const url = make().r2.presignGet("art/a b+c/é!'()*~.png")
    expect(url).toContain("/relics/art/a%20b%2Bc/%C3%A9%21%27%28%29%2A~.png?")
    expect(new URL(url).pathname).toBe('/relics/art/a%20b%2Bc/%C3%A9%21%27%28%29%2A~.png')
  })

  it('signs for the endpoint given, its port included, with a trailing slash dropped', () => {
    const url = make({ endpoint: 'http://localhost:9000/' }).r2.presignGet('k')
    const query = presignQuery({ ...CTX, accessKeyId: SETTINGS.accessKeyId, expiresSec: 900 })
    const canonical = canonicalRequest({ method: 'GET', path: '/relics/k', query, headers: { host: 'localhost:9000' }, payloadHash: 'UNSIGNED-PAYLOAD' })
    expect(url).toBe(`http://localhost:9000/relics/k?${query}&X-Amz-Signature=${sign(canonical)}`)
  })

  it.each([0, -1, 1.5, 604801, '900'])('refuses an expiry of %s', (expiresSec) => {
    expect(() => make().r2.presignGet('k', { expiresSec })).toThrow(new TypeError('expiresSec must be a whole number from 1 to 604800.'))
  })

  it.each([1, 604800])('signs for an expiry of exactly %i seconds, the edge of the range', (expiresSec) => {
    expect(make().r2.presignGet('k', { expiresSec })).toContain(`&X-Amz-Expires=${expiresSec}&`)
  })

  it('never puts the secret in the link', () => {
    const url = make().r2.presignGet('k')
    expect(url).not.toContain(SETTINGS.secretAccessKey)
    expect(url).not.toContain(encodeURIComponent(SETTINGS.secretAccessKey))
  })
})

describe('put', () => {
  const PUT_SIGNED = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date'

  it('uploads bytes once with header signing', async () => {
    const { r2, calls } = make()
    const body = new Uint8Array([1, 2, 3])
    await expect(r2.put('art/7/9.png', body, { contentType: 'image/png', contentLength: 3 })).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    const [url, init] = calls[0]
    expect(url).toBe('https://acct0123.r2.cloudflarestorage.com/relics/art/7/9.png')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(body)
    expect('duplex' in init).toBe(false)
    const canonical = canonicalRequest({
      method: 'PUT',
      path: '/relics/art/7/9.png',
      query: '',
      headers: {
        'content-length': '3',
        'content-type': 'image/png',
        host: 'acct0123.r2.cloudflarestorage.com',
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-date': AMZ_DATE,
      },
      payloadHash: 'UNSIGNED-PAYLOAD',
    })
    expect(init.headers).toEqual({
      'Content-Length': '3',
      'Content-Type': 'image/png',
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': AMZ_DATE,
      Authorization: `AWS4-HMAC-SHA256 Credential=KEYID0123/20261102/auto/s3/aws4_request, SignedHeaders=${PUT_SIGNED}, Signature=${sign(canonical)}`,
    })
  })

  it('signs the encoded key path, so a key with spaces or unicode uploads to the same object it links to', async () => {
    const { r2, calls } = make()
    await r2.put('art/a b+c/é.png', new Uint8Array(1), { contentType: 'image/png', contentLength: 1 })
    expect(calls[0][0]).toBe('https://acct0123.r2.cloudflarestorage.com/relics/art/a%20b%2Bc/%C3%A9.png')
    expect(calls[0][1].headers.Authorization).toContain(
      sign(
        canonicalRequest({
          method: 'PUT',
          path: '/relics/art/a%20b%2Bc/%C3%A9.png',
          query: '',
          headers: {
            'content-length': '1',
            'content-type': 'image/png',
            host: 'acct0123.r2.cloudflarestorage.com',
            'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
            'x-amz-date': AMZ_DATE,
          },
          payloadHash: 'UNSIGNED-PAYLOAD',
        }),
      ),
    )
  })

  it('streams a ReadableStream body half-duplex', async () => {
    const { r2, calls } = make()
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(4))
        c.close()
      },
    })
    await r2.put('clips/1/2.mp4', body, { contentType: 'video/mp4', contentLength: 4 })
    expect(calls[0][1].body).toBe(body)
    expect(calls[0][1].duplex).toBe('half')
  })

  it('resolves on any 2xx and lets go of the reply body', async () => {
    const reply = new Response('ok', { status: 201 })
    const { r2 } = make({ response: () => reply })
    await expect(r2.put('k', new Uint8Array(0), { contentType: 'image/gif', contentLength: 0 })).resolves.toBeUndefined()
    await expect(reply.text()).rejects.toThrow()
  })

  it('throws R2Error with the status when R2 refuses, without the secret or the reply', async () => {
    const { r2 } = make({ response: () => new Response(`<Error>${SETTINGS.secretAccessKey}</Error>`, { status: 403 }) })
    const err = await r2.put('k', new Uint8Array(1), { contentType: 'image/png', contentLength: 1 }).catch((e) => e)
    expect(err).toBeInstanceOf(R2Error)
    expect(err.status).toBe(403)
    expect(err.message).not.toContain(SETTINGS.secretAccessKey)
  })

  it.each([
    [401, 'R2 refused the credentials (401).'],
    [403, 'R2 refused the credentials (403).'],
    [400, 'R2 refused the upload (400).'],
    [503, 'R2 refused the upload (503).'],
  ])('names a %i as %j, with no key, secret or bucket in it', async (status, message) => {
    const { r2 } = make({ response: () => new Response('<Error/>', { status }) })
    const err = await r2.put('k', new Uint8Array(1), { contentType: 'image/png', contentLength: 1 }).catch((e) => e)
    expect(err.message).toBe(message)
    for (const value of Object.values(SETTINGS)) expect(err.message).not.toContain(value)
  })

  it('throws R2Error with status 0 when R2 is unreachable, dropping the original error', async () => {
    const { r2 } = make({
      fetchImpl: async () => {
        throw new TypeError(`fetch failed ${SETTINGS.secretAccessKey}`)
      },
    })
    const err = await r2.put('k', new Uint8Array(1), { contentType: 'image/png', contentLength: 1 }).catch((e) => e)
    expect(err).toBeInstanceOf(R2Error)
    expect(err.status).toBe(0)
    expect(err.message).toBe('R2 is unreachable.')
    expect(err.cause).toBeUndefined()
  })

  it('hands the caller signal to fetch, so an upload can be timed out', async () => {
    const { r2, calls } = make()
    const signal = new AbortController().signal
    await r2.put('k', new Uint8Array(1), { contentType: 'image/png', contentLength: 1, signal })
    expect(calls[0][1].signal).toBe(signal)
  })

  it('turns an aborted upload into R2Error with status 0', async () => {
    const { r2 } = make({
      fetchImpl: async (url, init) => {
        // Fails only on a signal that arrived and is aborted; without one, the upload would succeed.
        if (init.signal?.aborted) throw init.signal.reason
        return new Response(null, { status: 200 })
      },
    })
    const err = await r2.put('k', new Uint8Array(1), { contentType: 'image/png', contentLength: 1, signal: AbortSignal.abort() }).catch((e) => e)
    expect(err).toBeInstanceOf(R2Error)
    expect(err.status).toBe(0)
    expect(err.message).toBe('R2 is unreachable.')
    expect(err.cause).toBeUndefined()
  })

  const BAD_LENGTH = 'contentLength must be a whole number of bytes.'
  const BAD_TYPE = 'contentType must be a plain header value.'
  it.each([
    [{ contentType: 'image/png', contentLength: -1 }, BAD_LENGTH],
    [{ contentType: 'image/png', contentLength: 1.5 }, BAD_LENGTH],
    [{ contentType: 'image/png', contentLength: '1' }, BAD_LENGTH],
    [{ contentType: '', contentLength: 1 }, BAD_TYPE],
    [{ contentType: 'image/png\r\nx-evil: 1', contentLength: 1 }, BAD_TYPE],
    [{ contentType: ' image/png', contentLength: 1 }, BAD_TYPE],
    [{ contentLength: 1 }, BAD_TYPE],
  ])('refuses bad upload headers %o without touching the network', async (opts, message) => {
    const { r2, calls } = make()
    await expect(r2.put('k', new Uint8Array(1), opts)).rejects.toThrow(new TypeError(message))
    expect(calls).toHaveLength(0)
  })
})

describe('remove', () => {
  const DELETE_SIGNED = 'host;x-amz-content-sha256;x-amz-date'

  it('deletes one object, header-signed, with no body', async () => {
    const { r2, calls } = make({ response: () => new Response(null, { status: 204 }) })
    await expect(r2.remove('clips/1/2.mp4')).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    const [url, init] = calls[0]
    expect(url).toBe('https://acct0123.r2.cloudflarestorage.com/relics/clips/1/2.mp4')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    const canonical = canonicalRequest({
      method: 'DELETE',
      path: '/relics/clips/1/2.mp4',
      query: '',
      headers: { host: 'acct0123.r2.cloudflarestorage.com', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': AMZ_DATE },
      payloadHash: 'UNSIGNED-PAYLOAD',
    })
    expect(init.headers).toEqual({
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': AMZ_DATE,
      Authorization: `AWS4-HMAC-SHA256 Credential=KEYID0123/20261102/auto/s3/aws4_request, SignedHeaders=${DELETE_SIGNED}, Signature=${sign(canonical)}`,
    })
  })

  it('signs the encoded key path, so it deletes the object put and presignGet name', async () => {
    const { r2, calls } = make()
    await r2.remove('art/a b+c/é.png')
    expect(calls[0][0]).toBe('https://acct0123.r2.cloudflarestorage.com/relics/art/a%20b%2Bc/%C3%A9.png')
    expect(calls[0][1].headers.Authorization).toContain(
      sign(
        canonicalRequest({
          method: 'DELETE',
          path: '/relics/art/a%20b%2Bc/%C3%A9.png',
          query: '',
          headers: { host: 'acct0123.r2.cloudflarestorage.com', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': AMZ_DATE },
          payloadHash: 'UNSIGNED-PAYLOAD',
        }),
      ),
    )
  })

  it.each([200, 204, 404])('resolves on %i: an object already gone is what was asked for', async (status) => {
    const reply = new Response(status === 204 ? null : '<x/>', { status })
    const { r2 } = make({ response: () => reply })
    await expect(r2.remove('k')).resolves.toBeUndefined()
    if (status !== 204) await expect(reply.text()).rejects.toThrow()
  })

  it.each([
    [401, 'R2 refused the credentials (401).'],
    [403, 'R2 refused the credentials (403).'],
    [400, 'R2 refused the delete (400).'],
    [409, 'R2 refused the delete (409).'],
    [503, 'R2 refused the delete (503).'],
  ])('throws R2Error naming a %i as %j, with no key, secret or bucket in it, and lets go of the reply', async (status, message) => {
    const reply = new Response(`<Error>${SETTINGS.secretAccessKey}</Error>`, { status })
    const { r2 } = make({ response: () => reply })
    const err = await r2.remove('k').catch((e) => e)
    expect(err).toBeInstanceOf(R2Error)
    expect(err.status).toBe(status)
    expect(err.message).toBe(message)
    for (const value of Object.values(SETTINGS)) expect(err.message).not.toContain(value)
    await expect(reply.text()).rejects.toThrow()
  })

  it('throws R2Error with status 0 when R2 is unreachable, dropping the original error', async () => {
    const { r2 } = make({
      fetchImpl: async () => {
        throw new TypeError(`fetch failed ${SETTINGS.secretAccessKey}`)
      },
    })
    const err = await r2.remove('k').catch((e) => e)
    expect(err).toBeInstanceOf(R2Error)
    expect(err.status).toBe(0)
    expect(err.message).toBe('R2 is unreachable.')
    expect(err.cause).toBeUndefined()
  })

  it.each(['', null, undefined, 7, ['k']])('refuses a key of %j before any request: an empty one would name the bucket itself', async (key) => {
    const { r2, calls } = make()
    await expect(r2.remove(key)).rejects.toThrow(TypeError)
    await expect(r2.remove(key)).rejects.toThrow('remove: the key must be a non-empty string')
    expect(calls).toHaveLength(0)
  })
})
