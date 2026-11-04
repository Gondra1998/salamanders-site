import { describe, it, expect, vi } from 'vitest'
import { createDeathwatchHandler } from './deathwatchHandler'
import { createDeathwatchAccess } from './deathwatchAccess'
import { Upstream } from './discordRoles'
import { MAX_ACTIVE_GRANTS, MAX_BODY_BYTES } from './deathwatchValidate'
import { etagOf } from './deathwatchEtag'

// Invented ids only: the real role and user ids never enter the repo.
const DW = '200000000000000101'
const WC = '200000000000000102'
const LEGION = '200000000000000199'
const CMD = '200000000000000110' // the Deathwatch Command role
const USERS = {
  commander: { id: '300000000000000001', roles: [WC] },
  watcher: { id: '300000000000000002', roles: [DW] },
  command: { id: '300000000000000007', roles: [DW, CMD] }, // Deathwatch Command, never the Watch Commander
  commandOnly: { id: '300000000000000008', roles: [CMD] }, // the role without the Deathwatch one: no way in
  granted: { id: '300000000000000003', roles: null }, // not in the guild; gets a grant in some tests
  plain: { id: '300000000000000004', roles: [] },
  legion: { id: '300000000000000005', roles: [LEGION] },
  stranger: { id: '300000000000000006', roles: null }, // not in the guild, never granted
}
const OTHER = '300000000000000099'
const DOC = { col: 'teams', id: 'alpha', op: 'set', doc: { n: 1 } }

// In-memory store with the same contract as deathwatchStore.js.
function memStore() {
  const docs = { teams: new Map(), cfg: new Map(), archive: new Map() }
  const history = []
  const events = []
  const grants = new Map() // discordId -> { active, by }
  const activeCount = () => [...grants.values()].filter((g) => g.active).length
  return {
    docs, history, events, grants,
    readAll: vi.fn(async () => Object.fromEntries(Object.entries(docs).map(([c, m]) => [c, Object.fromEntries(m)]))),
    writeDoc: vi.fn(async ({ col, id, op, doc }, actor) => {
      const old = docs[col].get(id)
      if (op === 'delete') {
        if (!old) return { changed: false }
        docs[col].delete(id)
        history.push({ col, id, op, doc: old, actor: actor.id })
        return { changed: true }
      }
      if (old && JSON.stringify(old) === JSON.stringify(doc)) return { changed: false }
      docs[col].set(id, doc)
      history.push({ col, id, op, doc, actor: actor.id })
      return { changed: true }
    }),
    isGranted: vi.fn(async (id) => grants.get(id)?.active === true),
    listGrants: vi.fn(async () =>
      [...grants].filter(([, g]) => g.active).map(([discordId, g]) => ({ discordId, grantedBy: g.by, grantedAt: 't0' })),
    ),
    grant: vi.fn(async (id, actor) => {
      if (grants.get(id)?.active) return 'exists'
      if (activeCount() >= MAX_ACTIVE_GRANTS) return 'limit'
      grants.set(id, { active: true, by: actor.id })
      events.push({ id, actor: actor.id, action: 'granted' })
      return 'granted'
    }),
    revoke: vi.fn(async (id, actor) => {
      const g = grants.get(id)
      if (!g?.active) return 'none'
      g.active = false
      events.push({ id, actor: actor.id, action: 'revoked' })
      return 'revoked'
    }),
  }
}

function setup({ configured = true } = {}) {
  const users = structuredClone(USERS)
  const fail = { discord: false }
  const byToken = (request) => users[(request.headers.get('Authorization') || '').slice(7)]
  const roles = {
    identify: vi.fn(async (request) => {
      if (fail.discord) throw new Upstream()
      const u = byToken(request)
      return u ? { id: u.id, username: 'u' + u.id } : null
    }),
    rolesOf: vi.fn(async (id) => Object.values(users).find((u) => u.id === id).roles),
    isAdmin: async () => false, // nobody here is an administrator
  }
  const store = memStore()
  const access = createDeathwatchAccess({
    roles,
    store,
    deathwatchRoleId: configured ? DW : undefined,
    commanderRoleId: configured ? WC : undefined,
    deathwatchCommandRoleId: CMD, // set even when the area is not: it must not configure anything
  })
  const handle = createDeathwatchHandler({ access, store })

  // body: an object (sent as JSON), or `raw` for a literal body; `headers` override the defaults.
  async function call(who, method, path, body, { raw, headers = {} } = {}) {
    const h = new Headers(headers)
    if (who && !h.has('Authorization')) h.set('Authorization', `Bearer ${who}`)
    const sends = body !== undefined || raw !== undefined
    if (sends && !h.has('Content-Type')) h.set('Content-Type', 'application/json')
    const req = new Request(`https://api.test${path}`, { method, headers: h, body: sends ? (raw ?? JSON.stringify(body)) : undefined })
    const res = await handle(req, new URL(req.url))
    if (!res) return null
    const text = await res.text()
    return { status: res.status, headers: res.headers, text, body: text ? JSON.parse(text) : null }
  }
  return { call, users, roles, store, fail, access }
}

