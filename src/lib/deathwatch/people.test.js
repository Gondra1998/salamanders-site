import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../buildsApi', async (real) => ({ ...(await real()), request: vi.fn() }))
import { request } from '../buildsApi'
import { addAccess, listAccess, removeAccess, searchMembers } from './people'

// Invented values only.
const ID = '300000000000000201'
const ROW = { id: ID, kind: 'desk', name: 'Brother Valen', avatar: null, grantedBy: 'Watch Commander Tor', grantedAt: '2026-06-01T00:00:00.000Z' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '') // as in production, whatever .env.local says
})
afterEach(() => vi.unstubAllEnvs())

describe('against the server', () => {
  it('searches with the query in the address, encoded, never from the HTTP cache', async () => {
    request.mockResolvedValue({ members: [{ id: ID, name: 'Brother Valen', avatar: null }] })
    expect(await searchMembers('tok', 'val & co?')).toEqual([{ id: ID, name: 'Brother Valen', avatar: null }])
    expect(request).toHaveBeenCalledWith('/deathwatch/members?q=val%20%26%20co%3F', { token: 'tok', cache: 'no-store' })
  })

  it('lists who was given what, never from the HTTP cache', async () => {
    request.mockResolvedValue({ people: [ROW] })
    expect(await listAccess('tok')).toEqual([ROW])
    expect(request).toHaveBeenCalledWith('/deathwatch/access', { token: 'tok', cache: 'no-store' })
  })

  it('adds one kind for one person', async () => {
    request.mockResolvedValue({ discordId: ID, kind: 'watchcommand' })
    await addAccess('tok', ID, 'watchcommand')
    expect(request).toHaveBeenCalledWith('/deathwatch/access', { method: 'POST', token: 'tok', body: { discordId: ID, kind: 'watchcommand' } })
  })

  it('removes one kind for one person, both encoded into the address', async () => {
    request.mockResolvedValue({})
    await removeAccess('tok', ID, 'desk')
    expect(request).toHaveBeenCalledWith(`/deathwatch/access/${ID}/desk`, { method: 'DELETE', token: 'tok' })
    await removeAccess('tok', '../x', 'a/b')
    expect(request).toHaveBeenLastCalledWith('/deathwatch/access/..%2Fx/a%2Fb', { method: 'DELETE', token: 'tok' })
  })

  it('passes a refusal on', async () => {
    request.mockRejectedValue(Object.assign(new Error('Not in the server.'), { status: 404 }))
    await expect(addAccess('tok', ID, 'desk')).rejects.toMatchObject({ status: 404, message: 'Not in the server.' })
  })
})

describe('in dev with the fixture', () => {
  beforeEach(() => vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '1'))

  it('searches invented members without asking the server, two of them of one name', async () => {
    const found = await searchMembers('tok', 'ostar')
    expect(found.map((m) => m.name)).toEqual(['Brother Ostar', 'Brother Ostar'])
    expect(new Set(found.map((m) => m.id)).size).toBe(2)
    expect(await searchMembers('tok', 'o')).toEqual([])
    expect(request).not.toHaveBeenCalled()
  })

  it('adds and removes in memory, and lists what is held', async () => {
    const [someone] = await searchMembers('tok', 'kael')
    await addAccess('tok', someone.id, 'watchcommand')
    expect((await listAccess('tok')).filter((r) => r.id === someone.id).map((r) => r.kind)).toEqual(['watchcommand'])
    await addAccess('tok', someone.id, 'watchcommand')
    expect((await listAccess('tok')).filter((r) => r.id === someone.id)).toHaveLength(1)
    await removeAccess('tok', someone.id, 'watchcommand')
    expect((await listAccess('tok')).some((r) => r.id === someone.id)).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
})
