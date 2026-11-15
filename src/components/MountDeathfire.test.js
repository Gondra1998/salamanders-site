// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installFakeCanvas } from '../test-utils/fakeCanvas.js'
import { deathfireHeat } from '../lib/deathfireHeat'
import { loadBaked } from '../lib/deathfire/baked.js'
import { measureCalm } from '../lib/deathfire/calm.js'
import { createScene } from '../lib/deathfire/scene.js'
import { motionAllowed } from '../lib/doomfire'
import MountDeathfire from './MountDeathfire.vue'

// The drawing itself is stood in for: these tests are about the host, which owns the clocks, the page and the
// lifecycle, and tells a scene what to draw. The scene's own tests are in src/lib/deathfire/scene.test.js.
vi.mock('../lib/deathfire/scene.js', () => ({ createScene: vi.fn() }))
vi.mock('../lib/deathfire/baked.js', () => ({ loadBaked: vi.fn() }))
vi.mock('../lib/deathfire/painters.js', () => ({ paintMountain: vi.fn(), paintMoon: vi.fn() }))
vi.mock('../lib/doomfire', async (original) => ({ ...(await original()), motionAllowed: vi.fn(() => true) }))
vi.mock('../lib/deathfire/calm.js', async (original) => ({ ...(await original()), measureCalm: vi.fn() }))

const IMAGE = { picture: 'mountain' }
const MOON = { picture: 'moon' }
const PICTURES = { mountain: { image: IMAGE, meta: { riverU: -0.3 } }, moon: MOON }

let fake
let scenes // every scene the host has built, in order
let wrapper
let router
const Page = { template: '<p>page</p>' }

function setWindow(w, h) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}
function setScroll(y) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}
/** Let what the host is waiting for arrive: the scene's code, the pictures, the page's own updates. */
async function settle() {
  await vi.dynamicImportSettled()
  await flushPromises()
  await flushPromises()
}
/** Let `ms` of time pass, frame by frame. */
const pass = (ms) => vi.advanceTimersByTime(ms)
const scene = () => scenes.at(-1)
/** What the scene was last told about the frame it was asked to draw. */
const lastEnv = () => scene().draw.mock.calls.at(-1)[3]

