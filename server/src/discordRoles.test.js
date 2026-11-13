import { describe, it, expect } from 'vitest'
import { createDiscordRoles, Upstream } from './discordRoles'

const GUILD = '1322056087792521269'
const USER = '300000000000000001'
const ADMIN_ROLE = '111111111111111111'
const PLAIN_ROLE = '222222222222222222'

function discord(routes) {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push([url, init.headers.Authorization])
    const r = routes[url.replace('https://d.test/api', '')] || { status: 404, body: {} }
    // `raw` hands back a body as given (to model a reply that is not JSON); otherwise `body` is serialised.
    return new Response(r.raw ?? JSON.stringify(r.body), { status: r.status })
  }
  return { fetchImpl, seen }
}
const make = (routes, over = {}) => {
  const d = discord(routes)
  return { d, roles: createDiscordRoles({ fetchImpl: d.fetchImpl, apiBase: 'https://d.test/api', guildId: GUILD, botToken: 'bot', ...over }) }
}
const req = (auth) => new Request('https://x.test', { headers: auth ? { Authorization: auth } : {} })
const guild = (over = {}) => ({
  status: 200,
  body: { owner_id: '9', roles: [{ id: GUILD, permissions: '0' }, { id: ADMIN_ROLE, permissions: String(0x8 | 0x20) }, { id: PLAIN_ROLE, permissions: '2048' }], ...over },
})

