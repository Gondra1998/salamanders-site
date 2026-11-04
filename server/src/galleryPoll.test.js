import { describe, it, expect, vi, afterEach } from 'vitest'
import { createGalleryPoll } from './galleryPoll'
import { createGalleryDiscord, DownloadRefused } from './galleryDiscord'
import { Upstream } from './discordRoles'
import { R2Error, createR2 } from './r2'
import { POLL_ACTOR } from './galleryStore'
import { MAX_CLIP_BYTES } from './galleryParse'

const CHANNEL = '200000000000000100'
const T0 = Date.parse('2026-11-02T12:00:00.000Z')
const id = (n) => String(200000000000000300n + BigInt(n))
const attId = (n) => String(200000000000000700n + BigInt(n))
const message = (n, { attachments = [], content = '' } = {}) => ({
  id: id(n),
  content,
  timestamp: '2026-11-02T10:00:00.000Z',
  author: { id: '200000000000000900', username: 'invented-member' },
  attachments,
})
const video = (n, over = {}) => ({
  id: attId(n),
  url: `https://cdn.test/attachments/${n}/clip.mp4?ex=signed&hm=signed`,
  size: 1000 + n,
  content_type: 'video/mp4',
  ...over,
})
const clip = (n) => message(n, { attachments: [video(n)] })
const range = (from, to, make = message) => Array.from({ length: to - from + 1 }, (_, i) => make(from + i))

/** The clips channel, oldest first, read the way galleryDiscord reads it. */
function fakeDiscord(channel = []) {
  const d = {
    channel,
    calls: [],
    async messagesAfter(ch, after, limit) {
      d.calls.push(['messagesAfter', after, limit])
      if (after === null) return d.channel.slice(-limit)
      return d.channel.filter((m) => BigInt(m.id) > BigInt(after)).slice(0, limit)
    },
    async newest(ch, limit) {
      d.calls.push(['newest', limit])
      return d.channel.slice(-limit).reverse()
    },
    async exists(ch, messageId) {
      d.calls.push(['exists', messageId])
      return d.channel.some((m) => m.id === messageId)
    },
    async download(url, { signal } = {}) {
      d.calls.push(['download', url, signal])
      return { body: `bytes of ${url}`, contentLength: 0, contentType: 'video/mp4' }
    },
  }
  return d
}

function fakeR2(order = []) {
  const r2 = {
    puts: [],
    async put(key, body, opts) {
      order.push(['put', key])
      r2.puts.push({ key, body, opts })
    },
  }
  return r2
}

/** In memory, with the real store's contract: setSync refuses an unknown or undefined key. */
function fakeStore({ cursor, items = [] } = {}, order = []) {
  const s = {
    sync: cursor === undefined ? null : { channel_id: CHANNEL, last_message_id: cursor, last_run_at: null, last_ok_at: null, last_error: null },
    syncCalls: [],
    items: items.map((it, i) => ({ id: i + 1, status: 'approved', ...it })),
    events: [],
    async getSync(ch) {
      expect(ch).toBe(CHANNEL)
      return s.sync && { ...s.sync }
    },
    async setSync(ch, patch) {
      expect(ch).toBe(CHANNEL)
      for (const [k, v] of Object.entries(patch)) {
        if (!['last_message_id', 'last_run_at', 'last_ok_at', 'last_error'].includes(k)) throw new TypeError(`bad key ${k}`)
        if (v === undefined) throw new TypeError(`${k} is undefined`)
      }
      s.syncCalls.push(patch)
      s.sync = { channel_id: ch, last_message_id: null, last_run_at: null, last_ok_at: null, last_error: null, ...s.sync, ...patch }
    },
    hasCalls: 0,
    async hasDiscordItem(messageId, attachmentId) {
      s.hasCalls++
      return s.items.some((it) => it.messageId === messageId && it.attachmentId === attachmentId)
    },
    async insertDiscordItem(row, actor) {
      order.push(['insert', row.messageId, row.attachmentId])
      if (s.items.some((it) => it.messageId === row.messageId && it.attachmentId === row.attachmentId)) return 'exists'
      const item = { ...row, id: s.items.length + 1, status: 'approved' }
      s.items.push(item)
      s.events.push({ itemId: item.id, action: 'stored', actor })
      return { id: item.id }
    },
    live: () => s.items.filter((it) => it.status === 'approved'),
    async approvedClipIds({ newest }) {
      return s.live().sort((a, b) => b.id - a.id).slice(0, newest).map((it) => ({ id: String(it.id), discord_message_id: it.messageId }))
    },
    async approvedClipMessageIds({ after = null, limit }) {
      return s.live()
        .filter((it) => after === null || it.id > Number(after))
        .sort((a, b) => a.id - b.id)
        .slice(0, limit)
        .map((it) => ({ id: String(it.id), discord_message_id: it.messageId }))
    },
    async markDiscordDeleted(messageId) {
      const hit = s.live().filter((it) => it.messageId === messageId)
      for (const it of hit) {
        it.status = 'removed'
        s.events.push({ itemId: it.id, action: 'discord_deleted', actor: POLL_ACTOR })
      }
      return hit.length
    },
  }
  return s
}

