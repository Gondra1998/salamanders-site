import { describe, it, expect } from 'vitest'
import { createGalleryDiscord } from './galleryDiscord'
import { Upstream } from './discordRoles'

const API = 'https://d.test/api'
const CHANNEL = '200000000000000100'
const msg = (id) => ({ id, content: '', author: { id: '200000000000000900', username: 'invented' }, attachments: [] })

/** A fake fetch answering from a queue of replies, recording each url, auth header and signal. */
function fakeFetch(...replies) {
  const seen = []
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, auth: init.headers?.Authorization, signal: init.signal })
    const r = replies.shift()
    if (r instanceof Error) throw r
    return new Response(r.raw !== undefined ? r.raw : JSON.stringify(r.body ?? null), { status: r.status, headers: r.headers })
  }
  return { fetchImpl, seen }
}
const make = (f, over = {}) => {
  const slept = []
  const discord = createGalleryDiscord({
    fetchImpl: f.fetchImpl,
    apiBase: API,
    botToken: 'secret-bot-token',
    sleep: async (ms) => slept.push(ms),
    ...over,
  })
  return { discord, slept }
}

describe('messagesAfter', () => {
  it('asks for messages after the cursor and returns them oldest-first', async () => {
    const f = fakeFetch({ status: 200, body: [msg('200000000000000303'), msg('200000000000000302'), msg('200000000000000301')] })
    const { discord } = make(f)
    const out = await discord.messagesAfter(CHANNEL, '200000000000000300', 100)
    expect(out.map((m) => m.id)).toEqual(['200000000000000301', '200000000000000302', '200000000000000303'])
    expect(f.seen[0].url).toBe(`${API}/v10/channels/${CHANNEL}/messages?limit=100&after=200000000000000300`)
    expect(f.seen[0].auth).toBe('Bot secret-bot-token')
    expect(f.seen[0].signal).toBeInstanceOf(AbortSignal)
  })

  it('leaves out after when the cursor is null', async () => {
    const f = fakeFetch({ status: 200, body: [msg('200000000000000301')] })
    const { discord } = make(f)
    expect((await discord.messagesAfter(CHANNEL, null, 1)).map((m) => m.id)).toEqual(['200000000000000301'])
    expect(f.seen[0].url).toBe(`${API}/v10/channels/${CHANNEL}/messages?limit=1`)
  })

  it.each([
    ['a refusal', { status: 403, body: { message: 'Missing Access' } }],
    ['a reply that is not a list', { status: 200, body: { nope: true } }],
    ['a reply that is not JSON', { status: 200, raw: 'not json' }],
  ])('throws Upstream on %s', async (_, reply) => {
    const { discord } = make(fakeFetch(reply))
    await expect(discord.messagesAfter(CHANNEL, null, 1)).rejects.toBeInstanceOf(Upstream)
  })

  it('names the status Discord answered with, and nothing more', async () => {
    const { discord } = make(fakeFetch({ status: 403, body: { message: 'Missing Access' } }))
    const err = await discord.messagesAfter(CHANNEL, null, 1).catch((e) => e)
    expect(err.message).toContain('403')
    expect(err.message).not.toContain('secret-bot-token')
  })

  it('throws Upstream without the original message when Discord is unreachable', async () => {
    const { discord } = make(fakeFetch(new TypeError(`fetch failed for ${API}/secret-bot-token`)))
    const err = await discord.messagesAfter(CHANNEL, null, 1).catch((e) => e)
    expect(err).toBeInstanceOf(Upstream)
    expect(err.message).toBe('Discord is unreachable.')
  })

  it('throws Upstream when not configured, without asking Discord', async () => {
    const f = fakeFetch()
    const { discord } = make(f, { botToken: '' })
    await expect(discord.messagesAfter(CHANNEL, null, 1)).rejects.toBeInstanceOf(Upstream)
    expect(f.seen).toEqual([])
  })
})

describe('newest', () => {
  it('asks for the newest messages and returns them as Discord gives them', async () => {
    const f = fakeFetch({ status: 200, body: [msg('200000000000000302'), msg('200000000000000301')] })
    const { discord } = make(f)
    expect((await discord.newest(CHANNEL, 50)).map((m) => m.id)).toEqual(['200000000000000302', '200000000000000301'])
    expect(f.seen[0].url).toBe(`${API}/v10/channels/${CHANNEL}/messages?limit=50`)
  })
})

