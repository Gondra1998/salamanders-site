import { test, expect } from '@playwright/test'

// The Deathwatch API against the e2e stack (api + postgres + discord-mock), with no page in the way: the
// views that call it arrive with the Event Tracker and Manage chunks. Tokens and ids are the invented
// ones in e2e/discord-mock/server.js. This is where the real SQL in deathwatchStore.js and the real
// headers from index.js are proven.
const API = process.env.API_URL || 'http://api:8787'
// The page's origin, as docker-compose.yml hands it to the api container (ALLOWED_ORIGIN).
const SITE = 'http://localhost:5173'

const DEATHWATCH = 'test-deathwatch-token'
const COMMANDER = 'test-commander-token'
// In the guild with no role, as 'E2E Delegate': the Watch Commander gives them the desk.
const DELEGATE = 'test-granted-token'
const DELEGATE_ID = '200000000000000003'
const MOCK = 'http://discord-mock:4400'
const DOC = { col: 'teams', id: 'e2e-alpha', op: 'set', doc: { name: 'Alpha', score: 3 } }

const as = (token, headers = {}) => ({ headers: { Authorization: `Bearer ${token}`, ...headers } })
const get = (request, path, token, headers) => request.get(`${API}${path}`, as(token, headers))
const send = (request, method, path, token, data) => request.fetch(`${API}${path}`, { method, ...as(token), data })
const data = async (request, token = DEATHWATCH) => (await get(request, '/deathwatch/data', token)).json()

