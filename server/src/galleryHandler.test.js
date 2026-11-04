import { describe, it, expect, vi } from 'vitest'
import { createGalleryHandler } from './galleryHandler'
import { Upstream } from './discordRoles'
import { COMMUNITY_MEMBER } from './displayNames'
import { MAX_ART_BYTES } from './galleryValidate'

// Invented ids only: the real role and user ids never enter the repo.
const MEMBER = Object.freeze({ id: '200000000000000401', username: 'brother' })
const APPROVER = Object.freeze({ id: '200000000000000402', username: 'chaplain' })
const OUTSIDER = Object.freeze({ id: '200000000000000403', username: 'stranger' })
const LEFT = '200000000000000404' // a clip author the name directory no longer knows

// Deep-frozen, so a handler that mutated a verdict would throw.
const freeze = (v) => Object.freeze({ ...v, user: Object.freeze(v.user) })
const VERDICTS = {
  member: freeze({ user: MEMBER, access: true, approver: false }),
  approver: freeze({ user: APPROVER, access: true, approver: true }),
  outsider: freeze({ user: OUTSIDER, access: false, approver: false }),
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]
const POSTED = new Date('2026-11-02T10:00:00.000Z')

const row = (over) => ({
  kind: 'art',
  source: 'site',
  author_discord_id: MEMBER.id,
  author_username: MEMBER.username,
  title: 'A piece',
  note: '',
  media: 'image',
  r2_key: null,
  embed_url: null,
  content_type: null,
  bytes: null,
  status: 'approved',
  review_note: null,
  posted_at: POSTED,
  ...over,
})

// In-memory store with the same contract as galleryStore.js. Ids are strings, as pg returns bigserial.
function memStore() {
  const items = new Map()
  const events = []
  let seq = 100
  const add = (over) => {
    const id = String(++seq)
    items.set(id, row({ id, ...over }))
    return id
  }
  const move = (id, { from, to, action, actor, note }, owner = null) => {
    const item = items.get(id)
    if (!item || (owner && item.author_discord_id !== owner)) return 'missing'
    if (!from.includes(item.status)) return 'conflict'
    item.status = to
    if (!owner) item.review_note = note ?? null
    events.push({ id: String(events.length + 1), item_id: id, action, actor_discord_id: actor.id, actor_username: actor.username, note: note ?? '', created_at: POSTED })
    return { item: { ...item } }
  }
  return {
    items,
    events,
    add,
    insertArt: vi.fn(async ({ title, note, ext, contentType, bytes }, user) => {
      const id = add({ status: 'pending', r2_key: '', title, note, content_type: contentType, bytes: String(bytes), author_discord_id: user.id, author_username: user.username })
      const r2Key = `art/${id}.${ext}`
      items.get(id).r2_key = r2Key
      return { id, r2Key }
    }),
    transition: vi.fn(async (id, opts) => move(id, opts)),
    removeByOwner: vi.fn(async (id, user) => {
      if (!user?.id) throw new TypeError('user.id must be a non-empty string')
      return move(id, { from: ['pending', 'approved', 'rejected'], to: 'removed', action: 'removed', actor: user }, user.id)
    }),
    list: vi.fn(async ({ kind, before }) => ({
      rows: [...items.values()].filter((r) => r.kind === kind && r.status === 'approved' && (!before || Number(r.id) < Number(before))).reverse(),
      next: kind === 'clip' ? '7' : null,
    })),
    mine: vi.fn(async (userId) => [...items.values()].filter((r) => r.author_discord_id === userId).reverse()),
    pending: vi.fn(async () => [...items.values()].filter((r) => r.status === 'pending').reverse()),
    events: vi.fn(async () => ({ rows: [...events].reverse(), next: '3' })),
  }
}

const SYNC = { lastRunAt: '2026-11-02T09:00:00.000Z', lastOkAt: '2026-11-02T09:00:00.000Z', lastError: null }

