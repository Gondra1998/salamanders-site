// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, onMounted } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

// Real auth and Deathwatch stores and a real router: only the network, the dev fixture and the redirect to
// Discord are replaced, so token expiry and sign-out go through the code that runs for real.
vi.mock('../../lib/deathwatch/api', () => ({ getMe: vi.fn() }))
vi.mock('../../lib/deathwatch/fixture', () => ({ loadFixture: vi.fn() }))
vi.mock('../../lib/discordAuth', async (orig) => ({ ...(await orig()), beginSignIn: vi.fn() }))
import { getMe } from '../../lib/deathwatch/api'
import { loadFixture } from '../../lib/deathwatch/fixture'
import { beginSignIn } from '../../lib/discordAuth'
import { useAuth } from '../../stores/auth'
import { useDeathwatch } from '../../stores/deathwatch'
import DeathwatchGate from './DeathwatchGate.vue'

const MEMBER_KEY = 'salamanders-discord-member'
// Invented values only. `isMember` is the Legion list's hint, which the gate must never consult.
const storeMember = ({ isMember = true, expiresAt = Date.now() + 3_600_000 } = {}) =>
  localStorage.setItem(
    MEMBER_KEY,
    JSON.stringify({ id: '100000000000000001', username: 'invented', isMember, checkedAt: Date.now(), accessToken: 'tok', expiresAt }),
  )
const apiError = (status) => Object.assign(new Error('nope'), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const settle = async (w) => {
  await new Promise((r) => setTimeout(r, 0))
  await w.vm.$nextTick()
}

const PAGE = '/deathwatch/eventtracker/players?x=1'
const slotMounted = vi.fn()
const Probe = defineComponent({
  setup() {
    onMounted(slotMounted)
    return () => h('p', { class: 'page' }, 'the page')
  },
})

// `before` runs once the stores exist and before the gate mounts: it sets up what an earlier visit left behind.
async function mountGate({ before } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  before?.()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  router.push(PAGE)
  await router.isReady()
  const w = mount(DeathwatchGate, { slots: { default: () => h(Probe) }, global: { plugins: [pinia, router] } })
  await settle(w)
  return w
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.resetAllMocks()
  slotMounted.mockClear()
  loadFixture.mockResolvedValue(null)
})

describe('DeathwatchGate: signed out', () => {
  it('asks for sign-in, and never asks the server who you are', async () => {
    const w = await mountGate()
    expect(w.text()).toContain('Watch Fortress Ebonhold')
    expect(w.text()).toContain('Clearance required. Sign in with Discord to be verified.')
    expect(w.find('button').text()).toBe('Sign in with Discord')
    expect(w.find('button').classes()).toContain('btn-ember')
    expect(getMe).not.toHaveBeenCalled()
    expect(slotMounted).not.toHaveBeenCalled()
  })

  it('brings you back to the page you were on', async () => {
    const w = await mountGate()
    await w.find('button').trigger('click')
    expect(beginSignIn).toHaveBeenCalledWith({ returnTo: PAGE })
  })

  it('treats a stored member whose token has expired as signed out, without asking the server', async () => {
    storeMember({ expiresAt: Date.now() - 1000 })
    const w = await mountGate()
    expect(w.text()).toContain('Clearance required.')
    expect(getMe).not.toHaveBeenCalled()
    expect(slotMounted).not.toHaveBeenCalled()
  })
})

describe('DeathwatchGate: checking', () => {
  it('says it is verifying, marked busy, and shows nothing of the page until the answer', async () => {
    storeMember()
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    const w = await mountGate()
    expect(w.text()).toContain('Verifying clearance…')
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
    expect(slotMounted).not.toHaveBeenCalled()

    d.resolve({ access: true, watchCommander: false })
    await settle(w)
    expect(w.find('.page').exists()).toBe(true)
    expect(w.text()).not.toContain('Verifying clearance')
  })
})

describe('DeathwatchGate: allowed and denied', () => {
  it('shows the page to someone with access', async () => {
    storeMember()
    getMe.mockResolvedValue({ access: true, watchCommander: false })
    const w = await mountGate()
    expect(w.find('.page').text()).toBe('the page')
    expect(getMe).toHaveBeenCalledWith('tok')
    expect(w.find('button').exists()).toBe(false)
  })

  it('shows the page to a Deathwatch member who is not on the Legion list', async () => {
    // The Legion list is only a hint for other pages; the Deathwatch gate trusts the server alone.
    storeMember({ isMember: false })
    getMe.mockResolvedValue({ access: true, watchCommander: false })
    const w = await mountGate()
    expect(w.find('.page').exists()).toBe(true)
  })

  it('keeps the page out for a Legion member the server does not clear', async () => {
    storeMember({ isMember: true })
    getMe.mockResolvedValue({ access: false, watchCommander: false })
    const w = await mountGate()
    expect(w.text()).toContain(
      'Your clearance is not on record. Access is held by the Deathwatch and by those the Watch Commander has cleared.',
    )
    expect(slotMounted).not.toHaveBeenCalled()
    expect(w.find('.page').exists()).toBe(false)
  })

  it('goes back to asking for sign-in when you sign out', async () => {
    storeMember()
    getMe.mockResolvedValue({ access: true, watchCommander: true })
    const w = await mountGate()
    expect(w.find('.page').exists()).toBe(true)

    useAuth().signOut()
    await settle(w)
    expect(w.find('.page').exists()).toBe(false)
    expect(w.text()).toContain('Clearance required.')
  })
})