describe('identify', () => {
  it('returns the Discord user for a good token', async () => {
    const { roles, d } = make({ '/users/@me': { status: 200, body: { id: USER, username: 'u' } } })
    expect(await roles.identify(req('Bearer tok'))).toEqual({ id: USER, username: 'u' })
    expect(d.seen[0][1]).toBe('Bearer tok')
  })

  it('is null without a token or when Discord rejects it', async () => {
    const { roles } = make({ '/users/@me': { status: 401, body: {} } })
    expect(await roles.identify(req())).toBeNull()
    expect(await roles.identify(req('Basic x'))).toBeNull()
    expect(await roles.identify(req('Bearer tok'))).toBeNull()
  })

  // A header value handed to identify exactly as given. A real Request would trim a trailing newline
  // (and refuse an embedded one) before identify ever saw it, so the value is faked at headers.get.
  const rawAuth = (value) => ({ headers: { get: () => value } })
  const DISCORD_MUST_NOT_BE_ASKED = () => {
    throw new Error('Discord was asked about a malformed Authorization header')
  }

  it.each([
    ['empty', ''],
    ['absent', null],
    ['the Basic scheme', 'Basic abc'],
    ['no token and no space', 'Bearer'],
    ['no token after the space', 'Bearer '],
    ['a lower-case scheme', 'bearer abc'],
    ['an upper-case scheme', 'BEARER abc'],
    ['a token with a space in it', 'Bearer a b'],
    ['a leading space', ' Bearer abc'],
    ['two spaces after the scheme', 'Bearer  abc'],
    ['a trailing space', 'Bearer abc '],
    ['a token over 512 characters', `Bearer ${'a'.repeat(513)}`],
    ['a trailing newline', 'Bearer abc\n'],
    ['a trailing carriage return', 'Bearer abc\r'],
    ['a newline inside the token', 'Bearer a\nb'],
    ['a tab inside the token', 'Bearer a\tb'],
    ['a quote inside the token', 'Bearer a"b'],
    ['a second Bearer token', 'Bearer abc, Bearer def'],
  ])('is null, and Discord is never asked, for an Authorization header that is %s', async (_, value) => {
    const roles = createDiscordRoles({
      fetchImpl: DISCORD_MUST_NOT_BE_ASKED,
      apiBase: 'https://d.test/api',
      guildId: GUILD,
      botToken: 'bot',
    })
    await expect(roles.identify(rawAuth(value))).resolves.toBeNull()
  })

  it('does ask Discord at the longest token the check allows (512 characters)', async () => {
    const { roles, d } = make({ '/users/@me': { status: 200, body: { id: USER, username: 'u' } } })
    const token = 'a'.repeat(512)
    expect(await roles.identify(rawAuth(`Bearer ${token}`))).toEqual({ id: USER, username: 'u' })
    expect(d.seen[0][1]).toBe(`Bearer ${token}`)
  })

  it('throws Upstream on odd answers and when unconfigured', async () => {
    await expect(make({ '/users/@me': { status: 500, body: {} } }).roles.identify(req('Bearer t'))).rejects.toBeInstanceOf(Upstream)
    await expect(make({ '/users/@me': { status: 200, body: { id: 'x' } } }).roles.identify(req('Bearer t'))).rejects.toBeInstanceOf(Upstream)
    await expect(make({}, { botToken: '' }).roles.identify(req('Bearer t'))).rejects.toBeInstanceOf(Upstream)
  })

  // What Discord's answer to GET /users/@me means. These are the only checks standing between a
  // token and a user id on the archive key and on /membership, so each odd answer is pinned alone.
  const me = (route) => make({ '/users/@me': route }).roles.identify(req('Bearer tok'))

  it('is null when Discord says the token is not accepted (401 or 403)', async () => {
    await expect(me({ status: 401, body: { message: '401: Unauthorized' } })).resolves.toBeNull()
    await expect(me({ status: 403, body: { message: 'Missing Access' } })).resolves.toBeNull()
  })

  it.each([
    ['rate limited (429)', { status: 429, body: { message: 'You are being rate limited.' } }],
    ['a server error (500) that still carries a valid user id', { status: 500, body: { id: USER, username: 'u' } }],
    ['a server error (502)', { status: 502, body: {} }],
    ['an accepted-but-not-ready answer (202) with a valid user id', { status: 202, body: { id: USER, username: 'u' } }],
    ['a redirect-range status (301) with a valid user id', { status: 301, body: { id: USER, username: 'u' } }],
    ['a body that is not JSON', { status: 200, raw: '<html>bad gateway</html>' }],
    ['an empty body', { status: 200, raw: '' }],
    ['a JSON null body', { status: 200, raw: 'null' }],
    ['a JSON body with no id', { status: 200, body: { username: 'u' } }],
    ['an id that is null', { status: 200, body: { id: null, username: 'u' } }],
    ['an empty-string id', { status: 200, body: { id: '', username: 'u' } }],
    ['an id that is not digits', { status: 200, body: { id: 'x', username: 'u' } }],
    ['an id with a non-digit character in it', { status: 200, body: { id: '30000000000000000a', username: 'u' } }],
    ['an id with a trailing newline', { status: 200, body: { id: `${USER}\n`, username: 'u' } }],
    ['an id that is too short (16 digits)', { status: 200, body: { id: '3000000000000001', username: 'u' } }],
    ['an id that is too long (21 digits)', { status: 200, body: { id: '300000000000000000001', username: 'u' } }],
    ['an id sent as a short number', { status: 200, body: { id: 12345, username: 'u' } }],
    ['an id sent as a number too large to be a snowflake', { status: 200, body: { id: 3e20, username: 'u' } }],
    // JavaScript rounds an 18-digit JSON number, so the digits that survive name a different person.
    ['an 18-digit id sent as a number, which JavaScript rounds', { status: 200, raw: '{"id": 300000000000000001, "username": "u"}' }],
    ['an 18-digit id sent as a number that happens to be exact', { status: 200, raw: '{"id": 300000000000000000, "username": "u"}' }],
  ])('throws Upstream, not null and not a user, on %s', async (_, route) => {
    await expect(me(route)).rejects.toBeInstanceOf(Upstream)
  })

  it.each([
    ['17 digits', '30000000000000001'],
    ['20 digits', '30000000000000000001'],
  ])('accepts a snowflake of %s, the edges of the allowed length', async (_, id) => {
    await expect(me({ status: 200, body: { id, username: 'u' } })).resolves.toEqual({ id, username: 'u' })
  })

  it('names the user by id when Discord sends no username', async () => {
    await expect(me({ status: 200, body: { id: USER } })).resolves.toEqual({ id: USER, username: USER })
  })
})