async function start({ path = '/', routes = [] } = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Page }, { path: '/builds', component: Page }, ...routes],
  })
  router.push(path)
  await router.isReady()
  wrapper = mount(MountDeathfire, { global: { plugins: [router] }, attachTo: document.body })
  await settle()
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
  fake = installFakeCanvas()
  scenes = []
  setWindow(1280, 720)
  setScroll(0)
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  createScene.mockReset().mockImplementation(() => {
    const made = { draw: vi.fn(), erupt: vi.fn(), dispose: vi.fn(), heatNow: vi.fn(() => ({ breathe: 0.6, flare: 0 })), info: {} }
    scenes.push(made)
    return made
  })
  loadBaked.mockReset().mockResolvedValue(PICTURES)
  measureCalm.mockReset().mockReturnValue({ rects: [], scrollY: 0, navBottom: 0 })
  motionAllowed.mockReset().mockReturnValue(true)
  deathfireHeat.breathe = 0.6
  deathfireHeat.flare = 0
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  fake.restore()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('the mountain behind the home page', () => {
  it('builds one scene for the window, from the baked pictures, and draws it', async () => {
    await start()
    expect(loadBaked).toHaveBeenCalledWith('desktop')
    expect(createScene).toHaveBeenCalledTimes(1)
    const [w, h, options] = createScene.mock.calls[0]
    expect([w, h]).toEqual([1280, 720])
    expect(options).toMatchObject({ dpr: 1, faceX: 0.14, flip: true, phoneMax: 768, mountain: PICTURES.mountain, riverU: -0.3, moonImage: MOON })
    expect(options.painter).toBeUndefined()
    expect(options.lakeLevel).toBeCloseTo(0.3, 6)

    pass(50)
    expect(scene().draw).toHaveBeenCalled()
    const [ctx, t, dt, env] = scene().draw.mock.calls.at(-1)
    expect(ctx).toBe(wrapper.find('canvas.deathfire-canvas').element.getContext('2d'))
    expect(t).toBeGreaterThan(0)
    expect(t).toBeLessThan(0.2)
    expect(dt).toBeGreaterThan(0)
    expect(env.moonPhase).toBeTypeOf('number')
    expect(env.calm).toBeTypeOf('function')
    expect(env.lakeLevel).toBeCloseTo(0.3, 2)
    expect(env).toMatchObject({ trial: 0, spill: 0, mirror: false, quiet: false })
    expect(wrapper.find('.deathfire').attributes('data-mode')).toBe('live')
  })

  it('sizes its canvas to the window', async () => {
    await start()
    const cv = wrapper.find('canvas.deathfire-canvas').element
    expect([cv.width, cv.height]).toEqual([1280, 720])
    expect([cv.style.width, cv.style.height]).toEqual(['1280px', '720px'])
  })

  it('waits for the pictures before it builds', async () => {
    let arrive
    loadBaked.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    await start()
    pass(500)
    expect(createScene).not.toHaveBeenCalled()
    arrive(PICTURES)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(1)
    pass(50)
    expect(scene().draw).toHaveBeenCalled()
  })

  it('falls back to painting the mountain itself when the pictures do not load', async () => {
    loadBaked.mockResolvedValue(null)
    await start()
    expect(createScene).toHaveBeenCalledTimes(1)
    const options = createScene.mock.calls[0][2]
    expect(options.painter.paintMountain).toBeTypeOf('function')
    expect(options.painter.paintMoon).toBeTypeOf('function')
    expect(options.mountain).toBeUndefined()
    expect(options.moonImage).toBeUndefined()
    pass(50)
    expect(scene().draw).toHaveBeenCalled()
  })

  it('publishes the mountain\'s heat, for the Archive plaque to breathe with', async () => {
    await start()
    scene().heatNow.mockReturnValue({ breathe: 0.9, flare: 0.4 })
    pass(50)
    expect(deathfireHeat).toEqual({ breathe: 0.9, flare: 0.4 })
  })

  it('throws eruptions on its own timer, the first after three seconds', async () => {
    await start()
    pass(2900)
    expect(scene().erupt).not.toHaveBeenCalled()
    pass(1100)
    expect(scene().erupt).toHaveBeenCalledTimes(1)
    expect(scene().erupt.mock.calls[0][0]).toBeGreaterThanOrEqual(0.55)
    pass(20000)
    expect(scene().erupt.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('fills the lake from a third full, by the scene\'s own time', async () => {
    await start()
    pass(30000)
    expect(lastEnv().lakeLevel).toBeGreaterThan(0.36)
    expect(lastEnv().lakeLevel).toBeLessThan(0.38)
  })

  it('draws no more than thirty frames a second', async () => {
    await start()
    pass(1000)
    // (the test's clock ticks every 16 ms, so the cap lets through every third tick: 20 or 21 a second here)
    expect(scene().draw.mock.calls.length).toBeGreaterThanOrEqual(15)
    expect(scene().draw.mock.calls.length).toBeLessThanOrEqual(31)
  })
})

describe('the window changing size', () => {
  it('builds the scene again once, hands the old one\'s memory back, and does nothing for the same size', async () => {
    await start()
    const first = scene()
    setWindow(1000, 700)
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    pass(50)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(2)
    expect(createScene.mock.calls[1].slice(0, 2)).toEqual([1000, 700])
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(scene().dispose).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('resize'))
    pass(50)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(2)
  })

  it('keeps the lake where it had risen to', async () => {
    await start()
    pass(30000)
    setWindow(1000, 700)
    window.dispatchEvent(new Event('resize'))
    pass(50)
    await settle()
    expect(createScene.mock.calls[1][2].lakeLevel).toBeGreaterThan(0.36)
  })
})

describe('the page\'s text', () => {
  it('is measured for the scene, which is told where the nav bar ends', async () => {
    measureCalm.mockReturnValue({ rects: [{ l: 100, t: 300, r: 500, b: 340 }], scrollY: 0, navBottom: 61 })
    await start()
    pass(50)
    expect(measureCalm).toHaveBeenCalledWith(document, window, expect.anything())
    expect(lastEnv().navBottom).toBe(61)
    expect(lastEnv().calm(300, 320)).toBeCloseTo(0.1, 6)
    expect(lastEnv().calm(300, 500)).toBe(1)
  })

  it('is measured again a few times a second, not every frame', async () => {
    await start()
    pass(2000)
    expect(measureCalm.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(measureCalm.mock.calls.length).toBeLessThanOrEqual(7)
  })

  it('is followed as the page scrolls, between one measuring and the next', async () => {
    measureCalm.mockReturnValue({ rects: [{ l: 100, t: 300, r: 500, b: 340 }], scrollY: 0, navBottom: 61 })
    await start()
    pass(50)
    setScroll(100) // the text has gone up the window by 100 px
    pass(50)
    expect(lastEnv().calm(300, 220)).toBeCloseTo(0.1, 6)
    expect(lastEnv().calm(300, 320)).toBeGreaterThan(0.1)
  })
})

describe('what the live mountain did, and this one must', () => {
  const setHidden = (value) => Object.defineProperty(document, 'hidden', { value, configurable: true })
  afterEach(() => {
    delete document.hidden // (back to jsdom's own)
  })

  it('opened in a hidden tab, draws nothing until it is shown, and time does not leap when it is', async () => {
    setHidden(true)
    await start()
    pass(5000)
    expect(scene().draw).not.toHaveBeenCalled()
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    pass(50)
    expect(scene().draw).toHaveBeenCalled()
    const [, t, , env] = scene().draw.mock.calls[0]
    expect(t).toBeLessThan(0.2)
    expect(env.lakeLevel).toBeLessThan(0.31)
  })

  it('stops drawing while the tab is hidden', async () => {
    await start()
    pass(1000)
    const drawn = scene().draw.mock.calls.length
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    pass(3000)
    expect(scene().draw.mock.calls.length).toBe(drawn)
  })

  it('with reduced motion, draws one still frame, and draws it again on a page change and a resize', async () => {
    motionAllowed.mockReturnValue(false)
    await start()
    expect(wrapper.find('.deathfire').attributes('data-mode')).toBe('still')
    expect(scene().draw).toHaveBeenCalledTimes(1)
    expect(scene().draw.mock.calls[0][1]).toBe(2.5)
    pass(5000)
    expect(scene().draw).toHaveBeenCalledTimes(1)
    expect(scene().erupt).not.toHaveBeenCalled()

    // another page: the same scene, drawn again for it, with that page's text measured
    const measured = measureCalm.mock.calls.length
    await router.push('/builds')
    await settle()
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(scene().draw).toHaveBeenCalledTimes(2)
    expect(lastEnv()).toMatchObject({ mirror: true, quiet: true })
    expect(measureCalm.mock.calls.length).toBe(measured + 1)

    // another size: a new scene, and its one frame
    setWindow(1000, 700)
    window.dispatchEvent(new Event('resize'))
    pass(50)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(2)
    expect(scene().draw).toHaveBeenCalledTimes(1)
    expect(scene().draw.mock.calls[0][1]).toBe(2.5)
    for (const made of scenes) for (const call of made.draw.mock.calls) expect(call[3].trial).toBe(0)
  })

  it('lets ash fall behind the rock and in front of it', async () => {
    await start()
    fake.clear() // (count one frame's painting, not the one drawn as the scene was built)
    pass(50)
    // 460 flakes to 1600 x 1000 px: 265 in this window, two fifths of them in front
    const main = wrapper.find('canvas.deathfire-canvas').element.getContext('2d')
    expect(fake.calls('fillRect', main)).toHaveLength(106)
    expect(main.fillStyle).toBe('#6b6560')
    // the scene is handed the rest, to draw behind the mountain when it gets there
    const behind = { fillRect: vi.fn() }
    lastEnv().behindRock(behind)
    expect(behind.fillRect).toHaveBeenCalledTimes(159)
    // and in front means over the scene, in the page's own left and right: after the scene has drawn
    expect(fake.calls('setTransform', main).at(-1)).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('on a page marked ashOver, lets the front ash fall over the page instead, a shade lighter', async () => {
    await start({ path: '/accolades', routes: [{ path: '/accolades', component: Page, meta: { ashOver: true } }] })
    fake.clear()
    pass(50)
    const veil = wrapper.find('canvas.deathfire-veil').element
    const over = veil.getContext('2d')
    const main = wrapper.find('canvas.deathfire-canvas').element.getContext('2d')
    expect(veil.style.display).not.toBe('none')
    expect([veil.width, veil.height]).toEqual([1280, 720])
    expect(fake.calls('clearRect', over).at(-1)).toEqual([0, 0, 1280, 720])
    expect(fake.calls('fillRect', over)).toHaveLength(106)
    expect(over.fillStyle).toBe('#9a928a')
    expect(fake.calls('fillRect', main)).toHaveLength(0)
  })

  it('keeps the veil out of the way on a page that is not', async () => {
    await start()
    pass(50)
    const veil = wrapper.find('canvas.deathfire-veil').element
    expect(veil.style.display).toBe('none')
    expect(fake.calls('fillRect', veil.getContext('2d'))).toHaveLength(0)
  })

  it('in a Time of Trial, throws the trial\'s own blasts', async () => {
    window.history.replaceState(null, '', '/?trial=3')
    await start()
    pass(8000)
    const blasts = scene().erupt.mock.calls.filter((call) => call[1] === 0.4)
    expect(blasts.length).toBeGreaterThanOrEqual(2)
    for (const [scale] of blasts) {
      expect(scale).toBeGreaterThan(0.9 + 1.2 * 0.2)
      expect(scale).toBeLessThanOrEqual(2.1)
    }
    expect(scene().draw.mock.calls.some((call) => call[3].trial > 0.9)).toBe(true)
  })

  it('cleans up when it goes: no more frames, no more building, and the scene\'s memory handed back', async () => {
    await start()
    pass(100)
    const made = scene()
    const drawn = made.draw.mock.calls.length
    wrapper.unmount()
    wrapper = null
    expect(made.dispose).toHaveBeenCalledTimes(1)
    pass(2000)
    expect(made.draw.mock.calls.length).toBe(drawn)
    setWindow(900, 600)
    window.dispatchEvent(new Event('resize'))
    pass(100)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(1)
  })
})

describe('the same mountain behind every page', () => {
  it('shows an inner page the same scene, mirrored and quiet, and builds nothing for it', async () => {
    await start()
    pass(50)
    const measured = measureCalm.mock.calls.length
    await router.push('/builds')
    await settle()
    pass(100)
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(lastEnv()).toMatchObject({ mirror: true, quiet: true })
    // the new page's text lies elsewhere: it is measured at once, not a third of a second later
    expect(measureCalm.mock.calls.length).toBe(measured + 1)

    await router.push('/')
    await settle()
    pass(100)
    expect(lastEnv()).toMatchObject({ mirror: false, quiet: false })
    expect(createScene).toHaveBeenCalledTimes(1)
  })

  it('never mirrors a phone, and gives it the phone\'s mountain under where the hero\'s text ends', async () => {
    setWindow(390, 844)
    await start({ path: '/builds' })
    expect(loadBaked).toHaveBeenCalledWith('phone')
    const options = createScene.mock.calls[0][2]
    expect(options.faceX).toBeUndefined()
    expect(options.textBottom).toBe(352)
    fake.clear()
    pass(50)
    expect(lastEnv()).toMatchObject({ mirror: false, quiet: true })
    // half as much ash on a phone: 460 x (390 x 844 / 1600000) / 2 = 47 flakes, 19 of them in front
    expect(fake.calls('fillRect', wrapper.find('canvas.deathfire-canvas').element.getContext('2d'))).toHaveLength(19)
  })
})

describe('Deathwatch, which is off planet', () => {
  const deathwatch = { path: '/deathwatch', component: Page, meta: { deathfire: false, ashOver: true } }
  const shown = (selector) => wrapper.find(selector).element.style.display !== 'none'

  it('draws nothing there, ends a trial that was raging, and brings the mountain back on leaving', async () => {
    window.history.replaceState(null, '', '/?trial=3')
    await start({ routes: [deathwatch] })
    pass(8000)
    expect(lastEnv().trial).toBeGreaterThan(0.9)
    expect(shown('.deathfire')).toBe(true)

    await router.push('/deathwatch')
    await settle()
    expect(shown('.deathfire')).toBe(false)
    expect(shown('.deathfire-veil')).toBe(false) // though the page is marked ashOver
    const drawn = scene().draw.mock.calls.length
    const thrown = scene().erupt.mock.calls.length
    pass(3000)
    expect(scene().draw.mock.calls.length).toBe(drawn)
    expect(scene().erupt.mock.calls.length).toBe(thrown)

    await router.push('/')
    await settle()
    pass(100)
    expect(shown('.deathfire')).toBe(true)
    expect(scene().draw.mock.calls.length).toBeGreaterThan(drawn)
    expect(lastEnv().trial).toBe(0)
    expect(createScene).toHaveBeenCalledTimes(1)
  })

  it('opened there, fetches and builds nothing until the visitor leaves for the rest of the site', async () => {
    await start({ path: '/deathwatch', routes: [deathwatch] })
    pass(1000)
    expect(loadBaked).not.toHaveBeenCalled()
    expect(createScene).not.toHaveBeenCalled()
    expect(shown('.deathfire')).toBe(false)

    await router.push('/builds')
    await settle()
    pass(50)
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(scene().draw).toHaveBeenCalled()
    expect(shown('.deathfire')).toBe(true)
  })

  it('shows the veil again on a page marked ashOver that is not Deathwatch', async () => {
    await start({ path: '/deathwatch', routes: [deathwatch, { path: '/accolades', component: Page, meta: { ashOver: true } }] })
    await router.push('/accolades')
    await settle()
    pass(50)
    expect(shown('.deathfire-veil')).toBe(true)
  })
})

describe('a page opened directly, before the router knows which page it is', () => {
  const deathwatch = { path: '/deathwatch', component: { template: '<p>page</p>' }, meta: { deathfire: false, ashOver: true } }
  /** Mount as the app does: at once, with the first navigation still on its way. */
  async function open(path) {
    const history = createMemoryHistory()
    history.replace(path) // the address the browser was opened at
    router = createRouter({
      history,
      routes: [{ path: '/', component: { template: '<p>page</p>' } }, { path: '/builds', component: { template: '<p>page</p>' } }, deathwatch],
    })
    // (installing the router is what starts its first navigation, to wherever the address bar points)
    wrapper = mount(MountDeathfire, { global: { plugins: [router] }, attachTo: document.body })
    await router.isReady()
    await settle()
  }

  it('fetches and builds nothing for a Deathwatch page', async () => {
    await open('/deathwatch')
    pass(500)
    expect(loadBaked).not.toHaveBeenCalled()
    expect(createScene).not.toHaveBeenCalled()
  })

  it('draws an inner page mirrored from its first frame', async () => {
    await open('/builds')
    pass(100)
    expect(createScene).toHaveBeenCalledTimes(1)
    for (const call of scene().draw.mock.calls) expect(call[3]).toMatchObject({ mirror: true, quiet: true })
  })

  it('builds nothing while the page is still being found out, whatever stirs in the meantime', async () => {
    // A browser's resize observer calls back once as soon as it is asked to watch, and a page's own code can take a
    // while to arrive. Neither may start a build for the placeholder page the router shows until it knows.
    let watching = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) {
        watching = callback
      }
      observe() {
        Promise.resolve().then(() => watching([]))
      }
      disconnect() {}
    })
    let arrive
    const slow = { ...deathwatch, component: () => new Promise((resolve) => (arrive = () => resolve({ template: '<p>page</p>' }))) }
    const history = createMemoryHistory()
    history.replace('/deathwatch')
    router = createRouter({ history, routes: [{ path: '/', component: { template: '<p>page</p>' } }, slow] })
    wrapper = mount(MountDeathfire, { global: { plugins: [router] }, attachTo: document.body })
    await settle()
    pass(200) // the observer's first call has come and gone, and frames have run
    await settle()
    expect(loadBaked).not.toHaveBeenCalled()
    expect(createScene).not.toHaveBeenCalled()

    arrive()
    await router.isReady()
    await settle()
    pass(200)
    expect(loadBaked).not.toHaveBeenCalled()
    expect(createScene).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('with reduced motion, still draws its one frame once the page is known', async () => {
    motionAllowed.mockReturnValue(false)
    await open('/builds')
    expect(scene().draw).toHaveBeenCalledTimes(1)
    expect(lastEnv()).toMatchObject({ mirror: true, quiet: true })
  })
})

describe('a phone, where the mountain stands under the home page\'s hero text', () => {
  let buttons
  /** Put the home page's hero on the page, its two buttons ending where the test says (px down the window). */
  function hero(...bottoms) {
    const section = document.createElement('section')
    section.className = 'hero'
    section.innerHTML = '<div class="cta-row"><a>Join</a><a>Perk builder</a></div>'
    buttons = [...section.querySelectorAll('a')]
    buttons.forEach((el, i) => (el.getBoundingClientRect = () => ({ bottom: bottoms[i] })))
    document.body.appendChild(section)
    return section
  }
  const moveTo = (bottom) => (buttons[1].getBoundingClientRect = () => ({ bottom }))
  const textBottoms = () => createScene.mock.calls.map((call) => call[2].textBottom)
  beforeEach(() => setWindow(390, 844))

  it('builds the mountain under the lower button, wherever the page is scrolled to', async () => {
    hero(266, 321)
    setScroll(40) // the buttons are 40 px further down the page than down the window
    await start()
    const options = createScene.mock.calls[0][2]
    expect(options.textBottom).toBe(361)
    expect(options.faceX).toBeUndefined()
    pass(50)
    // the hero's own text is above the mountain now, so it is not text the lava must step aside for
    expect(measureCalm).toHaveBeenLastCalledWith(document, window, { stacked: true })
  })

  it('follows the hero text if it moves after the build, as it does when a font arrives', async () => {
    hero(300, 352)
    await start()
    expect(textBottoms()).toEqual([352])
    moveTo(380)
    pass(600)
    await settle()
    expect(textBottoms()).toEqual([352, 380])
    expect(scenes[0].dispose).toHaveBeenCalledTimes(1)
    // a move of a pixel or two is not worth a new mountain
    moveTo(381.5)
    pass(1500)
    await settle()
    expect(textBottoms()).toEqual([352, 380])
  })

  it('gives up on a page whose text never settles: twelve tries for one size of window, and twelve more for the next', async () => {
    let bottom = 352
    hero(300, 352)
    buttons[1].getBoundingClientRect = () => ({ bottom: (bottom += 5) })
    await start()
    for (let i = 0; i < 40; i++) {
      pass(500)
      await settle()
    }
    expect(createScene).toHaveBeenCalledTimes(13)
    setWindow(360, 740)
    window.dispatchEvent(new Event('resize'))
    for (let i = 0; i < 40; i++) {
      pass(500)
      await settle()
    }
    expect(createScene).toHaveBeenCalledTimes(26)
  })

  it('keeps the home page\'s mountain on the other pages, which have no hero text', async () => {
    const section = hero(309, 361)
    await start()
    expect(textBottoms()).toEqual([361])
    section.remove()
    await router.push('/builds')
    await settle()
    pass(1500)
    await settle()
    expect(textBottoms()).toEqual([361])
    expect(measureCalm).toHaveBeenLastCalledWith(document, window, { stacked: false })
  })

  it('opened on another page, takes where the hero\'s text usually ends, and the real place on reaching home', async () => {
    await start({ path: '/builds' })
    expect(textBottoms()).toEqual([352])
    hero(309, 361)
    await router.push('/')
    await settle()
    pass(600)
    await settle()
    expect(textBottoms()).toEqual([352, 361])
  })

  it('with reduced motion, stands the mountain again once the page\'s fonts have come', async () => {
    motionAllowed.mockReturnValue(false)
    let fontsCome
    Object.defineProperty(document, 'fonts', { value: { ready: new Promise((resolve) => (fontsCome = resolve)) }, configurable: true })
    hero(300, 352)
    await start()
    expect(textBottoms()).toEqual([352])
    moveTo(371)
    fontsCome()
    await settle()
    expect(textBottoms()).toEqual([352, 371])
    expect(scene().draw).toHaveBeenCalledTimes(1)
    delete document.fonts
  })
})

describe('a desktop, where the hero text stands beside the mountain', () => {
  it('does not measure the hero for the mountain, and keeps the lava calm under the hero\'s text', async () => {
    const section = document.createElement('section')
    section.className = 'hero'
    section.innerHTML = '<div class="cta-row"><a>Join</a></div>'
    section.querySelector('a').getBoundingClientRect = () => ({ bottom: 580 })
    document.body.appendChild(section)
    await start()
    pass(600)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(1)
    expect(createScene.mock.calls[0][2].textBottom).toBeUndefined()
    expect(measureCalm).toHaveBeenLastCalledWith(document, window, { stacked: false })
  })
})

describe('on the dev server', () => {
  it('leaves the scene where it can be looked at, for measuring what a build and a frame cost', async () => {
    await start()
    expect(window.__deathfire.scene).toBe(scene())
    setWindow(1000, 700)
    window.dispatchEvent(new Event('resize'))
    pass(50)
    await settle()
    expect(window.__deathfire.scene).toBe(scene())
    wrapper.unmount()
    wrapper = null
    expect(window.__deathfire).toBeUndefined()
  })
})

describe('found by the review before the merge', () => {
  const resizeTo = async (w, h) => {
    setWindow(w, h)
    window.dispatchEvent(new Event('resize'))
    pass(50)
    await settle()
  }

  it('does not land a scene nobody wants any more: the window went back before the other kind\'s pictures came', async () => {
    await start() // a desktop's scene, built
    let arrive
    loadBaked.mockImplementation((kind) => (kind === 'phone' ? new Promise((resolve) => (arrive = resolve)) : Promise.resolve(PICTURES)))
    await resizeTo(390, 844) // turned to a phone's shape: its pictures are slow to come
    expect(createScene).toHaveBeenCalledTimes(1)
    await resizeTo(1280, 720) // and turned back before they did
    arrive(PICTURES)
    await settle()
    pass(100)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(1)
    const cv = wrapper.find('canvas.deathfire-canvas').element
    expect([cv.width, cv.height]).toEqual([1280, 720])
    expect([cv.style.width, cv.style.height]).toEqual(['1280px', '720px'])
  })

  it('still builds for the other kind when the window stays that way', async () => {
    await start()
    let arrive
    loadBaked.mockImplementation((kind) => (kind === 'phone' ? new Promise((resolve) => (arrive = resolve)) : Promise.resolve(PICTURES)))
    await resizeTo(390, 844)
    arrive(PICTURES)
    await settle()
    expect(createScene).toHaveBeenCalledTimes(2)
    expect(createScene.mock.calls[1].slice(0, 2)).toEqual([390, 844])
  })

  it('draws a scene as soon as it is built, so a new size never shows an empty canvas for a frame', async () => {
    await start()
    // (sizing a canvas empties it: the frame that would have filled it has already run by then)
    expect(scene().draw).toHaveBeenCalledTimes(1)
    expect(scene().erupt).not.toHaveBeenCalled()
    await resizeTo(1000, 700)
    expect(createScene).toHaveBeenCalledTimes(2)
    expect(scene().draw).toHaveBeenCalledTimes(1)
  })

  describe('a phone that asked for reduced motion, going home from another page', () => {
    // The home page's own hero, drawn by the router as on the site, its lower button ending 372 px down.
    const Home = { template: '<section class="hero"><div class="cta-row"><a class="one">Join</a><a class="two">Perk builder</a></div></section>' }
    const Site = { components: { MountDeathfire }, template: '<MountDeathfire /><RouterView />' }
    let rects
    beforeEach(() => {
      setWindow(360, 740)
      rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return { bottom: this.classList.contains('two') ? 372 : this.classList.contains('one') ? 320 : 0 }
      })
    })
    afterEach(() => rects.mockRestore())
    async function openSite(path) {
      router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }, { path: '/builds', component: Page }] })
      router.push(path)
      await router.isReady()
      wrapper = mount(Site, { global: { plugins: [router] }, attachTo: document.body })
      await settle()
    }
    const textBottoms = () => createScene.mock.calls.map((call) => call[2].textBottom)

    it('stands the mountain under the home page\'s real buttons, not where they usually are', async () => {
      motionAllowed.mockReturnValue(false)
      await openSite('/builds')
      expect(textBottoms()).toEqual([309]) // no hero on this page: where its text usually ends, at this height
      await router.push('/')
      await settle()
      expect(textBottoms()).toEqual([309, 372])
      expect(scene().draw).toHaveBeenCalledTimes(1)
    })

    it('and with motion on, does so at once, without waiting to notice', async () => {
      await openSite('/builds')
      await router.push('/')
      await settle()
      expect(textBottoms()).toEqual([309, 372])
    })
  })
})