describe('DeathwatchGate: a clearance left over from an earlier visit', () => {
  // The Deathwatch store outlives the gate: you can leave /deathwatch cleared, let the token lapse or lose the
  // role, and come back. The old clearance must not mount the page, even for the instant before the re-check.
  const leftOver = () => useDeathwatch().$patch({ status: 'allowed', commander: true })

  it('does not mount the page while it checks again, with no token', async () => {
    const w = await mountGate({ before: leftOver })
    expect(slotMounted).not.toHaveBeenCalled()
    expect(w.find('.page').exists()).toBe(false)
    expect(w.text()).toContain('Clearance required.')
  })

  it('does not mount the page while it checks again, and drops the old commander', async () => {
    storeMember()
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    const w = await mountGate({ before: leftOver })
    expect(slotMounted).not.toHaveBeenCalled()
    expect(useDeathwatch().commander).toBe(false)

    d.resolve({ access: false, watchCommander: false })
    await settle(w)
    expect(w.find('.page').exists()).toBe(false)
    expect(w.text()).toContain('Your clearance is not on record.')
  })
})

describe('DeathwatchGate: the server cannot be reached', () => {
  it('says so, as an alert, and lets you try again', async () => {
    storeMember()
    getMe.mockRejectedValueOnce(apiError(503))
    const w = await mountGate()
    expect(w.find('[role="alert"]').text()).toBe('The fortress could not be reached. Try again in a moment.')
    expect(slotMounted).not.toHaveBeenCalled()
    expect(w.find('button').text()).toBe('Try again')

    getMe.mockResolvedValueOnce({ access: true, watchCommander: false })
    await w.find('button').trigger('click')
    await settle(w)
    expect(getMe).toHaveBeenCalledTimes(2)
    expect(w.find('.page').exists()).toBe(true)
  })
})

describe("DeathwatchGate: the cogitator's wake", () => {
  // matchMedia stands for a real browser (jsdom has none, so the other tests see no wake); `reduce` for its setting.
  const motion = (reduce) => vi.stubGlobal('matchMedia', (q) => ({ matches: reduce && q.includes('reduce') }))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('runs its checks over the page, ends on the real answer, and fades once', async () => {
    motion(false)
    vi.useFakeTimers()
    storeMember()
    getMe.mockResolvedValue({ access: true, watchCommander: true })
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    router.push(PAGE)
    await router.isReady()
    const w = mount(DeathwatchGate, { slots: { default: () => h(Probe) }, global: { plugins: [pinia, router] } })
    await vi.advanceTimersByTimeAsync(0)
    expect(w.find('.dwb').exists()).toBe(true)
    expect(w.find('.page').exists()).toBe(true) // the page is already behind it
    expect(w.find('.dwb-big').text()).toBe('Waking the machine spirit_')

    await vi.advanceTimersByTimeAsync(1000 + 4 * 500) // the vox log, four rites (1–3 s)
    expect(w.find('.dwb-ident b').text()).toBe('invented')
    expect(w.findAll('.dwb-log li.on')).toHaveLength(5)
    expect(w.findAll('.dwb-log li').at(-1).text()).toContain('granted')

    await vi.advanceTimersByTimeAsync(700) // hold (to 3.7 s)
    expect(w.find('.dwb-big').text()).toBe('The gate is open')
    expect(w.find('.dwb-small').text()).toBe('Welcome to the Vigil')
    await vi.advanceTimersByTimeAsync(1900 + 400) // open to 5.6 s, then a short fade (six seconds in all)
    expect(w.find('.dwb').exists()).toBe(false)
    expect(sessionStorage.getItem('dw-booted')).toBe('1')
  })

  it('plays once per visit', async () => {
    motion(false)
    storeMember()
    getMe.mockResolvedValue({ access: true, watchCommander: false })
    sessionStorage.setItem('dw-booted', '1')
    expect((await mountGate()).find('.dwb').exists()).toBe(false)
  })

  it('shuts the gate when refused, and stays with a way back', async () => {
    motion(false)
    vi.useFakeTimers()
    storeMember()
    getMe.mockResolvedValue({ access: false, watchCommander: false })
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
    router.push(PAGE)
    await router.isReady()
    const w = mount(DeathwatchGate, { slots: { default: () => h(Probe) }, global: { plugins: [pinia, router] } })
    await vi.advanceTimersByTimeAsync(1000 + 4 * 500)
    expect(w.findAll('.dwb-log li').at(-1).text()).toContain('withheld')
    await vi.advanceTimersByTimeAsync(700 + 5000)
    expect(w.find('.dwb').classes()).toContain('shut')
    expect(w.find('.dwb-big').text()).toBe('The gate stays shut')
    expect(w.find('.dwb-back').attributes('href')).toBe('/companies')
    expect(w.find('.page').exists()).toBe(false)
  })

  it('steps aside at once when signed out', async () => {
    motion(false)
    const w = await mountGate()
    expect(w.find('.dwb').exists()).toBe(false)
    expect(w.text()).toContain('Sign in with Discord')
  })

  it('never plays with reduced motion', async () => {
    storeMember()
    getMe.mockResolvedValue({ access: true, watchCommander: false })
    motion(true)
    expect((await mountGate()).find('.dwb').exists()).toBe(false)
  })
})