function setup({ configured = true } = {}) {
  const store = memStore()
  const r2 = {
    put: vi.fn(async () => {}),
    presignGet: vi.fn((key) => `signed:${key}`),
  }
  const poll = { status: vi.fn(async () => SYNC) }
  const names = { [MEMBER.id]: 'Brother Tuoni', [APPROVER.id]: 'Chaplain Xavier' }
  const displayNames = { resolver: vi.fn(async () => (id) => names[id] ?? COMMUNITY_MEMBER) }
  const fail = { discord: false }
  const access = {
    resolve: vi.fn(async (request) => {
      if (fail.discord) throw new Upstream('Discord is unreachable.')
      return VERDICTS[(request.headers.get('Authorization') || '').slice(7)] ?? null
    }),
  }
  const handle = createGalleryHandler({ access, store, r2, poll, displayNames, configured })
  return { handle, store, r2, poll, access, fail, displayNames }
}

const BASE = 'http://api.test'
function req(method, path, { who, json, body, headers = {} } = {}) {
  const h = { ...headers }
  if (who) h.Authorization = `Bearer ${who}`
  let payload = body
  if (json !== undefined) {
    h['Content-Type'] = 'application/json'
    payload = JSON.stringify(json)
  }
  return new Request(BASE + path, { method, headers: h, body: payload })
}
const call = (ctx, request) => ctx.handle(request, new URL(request.url))
const bodyOf = async (res) => (res.status === 204 ? null : res.json())

// A field given as undefined is left out of the form.
function form(over = {}) {
  const fields = { file: new File([new Uint8Array(PNG)], 'x.png', { type: 'image/png' }), title: 'Salamander at rest', ...over }
  const f = new FormData()
  for (const [name, value] of Object.entries(fields)) if (value !== undefined) f.set(name, value)
  return f
}
const upload = (ctx, fields, who = 'member') => call(ctx, req('POST', '/gallery/art', { who, body: form(fields) }))

/**
 * A request whose body the handler must never read: formData and text throw. For the checks that run on the
 * headers alone, and for the size check on a FormData built here (no 10 MB multipart to serialise).
 */
function fakeUpload({ who = 'member', headers = {}, formData } = {}) {
  return {
    method: 'POST',
    url: `${BASE}/gallery/art`,
    headers: new Headers({ Authorization: `Bearer ${who}`, 'Content-Type': 'multipart/form-data; boundary=x', ...headers }),
    formData: vi.fn(formData ?? (async () => { throw new Error('the body must not be read') })),
    text: vi.fn(async () => { throw new Error('the body must not be read') }),
  }
}

// Every route, with whether it is approver only.
const ROUTES = [
  ['GET', '/gallery/clips', false],
  ['GET', '/gallery/art', false],
  ['GET', '/gallery/mine', false],
  ['POST', '/gallery/art', false],
  ['DELETE', '/gallery/items/101', false],
  ['GET', '/gallery/review', true],
  ['POST', '/gallery/items/101/approve', true],
  ['POST', '/gallery/items/101/reject', true],
  ['POST', '/gallery/items/101/hide', true],
  ['GET', '/gallery/events', true],
]

