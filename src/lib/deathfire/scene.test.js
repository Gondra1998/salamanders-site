// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeCanvas } from '../../test-utils/fakeCanvas.js'
import { mulberry32 } from './noise.js'
import { createScene } from './scene.js'

// A baked mountain and moon, stood in for: the scene only places them, it never looks inside.
const MOUNTAIN = { image: { width: 10, height: 10 }, meta: { H: 500, peakX: 0, rimY: 0, x: 0, y: 0, w: 10, h: 10, riverU: -0.36 } }
const PICTURES = { mountain: MOUNTAIN, riverU: MOUNTAIN.meta.riverU, moonImage: { width: 10, height: 10 } }
const W = 1280
const H = 720
const desktop = (more = {}) => createScene(W, H, { dpr: 1, faceX: 0.14, flip: true, phoneMax: 768, ...PICTURES, ...more })

let fake
let realRandom
beforeAll(() => {
  fake = installFakeCanvas()
})
afterAll(() => fake.restore())
beforeEach(() => {
  realRandom = Math.random
  Math.random = mulberry32(7) // the fires and the sparks come out the same every time
  fake.clear()
})
afterEach(() => {
  Math.random = realRandom
})

/** A canvas of the page's size and its (stand-in) context, as the host has. */
function page() {
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  return cv.getContext('2d')
}
const shape = (info) => ({ peakX: info.peakX, rimY: info.rimY, H: info.H, ch: info.ch, shoreY: info.shoreY, breach: info.breach, tipY: info.tipY, inlet: info.inlet, riverPath: info.riverPath })

describe('the mountain', () => {
  it('is the same mountain for the same seed', () => {
    const a = shape(desktop().info)
    Math.random = mulberry32(99) // (chance is for what moves: it has no say in the mountain's shape)
    const b = shape(desktop().info)
    expect(a.riverPath).toHaveLength(41)
    expect(b).toEqual(a)
  })

  it('sends its river downhill from the breach to the lake', () => {
    const { riverPath, breach, inlet } = desktop().info
    const [x0, y0] = riverPath[0]
    const [x1, y1] = riverPath[40]
    expect(Math.hypot(x0 - breach.x, y0 - breach.y)).toBeLessThan(2)
    expect(Math.hypot(x1 - inlet.x, y1 - inlet.y)).toBeLessThan(2)
    for (let i = 1; i < riverPath.length; i++) expect(riverPath[i][1]).toBeGreaterThanOrEqual(riverPath[i - 1][1])
  })

  it('stands its spire under the hero\'s lower button on a phone', () => {
    const { info } = createScene(390, 844, { dpr: 1, flip: true, phoneMax: 768, textBottom: 352, ...PICTURES })
    expect(info.stack).toBe(true)
    // the whole crown shows below the button: its tip a little under it (11 px in the approved drawing), the breach lower
    expect(info.tipY).toBeGreaterThanOrEqual(352 + 8)
    expect(info.tipY).toBeLessThanOrEqual(352 + 20)
    expect(info.breach.y).toBeGreaterThan(info.tipY)
  })

  it('moves down with the hero\'s lower button', () => {
    const at = (textBottom) => createScene(390, 844, { dpr: 1, flip: true, phoneMax: 768, textBottom, ...PICTURES }).info.tipY
    expect(at(380) - at(352)).toBeCloseTo(28, 0)
  })

  it('says so when it is given no picture and no painter', () => {
    expect(() => createScene(W, H, {})).toThrow('deathfire: no mountain picture and no painter')
  })
})