describe('rolesOf', () => {
  it('returns roles with the bot token, null when not in the guild', async () => {
    const { roles, d } = make({ [`/v10/guilds/${GUILD}/members/${USER}`]: { status: 200, body: { roles: [PLAIN_ROLE] } } })
    expect(await roles.rolesOf(USER)).toEqual([PLAIN_ROLE])
    expect(d.seen[0][1]).toBe('Bot bot')
    expect(await roles.rolesOf('1')).toBeNull()
  })

  // What the bot's answer about one member means. Only a 200 with a roles array is a member;
  // only a 404 is a non-member; anything else must not read as either.
  const member = (route) => make({ [`/v10/guilds/${GUILD}/members/${USER}`]: route }).roles.rolesOf(USER)

  it('returns the roles array unchanged, including an empty one', async () => {
    await expect(member({ status: 200, body: { roles: [PLAIN_ROLE, ADMIN_ROLE] } })).resolves.toEqual([PLAIN_ROLE, ADMIN_ROLE])
    await expect(member({ status: 200, body: { roles: [] } })).resolves.toEqual([])
  })

  it.each([
    ['403 (the bot cannot see the guild)', { status: 403, body: { message: 'Missing Access' } }],
    ['403 with a roles array in the body', { status: 403, body: { roles: [PLAIN_ROLE] } }],
    ['429 (rate limited)', { status: 429, body: { message: 'You are being rate limited.' } }],
    ['500 with a roles array in the body', { status: 500, body: { roles: [PLAIN_ROLE] } }],
    ['202 with a roles array in the body', { status: 202, body: { roles: [PLAIN_ROLE] } }],
    ['401 (the bot token is rejected)', { status: 401, body: {} }],
    ['200 with a body that is not JSON', { status: 200, raw: '<html>bad gateway</html>' }],
    ['200 with a JSON null body', { status: 200, raw: 'null' }],
    ['200 with no roles key', { status: 200, body: { user: { id: USER } } }],
    ['200 with roles null', { status: 200, body: { roles: null } }],
    ['200 with roles a string', { status: 200, body: { roles: PLAIN_ROLE } }],
    ['200 with roles an object', { status: 200, body: { roles: { 0: PLAIN_ROLE, length: 1 } } }],
  ])('throws Upstream, not null and not a role list, on %s', async (_, route) => {
    await expect(member(route)).rejects.toBeInstanceOf(Upstream)
  })
})

describe('isAdmin', () => {
  const route = (g) => ({ [`/v10/guilds/${GUILD}`]: g })
  it('is true for an Administrator role or the owner', async () => {
    expect(await make(route(guild())).roles.isAdmin(USER, [ADMIN_ROLE])).toBe(true)
    expect(await make(route(guild({ owner_id: USER }))).roles.isAdmin(USER, [])).toBe(true)
  })

  it('is false for roles without the bit, and honours @everyone', async () => {
    expect(await make(route(guild())).roles.isAdmin(USER, [PLAIN_ROLE])).toBe(false)
    const everyoneAdmin = guild({ roles: [{ id: GUILD, permissions: '8' }] })
    expect(await make(route(everyoneAdmin)).roles.isAdmin(USER, [])).toBe(true)
  })

  it('treats malformed permissions as none and a failed guild fetch as Upstream', async () => {
    expect(await make(route(guild({ roles: [{ id: ADMIN_ROLE, permissions: '8x' }] }))).roles.isAdmin(USER, [ADMIN_ROLE])).toBe(false)
    await expect(make({}).roles.isAdmin(USER, [])).rejects.toBeInstanceOf(Upstream)
  })
})

describe('Discord unreachable', () => {
  const unreachable = (fetchImpl, over = {}) =>
    createDiscordRoles({ fetchImpl, apiBase: 'https://d.test/api', guildId: GUILD, botToken: 'bot', ...over })
  const hang = (_url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))

  it.each([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['an abort', () => Promise.reject(new DOMException('aborted', 'AbortError'))],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
  ])('throws Upstream, not the raw error, on %s', async (_, fetchImpl) => {
    const roles = unreachable(fetchImpl)
    await expect(roles.identify(req('Bearer tok'))).rejects.toBeInstanceOf(Upstream)
    await expect(roles.rolesOf(USER)).rejects.toBeInstanceOf(Upstream)
    await expect(roles.isAdmin(USER, [])).rejects.toBeInstanceOf(Upstream)
  })

  it('throws Upstream when Discord never answers within the timeout', async () => {
    await expect(unreachable(hang, { timeoutMs: 20 }).rolesOf(USER)).rejects.toBeInstanceOf(Upstream)
  })

  it('does not carry the request url, and so the user id, into the error', async () => {
    const fetchImpl = () => Promise.reject(new TypeError(`fetch failed: https://d.test/api/v10/guilds/${GUILD}/members/${USER}`))
    const err = await unreachable(fetchImpl).rolesOf(USER).catch((e) => e)
    expect(err).toBeInstanceOf(Upstream)
    expect(err.message).not.toContain(USER)
  })

  it('throws Upstream when the body stream fails mid-read', async () => {
    const broken = new Response(new ReadableStream({ start: (c) => c.error(new Error('reset')) }), { status: 200 })
    // an unreadable body is a null body, so a good status with no roles is the odd answer Upstream already covers
    await expect(unreachable(async () => broken).rolesOf(USER)).rejects.toBeInstanceOf(Upstream)
  })
})