const ROUTES = [
  ['GET', '/deathwatch/me'],
  ['GET', '/deathwatch/data'],
  ['POST', '/deathwatch/doc', DOC],
  ['GET', '/deathwatch/grants'],
  ['POST', '/deathwatch/grants', { discordId: OTHER }],
  ['DELETE', `/deathwatch/grants/${OTHER}`],
]

describe('routing and the common failures', () => {
  it('ignores paths outside /deathwatch', async () => {
    const { call } = setup()
    expect(await call('commander', 'GET', '/builds')).toBeNull()
    expect(await call('commander', 'GET', '/deathwatchx/me')).toBeNull()
  })

  it('answers 404 for unknown paths and methods under /deathwatch', async () => {
    const { call } = setup()
    for (const [m, p] of [
      ['GET', '/deathwatch'],
      ['GET', '/deathwatch/nope'],
      ['POST', '/deathwatch/me'],
      ['GET', '/deathwatch/doc'],
      ['POST', '/deathwatch/data'],
      ['GET', `/deathwatch/grants/${OTHER}`],
      ['POST', `/deathwatch/grants/${OTHER}`],
      ['PUT', '/deathwatch/grants'],
      ['DELETE', '/deathwatch/grants'],
      ['DELETE', '/deathwatch/grants/'],
      ['DELETE', `/deathwatch/grants/${OTHER}/x`],
    ]) {
      const res = await call('commander', m, p)
      expect([m, p, res.status]).toEqual([m, p, 404])
      expect(res.body).toEqual({ error: 'Not found.' })
    }
  })

  it('answers 503 on every route when the role ids are not configured, without asking Discord', async () => {
    const { call, roles } = setup({ configured: false })
    for (const [m, p, b] of ROUTES) {
      const res = await call('commander', m, p, b)
      expect([m, p, res.status]).toEqual([m, p, 503])
      expect(res.body).toEqual({ error: 'The Deathwatch area is not configured.' })
    }
    expect(roles.identify).not.toHaveBeenCalled()
  })

  it('answers 401 with no token or an unknown one, on every route', async () => {
    const { call } = setup()
    for (const [m, p, b] of ROUTES) {
      for (const who of [null, 'nobody']) {
        const res = await call(who, m, p, b)
        expect([m, p, res.status]).toEqual([m, p, 401])
        expect(res.body).toEqual({ error: 'Sign in with Discord.' })
      }
    }
  })

  it('answers 503 when Discord cannot be reached, on every route', async () => {
    const { call, fail } = setup()
    fail.discord = true
    for (const [m, p, b] of ROUTES) {
      const res = await call('commander', m, p, b)
      expect([m, p, res.status]).toEqual([m, p, 503])
      expect(res.body).toEqual({ error: 'Discord could not be reached. Try again.' })
    }
  })

  it('lets an unexpected error propagate', async () => {
    const { call, roles } = setup()
    roles.rolesOf.mockRejectedValueOnce(new Error('db down'))
    await expect(call('commander', 'GET', '/deathwatch/me')).rejects.toThrow('db down')
  })

  it('never lets a response be cached', async () => {
    const { call } = setup()
    for (const [who, m, p] of [['commander', 'GET', '/deathwatch/me'], ['legion', 'GET', '/deathwatch/data'], [null, 'GET', '/deathwatch/me'], ['commander', 'GET', '/deathwatch/nope']]) {
      const res = await call(who, m, p)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(res.headers.get('Content-Type')).toBe('application/json')
    }
  })
})