test.describe('Deathwatch API', () => {
  test.describe.configure({ mode: 'serial' })

  test('/me says where each caller stands', async ({ request }) => {
    expect((await request.get(`${API}/deathwatch/me`)).status()).toBe(401)
    const me = async (token) => (await get(request, '/deathwatch/me', token)).json()
    const out = (access, watchCommander, deathwatchCommand, roles) => ({ access, watchCommander, deathwatchCommand, roles })
    expect(await me(DEATHWATCH)).toEqual(out(true, false, false, ['deployment']))
    // DEATHWATCH_ROLE_ID lists two roles; a holder of the second one is as welcome as a holder of the first.
    expect(await me('test-deathwatch-second-token')).toEqual(out(true, false, false, ['deployment']))
    // The guild owner and an Administrator are admins: deployed, and the Administratum to look at; never the Commander.
    for (const who of ['test-owner-token', 'test-admin-token']) expect(await me(who), who).toEqual(out(true, false, false, ['deployment', 'admin']))
    expect(await me(COMMANDER)).toEqual(out(true, true, false, []))
    // DEATHWATCH_COMMAND_ROLE_ID is its own standing, and deploys its holder too, even without a Deathwatch role.
    expect(await me('test-command-token')).toEqual(out(true, false, true, ['deployment', 'command']))
    expect(await me('test-command-only-token')).toEqual(out(true, false, true, ['deployment', 'command']))
    // The Legion role (rosterLadder.js) lets its holder in as legion; holding no role does not.
    expect(await me('test-member-token')).toEqual(out(true, false, false, ['legion']))
    expect(await me('test-norole-token')).toEqual(out(false, false, false, []))
    // The Event Tracker's documents go to deployment only: everyone else let in gets them empty.
    await send(request, 'POST', '/deathwatch/doc', COMMANDER, DOC)
    for (const who of ['test-command-token', 'test-command-only-token']) expect((await data(request, who)).teams, who).toHaveProperty(DOC.id)
    for (const who of ['test-member-token']) {
      const res = await get(request, '/deathwatch/data', who)
      expect(res.status(), who).toBe(200)
      expect((await res.json()).teams, who).toEqual({})
    }
    await send(request, 'POST', '/deathwatch/doc', COMMANDER, { col: DOC.col, id: DOC.id, op: 'delete' })
    expect((await get(request, '/deathwatch/data', 'test-norole-token')).status()).toBe(403)
    // Deathwatch Command is not the Watch Commander: the Commander-only routes stay closed to it.
    expect((await get(request, '/deathwatch/members?q=e2e', 'test-command-token')).status()).toBe(403)
    expect((await send(request, 'POST', '/deathwatch/doc', 'test-command-token', DOC)).status()).toBe(403)
    for (const who of ['test-owner-token', 'test-admin-token']) {
      expect((await get(request, '/deathwatch/data', who)).status(), who).toBe(200)
      expect((await get(request, '/deathwatch/members?q=e2e', who)).status(), who).toBe(403)
    }
    // The old grants are gone.
    expect((await get(request, '/deathwatch/grants', COMMANDER)).status()).toBe(404)
  })

  test('the Commander edits documents and readers poll them by ETag', async ({ request }) => {
    const first = await get(request, '/deathwatch/data', DEATHWATCH)
    expect(first.status()).toBe(200)
    expect(Object.keys(await first.json()).sort()).toEqual(['archive', 'cfg', 'teams'])
    const before = first.headers()['etag']
    expect(before).toMatch(/^"[0-9a-f]{32}"$/)

    // Reading is not writing: a Deathwatch member is refused.
    expect((await send(request, 'POST', '/deathwatch/doc', DEATHWATCH, DOC)).status()).toBe(403)

    const set = await send(request, 'POST', '/deathwatch/doc', COMMANDER, DOC)
    expect(set.status()).toBe(200)
    expect(await set.json()).toEqual({ ok: true, changed: true })

    const after = await get(request, '/deathwatch/data', DEATHWATCH)
    expect((await after.json()).teams[DOC.id]).toEqual(DOC.doc)
    const tag = after.headers()['etag']
    expect(tag).not.toBe(before)

    // The old tag is stale; the new one is current and costs no body.
    expect((await get(request, '/deathwatch/data', DEATHWATCH, { 'If-None-Match': before })).status()).toBe(200)
    const current = await get(request, '/deathwatch/data', DEATHWATCH, { 'If-None-Match': tag })
    expect(current.status()).toBe(304)
    expect(await current.text()).toBe('')

    // Setting the same document again changes nothing, so it does not move the tag.
    const again = await send(request, 'POST', '/deathwatch/doc', COMMANDER, DOC)
    expect(await again.json()).toEqual({ ok: true, changed: false })
    expect((await get(request, '/deathwatch/data', DEATHWATCH, { 'If-None-Match': tag })).status()).toBe(304)

    const del = await send(request, 'POST', '/deathwatch/doc', COMMANDER, { col: DOC.col, id: DOC.id, op: 'delete' })
    expect(await del.json()).toEqual({ ok: true, changed: true })
    expect((await data(request)).teams).not.toHaveProperty(DOC.id)
    const delAgain = await send(request, 'POST', '/deathwatch/doc', COMMANDER, { col: DOC.col, id: DOC.id, op: 'delete' })
    expect(await delAgain.json()).toEqual({ ok: true, changed: false })
  })

  test('real Postgres keeps an id of __proto__ and is never handed text it cannot store', async ({ request }) => {
    const proto = { col: 'teams', id: '__proto__', op: 'set', doc: { ok: true } }
    expect((await send(request, 'POST', '/deathwatch/doc', COMMANDER, proto)).status()).toBe(200)
    expect(Object.hasOwn((await data(request)).teams, '__proto__')).toBe(true)
    await send(request, 'POST', '/deathwatch/doc', COMMANDER, { col: 'teams', id: '__proto__', op: 'delete' })

    // U+0000 inside a string would be a 500 from jsonb if it got that far.
    const nul = '{"col":"teams","id":"nul","op":"set","doc":{"v":"a\\u0000b"}}'
    const res = await request.fetch(`${API}/deathwatch/doc`, {
      method: 'POST',
      ...as(COMMANDER, { 'Content-Type': 'application/json' }),
      data: nul,
    })
    expect(res.status()).toBe(400)
  })

  test('a body over 2 MB is refused', async ({ request }) => {
    const res = await request.fetch(`${API}/deathwatch/doc`, {
      method: 'POST',
      ...as(COMMANDER, { 'Content-Type': 'application/json' }),
      data: 'x'.repeat(2 * 1024 * 1024 + 1),
    })
    expect(res.status()).toBe(413)
  })

  test('the Watch Commander finds a member by name and gives them the desk, which works at once', async ({ request }) => {
    // A member with no role: refused, and that refusal is now cached.
    expect((await get(request, '/deathwatch/data', DELEGATE)).status()).toBe(403)
    expect(await (await get(request, '/deathwatch/me', DELEGATE)).json()).toEqual({ access: false, watchCommander: false, deathwatchCommand: false, roles: [] })
    // Only the Watch Commander searches and gives; the list is for the Administratum.
    expect((await get(request, '/deathwatch/members?q=dele', DEATHWATCH)).status()).toBe(403)
    expect((await send(request, 'POST', '/deathwatch/access', DEATHWATCH, { discordId: DELEGATE_ID, kind: 'desk' })).status()).toBe(403)
    expect((await get(request, '/deathwatch/access', DEATHWATCH)).status()).toBe(403)

    const found = await (await get(request, '/deathwatch/members?q=e2e%20dele', COMMANDER)).json()
    expect(found.members.map((m) => [m.id, m.name])).toEqual([[DELEGATE_ID, 'E2E Delegate']])
    expect((await (await get(request, `/deathwatch/members?q=${DELEGATE_ID}`, COMMANDER)).json()).members.map((m) => m.id)).toEqual([DELEGATE_ID])

    expect((await send(request, 'POST', '/deathwatch/access', COMMANDER, { discordId: DELEGATE_ID, kind: 'desk' })).status()).toBe(201)
    expect((await send(request, 'POST', '/deathwatch/access', COMMANDER, { discordId: DELEGATE_ID, kind: 'desk' })).status()).toBe(200)
    expect((await send(request, 'POST', '/deathwatch/access', COMMANDER, { discordId: '200000000000000099', kind: 'desk' })).status()).toBe(404)
    expect((await send(request, 'POST', '/deathwatch/access', COMMANDER, { discordId: DELEGATE_ID, kind: 'admin' })).status()).toBe(400)

    // At once, despite the cached refusal: the desk reads the Event Tracker and writes, and changes no access.
    expect(await (await get(request, '/deathwatch/me', DELEGATE)).json()).toEqual({ access: true, watchCommander: false, deathwatchCommand: false, roles: ['deployment', 'desk'] })
    expect((await send(request, 'POST', '/deathwatch/doc', DELEGATE, DOC)).status()).toBe(200)
    expect((await data(request, DELEGATE)).teams).toHaveProperty(DOC.id)
    expect((await send(request, 'POST', '/deathwatch/access', DELEGATE, { discordId: DELEGATE_ID, kind: 'watchcommand' })).status()).toBe(403)
    const list = await (await get(request, '/deathwatch/access', DELEGATE)).json()
    expect(list.people.map((p) => [p.id, p.kind, p.name])).toEqual([[DELEGATE_ID, 'desk', 'E2E Delegate']])
    await send(request, 'POST', '/deathwatch/doc', COMMANDER, { col: DOC.col, id: DOC.id, op: 'delete' })
  })

  test('an admin sees the Administratum and changes nothing', async ({ request }) => {
    expect(await (await get(request, '/deathwatch/me', 'test-admin-token')).json()).toEqual({ access: true, watchCommander: false, deathwatchCommand: false, roles: ['deployment', 'admin'] })
    expect((await get(request, '/deathwatch/access', 'test-admin-token')).status()).toBe(200)
    expect((await send(request, 'POST', '/deathwatch/doc', 'test-admin-token', DOC)).status()).toBe(403)
    expect((await send(request, 'POST', '/deathwatch/access', 'test-admin-token', { discordId: DELEGATE_ID, kind: 'deathwatch' })).status()).toBe(403)
  })

  test('leaving the guild ends what was given for good: coming back does not bring it back', async ({ request }) => {
    expect((await send(request, 'POST', '/deathwatch/doc', DELEGATE, DOC)).status()).toBe(200)
    expect((await request.post(`${MOCK}/__test/leave/${DELEGATE_ID}`)).status()).toBe(200)
    expect((await send(request, 'POST', '/deathwatch/doc', DELEGATE, DOC)).status()).toBe(403)
    expect((await request.post(`${MOCK}/__test/rejoin/${DELEGATE_ID}`)).status()).toBe(200)
    // Back in the guild, joined after the desk was given: it is void, and the server removes it.
    expect((await send(request, 'POST', '/deathwatch/doc', DELEGATE, DOC)).status()).toBe(403)
    expect(await (await get(request, '/deathwatch/me', DELEGATE)).json()).toEqual({ access: false, watchCommander: false, deathwatchCommand: false, roles: [] })
    expect((await (await get(request, '/deathwatch/access', COMMANDER)).json()).people.map((p) => p.id)).not.toContain(DELEGATE_ID)
    // Given again, it works again.
    expect((await send(request, 'POST', '/deathwatch/access', COMMANDER, { discordId: DELEGATE_ID, kind: 'desk' })).status()).toBe(201)
    expect((await send(request, 'POST', '/deathwatch/doc', DELEGATE, DOC)).status()).toBe(200)
    expect((await send(request, 'DELETE', `/deathwatch/access/${DELEGATE_ID}/desk`, COMMANDER)).status()).toBe(200)
    expect((await send(request, 'DELETE', `/deathwatch/access/${DELEGATE_ID}/desk`, COMMANDER)).status()).toBe(404)
    expect((await send(request, 'POST', '/deathwatch/doc', DELEGATE, DOC)).status()).toBe(403)
    await send(request, 'POST', '/deathwatch/doc', COMMANDER, { col: DOC.col, id: DOC.id, op: 'delete' })
  })

  test('CORS: the preflight allows If-None-Match and the response exposes the ETag', async ({ request }) => {
    const pre = await request.fetch(`${API}/deathwatch/data`, {
      method: 'OPTIONS',
      headers: { Origin: SITE, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,if-none-match' },
    })
    expect(pre.status()).toBe(204)
    expect(pre.headers()['access-control-allow-headers'].toLowerCase()).toContain('if-none-match')
    const res = await get(request, '/deathwatch/data', DEATHWATCH, { Origin: SITE })
    expect(res.headers()['access-control-allow-origin']).toBe(SITE)
    expect(res.headers()['access-control-expose-headers']).toBe('ETag')
  })

  test('CORS: a browser on the site can send If-None-Match and read the ETag', async ({ page }) => {
    await page.goto('/')
    const seen = await page.evaluate(
      async ({ url, token }) => {
        const headers = { Authorization: `Bearer ${token}` }
        const res = await fetch(url, { headers })
        const etag = res.headers.get('ETag') // null unless the response exposes it to this origin
        const again = await fetch(url, { headers: { ...headers, 'If-None-Match': etag } })
        return { status: res.status, etag, again: again.status }
      },
      { url: `${API}/deathwatch/data`, token: DEATHWATCH },
    )
    expect(seen.status).toBe(200)
    expect(seen.etag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(seen.again).toBe(304)
  })
})