describe('exists', () => {
  it.each([
    [200, true],
    [404, false],
  ])('a %i is %s', async (status, expected) => {
    const f = fakeFetch({ status, body: {} })
    const { discord } = make(f)
    expect(await discord.exists(CHANNEL, '200000000000000301')).toBe(expected)
    expect(f.seen[0].url).toBe(`${API}/v10/channels/${CHANNEL}/messages/200000000000000301`)
  })

  it('throws Upstream on anything else', async () => {
    const { discord } = make(fakeFetch({ status: 500, body: {} }))
    await expect(discord.exists(CHANNEL, '200000000000000301')).rejects.toBeInstanceOf(Upstream)
  })
})

describe('a 429', () => {
  it('waits Retry-After seconds once, then retries', async () => {
    const f = fakeFetch({ status: 429, headers: { 'Retry-After': '2' } }, { status: 200, body: [msg('200000000000000301')] })
    const { discord, slept } = make(f)
    expect(await discord.messagesAfter(CHANNEL, null, 1)).toHaveLength(1)
    expect(slept).toEqual([2000])
    expect(f.seen).toHaveLength(2)
    expect(f.seen[1].url).toBe(f.seen[0].url)
  })

  it('waits no more than 30 seconds', async () => {
    const f = fakeFetch({ status: 429, headers: { 'Retry-After': '3600' } }, { status: 404, body: {} })
    const { discord, slept } = make(f)
    expect(await discord.exists(CHANNEL, '200000000000000301')).toBe(false)
    expect(slept).toEqual([30_000])
  })

  it.each([
    ['missing', {}],
    ['empty', { 'Retry-After': '' }],
    ['not a number', { 'Retry-After': 'soon' }],
  ])('waits a second when Retry-After is %s', async (_, headers) => {
    const f = fakeFetch({ status: 429, headers }, { status: 200, body: [] })
    const { discord, slept } = make(f)
    await discord.newest(CHANNEL, 50)
    expect(slept).toEqual([1000])
  })

  it('a second 429 throws Upstream', async () => {
    const f = fakeFetch({ status: 429, headers: { 'Retry-After': '1' } }, { status: 429, headers: { 'Retry-After': '1' } })
    const { discord, slept } = make(f)
    await expect(discord.exists(CHANNEL, '200000000000000301')).rejects.toBeInstanceOf(Upstream)
    expect(slept).toEqual([1000])
    expect(f.seen).toHaveLength(2)
  })
})

describe('download', () => {
  const CDN = 'https://cdn.test/attachments/1/2/clip.mp4?ex=signed&hm=signed'

  it('fetches with no auth and passes through the body, length and type', async () => {
    const f = fakeFetch({ status: 200, raw: 'video-bytes', headers: { 'content-length': '11', 'content-type': 'video/mp4' } })
    const { discord } = make(f)
    const out = await discord.download(CDN)
    expect(f.seen[0].url).toBe(CDN)
    expect(f.seen[0].auth).toBeUndefined()
    expect(f.seen[0].signal).toBeInstanceOf(AbortSignal)
    expect(out.body).toBeInstanceOf(ReadableStream)
    expect(out.contentLength).toBe(11)
    expect(out.contentType).toBe('video/mp4')
    expect(await new Response(out.body).text()).toBe('video-bytes')
  })

  it('uses the signal it is given, so one deadline can cover the download and the upload', async () => {
    const f = fakeFetch({ status: 200, raw: 'x' })
    const { discord } = make(f)
    const signal = new AbortController().signal
    await discord.download(CDN, { signal })
    expect(f.seen[0].signal).toBe(signal)
  })

  it('a missing length is 0', async () => {
    const { discord } = make(fakeFetch({ status: 200, raw: null }))
    expect((await discord.download(CDN)).contentLength).toBe(0)
  })

  it('throws Upstream on a non-200, naming the status but not the signed url', async () => {
    const { discord } = make(fakeFetch({ status: 403, raw: 'expired' }))
    const err = await discord.download(CDN).catch((e) => e)
    expect(err).toBeInstanceOf(Upstream)
    expect(err.message).not.toContain('cdn.test')
    expect(err.message).toContain('403')
  })

  it('throws Upstream without the original message when the CDN is unreachable', async () => {
    const { discord } = make(fakeFetch(new TypeError(`fetch failed: ${CDN}`)))
    const err = await discord.download(CDN).catch((e) => e)
    expect(err).toBeInstanceOf(Upstream)
    expect(err.message).not.toContain('signed')
  })
})
