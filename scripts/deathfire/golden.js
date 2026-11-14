// The golden check's page. It proves that a change to the drawing's code moved no pixel.
//
// It builds a fixed set of scenes, with chance seeded so that the fires and the sparks come out the same every time,
// draws a fixed run of frames, and leaves a hash of each finished picture in the page (golden.mjs compares them with
// the recorded ones). A case that differs after a change means the change altered what is drawn.
//
// The scene's code is named once, here. The baked pictures sit in ./baked/ beside it.
const SCENE = '/src/lib/deathfire/scene.js'

import { bakeScenes } from './bakeScenes.js'

const { createScene } = await import(/* @vite-ignore */ SCENE)
const beside = (name) => new URL(name, new URL(SCENE, location.href)).href
const { mulberry32 } = await import(/* @vite-ignore */ beside('./noise.js'))
// the painting code: handed to the scene only in the cases that paint (the others prove the scene needs none)
const painter = await import(/* @vite-ignore */ beside('./painters.js'))
const BAKED = new URL('./baked/', new URL(SCENE, location.href))

// the numbers the look was approved with (the mock's tuner at its defaults)
const TUNE = {
  peakH: 0.72, baseW: 1.35, crown: 1.25, rock: 1, columns: 1, planes: 0.55, ranges: 1, rangeH: 1, haze: 0.5, lavaTint: 0.5, lavaRed: 0.5,
  lavaHeat: 1.12, plume: 1.3, embers: 2.3, lake: 1, lakeCrust: 0.3, lakeHeat: 1, lakeStart: 0.3, lakeFill: 5, fog: 1,
}
const FRAMES = 60
const realRandom = Math.random
const seedChance = () => (Math.random = mulberry32(0x601de))

/** FNV-1a, 32 bit, over a canvas's pixels, as 8 hex digits. */
function hash(cv) {
  const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** A block of text to keep calm around, where the home page's title stands, and the page's own measure of it. */
function calmFor(w, h) {
  const r = { l: 0.2 * w, r: 0.8 * w, t: 0.36 * h, b: 0.56 * h }
  return (x, y) => {
    const d = Math.hypot(Math.max(r.l - x, 0, x - r.r), Math.max(r.t - y, 0, y - r.b))
    if (d >= 48) return 1
    const c = d / 48
    return 0.1 + 0.9 * c * c * (3 - 2 * c)
  }
}

/**
 * A baked picture, as an image element. (Not createImageBitmap, as the site uses: headless Chrome's clock, which
 * chrome.mjs runs the page on, waits for a picture that is loading but not for one that is being decoded off to the
 * side, and would hand the page back before it had finished.)
 */
function picture(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${file}`))
    img.src = new URL(file, BAKED).href
  })
}

/** Build a scene, draw its frames, and hand back the canvas and the scene. */
function run({ w, h, dpr, options, env = {}, frames = FRAMES, before }) {
  seedChance()
  const scene = createScene(w, h, { dpr, phoneMax: 768, flip: true, layers: { ash: false }, tune: { ...TUNE }, lakeLevel: env.lakeLevel ?? 0.3, ...options })
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(w * dpr)
  cv.height = Math.ceil(h * dpr)
  const ctx = cv.getContext('2d')
  const calm = calmFor(w, h)
  for (let i = 0; i < frames; i++) {
    before?.(scene, i)
    scene.draw(ctx, i / 30, 2, { calm, navBottom: 61, moonPhase: 0.46, lakeLevel: 0.3, ...env })
  }
  return { cv, scene }
}

const out = {}
const log = document.getElementById('log')
try {
  const list = await (await fetch(new URL('baked.json', BAKED))).json()
  const moonImage = await picture(list.moon.file)
  const baked = {}
  for (const kind of ['desktop', 'phone']) baked[kind] = { image: await picture(list[kind].mountain.file), meta: list[kind].mountain }
  const withPictures = (kind) => ({ mountain: baked[kind], riverU: baked[kind].meta.riverU, moonImage })
  const desktop = { w: 1596, h: 738, dpr: 1 }

  const home = run({ ...desktop, options: { faceX: 0.14, ...withPictures('desktop') } })
  out['desktop-home'] = hash(home.cv)
  // the layers the scene paints once and keeps, as they stand after those frames
  for (const name of ['sky', 'hills', 'land', 'fore', 'ground']) out[`layer-${name}`] = hash(home.scene.info.layers[name])

  out['desktop-inner'] = hash(run({ ...desktop, options: { faceX: 0.14, mirror: true, quiet: true, ...withPictures('desktop') } }).cv)

  out['desktop-trial'] = hash(
    run({
      ...desktop,
      options: { faceX: 0.14, ...withPictures('desktop') },
      env: { lakeLevel: 1, spill: 1, trial: 1, moonPhase: 0.5 },
      before: (scene, i) => i === 10 && scene.erupt(2.1, 0.4),
    }).cv,
  )

  out['phone-home'] = hash(run({ w: 390, h: 844, dpr: 2, options: { textBottom: 352, ...withPictures('phone') } }).cv)

  // no pictures: the mountain and the moon painted here
  out['desktop-painted'] = hash(run({ ...desktop, options: { faceX: 0.14, painter }, frames: 1 }).cv)

  // the pictures the bake tool makes
  const scenes = bakeScenes(createScene, {}, { painter })
  for (const kind of ['desktop', 'phone']) {
    seedChance()
    out[`bake-${kind}`] = hash(scenes[kind]().info.bake.mountain.cv)
  }

  document.getElementById('golden').textContent = JSON.stringify(out)
  log.textContent = Object.entries(out).map(([k, v]) => `${k}  ${v}`).join('\n')
  document.title = 'golden'
} catch (e) {
  log.textContent = `failed: ${e && e.stack ? e.stack : e}`
  document.title = 'golden-failed'
} finally {
  Math.random = realRandom
}
