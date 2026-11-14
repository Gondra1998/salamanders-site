import { describe, it, expect, vi } from 'vitest'
import { createDeathwatchHandler, namedIn } from './deathwatchHandler'
import { createDeathwatchAccess } from './deathwatchAccess'
import { Upstream } from './discordRoles'
import { MAX_ACTIVE_ACCESS, MAX_BODY_BYTES } from './deathwatchValidate'
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
  commandOnly: { id: '300000000000000008', roles: [CMD] }, // the role without the Deathwatch one: deployed all the same
  granted: { id: '300000000000000003', roles: [] }, // in the guild with no role; gets a grant in some tests
  plain: { id: '300000000000000004', roles: [] },
  legion: { id: '300000000000000005', roles: [LEGION] }, // in, but no Event Tracker
  stranger: { id: '300000000000000006', roles: null }, // not in the guild, never granted
  desk: { id: '300000000000000010', roles: [] }, // given the Administratum desk by hand (setup)
  admin: { id: '300000000000000012', roles: [] }, // a guild admin: sees the Administratum, changes nothing
}
// Every member joined long before anything was given to them (deathwatchAccess.js counts it only then).
const JOINED = '2025-01-01T00:00:00.000Z'
const GIVEN = new Date('2026-06-01T00:00:00.000Z')
const OTHER = '300000000000000099'
const DOC = { col: 'teams', id: 'alpha', op: 'set', doc: { n: 1 } }

// In-memory store with the same contract as deathwatchStore.js.
function memStore() {
  const docs = { teams: new Map(), cfg: new Map(), archive: new Map() }
  const history = []
  const events = []
  // deathwatch_access: `${id}:${kind}` -> { discordId, kind, grantedBy, grantedAt }
  const access = new Map()
  const key = (id, kind) => `${id}:${kind}`
  return {
    docs, history, events, access,
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
    /** A row as the Watch Commander would have added it, `at` (after every member joined, unless given). */
    give: (id, kind, at = GIVEN, by = USERS.commander.id) => access.set(key(id, kind), { discordId: id, kind, grantedBy: by, grantedAt: at }),
    delegationsOf: vi.fn(async (id) => [...access.values()].filter((r) => r.discordId === id).map((r) => ({ kind: r.kind, grantedAt: r.grantedAt }))),
    listAccess: vi.fn(async () => [...access.values()].map((r) => ({ ...r }))),
    addAccess: vi.fn(async (id, kind, actorId) => {
      if (access.has(key(id, kind))) return 'exists'
      if (access.size >= MAX_ACTIVE_ACCESS) return 'limit'
      access.set(key(id, kind), { discordId: id, kind, grantedBy: actorId, grantedAt: new Date() }) // now()
      events.push({ id, kind, actor: actorId, action: 'added' })
      return 'added'
    }),
    removeAccess: vi.fn(async (id, kind, actorId) => {
      if (!access.delete(key(id, kind))) return 'none'
      events.push({ id, kind, actor: actorId, action: 'removed' })
      return 'removed'
    }),
  }
}

// The roster cache (roster.js): holding() for the Deployment list and the faces, members() for the search and the
// Access list. Everyone in USERS who is in the guild, under an invented name, unless a test says otherwise.
const rosterOf = (people) => ({ holding: vi.fn(async () => []), members: vi.fn(async () => people) })
const NAMES = { commander: 'Watch Commander Tor', desk: 'Brother Valen', admin: 'Brother Varro', watcher: 'Brother Kael', plain: 'Brother Avar', granted: 'Brother Ostar' }
const everyone = () =>
  Object.entries(USERS)
    .filter(([, u]) => u.roles !== null)
    .map(([k, u]) => ({ id: u.id, name: NAMES[k] ?? `Brother ${k}`, avatar: null, joinedAt: JOINED }))