describe('GET /deathwatch/me', () => {
  it('tells each kind of user where they stand', async () => {
    const { call, store } = setup()
    store.grants.set(USERS.granted.id, { active: true, by: 'x' })
    const me = async (who) => (await call(who, 'GET', '/deathwatch/me')).body
    expect(await me('commander')).toEqual({ access: true, watchCommander: true, deathwatchCommand: false })
    expect(await me('watcher')).toEqual({ access: true, watchCommander: false, deathwatchCommand: false })
    expect(await me('command')).toEqual({ access: true, watchCommander: false, deathwatchCommand: true })
    expect(await me('commandOnly')).toEqual({ access: false, watchCommander: false, deathwatchCommand: false })
    expect(await me('granted')).toEqual({ access: true, watchCommander: false, deathwatchCommand: false }) // not in the guild
    expect(await me('plain')).toEqual({ access: false, watchCommander: false, deathwatchCommand: false })
    expect(await me('legion')).toEqual({ access: false, watchCommander: false, deathwatchCommand: false })
    expect(await me('stranger')).toEqual({ access: false, watchCommander: false, deathwatchCommand: false })
  })

  it('sends nothing but the three flags', async () => {
    const { call } = setup()
    expect(Object.keys((await call('command', 'GET', '/deathwatch/me')).body).sort()).toEqual(['access', 'deathwatchCommand', 'watchCommander'])
  })

  it('tells a Deathwatch Command member who is only granted access in, and not before', async () => {
    const { call, store, access } = setup()
    expect((await call('commandOnly', 'GET', '/deathwatch/me')).body).toEqual({ access: false, watchCommander: false, deathwatchCommand: false })
    store.grants.set(USERS.commandOnly.id, { active: true, by: 'x' })
    access.forget() // as the grant route does, so the earlier refusal is not served from the cache
    expect((await call('commandOnly', 'GET', '/deathwatch/me')).body).toEqual({ access: true, watchCommander: false, deathwatchCommand: true })
  })

  it('is never a 403', async () => {
    const { call } = setup()
    for (const who of ['plain', 'legion', 'stranger', 'commandOnly']) expect((await call(who, 'GET', '/deathwatch/me')).status).toBe(200)
  })
})

describe('the Deathwatch Command role and the Watch Commander routes', () => {
  const COMMANDER_ONLY = [
    ['POST', '/deathwatch/doc', DOC],
    ['GET', '/deathwatch/grants'],
    ['POST', '/deathwatch/grants', { discordId: OTHER }],
    ['DELETE', `/deathwatch/grants/${OTHER}`],
  ]

  it('opens none of them: only the Watch Commander role does', async () => {
    const { call, store } = setup()
    for (const who of ['command', 'commandOnly']) {
      for (const [m, p, b] of COMMANDER_ONLY) {
        const res = await call(who, m, p, b)
        expect([who, m, p, res.status, res.body]).toEqual([who, m, p, 403, { error: 'Only the Watch Commander can do that.' }])
      }
    }
    expect(store.writeDoc).not.toHaveBeenCalled()
    expect(store.listGrants).not.toHaveBeenCalled()
    expect(store.grant).not.toHaveBeenCalled()
    expect(store.revoke).not.toHaveBeenCalled()
  })

  it('reads the area like any other member, and only with access', async () => {
    const { call } = setup()
    expect((await call('command', 'GET', '/deathwatch/data')).status).toBe(200)
    expect((await call('commandOnly', 'GET', '/deathwatch/data')).status).toBe(403)
  })
})