describe('one frame', () => {
  /** Build a scene and draw one frame of it, noting where it asks about the page's text. */
  function frame(env, layers) {
    Math.random = mulberry32(7)
    const scene = desktop({ layers })
    const ctx = page()
    const asked = []
    scene.draw(ctx, 1, 2, { calm: (x, y) => (asked.push([x, y]), 1), moonPhase: 0.46, ...env })
    return { ctx, asked }
  }

  it('mirrored, draws through a flipped canvas and asks about the page\'s own left and right', () => {
    // (the moon is left out: it is never mirrored, so neither are its questions)
    const plain = frame({}, { moon: false })
    const mirrored = frame({ mirror: true }, { moon: false })
    expect(fake.calls('setTransform', mirrored.ctx)).toContainEqual([-1, 0, 0, 1, W, 0])
    expect(fake.calls('setTransform', plain.ctx)).not.toContainEqual([-1, 0, 0, 1, W, 0])
    expect(plain.asked.length).toBeGreaterThan(10)
    expect(mirrored.asked).toHaveLength(plain.asked.length)
    mirrored.asked.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(W - plain.asked[i][0], 6)
      expect(y).toBeCloseTo(plain.asked[i][1], 6)
    })
  })

  it.each([
    ['as it stands', {}],
    ['mirrored', { mirror: true }],
  ])('calls the host\'s hook once, behind the rock, in the page\'s own left and right (%s)', (_, env) => {
    const scene = desktop()
    const ctx = page()
    const seen = []
    const behindRock = vi.fn((c) => seen.push({ same: c === ctx, transform: fake.calls('setTransform', ctx).at(-1), landDrawn: fake.calls('drawImage', ctx).some((a) => a[0] === scene.info.layers.land) }))
    scene.draw(ctx, 1, 2, { ...env, behindRock })
    expect(behindRock).toHaveBeenCalledTimes(1)
    expect(seen[0]).toEqual({ same: true, transform: [1, 0, 0, 1, 0, 0], landDrawn: false })
    // and the mountain is drawn after it
    expect(fake.calls('drawImage', ctx).some((a) => a[0] === scene.info.layers.land)).toBe(true)
  })

  it('draws its sky, and does not paint over it', () => {
    const scene = desktop()
    const ctx = page()
    scene.draw(ctx, 1, 2, {})
    expect(fake.calls('drawImage', ctx)[0][0]).toBe(scene.info.layers.sky)
    // (the plain dark fill is only for when the sky's layer is switched off)
    expect(fake.calls('fillRect', ctx)).not.toContainEqual([0, 0, W, H])
  })

  it('quiet, lays the sky without its live volcanoes back over their stretch of it', () => {
    const drawsOf = (env) => {
      Math.random = mulberry32(7)
      const scene = desktop()
      const ctx = page()
      scene.draw(ctx, 1, 2, env)
      return { scene, draws: fake.calls('drawImage', ctx), fills: fake.calls('fillRect', ctx) }
    }
    const plain = drawsOf({})
    const quiet = drawsOf({ quiet: true })
    expect(quiet.draws[0][0]).toBe(quiet.scene.info.layers.sky)
    // straight after the sky comes one thing more than in a plain frame: a strip of sky, above the shore
    const [strip, x, y, pw, ph] = quiet.draws[1]
    expect(strip).not.toBe(quiet.scene.info.layers.sky)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + pw).toBeLessThanOrEqual(W)
    expect(y + ph).toBeLessThanOrEqual(quiet.scene.info.shoreY)
    expect(ph).toBeLessThan(H / 3)
    // and then the frame goes on as a plain one does
    expect(quiet.draws[2].slice(1)).toEqual(plain.draws[1].slice(1))
    expect(quiet.draws[1].slice(1)).not.toEqual(plain.draws[1].slice(1))
    expect(quiet.fills).not.toContainEqual([0, 0, W, H])
  })

  it('quiet, leaves out the far volcanoes\' breathing light', () => {
    const lights = (env) => {
      const scene = desktop({ layers: { embers: false } })
      const ctx = page()
      scene.draw(ctx, 1, 2, env)
      // the far volcanoes' halos are small sprites drawn above the far hills' line, before the hills' own layer
      const draws = fake.calls('drawImage', ctx)
      const hillsAt = draws.findIndex((a) => a[0] === scene.info.layers.hills)
      return draws.slice(0, hillsAt).filter((a) => a[0] !== scene.info.layers.sky && a.length === 5 && a[3] < 80 && a[2] < scene.info.shoreY && a[2] > scene.info.shoreY - 0.45 * H).length
    }
    const loud = lights({})
    expect(loud).toBeGreaterThan(0)
    expect(lights({ quiet: true })).toBeLessThan(loud)
  })
})

describe('clean-up', () => {
  it('empties the canvases it made', () => {
    const scene = desktop()
    expect(scene.info.layers.sky.width).toBe(W)
    scene.dispose()
    for (const name of ['sky', 'hills', 'land', 'fore', 'ground']) {
      expect(scene.info.layers[name].width).toBe(0)
      expect(scene.info.layers[name].height).toBe(0)
    }
  })
})
