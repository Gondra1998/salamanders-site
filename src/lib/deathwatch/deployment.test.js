import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../buildsApi', async (real) => ({ ...(await real()), request: vi.fn() }))
import { request } from '../buildsApi'
import { getDeployment, useDeployment, useFaces } from './deployment'

// Invented values only. useDeployment keeps its list for the page's life, so it is asked once in this file; the
// refused case has a file of its own (deployment.refused.test.js), which gets a module of its own.
const MEMBERS = [{ id: '300000000000000001', name: 'Brother Invented', avatar: null }]
const FACES = [{ id: '300000000000000002', name: 'Brother Legion', avatar: null }]
const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '') // as in production, whatever .env.local says
})
afterEach(() => vi.unstubAllEnvs())

describe('getDeployment', () => {
  it('asks the server with the token, never from the HTTP cache, and hands back its members', async () => {
    request.mockResolvedValue({ members: MEMBERS, faces: FACES })
    expect(await getDeployment('tok')).toEqual({ members: MEMBERS, faces: FACES })
    expect(request).toHaveBeenCalledWith('/deathwatch/deployment', { token: 'tok', cache: 'no-store' })
  })

  it('in dev with the fixture, lists the invented players without asking the server', async () => {
    vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '1')
    const { members: list, faces } = await getDeployment('tok')
    expect(faces).toEqual([])
    expect(request).not.toHaveBeenCalled()
    expect(list.map((m) => m.name)).toEqual(expect.arrayContaining(['Brother Orrin', 'Brother Kesh', 'Brother Daval']))
    expect(list.every((m) => /^30000000000000\d{4}$/.test(m.id) && m.avatar === null)).toBe(true)
    expect(new Set(list.map((m) => m.id)).size).toBe(list.length)
  })
})

describe('useDeployment', () => {
  it('takes a server from before the faces as having none', async () => {
    request.mockResolvedValue({ members: MEMBERS })
    expect(await getDeployment('tok')).toEqual({ members: MEMBERS, faces: [] })
  })

  it('fetches once for the whole page and shares the list, and the faces with it', async () => {
    request.mockResolvedValue({ members: MEMBERS, faces: FACES })
    const a = useDeployment()
    expect(a.value).toEqual([]) // empty until it arrives
    await settle()
    expect(useDeployment()).toBe(a)
    expect(a.value).toEqual(MEMBERS)
    expect(useFaces().value).toEqual([...MEMBERS, ...FACES])
    expect(request).toHaveBeenCalledTimes(1)
  })
})