describe('memberOf', () => {
  const at = (route) => make({ [`/v10/guilds/${GUILD}/members/${USER}`]: route }).roles.memberOf(USER)

  it('returns the roles and when they joined, with the bot token', async () => {
    const { roles, d } = make({ [`/v10/guilds/${GUILD}/members/${USER}`]: { status: 200, body: { roles: [PLAIN_ROLE], joined_at: '2025-01-01T00:00:00.000000+00:00' } } })
    expect(await roles.memberOf(USER)).toEqual({ roles: [PLAIN_ROLE], joinedAt: '2025-01-01T00:00:00.000000+00:00' })
    expect(d.seen[0][1]).toBe('Bot bot')
  })

  it('is null for someone not in the guild', async () => {
    await expect(at({ status: 404, body: { message: 'Unknown Member' } })).resolves.toBeNull()
  })

  it('has no join date unless it is a string', async () => {
    for (const joined_at of [undefined, null, 1735689600000, {}]) {
      await expect(at({ status: 200, body: { roles: [], joined_at } })).resolves.toEqual({ roles: [], joinedAt: null })
    }
  })

  it.each([
    ['500', { status: 500, body: { roles: [PLAIN_ROLE] } }],
    ['403', { status: 403, body: {} }],
    ['200 without a roles array', { status: 200, body: { roles: 'x', joined_at: '2025-01-01T00:00:00Z' } }],
    ['200 with a body that is not JSON', { status: 200, raw: 'nope' }],
  ])('a %s is a failure, never an answer', async (_, route) => {
    await expect(at(route)).rejects.toBeInstanceOf(Upstream)
  })

  it('a network failure is a failure', async () => {
    const roles = createDiscordRoles({ fetchImpl: async () => { throw new Error('down') }, apiBase: 'https://d.test/api', guildId: GUILD, botToken: 'bot' })
    await expect(roles.memberOf(USER)).rejects.toBeInstanceOf(Upstream)
  })
})

describe('guildAdmins', () => {
  const read = (route) => make({ [`/v10/guilds/${GUILD}`]: route }).roles.guildAdmins()

  it('names the owner and the roles that carry the Administrator permission', async () => {
    await expect(read(guild())).resolves.toEqual({ ownerId: '9', adminRoleIds: [ADMIN_ROLE], everyoneAdmin: false })
  })

  it('says when @everyone itself carries it, without listing it as a role', async () => {
    await expect(read(guild({ roles: [{ id: GUILD, permissions: '8' }, { id: PLAIN_ROLE, permissions: '0' }] }))).resolves.toEqual({
      ownerId: '9',
      adminRoleIds: [],
      everyoneAdmin: true,
    })
  })

  it('counts the bit only, and anything that is not digits as no permissions', async () => {
    const roles = [
      { id: '200000000000000001', permissions: String(0x8n | (1n << 40n)) },
      { id: '200000000000000002', permissions: String(0x7) },
      { id: '200000000000000003', permissions: '8x' },
      { id: '200000000000000004', permissions: null },
      { id: '200000000000000005' },
      null,
      { permissions: '8' },
    ]
    await expect(read(guild({ roles }))).resolves.toEqual({ ownerId: '9', adminRoleIds: ['200000000000000001'], everyoneAdmin: false })
  })

  it('has no owner unless the owner id is a string', async () => {
    await expect(read(guild({ owner_id: 9 }))).resolves.toMatchObject({ ownerId: null })
  })

  it.each([
    ['500', { status: 500, body: {} }],
    ['200 without a roles list', { status: 200, body: { owner_id: '9' } }],
  ])('a %s is a failure', async (_, route) => {
    await expect(read(route)).rejects.toBeInstanceOf(Upstream)
  })
})