function setup({ channel = [], cursor, items, ...over } = {}) {
  const order = []
  const clock = { t: T0 }
  const discord = over.discord ?? fakeDiscord(channel)
  const r2 = fakeR2(order)
  const store = fakeStore({ cursor, items }, order)
  const log = vi.fn()
  const poll = createGalleryPoll({ discord, r2, store, channelId: CHANNEL, intervalMs: 120_000, now: () => clock.t, log, ...over })
  return { poll, discord, r2, store, log, order, clock }
}
const iso = (t) => new Date(t).toISOString()

afterEach(() => {
  vi.useRealTimers()
})

describe('copying the channel', () => {
  it('on first run with no cursor fetches limit=1 and stores nothing, cursor = newest id', async () => {
    const { poll, discord, store, r2 } = setup({ channel: [clip(1), clip(2)] })
    await poll.runOnce()
    expect(discord.calls).toEqual([['messagesAfter', null, 1]])
    expect(store.items).toEqual([])
    expect(r2.puts).toEqual([])
    expect(store.sync).toMatchObject({ last_message_id: id(2), last_run_at: iso(T0), last_ok_at: iso(T0), last_error: null })
  })

  it('seeds the same way when the sync row is there but has no cursor', async () => {
    const { poll, discord, store } = setup({ channel: [clip(1)], cursor: null })
    await poll.runOnce()
    expect(discord.calls).toEqual([['messagesAfter', null, 1]])
    expect(store.sync.last_message_id).toBe(id(1))
  })

  it('an empty channel seeds the cursor at the start, so its first clip is not taken for history', async () => {
    const { poll, discord, store } = setup({ channel: [] })
    await poll.runOnce()
    expect(store.sync.last_message_id).toBe('0')
    discord.channel.push(clip(1))
    await poll.runOnce()
    expect(store.items.map((it) => it.messageId)).toEqual([id(1)])
    expect(store.sync.last_message_id).toBe(id(1))
  })

  it.each([
    ['no id', { content: '' }],
    ['a number id', { id: 200000000000000301 }],
  ])('a seed message with %s is a failed pass, not a cursor of 0', async (_, odd) => {
    const discord = fakeDiscord()
    discord.messagesAfter = async () => [odd]
    const { poll, store } = setup({ discord })
    await expect(poll.runOnce()).resolves.toBeUndefined()
    expect(store.sync).toMatchObject({ last_message_id: null, last_ok_at: null, last_run_at: iso(T0) })
    expect(store.sync.last_error).toBe('The clips poll failed (TypeError).')
  })

  it.each(['intervalMs', 'sweepMs', 'uploadTimeoutMs'])('refuses a %s that is not a finite number above 0', (name) => {
    for (const bad of [0, -1, Infinity, NaN, '120000', null]) {
      expect(() => setup({ [name]: bad })).toThrow(TypeError)
    }
    expect(() => setup({ [name]: 1 })).not.toThrow()
  })

  it('copies each attachment to r2 under clips/<msg>/<att>.<ext> before inserting, status approved, event stored', async () => {
    const two = message(2, { attachments: [video(2), video(3, { content_type: 'image/png', size: 5 })], content: 'two shots' })
    const { poll, discord, r2, store, order } = setup({ cursor: id(0), channel: [clip(1), two] })
    await poll.runOnce()

    expect(order).toEqual([
      ['put', `clips/${id(1)}/${attId(1)}.mp4`],
      ['insert', id(1), attId(1)],
      ['put', `clips/${id(2)}/${attId(2)}.mp4`],
      ['insert', id(2), attId(2)],
      ['put', `clips/${id(2)}/${attId(3)}.png`],
      ['insert', id(2), attId(3)],
    ])
    const [put] = r2.puts
    expect(put.body).toBe(`bytes of ${video(1).url}`)
    expect(put.opts).toEqual({ contentType: 'video/mp4', contentLength: 1001, signal: expect.any(AbortSignal) })
    // One deadline covers the download and the upload it streams into.
    const download = discord.calls.find((c) => c[0] === 'download')
    expect(download[2]).toBe(put.opts.signal)

    expect(store.items[2]).toMatchObject({
      status: 'approved',
      messageId: id(2),
      attachmentId: attId(3),
      media: 'image',
      title: 'two shots',
      r2Key: `clips/${id(2)}/${attId(3)}.png`,
      contentType: 'image/png',
      bytes: 5,
    })
    // The signed CDN link is not handed to the store.
    expect(store.items[0]).not.toHaveProperty('download')
    expect(store.events).toEqual([1, 2, 3].map((itemId) => ({ itemId, action: 'stored', actor: POLL_ACTOR })))
    expect(store.sync).toMatchObject({ last_message_id: id(2), last_ok_at: iso(T0), last_error: null })
  })

  it('inserts an embed row with no r2 call', async () => {
    const { poll, r2, store, discord } = setup({ cursor: id(0), channel: [message(1, { content: 'look https://youtu.be/abcdefghijk' })] })
    await poll.runOnce()
    expect(r2.puts).toEqual([])
    expect(discord.calls.some((c) => c[0] === 'download')).toBe(false)
    expect(store.items).toHaveLength(1)
    expect(store.items[0]).toMatchObject({
      media: 'embed',
      embedUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      r2Key: null,
      contentType: null,
      bytes: null,
    })
  })

  it('advances the cursor only after the whole batch is stored', async () => {
    const { poll, store, r2, log } = setup({ cursor: id(0), channel: [clip(1), clip(2), clip(3)] })
    r2.put = async (key) => {
      if (key.includes(id(3))) throw new R2Error('R2 is unreachable.', 0)
      r2.puts.push({ key })
    }
    await poll.runOnce()
    // A failed upload leaves no row.
    expect(store.items.map((it) => it.messageId)).toEqual([id(1), id(2)])
    expect(store.syncCalls.some((p) => 'last_message_id' in p)).toBe(false)
    expect(store.sync).toMatchObject({ last_message_id: id(0), last_run_at: iso(T0), last_ok_at: null, last_error: 'R2 is unreachable.' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('R2 is unreachable.'))
  })

  it('treats "exists" from the insert as fine (a row stored between the lookup and the insert)', async () => {
    const already = { messageId: id(1), attachmentId: attId(1) }
    const { poll, store } = setup({ cursor: id(0), channel: [clip(1), clip(2)], items: [already] })
    store.hasDiscordItem = async () => false
    await poll.runOnce()
    expect(store.items.map((it) => it.messageId)).toEqual([id(1), id(2)])
    expect(store.events).toHaveLength(1)
    expect(store.sync).toMatchObject({ last_message_id: id(2), last_ok_at: iso(T0), last_error: null })
  })

  it("prefers the CDN's content-length to Discord's size, and falls back to the size when the CDN gives none", async () => {
    const { poll, r2, store, discord } = setup({ cursor: id(0), channel: [clip(1), clip(2)] })
    const fallback = discord.download
    discord.download = async (url, opts) =>
      url === video(1).url ? { body: 'b', contentLength: 4242, contentType: 'video/mp4' } : fallback(url, opts)
    await poll.runOnce()
    expect(r2.puts.map((p) => p.opts.contentLength)).toEqual([4242, 1002])
    expect(store.items.map((it) => it.bytes)).toEqual([4242, 1002])
  })

  it('skips too-large and not-media attachments and still advances', async () => {
    const odd = message(1, {
      attachments: [video(1, { size: MAX_CLIP_BYTES + 1 }), video(2, { content_type: 'application/pdf' })],
    })
    const { poll, store, r2 } = setup({ cursor: id(0), channel: [odd, message(2, { content: 'just talk' })] })
    await poll.runOnce()
    expect(r2.puts).toEqual([])
    expect(store.items).toEqual([])
    expect(store.sync).toMatchObject({ last_message_id: id(2), last_ok_at: iso(T0), last_error: null })
  })

  it('pages while 100 messages come back', async () => {
    const { poll, discord, store } = setup({ cursor: id(0), channel: range(1, 150) })
    await poll.runOnce()
    expect(discord.calls.filter((c) => c[0] === 'messagesAfter')).toEqual([
      ['messagesAfter', id(0), 100],
      ['messagesAfter', id(100), 100],
    ])
    expect(store.syncCalls.filter((p) => 'last_message_id' in p)).toEqual([{ last_message_id: id(100) }, { last_message_id: id(150) }])
  })

  it('an exact 100 asks once more and an empty batch moves nothing', async () => {
    const { poll, discord, store } = setup({ cursor: id(0), channel: range(1, 100) })
    await poll.runOnce()
    expect(discord.calls.filter((c) => c[0] === 'messagesAfter')).toHaveLength(2)
    expect(store.syncCalls.filter((p) => 'last_message_id' in p)).toEqual([{ last_message_id: id(100) }])
  })
})

describe('a message that cannot be stored (Ruling 4)', () => {
  it('a parser throw on one message is logged, recorded, skipped, and the cursor still advances past it', async () => {
    const parse = vi.fn((m) => {
      if (m.id === id(2)) throw new TypeError("Cannot read properties of undefined (reading 'id')")
      return { rows: [], skipped: [] }
    })
    const { poll, store, log } = setup({ cursor: id(0), channel: range(1, 3), parse })
    await poll.runOnce()
    expect(parse).toHaveBeenCalledTimes(3)
    expect(store.sync.last_message_id).toBe(id(3))
    expect(store.sync.last_ok_at).toBe(iso(T0))
    expect(store.sync.last_error).toContain(`Skipped clips message ${id(2)}`)
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Skipped clips message ${id(2)}`))
  })

  it.each([
    ['a guard', new TypeError('attachmentId must be a non-empty string')],
    ['a constraint', Object.assign(new Error('null value in column violates not-null constraint'), { code: '23502' })],
    ['a data error', Object.assign(new Error('value too long for type'), { code: '22001' })],
  ])('the store rejecting a row with %s skips that row and goes on', async (_, err) => {
    const { poll, store } = setup({ cursor: id(0), channel: [clip(1), clip(2)] })
    const insert = store.insertDiscordItem
    store.insertDiscordItem = async (row, actor) => {
      if (row.messageId === id(1)) throw err
      return insert(row, actor)
    }
    await poll.runOnce()
    expect(store.items.map((it) => it.messageId)).toEqual([id(2)])
    expect(store.sync).toMatchObject({ last_message_id: id(2), last_ok_at: iso(T0) })
    expect(store.sync.last_error).toContain(`Skipped clips message ${id(1)}`)
  })

  it('a refused attachment does not lose its storable siblings in the same message', async () => {
    const three = message(1, { attachments: [video(1), video(2), video(3)] })
    const { poll, store } = setup({ cursor: id(0), channel: [three] })
    const insert = store.insertDiscordItem
    store.insertDiscordItem = async (row, actor) => {
      if (row.attachmentId === attId(2)) throw Object.assign(new Error('value too long for type'), { code: '22001' })
      return insert(row, actor)
    }
    await poll.runOnce()
    expect(store.items.map((it) => it.attachmentId)).toEqual([attId(1), attId(3)])
    expect(store.sync).toMatchObject({ last_message_id: id(1), last_ok_at: iso(T0) })
    expect(store.sync.last_error).toContain(`Skipped clips message ${id(1)}`)
  })

  it('Postgres being unreachable is not a rejected row: the pass ends and the cursor stays', async () => {
    const { poll, store } = setup({ cursor: id(0), channel: [clip(1), clip(2)] })
    store.insertDiscordItem = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    }
    await poll.runOnce()
    expect(store.sync).toMatchObject({ last_message_id: id(0), last_ok_at: null, last_run_at: iso(T0) })
    expect(store.sync.last_error).toBe('The clips poll failed (Error).')
  })

  it('never records or logs a signed CDN link', async () => {
    const parse = () => {
      throw new Error(`could not read ${video(1).url}`)
    }
    const { poll, store, log } = setup({ cursor: id(0), channel: [clip(1)], parse })
    await poll.runOnce()
    expect(store.sync.last_error).not.toContain('signed')
    expect(store.sync.last_error).not.toContain('cdn.test')
    for (const [line] of log.mock.calls) expect(line).not.toContain('signed')
  })
})

/**
 * Ruling 23: an attachment that can never be copied as things stand (the CDN refused its link, R2 refused the
 * object, or the copy ran out its own deadline) is skipped like a refused row; a network error, a 5xx or a 429
 * is an outage, which ends the pass with the cursor where it was.
 */
describe('an attachment that cannot be copied (Ruling 23)', () => {
  // The real galleryDiscord download, against a CDN that answers `reply` (a status, or an Error thrown by fetch).
  const cdn = (reply) =>
    createGalleryDiscord({
      fetchImpl: async () => {
        if (reply instanceof Error) throw reply
        return new Response('nope', { status: reply })
      },
      apiBase: 'https://d.test/api',
      botToken: 'bot',
    }).download
  // Message 2 holds two attachments; the first of them is the one that fails.
  const channel = () => [clip(1), message(2, { attachments: [video(2), video(3)] }), clip(4)]
  const failing = video(2)
  const failOne = (discord, download) => {
    const fine = discord.download
    discord.download = async (url, opts) => {
      if (url !== failing.url) return fine(url, opts)
      discord.calls.push(['download', url, opts.signal])
      return download(url, opts)
    }
  }
  const failPut = (r2, err) => {
    const fine = r2.put
    r2.put = async (key, body, opts) => {
      if (key.includes(failing.id)) throw typeof err === 'function' ? await err(opts) : err
      return fine(key, body, opts)
    }
  }
  const expectSkipped = (store, log) => {
    expect(store.items.map((it) => it.attachmentId)).toEqual([attId(1), attId(3), attId(4)])
    expect(store.sync).toMatchObject({ last_message_id: id(4), last_ok_at: iso(T0) })
    expect(store.sync.last_error).toContain(`Skipped clips message ${id(2)} (could not copy an attachment: `)
    expect(store.sync.last_error).not.toContain('cdn.test')
    expect(store.sync.last_error).not.toContain('signed')
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`Skipped clips message ${id(2)}`))
  }
  const expectOutage = (store, error) => {
    expect(store.items.map((it) => it.attachmentId)).toEqual([attId(1)])
    expect(store.syncCalls.some((p) => 'last_message_id' in p)).toBe(false)
    expect(store.sync).toMatchObject({ last_message_id: id(0), last_ok_at: null, last_run_at: iso(T0), last_error: error })
  }

  it.each([400, 404, 410, 415])('a CDN %i skips that row: its siblings are stored and the cursor advances', async (status) => {
    const { poll, store, discord, r2, log } = setup({ cursor: id(0), channel: channel() })
    failOne(discord, cdn(status))
    await poll.runOnce()
    expectSkipped(store, log)
    expect(store.sync.last_error).toContain(`Discord's CDN answered ${status}.`)
    expect(r2.puts.some((p) => p.key.includes(failing.id))).toBe(false)
  })

  it.each([
    [500, "Discord's CDN answered 500."],
    [503, "Discord's CDN answered 503."],
    [429, "Discord's CDN answered 429."],
    [401, "Discord's CDN answered 401."],
    [403, "Discord's CDN answered 403."], // Ruling 25: an expired link or a blocked address, never a skip
    [408, "Discord's CDN answered 408."],
  ])('a CDN %i ends the pass and leaves the cursor, as before', async (status, error) => {
    const { poll, store, discord } = setup({ cursor: id(0), channel: channel() })
    failOne(discord, cdn(status))
    await poll.runOnce()
    expectOutage(store, error)
  })

  it('a network error on the download ends the pass and leaves the cursor', async () => {
    const { poll, store, discord } = setup({ cursor: id(0), channel: channel() })
    failOne(discord, cdn(new TypeError('fetch failed')))
    await poll.runOnce()
    expectOutage(store, 'Discord is unreachable.')
  })

  it.each([400, 411, 412, 413, 415, 422])('R2 answering %i skips that row and goes on', async (status) => {
    const { poll, store, r2, log } = setup({ cursor: id(0), channel: channel() })
    failPut(r2, new R2Error(`R2 refused the upload (${status}).`, status))
    await poll.runOnce()
    expectSkipped(store, log)
    expect(store.sync.last_error).toContain(`R2 refused the upload (${status}).`)
  })

  it.each([
    [503, 'R2 refused the upload (503).'],
    [500, 'R2 refused the upload (500).'],
    [429, 'R2 refused the upload (429).'],
    [408, 'R2 refused the upload (408).'],
    [404, 'R2 refused the upload (404).'],
    [0, 'R2 is unreachable.'],
  ])('R2 answering %i ends the pass and leaves the cursor', async (status, error) => {
    const { poll, store, r2 } = setup({ cursor: id(0), channel: channel() })
    failPut(r2, new R2Error(error, status))
    await poll.runOnce()
    expectOutage(store, error)
  })

  // Bad or rotated credentials are true of every clip: skipping past them would lose clips silently.
  it.each([401, 403])('R2 answering %i (the credentials) ends the pass and leaves the cursor', async (status) => {
    const secrets = { accountId: 'acct-sentinel', bucket: 'bucket-sentinel', accessKeyId: 'key-sentinel', secretAccessKey: 'secret-sentinel' }
    const real = createR2({ ...secrets, fetchImpl: async () => new Response('<Error>AccessDenied</Error>', { status }) })
    const { poll, store, r2, log } = setup({ cursor: id(0), channel: channel() })
    r2.put = real.put
    await poll.runOnce()
    expect(store.items).toEqual([])
    expect(store.syncCalls.some((p) => 'last_message_id' in p)).toBe(false)
    expect(store.sync).toMatchObject({ last_message_id: id(0), last_ok_at: null, last_error: `R2 refused the credentials (${status}).` })
    for (const text of [store.sync.last_error, ...log.mock.calls.map(([line]) => line)]) expect(text).not.toMatch(/sentinel/)
  })

  // The row's own deadline: whatever the download or the upload throws once it has fired.
  const afterAbort = (signal) => new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  it.each([
    ['the download', 'download'],
    ['the upload', 'put'],
  ])("the row's deadline firing during %s skips that row", async (_, where) => {
    const { poll, store, discord, r2, log } = setup({ cursor: id(0), channel: channel(), uploadTimeoutMs: 20 })
    if (where === 'download') {
      failOne(discord, async (url, { signal }) => {
        await afterAbort(signal)
        throw new Upstream('Discord is unreachable.')
      })
    } else {
      failPut(r2, async ({ signal }) => {
        await afterAbort(signal)
        return new R2Error('R2 is unreachable.', 0)
      })
    }
    await poll.runOnce()
    expectSkipped(store, log)
    expect(store.sync.last_error).toContain('the copy did not finish within 0.02 s')
  })

  it('a batch repeated after a crash mid-batch downloads and uploads nothing it already holds', async () => {
    const { poll, store, discord, r2 } = setup({ cursor: id(0), channel: [clip(1), clip(2), clip(3)] })
    const fine = r2.put
    r2.put = async (key, body, opts) => {
      if (key.includes(attId(3))) throw new R2Error('R2 is unreachable.', 0)
      return fine(key, body, opts)
    }
    await poll.runOnce() // stores 1 and 2, then R2 goes away: the cursor stays
    expect(store.sync.last_message_id).toBe(id(0))
    expect(r2.puts).toHaveLength(2)
    const downloads = () => discord.calls.filter((c) => c[0] === 'download').length
    expect(downloads()).toBe(3)

    r2.put = fine
    await poll.runOnce() // the same batch again
    expect(r2.puts).toHaveLength(3) // only clip 3
    expect(r2.puts.at(-1).key).toBe(`clips/${id(3)}/${attId(3)}.mp4`)
    expect(downloads()).toBe(4)
    expect(store.hasCalls).toBe(6)
    expect(store.items.map((it) => it.messageId)).toEqual([id(1), id(2), id(3)])
    expect(store.sync).toMatchObject({ last_message_id: id(3), last_error: null })
  })

  it('Postgres failing the lookup is an outage, not a skipped row', async () => {
    const { poll, store, r2 } = setup({ cursor: id(0), channel: [clip(1)] })
    store.hasDiscordItem = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    }
    await poll.runOnce()
    expect(r2.puts).toEqual([])
    expect(store.sync).toMatchObject({ last_message_id: id(0), last_ok_at: null, last_error: 'The clips poll failed (Error).' })
  })

  it('DownloadRefused is still an Upstream, so other callers keep treating it as one', () => {
    expect(new DownloadRefused('x')).toBeInstanceOf(Upstream)
  })
})

describe('deletions', () => {
  it('fast window: an approved clip among the newest 50 whose message is gone becomes removed with discord_deleted', async () => {
    const items = [1, 2, 2, 3].map((n, i) => ({ messageId: id(n), attachmentId: attId(i) }))
    const { poll, store, discord } = setup({ cursor: id(3), channel: [message(1), message(3)], items })
    await poll.runOnce()
    expect(discord.calls).toContainEqual(['newest', 50])
    expect(store.items.map((it) => it.status)).toEqual(['approved', 'removed', 'removed', 'approved'])
    expect(store.events).toEqual([
      { itemId: 2, action: 'discord_deleted', actor: POLL_ACTOR },
      { itemId: 3, action: 'discord_deleted', actor: POLL_ACTOR },
    ])
  })

  it('fast window: a clip older than all of a full window is outside it, not gone', async () => {
    // 50 chat messages newer than the clip fill the window; the clip's message is still there, just further back.
    const { poll, store } = setup({
      cursor: id(60),
      channel: [message(1), ...range(11, 60)],
      items: [{ messageId: id(1), attachmentId: attId(1) }],
    })
    store.approvedClipMessageIds = async () => []
    await poll.runOnce()
    expect(store.items[0].status).toBe('approved')
  })

  it('slow sweep: runs when now - lastSweep >= sweepMs, walks approvedClipMessageIds in pages, exists() false → markDiscordDeleted, Upstream → stops the sweep and records last_error but keeps the copy work done', async () => {
    // 120 clips, one per message except message 5 with two; the site's newest 50 are all still in Discord.
    const items = range(1, 120, (n) => ({ messageId: id(n), attachmentId: attId(n) }))
    items.splice(5, 0, { messageId: id(5), attachmentId: attId(1000) })
    const channel = range(1, 120).filter((m) => m.id !== id(3))
    const { poll, store, discord, clock } = setup({ cursor: id(120), channel, items, sweepMs: 1000 })
    const exists = () => discord.calls.filter((c) => c[0] === 'exists').map((c) => c[1])
    const pages = []
    const page = store.approvedClipMessageIds
    store.approvedClipMessageIds = async (args) => {
      pages.push(args)
      return page(args)
    }

    await poll.runOnce() // the first pass sweeps
    expect(pages).toEqual([
      { after: null, limit: 100 },
      { after: '100', limit: 100 },
    ])
    expect(exists()).toHaveLength(120) // message 5 asked about once
    expect(store.items.filter((it) => it.status === 'removed').map((it) => it.messageId)).toEqual([id(3)])
    expect(store.sync).toMatchObject({ last_ok_at: iso(T0), last_error: null })

    clock.t = T0 + 999
    await poll.runOnce()
    expect(exists()).toHaveLength(120) // not due yet

    // Due again: a new clip is copied, then Discord fails part way through the sweep.
    clock.t = T0 + 1999
    discord.channel.push(clip(121))
    discord.exists = async (ch, messageId) => {
      discord.calls.push(['exists', messageId])
      if (messageId === id(50)) throw new Upstream('Discord answered 500 for a clips message.')
      return true
    }
    await poll.runOnce()
    expect(store.items.at(-1)).toMatchObject({ messageId: id(121), status: 'approved' })
    expect(store.sync).toMatchObject({
      last_message_id: id(121),
      last_run_at: iso(T0 + 1999),
      last_ok_at: iso(T0 + 999), // the pass before, which did not sweep
      last_error: 'Discord answered 500 for a clips message.',
    })

    // The sweep did not finish, so it does not count: had it, this pass would be 1 ms after it and not due.
    const before = exists().length
    clock.t = T0 + 2000
    discord.exists = async (ch, messageId) => {
      discord.calls.push(['exists', messageId])
      return true
    }
    await poll.runOnce()
    expect(exists().length).toBeGreaterThan(before)
    expect(store.sync).toMatchObject({ last_ok_at: iso(T0 + 2000), last_error: null })
  })
})

describe('a 429 handled by discord leaves the batch intact', () => {
  const discordWith = (...replies) => {
    const fetchImpl = async () => {
      const r = replies.shift()
      return new Response(JSON.stringify(r.body ?? null), { status: r.status, headers: r.headers })
    }
    return createGalleryDiscord({ fetchImpl, apiBase: 'https://d.test/api', botToken: 'bot', sleep: async () => {} })
  }

  it('one 429: the batch is read again and stored, the cursor moves', async () => {
    const discord = discordWith(
      { status: 429, headers: { 'Retry-After': '1' } },
      { status: 200, body: [message(2, { content: 'https://youtu.be/abcdefghijk' }), message(1)] },
      { status: 200, body: [] },
    )
    const { poll, store } = setup({ cursor: id(0), discord })
    store.approvedClipIds = async () => []
    store.approvedClipMessageIds = async () => []
    await poll.runOnce()
    expect(store.items.map((it) => it.messageId)).toEqual([id(2)])
    expect(store.sync).toMatchObject({ last_message_id: id(2), last_ok_at: iso(T0), last_error: null })
  })

  it('two 429s: nothing stored, the cursor stays, last_error says why', async () => {
    const discord = discordWith({ status: 429, headers: { 'Retry-After': '1' } }, { status: 429, headers: { 'Retry-After': '1' } })
    const { poll, store } = setup({ cursor: id(0), discord })
    await poll.runOnce()
    expect(store.items).toEqual([])
    expect(store.sync).toMatchObject({ last_message_id: id(0), last_ok_at: null, last_error: 'Discord is rate limiting the clips poll.' })
  })
})

describe('runOnce, start, stop and status', () => {
  it('runOnce never rejects; last_run_at is set on every pass and last_ok_at only on success', async () => {
    const { poll, store, clock, discord, log } = setup({ cursor: id(0), channel: [clip(1)] })
    await poll.runOnce()
    expect(store.sync).toMatchObject({ last_run_at: iso(T0), last_ok_at: iso(T0) })

    clock.t = T0 + 5000
    discord.messagesAfter = async () => {
      throw new Upstream('Discord is unreachable.')
    }
    await expect(poll.runOnce()).resolves.toBeUndefined()
    expect(store.sync).toMatchObject({ last_run_at: iso(T0 + 5000), last_ok_at: iso(T0), last_error: 'Discord is unreachable.' })

    // Even the store failing to record the failure does not reject.
    store.getSync = async () => {
      throw new Error('pool exhausted')
    }
    store.setSync = async () => {
      throw new Error('pool exhausted')
    }
    await expect(poll.runOnce()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(3)
  })

  it('two passes never overlap: a call while one is in flight is a no-op', async () => {
    const { poll, discord } = setup({ cursor: id(0), channel: [clip(1)] })
    let release
    const gate = new Promise((r) => (release = r))
    const read = discord.messagesAfter
    discord.messagesAfter = async (...args) => {
      await gate
      return read(...args)
    }
    const first = poll.runOnce()
    await poll.runOnce()
    release()
    await first
    expect(discord.calls.filter((c) => c[0] === 'messagesAfter')).toHaveLength(1)
    await poll.runOnce() // and the flag is cleared afterwards
    expect(discord.calls.filter((c) => c[0] === 'messagesAfter')).toHaveLength(2)
  })

  it('start() runs immediately and then every intervalMs; stop() clears it', async () => {
    vi.useFakeTimers()
    const { poll, store } = setup({ cursor: id(0) })
    const getSync = vi.spyOn(store, 'getSync')
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getSync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(getSync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getSync).toHaveBeenCalledTimes(2)
    poll.stop()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(getSync).toHaveBeenCalledTimes(2)
  })

  it('status() reads the sync row as camelCase ISO strings, or nulls', async () => {
    const { poll, store } = setup()
    expect(await poll.status()).toEqual({ lastRunAt: null, lastOkAt: null, lastError: null })
    store.sync = {
      channel_id: CHANNEL,
      last_message_id: id(1),
      last_run_at: new Date(T0 + 1000),
      last_ok_at: new Date(T0),
      last_error: 'Discord is unreachable.',
    }
    expect(await poll.status()).toEqual({ lastRunAt: iso(T0 + 1000), lastOkAt: iso(T0), lastError: 'Discord is unreachable.' })
  })
})