describe('galleryHandler routing and gates', () => {
  it('leaves paths outside /gallery to other handlers', async () => {
    const ctx = setup()
    expect(await call(ctx, req('GET', '/galleryx', { who: 'member' }))).toBeNull()
    expect(await call(ctx, req('GET', '/deathwatch/me', { who: 'member' }))).toBeNull()
    expect(ctx.access.resolve).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', '/gallery'],
    ['GET', '/gallery/'],
    ['GET', '/gallery/nope'],
    ['PUT', '/gallery/art'],
    ['GET', '/gallery/items/101'],
    ['POST', '/gallery/items/101/delete'],
    ['DELETE', '/gallery/items/101/approve'],
    ['POST', '/gallery/me'],
    // The read-only routes answer GET alone.
    ['POST', '/gallery/clips'],
    ['DELETE', '/gallery/mine'],
    ['PUT', '/gallery/review'],
    ['POST', '/gallery/events'],
  ])('%s %s is 404 before anything else, even unconfigured', async (method, path) => {
    const ctx = setup({ configured: false })
    const res = await call(ctx, req(method, path, { who: 'member' }))
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ error: 'Not found.' })
    expect(ctx.access.resolve).not.toHaveBeenCalled()
  })

  it.each([['GET', '/gallery/me'], ...ROUTES.map(([m, p]) => [m, p])])('%s %s answers 503 when not configured', async (method, path) => {
    const ctx = setup({ configured: false })
    const res = await call(ctx, req(method, path, { who: 'approver' }))
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'The Reliquarium is not configured.' })
    expect(ctx.access.resolve).not.toHaveBeenCalled()
  })

  it.each([['GET', '/gallery/me'], ...ROUTES.map(([m, p]) => [m, p])])('%s %s is 401 without a Discord identity', async (method, path) => {
    const ctx = setup()
    const res = await call(ctx, req(method, path))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Sign in with Discord.' })
  })

  it.each(ROUTES)('%s %s is 403 for a signed-in non-member, before any body or store call', async (method, path) => {
    const ctx = setup()
    const res = await call(ctx, req(method, path, { who: 'outsider' }))
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Restricted to the XVIIIth Legion.' })
    for (const fn of ['insertArt', 'transition', 'removeByOwner', 'list', 'mine', 'pending', 'events']) expect(ctx.store[fn]).not.toHaveBeenCalled()
  })

  it.each(ROUTES.filter(([, , approver]) => approver))('%s %s is 403 for a member who is not an approver', async (method, path) => {
    const ctx = setup()
    ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req(method, path, { who: 'member', ...(method === 'GET' ? {} : { json: { reason: 'r' } }) }))
    expect(res.status).toBe(403)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Only approvers can do that.' })
    expect(ctx.store.transition).not.toHaveBeenCalled()
  })

  it.each([['GET', '/gallery/me'], ...ROUTES.map(([m, p]) => [m, p])])('%s %s is 503 when Discord is down', async (method, path) => {
    const ctx = setup()
    ctx.fail.discord = true
    const res = await call(ctx, req(method, path, { who: 'approver' }))
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Discord could not be reached. Try again.' })
  })

  it('asks for a fresh verdict on every non-GET and allows a cached one on reads', async () => {
    const ctx = setup()
    for (const [method, path] of [['GET', '/gallery/me'], ...ROUTES]) {
      ctx.access.resolve.mockClear()
      await call(ctx, req(method, path, { who: 'approver' }))
      expect(ctx.access.resolve).toHaveBeenCalledTimes(1)
      expect(ctx.access.resolve.mock.calls[0][1]).toEqual({ fresh: method !== 'GET' })
    }
  })

  it('rethrows anything that is not a Discord failure', async () => {
    const ctx = setup()
    ctx.store.list.mockRejectedValueOnce(new Error('db down'))
    await expect(call(ctx, req('GET', '/gallery/clips', { who: 'member' }))).rejects.toThrow('db down')
  })
})