// `roster`: the roster cache's holding() (roster.js), absent by default.
function setup({ configured = true, roster = null, deploymentRoleIds = [DW], faceRoleIds } = {}) {
  const users = structuredClone(USERS)
  const fail = { discord: false }
  const byToken = (request) => users[(request.headers.get('Authorization') || '').slice(7)]
  const roles = {
    identify: vi.fn(async (request) => {
      if (fail.discord) throw new Upstream()
      const u = byToken(request)
      return u ? { id: u.id, username: 'u' + u.id } : null
    }),
    memberOf: vi.fn(async (id) => {
      const u = Object.values(users).find((x) => x.id === id)
      return !u || u.roles === null ? null : { roles: u.roles, joinedAt: u.joinedAt ?? JOINED }
    }),
  }
  const store = memStore()
  store.give(USERS.desk.id, 'desk')
  const access = createDeathwatchAccess({
    roles,
    store,
    admins: { isAdmin: async (id) => id === USERS.admin.id },
    deathwatchRoleId: configured ? DW : undefined,
    commanderRoleId: configured ? WC : undefined,
    deathwatchCommandRoleId: CMD, // set even when the area is not: it must not configure anything
    legionRoleId: LEGION,
  })
  // deploymentRoleIds: null leaves it out, as a server with no Deployment role set does.
  const handle = createDeathwatchHandler({
    access,
    store,
    roster,
    memberOf: roles.memberOf, // the live member lookup (discordRoles.js), as index.js hands it over
    ...(deploymentRoleIds ? { deploymentRoleIds } : {}),
    ...(faceRoleIds ? { faceRoleIds } : {}),
  })

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
  ['GET', '/deathwatch/deployment'],
  ['POST', '/deathwatch/doc', DOC],
  ['GET', '/deathwatch/members?q=va'],
  ['GET', '/deathwatch/access'],
  ['POST', '/deathwatch/access', { discordId: OTHER, kind: 'desk' }],
  ['DELETE', `/deathwatch/access/${OTHER}/desk`],
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
      ['POST', '/deathwatch/deployment'],
      ['GET', '/deathwatch/grants'],
      ['POST', '/deathwatch/grants'],
      ['DELETE', `/deathwatch/grants/${OTHER}`],
      ['POST', '/deathwatch/members'],
      ['GET', `/deathwatch/members/${OTHER}`],
      ['GET', `/deathwatch/access/${OTHER}/desk`],
      ['POST', `/deathwatch/access/${OTHER}/desk`],
      ['PUT', '/deathwatch/access'],
      ['DELETE', '/deathwatch/access'],
      ['DELETE', `/deathwatch/access/${OTHER}`],
      ['DELETE', `/deathwatch/access/${OTHER}/desk/x`],
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
    roles.memberOf.mockRejectedValueOnce(new Error('db down'))
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
    store.give(USERS.granted.id, 'deathwatch')
    const me = async (who) => (await call(who, 'GET', '/deathwatch/me')).body
    const out = (access, watchCommander, deathwatchCommand, roles) => ({ access, watchCommander, deathwatchCommand, roles })
    expect(await me('commander')).toEqual(out(true, true, false, []))
    expect(await me('watcher')).toEqual(out(true, false, false, ['deployment']))
    expect(await me('command')).toEqual(out(true, false, true, ['deployment', 'command']))
    expect(await me('commandOnly')).toEqual(out(true, false, true, ['deployment', 'command']))
    expect(await me('granted')).toEqual(out(true, false, false, ['deployment']))
    expect(await me('desk')).toEqual(out(true, false, false, ['deployment', 'desk']))
    expect(await me('admin')).toEqual(out(true, false, false, ['deployment', 'admin']))
    expect(await me('plain')).toEqual(out(false, false, false, []))
    expect(await me('legion')).toEqual(out(true, false, false, ['legion']))
    expect(await me('stranger')).toEqual(out(false, false, false, []))
  })

  it('sends nothing but the three flags and the standings', async () => {
    const { call } = setup()
    expect(Object.keys((await call('command', 'GET', '/deathwatch/me')).body).sort()).toEqual(['access', 'deathwatchCommand', 'roles', 'watchCommander'])
  })

  it('adds deployment for a Legion member once granted, and not before', async () => {
    const { call, store, access } = setup()
    expect((await call('legion', 'GET', '/deathwatch/me')).body.roles).toEqual(['legion'])
    store.give(USERS.legion.id, 'deathwatch')
    access.forget() // as the access route does, so the earlier verdict is not served from the cache
    expect((await call('legion', 'GET', '/deathwatch/me')).body.roles).toEqual(['legion', 'deployment'])
  })

  it('is never a 403', async () => {
    const { call } = setup()
    for (const who of ['plain', 'legion', 'stranger', 'commandOnly']) expect((await call(who, 'GET', '/deathwatch/me')).status).toBe(200)
  })
})