describe('GET /deathwatch/data', () => {
  it('refuses a user without access and never reads the store', async () => {
    const { call, store } = setup()
    for (const who of ['plain', 'legion', 'stranger']) {
      const res = await call(who, 'GET', '/deathwatch/data')
      expect(res.status).toBe(403)
      expect(res.body.error).toBeTruthy()
    }
    expect(store.readAll).not.toHaveBeenCalled()
  })

  it('serves the three collections with an ETag of the exact body', async () => {
    const { call } = setup()
    const res = await call('watcher', 'GET', '/deathwatch/data')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ teams: {}, cfg: {}, archive: {} })
    expect(res.headers.get('ETag')).toBe(etagOf(res.text))
  })

  it('serves the same tag for the same data', async () => {
    const { call } = setup()
    const a = await call('watcher', 'GET', '/deathwatch/data')
    const b = await call('commander', 'GET', '/deathwatch/data')
    expect(a.headers.get('ETag')).toBe(b.headers.get('ETag'))
  })

  it('answers 304 with the tag and no body when If-None-Match matches, in either form', async () => {
    const { call } = setup()
    const tag = (await call('watcher', 'GET', '/deathwatch/data')).headers.get('ETag')
    for (const sent of [tag, `W/${tag}`, `"stale", ${tag}`, '*']) {
      const res = await call('watcher', 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': sent } })
      expect([sent, res.status, res.text]).toEqual([sent, 304, ''])
      expect(res.headers.get('ETag')).toBe(tag)
    }
  })

  it('gives the 304 the content type and cache rule of the 200', async () => {
    const { call } = setup()
    const tag = (await call('watcher', 'GET', '/deathwatch/data')).headers.get('ETag')
    const res = await call('watcher', 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': tag } })
    expect(res.status).toBe(304)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 200 with the data when the tag does not match', async () => {
    const { call } = setup()
    const res = await call('watcher', 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': '"stale"' } })
    expect(res.status).toBe(200)
  })

  it('never answers 304 to a user without access, even with a valid tag', async () => {
    const { call } = setup()
    const tag = (await call('watcher', 'GET', '/deathwatch/data')).headers.get('ETag')
    const res = await call('legion', 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': tag } })
    expect(res.status).toBe(403)
    expect(res.text).not.toBe('')
  })

  it('gives a stale tag a 200 and a new tag after a write', async () => {
    const { call } = setup()
    const old = (await call('watcher', 'GET', '/deathwatch/data')).headers.get('ETag')
    await call('commander', 'POST', '/deathwatch/doc', DOC)
    const res = await call('watcher', 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': old } })
    expect(res.status).toBe(200)
    expect(res.body.teams).toEqual({ alpha: { n: 1 } })
    expect(res.headers.get('ETag')).not.toBe(old)
  })

  it('uses the cached verdict for repeated reads', async () => {
    const { call, roles } = setup()
    await call('watcher', 'GET', '/deathwatch/data')
    await call('watcher', 'GET', '/deathwatch/data')
    expect(roles.rolesOf).toHaveBeenCalledTimes(1)
  })
})

describe('POST /deathwatch/doc', () => {
  it('is for the Commander only', async () => {
    const { call, store } = setup()
    for (const who of ['watcher', 'plain', 'legion']) {
      const res = await call(who, 'POST', '/deathwatch/doc', DOC)
      expect([res.status, res.body]).toEqual([403, { error: 'Only the Watch Commander can do that.' }])
    }
    expect(store.writeDoc).not.toHaveBeenCalled()
  })

  it('requires a JSON content type', async () => {
    const { call, store } = setup()
    const post = (headers, extra) => call('commander', 'POST', '/deathwatch/doc', undefined, { raw: JSON.stringify(DOC), headers, ...extra })
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', 'application/vnd.api+json']) {
      expect([type, (await post({ 'Content-Type': type })).status]).toEqual([type, 415])
    }
    const none = await call('commander', 'POST', '/deathwatch/doc') // no body, no content type
    expect([none.status, none.body]).toEqual([415, { error: 'Send JSON (Content-Type: application/json).' }])
    for (const type of ['application/json', 'Application/JSON', 'application/json; charset=utf-8', 'application/json ; charset=utf-8']) {
      expect([type, (await post({ 'Content-Type': type })).status]).toEqual([type, 200])
    }
    expect(store.writeDoc).toHaveBeenCalledTimes(4)
  })

  it('refuses a body over the limit, counted in bytes, and accepts one exactly at it', async () => {
    const { call, store } = setup()
    const big = await call('commander', 'POST', '/deathwatch/doc', undefined, { raw: 'x'.repeat(MAX_BODY_BYTES + 1) })
    expect([big.status, big.body]).toEqual([413, { error: 'The request is too large (2 MB at most).' }])
    const euros = '€'.repeat(Math.floor(MAX_BODY_BYTES / 3) + 1)
    expect(euros.length).toBeLessThan(MAX_BODY_BYTES)
    expect((await call('commander', 'POST', '/deathwatch/doc', undefined, { raw: euros })).status).toBe(413)
    // Exactly at the limit it is read, found not to be JSON, and refused as malformed instead.
    expect((await call('commander', 'POST', '/deathwatch/doc', undefined, { raw: ' '.repeat(MAX_BODY_BYTES) })).status).toBe(400)
    expect(store.writeDoc).not.toHaveBeenCalled()
  })

  it('refuses malformed JSON and invalid fields with a message', async () => {
    const { call, store } = setup()
    for (const raw of ['{nope', 'null']) {
      const res = await call('commander', 'POST', '/deathwatch/doc', undefined, { raw })
      expect([raw, res.status, res.body]).toEqual([raw, 400, { error: 'Malformed request.' }])
    }
    const bad = [
      { col: 'users' },
      { id: 'a b' },
      { op: 'update' },
      { doc: undefined },
      { doc: [] },
      { doc: { v: 'a\u0000b' } }, // Postgres jsonb cannot hold U+0000
      { doc: { [`k\ud800`]: 1 } }, // or a lone surrogate
    ]
    for (const over of bad) {
      const res = await call('commander', 'POST', '/deathwatch/doc', { ...DOC, ...over })
      expect([JSON.stringify(over), res.status]).toEqual([JSON.stringify(over), 400])
      expect(res.body.error).toBeTruthy()
    }
    expect(store.writeDoc).not.toHaveBeenCalled()
  })

  it('sets and deletes a document, and reports whether anything changed', async () => {
    const { call } = setup()
    const set = await call('commander', 'POST', '/deathwatch/doc', DOC)
    expect([set.status, set.body]).toEqual([200, { ok: true, changed: true }])
    expect((await call('watcher', 'GET', '/deathwatch/data')).body.teams).toEqual({ alpha: { n: 1 } })
    expect((await call('commander', 'POST', '/deathwatch/doc', DOC)).body).toEqual({ ok: true, changed: false })
    const del = await call('commander', 'POST', '/deathwatch/doc', { col: 'teams', id: 'alpha', op: 'delete' })
    expect([del.status, del.body]).toEqual([200, { ok: true, changed: true }])
    expect((await call('watcher', 'GET', '/deathwatch/data')).body.teams).toEqual({})
    expect((await call('commander', 'POST', '/deathwatch/doc', { col: 'teams', id: 'alpha', op: 'delete' })).body).toEqual({ ok: true, changed: false })
  })

  it('records the caller as the actor and ignores one named in the body', async () => {
    const { call, store } = setup()
    await call('commander', 'POST', '/deathwatch/doc', { ...DOC, actor: { id: 'forged' }, actorId: 'forged' })
    expect(store.history).toEqual([{ col: 'teams', id: 'alpha', op: 'set', doc: { n: 1 }, actor: USERS.commander.id }])
  })

  it('stores and serves a document whose id is __proto__ as an ordinary key', async () => {
    const { call } = setup()
    expect((await call('commander', 'POST', '/deathwatch/doc', { col: 'teams', id: '__proto__', op: 'set', doc: { p: 1 } })).status).toBe(200)
    expect((await call('commander', 'POST', '/deathwatch/doc', { col: 'teams', id: 'constructor', op: 'set', doc: { c: 1 } })).status).toBe(200)
    const { teams } = JSON.parse((await call('watcher', 'GET', '/deathwatch/data')).text)
    expect(Object.hasOwn(teams, '__proto__')).toBe(true)
    expect(Object.keys(teams).sort()).toEqual(['__proto__', 'constructor'])
  })

  it('checks the role live: a cached Commander who lost the role is refused', async () => {
    const { call, users } = setup()
    expect((await call('commander', 'GET', '/deathwatch/me')).body.watchCommander).toBe(true)
    users.commander.roles = [DW] // demoted in Discord
    expect((await call('commander', 'GET', '/deathwatch/me')).body.watchCommander).toBe(true) // reads may still use the cache
    expect((await call('commander', 'POST', '/deathwatch/doc', DOC)).status).toBe(403)
  })
})

describe('grants', () => {
  it('lists active grants for the Commander only', async () => {
    const { call, store } = setup()
    expect((await call('commander', 'GET', '/deathwatch/grants')).body).toEqual({ grants: [] })
    store.grants.set(OTHER, { active: true, by: USERS.commander.id })
    expect((await call('commander', 'GET', '/deathwatch/grants')).body).toEqual({
      grants: [{ discordId: OTHER, grantedBy: USERS.commander.id, grantedAt: 't0' }],
    })
    for (const who of ['watcher', 'plain', 'granted']) expect((await call(who, 'GET', '/deathwatch/grants')).status).toBe(403)
  })

  it('creates a grant with 201, answers 200 on a repeat, and records the caller', async () => {
    const { call, store } = setup()
    const first = await call('commander', 'POST', '/deathwatch/grants', { discordId: OTHER, grantedBy: 'forged' })
    expect([first.status, first.body]).toEqual([201, { discordId: OTHER }])
    const again = await call('commander', 'POST', '/deathwatch/grants', { discordId: OTHER })
    expect([again.status, again.body]).toEqual([200, { discordId: OTHER }])
    expect(store.events).toEqual([{ id: OTHER, actor: USERS.commander.id, action: 'granted' }])
  })

  it('refuses a grant that is malformed, mistyped or not from the Commander', async () => {
    const { call, store } = setup()
    for (const discordId of ['12', 'abc', undefined]) {
      const res = await call('commander', 'POST', '/deathwatch/grants', { discordId })
      expect([res.status, res.body]).toEqual([400, { error: 'Enter a Discord user id (17 to 20 digits).' }])
    }
    const bad = await call('commander', 'POST', '/deathwatch/grants', undefined, { raw: '{nope' })
    expect([bad.status, bad.body]).toEqual([400, { error: 'Malformed request.' }])
    const text = await call('commander', 'POST', '/deathwatch/grants', undefined, { raw: JSON.stringify({ discordId: OTHER }), headers: { 'Content-Type': 'text/plain' } })
    expect(text.status).toBe(415)
    expect(text.body.error).toBe('Send JSON (Content-Type: application/json).')
    expect((await call('watcher', 'POST', '/deathwatch/grants', { discordId: OTHER })).status).toBe(403)
    expect(store.grant).not.toHaveBeenCalled()
  })

  it('answers 409 when the active-grant limit is reached', async () => {
    const { call, store } = setup()
    for (let i = 0; i < MAX_ACTIVE_GRANTS; i++) store.grants.set(String(400000000000000000n + BigInt(i)), { active: true, by: 'x' })
    const res = await call('commander', 'POST', '/deathwatch/grants', { discordId: OTHER })
    expect(res.status).toBe(409)
    expect(res.body.error).toBeTruthy()
  })

  it('revokes a grant, then answers 404 for it', async () => {
    const { call, store } = setup()
    await call('commander', 'POST', '/deathwatch/grants', { discordId: OTHER })
    const res = await call('commander', 'DELETE', `/deathwatch/grants/${OTHER}`)
    expect([res.status, res.body]).toEqual([200, { discordId: OTHER }])
    const gone = await call('commander', 'DELETE', `/deathwatch/grants/${OTHER}`)
    expect([gone.status, gone.body]).toEqual([404, { error: 'No active grant for that user.' }])
    expect(store.events.at(-1)).toEqual({ id: OTHER, actor: USERS.commander.id, action: 'revoked' })
  })

  it('refuses to revoke with a bad id or without being the Commander', async () => {
    const { call, store } = setup()
    const bad = await call('commander', 'DELETE', '/deathwatch/grants/abc')
    expect([bad.status, bad.body]).toEqual([400, { error: 'That is not a Discord user id.' }])
    expect((await call('watcher', 'DELETE', `/deathwatch/grants/${OTHER}`)).status).toBe(403)
    expect(store.revoke).not.toHaveBeenCalled()
  })

  it('makes a revoked grant stop working at once, despite a cached verdict', async () => {
    const { call } = setup()
    await call('commander', 'POST', '/deathwatch/grants', { discordId: USERS.granted.id })
    expect((await call('granted', 'GET', '/deathwatch/data')).status).toBe(200) // verdict now cached
    await call('commander', 'DELETE', `/deathwatch/grants/${USERS.granted.id}`)
    expect((await call('granted', 'GET', '/deathwatch/data')).status).toBe(403)
  })

  it('makes a new grant work at once, despite a cached refusal', async () => {
    const { call } = setup()
    expect((await call('granted', 'GET', '/deathwatch/data')).status).toBe(403) // refusal now cached
    await call('commander', 'POST', '/deathwatch/grants', { discordId: USERS.granted.id })
    expect((await call('granted', 'GET', '/deathwatch/data')).status).toBe(200)
    expect((await call('granted', 'GET', '/deathwatch/me')).body).toEqual({ access: true, watchCommander: false, deathwatchCommand: false })
  })
})