describe('GET /gallery/me', () => {
  it.each([
    ['outsider', { access: false, approver: false }],
    ['member', { access: true, approver: false }],
    ['approver', { access: true, approver: true }],
  ])('answers %s at 200 with only access and approver', async (who, expected) => {
    const ctx = setup()
    const res = await call(ctx, req('GET', '/gallery/me', { who }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual(expected)
  })
})

describe('GET /gallery/clips and /gallery/art', () => {
  it('lists approved clips with presigned or embed urls, display names, and the next cursor', async () => {
    const ctx = setup()
    const video = ctx.store.add({ kind: 'clip', source: 'discord', media: 'video', r2_key: 'clips/1/2.mp4', content_type: 'video/mp4', bytes: '2048', title: 'Ambush' })
    const embed = ctx.store.add({ kind: 'clip', source: 'discord', media: 'embed', embed_url: 'https://medal.tv/x', author_discord_id: LEFT, author_username: 'gone' })
    ctx.store.add({ kind: 'clip', source: 'discord', media: 'video', r2_key: 'clips/3/4.mp4', status: 'hidden' })
    ctx.store.add({ kind: 'art', r2_key: 'art/9.png' })
    const res = await call(ctx, req('GET', '/gallery/clips', { who: 'member' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(ctx.store.list).toHaveBeenCalledWith({ kind: 'clip', before: null })
    expect(await res.json()).toEqual({
      items: [
        {
          id: embed,
          kind: 'clip',
          source: 'discord',
          author: { id: LEFT, name: 'gone' },
          title: 'A piece',
          note: '',
          media: 'embed',
          url: 'https://medal.tv/x',
          contentType: null,
          bytes: null,
          status: 'approved',
          reviewNote: null,
          postedAt: '2026-11-02T10:00:00.000Z',
        },
        {
          id: video,
          kind: 'clip',
          source: 'discord',
          author: { id: MEMBER.id, name: 'Brother Tuoni' },
          title: 'Ambush',
          note: '',
          media: 'video',
          url: 'signed:clips/1/2.mp4',
          contentType: 'video/mp4',
          bytes: 2048,
          status: 'approved',
          reviewNote: null,
          postedAt: '2026-11-02T10:00:00.000Z',
        },
      ],
      next: '7',
    })
    expect(ctx.r2.presignGet).toHaveBeenCalledWith('clips/1/2.mp4', { expiresSec: 900 })
    expect(ctx.r2.presignGet).toHaveBeenCalledTimes(1)
  })

  it('never signs an empty or missing key, and gives null when there is nothing to link', async () => {
    const ctx = setup()
    ctx.store.add({ r2_key: '' })
    ctx.store.add({ r2_key: null, embed_url: null })
    ctx.store.add({ r2_key: 42, embed_url: '' })
    const { items } = await (await call(ctx, req('GET', '/gallery/art', { who: 'member' }))).json()
    expect(items.map((i) => i.url)).toEqual([null, null, null])
    expect(ctx.r2.presignGet).not.toHaveBeenCalled()
  })

  it('names an author the directory does not know by their stored username, else as a community member', async () => {
    const ctx = setup()
    ctx.store.add({ author_discord_id: LEFT, author_username: '' })
    ctx.store.add({ author_discord_id: LEFT, author_username: 'gone' })
    const { items } = await (await call(ctx, req('GET', '/gallery/art', { who: 'member' }))).json()
    expect(items.map((i) => i.author.name)).toEqual(['gone', COMMUNITY_MEMBER])
  })

  it('passes a valid before cursor to the store', async () => {
    const ctx = setup()
    const res = await call(ctx, req('GET', '/gallery/art?before=12345', { who: 'member' }))
    expect(res.status).toBe(200)
    expect(ctx.store.list).toHaveBeenCalledWith({ kind: 'art', before: '12345' })
    expect(await res.json()).toEqual({ items: [], next: null })
  })

  it.each(['/gallery/clips?before=abc', '/gallery/art?before=', '/gallery/art?before=-1', '/gallery/clips?before=1234567890123456'])(
    '%s is 400',
    async (path) => {
      const ctx = setup()
      const res = await call(ctx, req('GET', path, { who: 'member' }))
      expect(res.status).toBe(400)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(await res.json()).toEqual({ error: 'That page cursor is not valid.' })
      expect(ctx.store.list).not.toHaveBeenCalled()
    },
  )
})

describe('GET /gallery/mine', () => {
  it("lists the caller's own items in every status, with the rejection reason", async () => {
    const ctx = setup()
    const rejected = ctx.store.add({ status: 'rejected', review_note: 'Not lore-friendly', r2_key: 'art/1.png' })
    ctx.store.add({ author_discord_id: APPROVER.id })
    const res = await call(ctx, req('GET', '/gallery/mine', { who: 'member' }))
    expect(res.status).toBe(200)
    expect(ctx.store.mine).toHaveBeenCalledWith(MEMBER.id)
    const { items } = await res.json()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: rejected, status: 'rejected', reviewNote: 'Not lore-friendly', url: 'signed:art/1.png' })
  })
})

describe('POST /gallery/art', () => {
  it('stores a valid upload in R2 and answers 201 with the pending item and a signed url', async () => {
    const ctx = setup()
    const before = Date.now()
    const res = await upload(ctx, { title: '  Salamander at rest  ', note: ' oil on canvas ' })
    expect(res.status).toBe(201)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const { item } = await res.json()
    const id = [...ctx.store.items.keys()][0]
    expect(item).toEqual({
      id,
      kind: 'art',
      source: 'site',
      author: { id: MEMBER.id, name: 'Brother Tuoni' },
      title: 'Salamander at rest',
      note: 'oil on canvas',
      media: 'image',
      url: `signed:art/${id}.png`,
      contentType: 'image/png',
      bytes: PNG.length,
      status: 'pending',
      reviewNote: null,
      postedAt: expect.any(String),
    })
    expect(Date.parse(item.postedAt)).toBeGreaterThanOrEqual(before - 1000)
    expect(ctx.store.insertArt).toHaveBeenCalledWith(
      { title: 'Salamander at rest', note: 'oil on canvas', ext: 'png', contentType: 'image/png', bytes: PNG.length },
      MEMBER,
    )
    expect(ctx.r2.put).toHaveBeenCalledTimes(1)
    const [key, bytes, opts] = ctx.r2.put.mock.calls[0]
    expect(key).toBe(`art/${id}.png`)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual(PNG)
    expect(opts.contentType).toBe('image/png')
    expect(opts.contentLength).toBe(PNG.length)
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(ctx.r2.presignGet).toHaveBeenCalledWith(`art/${id}.png`, { expiresSec: 900 })
  })

  it('takes the note as optional', async () => {
    const ctx = setup()
    const res = await upload(ctx, {})
    expect(res.status).toBe(201)
    expect(ctx.store.insertArt.mock.calls[0][0].note).toBe('')
  })

  it('names the uploader by their username when the directory does not know them', async () => {
    const ctx = setup()
    ctx.displayNames.resolver.mockResolvedValueOnce(() => COMMUNITY_MEMBER)
    const { item } = await (await upload(ctx, {})).json()
    expect(item.author).toEqual({ id: MEMBER.id, name: MEMBER.username })
  })

  it('removes the item and answers 502 when R2 refuses the file, logging nothing when the cleanup works', async () => {
    const ctx = setup()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      ctx.r2.put.mockRejectedValueOnce(new Error('R2 refused the upload (500).'))
      const res = await upload(ctx, {})
      expect(res.status).toBe(502)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(await res.json()).toEqual({ error: 'The file could not be stored. Try again.' })
      const id = [...ctx.store.items.keys()][0]
      expect(ctx.store.transition).toHaveBeenCalledWith(id, { from: ['pending', 'approved'], to: 'removed', action: 'removed', actor: MEMBER, note: 'upload failed' })
      expect(ctx.store.items.get(id).status).toBe('removed')
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('removes the item even if an approver approved it while the file was uploading', async () => {
    const ctx = setup()
    ctx.r2.put.mockImplementationOnce(async (key) => {
      ctx.store.items.get(key.split('/')[1].split('.')[0]).status = 'approved'
      throw new Error('R2 is unreachable.')
    })
    const res = await upload(ctx, {})
    expect(res.status).toBe(502)
    const id = [...ctx.store.items.keys()][0]
    expect(ctx.store.items.get(id).status).toBe('removed')
  })

  it('still answers 502, and logs the item id alone, when the cleanup cannot remove the item', async () => {
    const ctx = setup()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      ctx.r2.put.mockRejectedValueOnce(new Error('R2 is unreachable.'))
      ctx.store.transition.mockResolvedValueOnce('conflict')
      const res = await upload(ctx, {})
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'The file could not be stored. Try again.' })
      const id = [...ctx.store.items.keys()][0]
      expect(log).toHaveBeenCalledTimes(1)
      expect(log.mock.calls[0].join(' ')).toContain(id)
      expect(log.mock.calls[0].join(' ')).not.toContain('Salamander')
    } finally {
      log.mockRestore()
    }
  })

  it.each([
    [{}, 'no Content-Type'],
    [{ 'Content-Type': 'application/json' }, 'JSON'],
    [{ 'Content-Type': 'text/plain; boundary=x' }, 'text'],
    [{ 'Content-Type': 'application/x-multipart/form-data; boundary=x' }, 'a type that only ends like a form'],
  ])('is 415 for %o (%s), without reading the body', async (headers) => {
    const ctx = setup()
    const request = fakeUpload({ headers })
    if (!headers['Content-Type']) request.headers.delete('Content-Type')
    const res = await call(ctx, request)
    expect(res.status).toBe(415)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Send the form as multipart/form-data.' })
    expect(request.formData).not.toHaveBeenCalled()
  })

  it('is 413 by Content-Length before reading the body', async () => {
    const ctx = setup()
    const request = fakeUpload({ headers: { 'Content-Length': String(MAX_ART_BYTES + 65_537) } })
    const res = await call(ctx, request)
    expect(res.status).toBe(413)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'The file is too large (10 MB at most).' })
    expect(request.formData).not.toHaveBeenCalled()
    expect(ctx.store.insertArt).not.toHaveBeenCalled()
  })

  it('reads a body whose Content-Length is exactly at the limit', async () => {
    const ctx = setup()
    const request = fakeUpload({ headers: { 'Content-Length': String(MAX_ART_BYTES + 65_536) }, formData: async () => form({}) })
    expect((await call(ctx, request)).status).toBe(201)
  })

  it('is 413 for a file over the limit, and the bytes never reach R2', async () => {
    const ctx = setup()
    const big = new Uint8Array(MAX_ART_BYTES + 1)
    big.set(PNG)
    const request = fakeUpload({ formData: async () => form({ file: new File([big], 'big.png') }) })
    const res = await call(ctx, request)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'The file is too large (10 MB at most).' })
    expect(ctx.store.insertArt).not.toHaveBeenCalled()
    expect(ctx.r2.put).not.toHaveBeenCalled()
  })

  it('takes a file of exactly the limit', async () => {
    const ctx = setup()
    const max = new Uint8Array(MAX_ART_BYTES)
    max.set(PNG)
    const request = fakeUpload({ formData: async () => form({ file: new File([max], 'max.png') }) })
    expect((await call(ctx, request)).status).toBe(201)
    expect(ctx.r2.put.mock.calls[0][2].contentLength).toBe(MAX_ART_BYTES)
  })

  it('is 400 when the form cannot be read', async () => {
    const ctx = setup()
    const request = req('POST', '/gallery/art', { who: 'member', body: 'not a form', headers: { 'Content-Type': 'multipart/form-data; boundary=zzz' } })
    const res = await call(ctx, request)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'That form could not be read.' })
  })

  const REFUSED = [
    ['no file', { file: undefined }, 'Choose an image to upload.'],
    ['a text field for the file', { file: 'not a file' }, 'Choose an image to upload.'],
    ['an empty file', { file: new File([], 'x.png') }, 'That file is empty.'],
    ['a renamed text file', { file: new File(['hello, not an image'], 'x.png', { type: 'image/png' }) }, 'That file is not a JPEG, PNG, WebP or GIF.'],
    ['no title', { title: undefined }, 'Give the piece a title (1 to 120 characters).'],
    ['a blank title', { title: '   ' }, 'Give the piece a title (1 to 120 characters).'],
    ['a long title', { title: 'x'.repeat(121) }, 'Give the piece a title (1 to 120 characters).'],
    ['a long note', { note: 'x'.repeat(501) }, 'The note is 500 characters at most.'],
  ]
  it.each(REFUSED)('is 400 for %s, and nothing is stored', async (_, fields, error) => {
    const ctx = setup()
    const res = await upload(ctx, fields)
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error })
    expect(ctx.store.insertArt).not.toHaveBeenCalled()
    expect(ctx.r2.put).not.toHaveBeenCalled()
  })

  it('never echoes what was sent in an error', async () => {
    const ctx = setup()
    const res = await upload(ctx, { title: '<script>x</script>'.repeat(10) })
    expect(JSON.stringify(await res.json())).not.toContain('script')
  })
})

