// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

const auth = vi.hoisted(() => ({ signedIn: false, signIn: vi.fn() }))
vi.mock('../../stores/auth', () => ({ useAuth: () => auth }))
import DeathwatchBanner from './DeathwatchBanner.vue'

function mountBanner({ router = true } = {}) {
  const r = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  const push = vi.spyOn(r, 'push')
  const w = mount(DeathwatchBanner, { global: { plugins: router ? [r] : [] } })
  return { w, push }
}
// A real click event, so the test can see whether the banner took it over (default prevented) or left it alone.
const click = (w, init = {}) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  w.find('a').element.dispatchEvent(e)
  return e
}

beforeEach(() => {
  auth.signedIn = false
  auth.signIn.mockReset()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('DeathwatchBanner', () => {
  it('is a link to /deathwatch that says REDACTED', () => {
    const { w } = mountBanner()
    const a = w.find('a.dw-banner')
    expect(a.attributes('href')).toBe('/deathwatch')
    expect(a.text()).toBe('REDACTED')
    expect(a.attributes('aria-label')).toBe('REDACTED — Deathwatch access')
  })

  it('fetches nothing', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mountBanner()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs you in, and brings you back to /deathwatch, when you are signed out', () => {
    vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '') // as in production, whatever .env.local says
    const { w, push } = mountBanner()
    const e = click(w)
    expect(auth.signIn).toHaveBeenCalledTimes(1)
    expect(auth.signIn).toHaveBeenCalledWith({ returnTo: '/deathwatch' })
    expect(push).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
    vi.unstubAllEnvs()
  })

  it("dims into the cogitator's scan lines first, then goes in", async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    auth.signedIn = true
    const { w, push } = mountBanner()
    click(w)
    await w.vm.$nextTick()
    expect(document.querySelector('.dw-dim')).not.toBeNull()
    expect(push).not.toHaveBeenCalled()
    click(w) // a second click while it dims changes nothing
    vi.advanceTimersByTime(650)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/deathwatch')
    w.unmount()
    vi.useRealTimers()
  })

  it('goes in at once with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q.includes('reduce') }))
    auth.signedIn = true
    const { w, push } = mountBanner()
    click(w)
    expect(push).toHaveBeenCalledWith('/deathwatch')
    expect(document.querySelector('.dw-dim')).toBeNull()
  })

  it('goes in at once once the boot screen has played this visit', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    sessionStorage.setItem('dw-booted', '1')
    auth.signedIn = true
    const { w, push } = mountBanner()
    click(w)
    expect(push).toHaveBeenCalledWith('/deathwatch')
    expect(document.querySelector('.dw-dim')).toBeNull()
  })

  it('in dev with the Deathwatch fixture, goes straight in without signing in', () => {
    vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '1')
    const { w, push } = mountBanner()
    click(w)
    expect(push).toHaveBeenCalledWith('/deathwatch')
    expect(auth.signIn).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('takes you to /deathwatch through the router when you are signed in', () => {
    auth.signedIn = true
    const { w, push } = mountBanner()
    const e = click(w)
    expect(push).toHaveBeenCalledWith('/deathwatch')
    expect(auth.signIn).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves a click that opens a new tab, a new window or a menu to the browser', () => {
    const modified = [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]
    for (const signedIn of [false, true]) {
      auth.signedIn = signedIn
      const { w, push } = mountBanner()
      for (const init of modified) {
        const e = click(w, init)
        expect(e.defaultPrevented, JSON.stringify(init)).toBe(false)
      }
      expect(auth.signIn).not.toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
    }
  })

  it('leaves a click that something else already handled', () => {
    const { w, push } = mountBanner()
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    e.preventDefault()
    w.find('a').element.dispatchEvent(e)
    expect(auth.signIn).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('is still an ordinary link when there is no router', () => {
    auth.signedIn = true
    const { w } = mountBanner({ router: false })
    expect(click(w).defaultPrevented).toBe(false) // the browser follows the href
    expect(auth.signIn).not.toHaveBeenCalled()
  })
})
