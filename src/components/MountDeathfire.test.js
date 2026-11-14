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