describe('DELETE /gallery/items/:id', () => {
  it('removes the caller\'s own item with 204 and no body', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'approved' })
    const res = await call(ctx, req('DELETE', `/gallery/items/${id}`, { who: 'member' }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.has('Content-Type')).toBe(false)
    expect(await res.text()).toBe('')
    expect(ctx.store.removeByOwner).toHaveBeenCalledWith(id, MEMBER)
    expect(ctx.store.items.get(id).status).toBe('removed')
  })

  it.each([
    ['someone else\'s', () => ({ author_discord_id: APPROVER.id })],
    ['an unknown', null],
  ])('is 404 for %s item', async (_, over) => {
    const ctx = setup()
    const id = over ? ctx.store.add(over()) : '999'
    const res = await call(ctx, req('DELETE', `/gallery/items/${id}`, { who: 'member' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such item.' })
  })

  it.each(['abc', '1234567890123456', '1.5'])('is 404 for the id %s, without asking the store', async (id) => {
    const ctx = setup()
    const res = await call(ctx, req('DELETE', `/gallery/items/${id}`, { who: 'member' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such item.' })
    expect(ctx.store.removeByOwner).not.toHaveBeenCalled()
  })

  it('is 409 for an item already hidden', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'hidden' })
    const res = await call(ctx, req('DELETE', `/gallery/items/${id}`, { who: 'member' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'That item has already moved on.' })
  })
})

describe('GET /gallery/review', () => {
  it('answers the pending queue and the poll status', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending', r2_key: 'art/5.png' })
    ctx.store.add({ status: 'approved' })
    const res = await call(ctx, req('GET', '/gallery/review', { who: 'approver' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    expect(body.sync).toEqual(SYNC)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ id, status: 'pending', url: 'signed:art/5.png' })
  })
})

describe('approve, reject, hide', () => {
  it('approves a pending item', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/approve`, { who: 'approver' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(ctx.store.transition).toHaveBeenCalledWith(id, { from: ['pending', 'rejected'], to: 'approved', action: 'approved', actor: APPROVER, note: null })
    expect((await res.json()).item).toMatchObject({ id, status: 'approved', author: { id: MEMBER.id, name: 'Brother Tuoni' } })
  })

  it('approves a rejected item (a mistaken rejection)', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'rejected' })
    expect((await call(ctx, req('POST', `/gallery/items/${id}/approve`, { who: 'approver' }))).status).toBe(200)
  })

  it('rejects with a trimmed reason', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', json: { reason: '  Off-topic  ' } }))
    expect(res.status).toBe(200)
    expect(ctx.store.transition).toHaveBeenCalledWith(id, { from: ['pending'], to: 'rejected', action: 'rejected', actor: APPROVER, note: 'Off-topic' })
    expect((await res.json()).item).toMatchObject({ id, status: 'rejected', reviewNote: 'Off-topic' })
  })

  it.each([
    ['an empty reason', { json: { reason: '   ' } }, 'Say why (1 to 500 characters).'],
    ['no reason', { json: {} }, 'Say why (1 to 500 characters).'],
    ['a JSON body that is not JSON', { body: 'nope', headers: { 'Content-Type': 'application/json' } }, 'Say why (1 to 500 characters).'],
    ['an empty JSON body', { body: '', headers: { 'Content-Type': 'application/json' } }, 'Say why (1 to 500 characters).'],
    ['a JSON array', { json: ['why'] }, 'Malformed request.'],
  ])('refuses a rejection with %s (400)', async (_, opts, error) => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', ...opts }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error })
    expect(ctx.store.transition).not.toHaveBeenCalled()
  })

  it.each([
    ['no Content-Type', {}],
    ['a form', { body: 'reason=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }],
  ])('refuses a rejection sent with %s (415)', async (_, opts) => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', ...opts }))
    expect(res.status).toBe(415)
    expect(await res.json()).toEqual({ error: 'Send JSON (Content-Type: application/json).' })
  })

  it('reads a JSON media type with spaces before its parameters', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const opts = { body: JSON.stringify({ reason: 'why' }), headers: { 'Content-Type': 'Application/JSON ; charset=utf-8' } }
    const res = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', ...opts }))
    expect(res.status).toBe(200)
    expect(ctx.store.transition.mock.calls[0][1].note).toBe('why')
  })

  it('reads a JSON body of exactly 16 KB, counted in bytes', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const head = JSON.stringify({ reason: 'why', pad: '' })
    // Each é is two bytes in UTF-8, so a count in characters would come out under the limit.
    const room = 16_384 - new TextEncoder().encode(head).length
    const pad = 'é'.repeat(Math.floor(room / 2)) + 'x'.repeat(room % 2)
    const body = JSON.stringify({ reason: 'why', pad })
    expect(new TextEncoder().encode(body).length).toBe(16_384)
    const res = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', body, headers: { 'Content-Type': 'application/json' } }))
    expect(res.status).toBe(200)
    const over = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', body: `${body} `, headers: { 'Content-Type': 'application/json' } }))
    expect(over.status).toBe(413)
  })

  it('refuses a JSON body over the size limit (413)', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/reject`, { who: 'approver', json: { reason: 'x', pad: 'y'.repeat(20_000) } }))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'The request is too large (16 KB at most).' })
  })

  it('hides with no body at all', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'approved' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/hide`, { who: 'approver' }))
    expect(res.status).toBe(200)
    expect(ctx.store.transition).toHaveBeenCalledWith(id, { from: ['pending', 'approved', 'rejected'], to: 'hidden', action: 'hidden', actor: APPROVER, note: '' })
    expect((await res.json()).item).toMatchObject({ id, status: 'hidden' })
  })

  it('hides with an empty JSON body', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/hide`, { who: 'approver', body: '', headers: { 'Content-Type': 'application/json' } }))
    expect(res.status).toBe(200)
    expect(ctx.store.transition.mock.calls[0][1].note).toBe('')
  })

  it('hides with a JSON body that is only whitespace, as no note', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/hide`, { who: 'approver', body: ' \n\t ', headers: { 'Content-Type': 'application/json' } }))
    expect(res.status).toBe(200)
    expect(ctx.store.transition.mock.calls[0][1].note).toBe('')
  })

  it('hides with a trimmed note', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'rejected' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/hide`, { who: 'approver', json: { note: ' spoilers ' } }))
    expect(res.status).toBe(200)
    expect(ctx.store.transition.mock.calls[0][1].note).toBe('spoilers')
  })

  it.each([
    ['text that is not JSON', { body: 'nope', headers: { 'Content-Type': 'application/json' } }, 400, 'Malformed request.'],
    ['a note that is not text', { json: { note: 5 } }, 400, 'Malformed request.'],
    ['a long note', { json: { note: 'x'.repeat(501) } }, 400, 'The note is 500 characters at most.'],
    ['a form', { body: 'note=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 415, 'Send JSON (Content-Type: application/json).'],
  ])('refuses a hide with %s', async (_, opts, status, error) => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'approved' })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/hide`, { who: 'approver', ...opts }))
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error })
    expect(ctx.store.transition).not.toHaveBeenCalled()
  })

  it.each(['approve', 'reject', 'hide'])('%s: 404 for an unknown item', async (action) => {
    const ctx = setup()
    const res = await call(ctx, req('POST', `/gallery/items/999/${action}`, { who: 'approver', json: { reason: 'why' } }))
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'No such item.' })
  })

  it.each(['approve', 'reject', 'hide'])('%s: 404 for a malformed id, without asking the store', async (action) => {
    const ctx = setup()
    const res = await call(ctx, req('POST', `/gallery/items/x1/${action}`, { who: 'approver', json: { reason: 'why' } }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such item.' })
    expect(ctx.store.transition).not.toHaveBeenCalled()
  })

  it.each([
    ['approve', 'approved'],
    ['approve', 'hidden'],
    ['reject', 'rejected'],
    ['reject', 'approved'],
    ['hide', 'hidden'],
    ['hide', 'removed'],
  ])('%s: 409 for an item that is %s', async (action, status) => {
    const ctx = setup()
    const id = ctx.store.add({ status })
    const res = await call(ctx, req('POST', `/gallery/items/${id}/${action}`, { who: 'approver', json: { reason: 'why' } }))
    expect(res.status).toBe(409)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'That item has already moved on.' })
  })
})

describe('GET /gallery/events', () => {
  it('answers audit rows newest first with the next cursor', async () => {
    const ctx = setup()
    const id = ctx.store.add({ status: 'pending' })
    await call(ctx, req('POST', `/gallery/items/${id}/approve`, { who: 'approver' }))
    const res = await call(ctx, req('GET', '/gallery/events?before=50', { who: 'approver' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(ctx.store.events).toHaveBeenCalledWith({ before: '50' })
    expect(await res.json()).toEqual({
      events: [
        { id: '1', itemId: id, action: 'approved', actor: { id: APPROVER.id, username: APPROVER.username }, note: '', createdAt: '2026-11-02T10:00:00.000Z' },
      ],
      next: '3',
    })
  })

  it('pages from the top without a cursor, and refuses a bad one', async () => {
    const ctx = setup()
    await call(ctx, req('GET', '/gallery/events', { who: 'approver' }))
    expect(ctx.store.events).toHaveBeenCalledWith({ before: null })
    const res = await call(ctx, req('GET', '/gallery/events?before=x', { who: 'approver' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'That page cursor is not valid.' })
  })
})