describe('who may call what: the Watch Commander, the desk, admins and everyone else', () => {
  const ONLY_COMMANDER = [
    ['GET', '/deathwatch/members?q=va'],
    ['POST', '/deathwatch/access', { discordId: OTHER, kind: 'desk' }],
    ['DELETE', `/deathwatch/access/${OTHER}/desk`],
  ]
  const outcome = async (call, who, m, p, b) => {
    const res = await call(who, m, p, b)
    return [who, m, p, res.status, res.status === 403 ? res.body : 'ok']
  }

  it("the search and every access change are the Watch Commander's alone", async () => {
    const { call, store } = setup({ roster: rosterOf(everyone()) })
    for (const who of ['desk', 'admin', 'command', 'commandOnly', 'watcher', 'legion']) {
      for (const [m, p, b] of ONLY_COMMANDER) {
        expect(await outcome(call, who, m, p, b)).toEqual([who, m, p, 403, { error: 'Only the Watch Commander can do that.' }])
      }
    }
    expect(store.events).toEqual([])
    for (const [m, p, b] of ONLY_COMMANDER) expect((await call('commander', m, p, b)).status).not.toBe(403)
  })

  it("a document write is the Watch Commander's and the desk's, and never an admin's", async () => {
    const { call, store } = setup()
    for (const who of ['admin', 'command', 'commandOnly', 'watcher', 'legion', 'granted']) {
      expect(await outcome(call, who, 'POST', '/deathwatch/doc', DOC)).toEqual([who, 'POST', '/deathwatch/doc', 403, { error: 'Only the Watch Commander and the desk can do that.' }])
    }
    expect(store.history).toEqual([])
    for (const who of ['commander', 'desk']) expect((await call(who, 'POST', '/deathwatch/doc', { ...DOC, doc: { by: who } })).status).toBe(200)
    expect(store.history.map((h) => h.actor)).toEqual([USERS.commander.id, USERS.desk.id])
  })

  it('the access list is for the Administratum: the Watch Commander, the desk and admins', async () => {
    const { call } = setup({ roster: rosterOf(everyone()) })
    for (const who of ['commander', 'desk', 'admin']) expect((await call(who, 'GET', '/deathwatch/access')).status).toBe(200)
    for (const who of ['watcher', 'command', 'legion', 'granted', 'plain']) {
      expect(await outcome(call, who, 'GET', '/deathwatch/access')).toEqual([who, 'GET', '/deathwatch/access', 403, { error: 'Restricted to the Administratum.' }])
    }
  })

  it('a desk delegate who lost the desk is refused at once, though a read was cached', async () => {
    const { call, store } = setup()
    expect((await call('desk', 'GET', '/deathwatch/me')).body.roles).toContain('desk')
    store.access.clear()
    expect((await call('desk', 'POST', '/deathwatch/doc', DOC)).status).toBe(403)
  })

  it('reads the Event Tracker as Deployment does, even without the Deathwatch role', async () => {
    const { call, store } = setup()
    store.docs.teams.set('alpha', { n: 1 })
    expect((await call('commandOnly', 'GET', '/deathwatch/data')).body.teams).toEqual({ alpha: { n: 1 } })
  })
})

describe('GET /deathwatch/data', () => {
  it('refuses a user without access and never reads the store', async () => {
    const { call, store } = setup()
    for (const who of ['plain', 'stranger']) {
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
    const res = await call('plain', 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': tag } })
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

  it('gives someone without deployment the page texts, but the live event and the archive empty, with their own tag', async () => {
    const { call, store } = setup()
    store.docs.teams.set('alpha', { n: 1 })
    store.docs.cfg.set('tx', { a: 'b' })
    store.docs.archive.set('t1', { n: 2 })
    const full = await call('watcher', 'GET', '/deathwatch/data')
    expect(full.body).toEqual({ teams: { alpha: { n: 1 } }, cfg: { tx: { a: 'b' } }, archive: { t1: { n: 2 } } })
    expect((await call('commander', 'GET', '/deathwatch/data')).body).toEqual(full.body)
    for (const who of ['legion']) {
      const res = await call(who, 'GET', '/deathwatch/data', undefined, { headers: { 'If-None-Match': full.headers.get('ETag') } })
      expect([who, res.status, res.body]).toEqual([who, 200, { teams: {}, cfg: { tx: { a: 'b' } }, archive: {} }])
      expect(res.headers.get('ETag')).toBe(etagOf(res.text))
    }
  })

  it('keeps the live event to deployment and the Watch Commander, whatever a cfg g document says', async () => {
    const { call, store } = setup()
    store.docs.teams.set('alpha', { n: 1 })
    store.docs.cfg.set('g', { eventtracker: ['legion'] })
    expect((await call('legion', 'GET', '/deathwatch/data')).body.teams).toEqual({})
    for (const who of ['watcher', 'commander', 'desk', 'admin']) expect((await call(who, 'GET', '/deathwatch/data')).body.teams, who).toEqual({ alpha: { n: 1 } })
  })

  it('uses the cached verdict for repeated reads', async () => {
    const { call, roles } = setup()
    await call('watcher', 'GET', '/deathwatch/data')
    await call('watcher', 'GET', '/deathwatch/data')
    expect(roles.memberOf).toHaveBeenCalledTimes(1)
  })
})

describe('GET /deathwatch/deployment', () => {
  const MEMBERS = [{ id: '300000000000000011', name: 'Brother Orrin', avatar: null }]
  const roster = () => ({ holding: vi.fn(async () => MEMBERS) })

  it('lists the role holders to the Event Tracker readers, asking the roster for the Deployment role', async () => {
    const r = roster()
    const { call } = setup({ roster: r })
    for (const who of ['commander', 'watcher', 'commandOnly']) {
      const res = await call(who, 'GET', '/deathwatch/deployment')
      expect([res.status, res.body], who).toEqual([200, { members: MEMBERS, faces: [] }])
    }
    expect(r.holding).toHaveBeenCalledWith([DW])
  })

  it('refuses anyone the Event Tracker is closed to, without asking the roster', async () => {
    const r = roster()
    const { call } = setup({ roster: r })
    for (const who of ['legion', 'plain']) {
      const res = await call(who, 'GET', '/deathwatch/deployment')
      expect([res.status, res.body], who).toEqual([403, { error: 'Restricted to the Event Tracker.' }])
    }
    expect(r.holding).not.toHaveBeenCalled()
  })

  it('ignores a cfg g document: the Event Tracker stays with deployment', async () => {
    const { call, store } = setup({ roster: roster() })
    store.docs.cfg.set('g', { eventtracker: ['legion'] })
    expect((await call('legion', 'GET', '/deathwatch/deployment')).status).toBe(403)
    expect((await call('watcher', 'GET', '/deathwatch/deployment')).status).toBe(200)
  })

  it('answers 503 with no roster, with no Deployment role set, or before the roster has loaded', async () => {
    const NOT_YET = [503, { error: 'The member list is not available yet. Try again.' }]
    const res = async (opts) => {
      const r = await setup(opts).call('watcher', 'GET', '/deathwatch/deployment')
      return [r.status, r.body]
    }
    expect(await res()).toEqual(NOT_YET)
    expect(await res({ roster: roster(), deploymentRoleIds: null })).toEqual(NOT_YET)
    expect(await res({ roster: { holding: async () => null } })).toEqual(NOT_YET)
  })
})

describe('the faces in GET /deathwatch/deployment', () => {
  // Invented values only. The Legion and Emissary members, of whom the tracker names some.
  const MEMBERS = [{ id: '300000000000000011', name: 'Brother Orrin', avatar: null }]
  const FACES = [
    { id: '300000000000000011', name: 'Brother Orrin', avatar: null }, // deployed: listed once, as a member
    { id: '300000000000000021', name: 'Brother Named', avatar: null }, // on a live roster by name
    { id: '300000000000000022', name: 'Brother Renamed', avatar: null }, // entered by id, renamed since
    { id: '300000000000000023', name: 'Brother Archived', avatar: null }, // on an archived roster
    { id: '300000000000000024', name: 'Brother Stranger', avatar: null }, // never entered
  ]
  const holding = (faces = FACES) => vi.fn(async (ids) => (ids.includes(DW) ? MEMBERS : faces))
  const fill = (store) => {
    store.docs.teams.set('1', { ro: ['Brother Named', 'Brother Old Name', 'Brother Orrin'], di: { 'Brother Old Name': '300000000000000022' } })
    store.docs.archive.set('e1', { teams: [{ ro: ['Brother Archived'] }] })
  }

  it('adds the Legion and Emissary members the tracker names, by id or by name, who are not deployed', async () => {
    const r = { holding: holding() }
    const { call, store } = setup({ roster: r, faceRoleIds: [LEGION, 'EMISSARY'] })
    fill(store)
    const res = await call('watcher', 'GET', '/deathwatch/deployment')
    expect(res.body).toEqual({ members: MEMBERS, faces: FACES.slice(1, 4) })
    expect(r.holding).toHaveBeenCalledWith([LEGION, 'EMISSARY'])
  })

  it('has none with no face roles set, and none while that list cannot be had', async () => {
    const plain = setup({ roster: { holding: holding() } })
    fill(plain.store)
    expect((await plain.call('watcher', 'GET', '/deathwatch/deployment')).body.faces).toEqual([])
    const late = setup({ roster: { holding: holding(null) }, faceRoleIds: [LEGION] })
    fill(late.store)
    expect((await late.call('watcher', 'GET', '/deathwatch/deployment')).body).toEqual({ members: MEMBERS, faces: [] })
  })

  it('reads the names and ids from any document, skipping what is not a roster or not an id', () => {
    const all = {
      teams: { a: { ro: ['A', 7], di: { A: '300000000000000031', B: 'not an id', C: 5 } }, b: { ro: 'A', di: null }, c: null, d: { di: ['300000000000000032'] } },
      archive: { e: { teams: [{ ro: ['E'] }, null] }, f: { teams: 'none' }, g: null },
    }
    const { ids, names } = namedIn(all)
    expect([...names].sort()).toEqual(['A', 'E'])
    expect([...ids]).toEqual(['300000000000000031', '300000000000000032'])
    expect(namedIn(undefined)).toEqual({ ids: new Set(), names: new Set() })
    expect(namedIn({})).toEqual({ ids: new Set(), names: new Set() })
  })
})

describe('POST /deathwatch/doc', () => {
  it('is for the Watch Commander and the desk only', async () => {
    const { call, store } = setup()
    for (const who of ['watcher', 'plain', 'legion', 'admin']) {
      const res = await call(who, 'POST', '/deathwatch/doc', DOC)
      expect([res.status, res.body]).toEqual([403, { error: 'Only the Watch Commander and the desk can do that.' }])
    }
    expect(store.history).toEqual([])
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

describe('GET /deathwatch/members', () => {
  const PEOPLE = [
    { id: '300000000000000101', name: 'Valen', avatar: null, joinedAt: JOINED },
    { id: '300000000000000102', name: 'Brother Avar', avatar: 'https://cdn.discordapp.com/avatars/300000000000000102/a.png', joinedAt: JOINED },
    { id: '300000000000000103', name: 'Kael', avatar: null, joinedAt: JOINED },
  ]

  it('finds members by name, prefix first, from the roster cache', async () => {
    const { call } = setup({ roster: rosterOf(PEOPLE) })
    const res = await call('commander', 'GET', '/deathwatch/members?q=va')
    expect([res.status, res.body]).toEqual([
      200,
      { members: [{ id: '300000000000000101', name: 'Valen', avatar: null }, { id: '300000000000000102', name: 'Brother Avar', avatar: PEOPLE[1].avatar }] },
    ])
  })

  it('finds one member by a pasted id, and nothing for no query or a short one', async () => {
    const { call } = setup({ roster: rosterOf(PEOPLE) })
    expect((await call('commander', 'GET', '/deathwatch/members?q=%20300000000000000103%20')).body).toEqual({ members: [{ id: '300000000000000103', name: 'Kael', avatar: null }] })
    for (const q of ['', '?q=', '?q=v', '?q=%20']) expect((await call('commander', 'GET', `/deathwatch/members${q}`)).body).toEqual({ members: [] })
  })

  it('answers 503 until the roster has loaded, or with no roster at all', async () => {
    const NOT_YET = [503, { error: 'The member list is not available yet. Try again.' }]
    for (const roster of [rosterOf(null), null]) {
      const res = await setup({ roster }).call('commander', 'GET', '/deathwatch/members?q=va')
      expect([res.status, res.body]).toEqual(NOT_YET)
    }
  })
})

describe('the access list', () => {
  const list = async (call, who = 'commander') => (await call(who, 'GET', '/deathwatch/access')).body.people

  it("lists each row with the person's name and picture and who gave it", async () => {
    const { call } = setup({ roster: rosterOf(everyone()) })
    expect(await list(call)).toEqual([
      { id: USERS.desk.id, kind: 'desk', name: 'Brother Valen', avatar: null, grantedBy: 'Watch Commander Tor', grantedAt: GIVEN.toISOString() },
    ])
  })

  it('removes, as left-guild, the rows of anyone gone from the guild or back only since', async () => {
    const people = everyone()
      .filter((p) => p.id !== USERS.granted.id)
      .map((p) => (p.id === USERS.watcher.id ? { ...p, joinedAt: '2026-07-01T00:00:00.000Z' } : p))
    const { call, store } = setup({ roster: rosterOf(people) })
    store.give(USERS.granted.id, 'deathwatch') // gone from the roster
    store.give(USERS.watcher.id, 'watchcommand') // the roster says he joined again after it was given
    expect((await list(call)).map((r) => r.id)).toEqual([USERS.desk.id])
    expect(store.events).toEqual([
      { id: USERS.granted.id, kind: 'deathwatch', actor: 'left-guild', action: 'removed' },
      { id: USERS.watcher.id, kind: 'watchcommand', actor: 'left-guild', action: 'removed' },
    ])
    expect([...store.access.keys()]).toEqual([`${USERS.desk.id}:desk`])
  })

  it('forgets cached verdicts when it removes someone, so their access ends at once', async () => {
    const people = everyone().map((p) => (p.id === USERS.watcher.id ? { ...p, joinedAt: '2026-07-01T00:00:00.000Z' } : p))
    const { call, store } = setup({ roster: rosterOf(people) })
    store.give(USERS.watcher.id, 'watchcommand')
    expect((await call('watcher', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment', 'command']) // cached with it
    await list(call)
    expect((await call('watcher', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment'])
  })

  it('keeps a row whose person the roster shows with no join date', async () => {
    const people = everyone().map((p) => (p.id === USERS.desk.id ? { ...p, joinedAt: null } : p))
    const { call, store } = setup({ roster: rosterOf(people) })
    expect((await list(call)).map((r) => r.id)).toEqual([USERS.desk.id])
    expect(store.events).toEqual([])
  })

  it('removes nobody while the roster has not loaded, and names nobody, the giver shown by id', async () => {
    const { call, store } = setup({ roster: rosterOf(null) })
    store.give(USERS.granted.id, 'deathwatch')
    expect(await list(call)).toEqual([
      { id: USERS.desk.id, kind: 'desk', name: null, avatar: null, grantedBy: USERS.commander.id, grantedAt: GIVEN.toISOString() },
      { id: USERS.granted.id, kind: 'deathwatch', name: null, avatar: null, grantedBy: USERS.commander.id, grantedAt: GIVEN.toISOString() },
    ])
    expect(store.events).toEqual([])
    expect(await list(setup({ roster: null }).call)).toHaveLength(1)
  })

  it('shows the same list to the desk and to admins', async () => {
    const { call } = setup({ roster: rosterOf(everyone()) })
    expect(await list(call, 'desk')).toEqual(await list(call, 'commander'))
    expect(await list(call, 'admin')).toEqual(await list(call, 'commander'))
  })
})

describe('POST /deathwatch/access', () => {
  const add = (call, body, who = 'commander') => call(who, 'POST', '/deathwatch/access', body)

  it('adds with 201, answers 200 on a repeat, records the caller and ignores a giver named in the body', async () => {
    const { call, store } = setup({ roster: rosterOf(everyone()) })
    const first = await add(call, { discordId: USERS.plain.id, kind: 'desk', grantedBy: 'forged' })
    expect([first.status, first.body]).toEqual([201, { discordId: USERS.plain.id, kind: 'desk' }])
    const again = await add(call, { discordId: USERS.plain.id, kind: 'desk' })
    expect([again.status, again.body]).toEqual([200, { discordId: USERS.plain.id, kind: 'desk' }])
    expect(store.events).toEqual([{ id: USERS.plain.id, kind: 'desk', actor: USERS.commander.id, action: 'added' }])
  })

  it('works at once, despite a cached refusal', async () => {
    const { call } = setup({ roster: rosterOf(everyone()) })
    expect((await call('plain', 'GET', '/deathwatch/me')).body.access).toBe(false)
    await add(call, { discordId: USERS.plain.id, kind: 'desk' })
    expect((await call('plain', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment', 'desk'])
    expect((await call('plain', 'POST', '/deathwatch/doc', DOC)).status).toBe(200)
  })

  it('asks Discord whether the person is in the server: not there is refused, whatever the roster says', async () => {
    const { call, store } = setup({ roster: rosterOf(everyone()) })
    for (const id of [OTHER, USERS.stranger.id]) {
      const res = await add(call, { discordId: id, kind: 'desk' })
      expect([id, res.status, res.body]).toEqual([id, 404, { error: 'Not in the server.' }])
    }
    expect(store.events).toEqual([])
  })

  it('adds someone who joined since the roster last loaded, or while it has not loaded at all', async () => {
    for (const roster of [rosterOf([]), rosterOf(null), null]) {
      const { call, store } = setup({ roster })
      expect((await add(call, { discordId: USERS.plain.id, kind: 'desk' })).status).toBe(201)
      expect(store.events).toEqual([{ id: USERS.plain.id, kind: 'desk', actor: USERS.commander.id, action: 'added' }])
    }
  })

  it('gives again what was lost by leaving and coming back: the old one goes as left-guild, the new one counts', async () => {
    const { call, store, users } = setup({ roster: rosterOf(everyone()) })
    store.give(USERS.plain.id, 'desk')
    store.give(USERS.plain.id, 'watchcommand')
    users.plain.joinedAt = '2026-07-01T00:00:00.000Z' // after both were given
    const res = await add(call, { discordId: USERS.plain.id, kind: 'desk' })
    expect([res.status, res.body]).toEqual([201, { discordId: USERS.plain.id, kind: 'desk' }])
    expect(store.events).toEqual([
      { id: USERS.plain.id, kind: 'desk', actor: 'left-guild', action: 'removed' },
      { id: USERS.plain.id, kind: 'watchcommand', actor: 'left-guild', action: 'removed' },
      { id: USERS.plain.id, kind: 'desk', actor: USERS.commander.id, action: 'added' },
    ])
    expect((await call('plain', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment', 'desk'])
  })

  it('leaves what was given alone when Discord gives no join date: it is still there, and the add says so', async () => {
    const { call, store, users } = setup({ roster: rosterOf(everyone()) })
    store.give(USERS.plain.id, 'desk')
    users.plain.joinedAt = 'not a date'
    expect((await add(call, { discordId: USERS.plain.id, kind: 'desk' })).status).toBe(200)
    expect(store.events).toEqual([])
  })

  it('answers 503 when Discord cannot be asked about the person', async () => {
    const { call, roles, store } = setup({ roster: rosterOf(everyone()) })
    const live = roles.memberOf.getMockImplementation()
    roles.memberOf.mockImplementation(async (id) => {
      if (id === USERS.plain.id) throw new Upstream()
      return live(id)
    })
    const res = await add(call, { discordId: USERS.plain.id, kind: 'desk' })
    expect([res.status, res.body]).toEqual([503, { error: 'Discord could not be reached. Try again.' }])
    expect(store.events).toEqual([])
  })

  it('refuses a malformed body or an unknown kind with the reason', async () => {
    const { call, store } = setup({ roster: rosterOf(everyone()) })
    for (const [body, error] of [
      [{ discordId: USERS.plain.id, kind: 'admin' }, 'Unknown access kind.'],
      [{ discordId: '123', kind: 'desk' }, 'Enter a Discord user id (17 to 20 digits).'],
      [[1], 'Malformed request.'],
    ]) {
      const res = await add(call, body)
      expect([res.status, res.body]).toEqual([400, { error }])
    }
    const raw = await call('commander', 'POST', '/deathwatch/access', undefined, { raw: '{"discordId":' })
    expect([raw.status, raw.body]).toEqual([400, { error: 'Malformed request.' }])
    const text = await call('commander', 'POST', '/deathwatch/access', undefined, { raw: 'x', headers: { 'Content-Type': 'text/plain' } })
    expect([text.status, text.body]).toEqual([415, { error: 'Send JSON (Content-Type: application/json).' }])
    expect(store.events).toEqual([])
  })

  it('answers 409 at the ceiling', async () => {
    const { call, store } = setup({ roster: rosterOf(everyone()) })
    store.addAccess.mockResolvedValueOnce('limit')
    const res = await add(call, { discordId: USERS.plain.id, kind: 'deathwatch' })
    expect([res.status, res.body]).toEqual([409, { error: `The access limit (${MAX_ACTIVE_ACCESS}) is reached. Remove someone first.` }])
  })
})

describe('DELETE /deathwatch/access/:id/:kind', () => {
  it('removes that one kind, then answers 404 for it, and it stops working at once', async () => {
    const { call, store } = setup()
    store.give(USERS.desk.id, 'watchcommand')
    expect((await call('desk', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment', 'command', 'desk'])
    const res = await call('commander', 'DELETE', `/deathwatch/access/${USERS.desk.id}/desk`)
    expect([res.status, res.body]).toEqual([200, { discordId: USERS.desk.id, kind: 'desk' }])
    expect((await call('desk', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment', 'command'])
    expect(store.events).toEqual([{ id: USERS.desk.id, kind: 'desk', actor: USERS.commander.id, action: 'removed' }])
    const again = await call('commander', 'DELETE', `/deathwatch/access/${USERS.desk.id}/desk`)
    expect([again.status, again.body]).toEqual([404, { error: 'No such access.' }])
  })

  it('refuses a bad id or kind', async () => {
    const { call, store } = setup()
    for (const [path, error] of [
      ['/deathwatch/access/123/desk', 'That is not a Discord user id.'],
      [`/deathwatch/access/${USERS.desk.id}/nope`, 'Unknown access kind.'],
      [`/deathwatch/access/${USERS.desk.id}/Desk`, 'Unknown access kind.'],
      [`/deathwatch/access/${USERS.desk.id}/%64esk`, 'Unknown access kind.'],
    ]) {
      const res = await call('commander', 'DELETE', path)
      expect([path, res.status, res.body]).toEqual([path, 400, { error }])
    }
    expect(store.events).toEqual([])
  })
})

describe('which routes may answer from a cached verdict, and which ask Discord afresh', () => {
  it('the reads answer from the cache: a role lost in Discord a moment ago still reads', async () => {
    const { call, users, store } = setup({ roster: rosterOf(everyone()) })
    for (const [who, path] of [['watcher', '/deathwatch/deployment'], ['commander', '/deathwatch/members?q=va'], ['desk', '/deathwatch/access']]) {
      expect((await call(who, 'GET', path)).status, path).not.toBe(403)
    }
    users.watcher.roles = []
    users.commander.roles = []
    store.access.clear()
    for (const [who, path] of [['watcher', '/deathwatch/deployment'], ['commander', '/deathwatch/members?q=va'], ['desk', '/deathwatch/access']]) {
      expect((await call(who, 'GET', path)).status, path).not.toBe(403)
    }
  })

  it('every access change asks afresh: a Watch Commander demoted a moment ago is refused', async () => {
    const { call, users } = setup({ roster: rosterOf(everyone()) })
    expect((await call('commander', 'GET', '/deathwatch/me')).body.watchCommander).toBe(true)
    users.commander.roles = [DW]
    expect((await call('commander', 'POST', '/deathwatch/access', { discordId: USERS.plain.id, kind: 'desk' })).status).toBe(403)
    expect((await call('commander', 'DELETE', `/deathwatch/access/${USERS.desk.id}/desk`)).status).toBe(403)
  })

  it('listing the access drops nobody\'s cached verdict when it removed nobody', async () => {
    const { call, users } = setup({ roster: rosterOf(everyone()) })
    expect((await call('watcher', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment'])
    users.watcher.roles = []
    await call('commander', 'GET', '/deathwatch/access')
    expect((await call('watcher', 'GET', '/deathwatch/me')).body.roles).toEqual(['deployment'])
  })
})
