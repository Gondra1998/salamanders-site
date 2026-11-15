// The golden check's page. It proves that a change to the drawing's code moved no pixel.
//
// It builds a fixed set of scenes, with chance seeded so that the fires and the sparks come out the same every time,
// draws a fixed run of frames, and leaves a hash of each finished picture in the page (golden.mjs compares them with
// the recorded ones). A case that differs after a change means the change altered what is drawn.
//
// The scene's code is named once, here. The baked pictures sit in ./baked/ beside it.
const SCENE = '/src/lib/deathfire/scene.js'

import { bakeScenes, mountainNumbers } from './bakeScenes.js'

const { createScene } = await import(/* @vite-ignore */ SCENE)
const beside = (name) => new URL(name, new URL(SCENE, location.href)).href
const { mulberry32 } = await import(/* @vite-ignore */ beside('./noise.js'))
// the painting code: handed to the scene only in the cases that paint (the others prove the scene needs none)
const painter = await import(/* @vite-ignore */ beside('./painters.js'))
const BAKED = new URL('./baked/', new URL(SCENE, location.href))

// the numbers of the approved look, from the one place they are kept
const { LOOK: TUNE } = await import(/* @vite-ignore */ beside('./look.js'))
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

/**
 * The brightest pixel of a canvas, by how bright it is to the eye (the relative luminance contrast is reckoned by),
 * and how much of the picture is nearly as bright. The site's contrast tests assume a "brightest lava"
 * (src/test-utils/contrast.js): this is what the drawing really reaches.
 */
function brightest(cv) {
  const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
  const lin = new Float32Array(256)
  for (let i = 0; i < 256; i++) lin[i] = i / 255 <= 0.03928 ? i / 255 / 12.92 : ((i / 255 + 0.055) / 1.055) ** 2.4
  const lum = (k) => 0.2126 * lin[data[k]] + 0.7152 * lin[data[k + 1]] + 0.0722 * lin[data[k + 2]]
  let best = 0
  let at = 0
  for (let k = 0; k < data.length; k += 4) {
    const l = lum(k)
    if (l > best) {
      best = l
      at = k
    }
  }
  let near = 0
  for (let k = 0; k < data.length; k += 4) if (lum(k) > 0.9 * best) near++
  return { rgb: [data[at], data[at + 1], data[at + 2]], luminance: +best.toFixed(3), share: +(near / (data.length / 4)).toFixed(5) }
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
  const scene = createScene(w, h, { dpr, phoneMax: 768, flip: true, tune: { ...TUNE }, lakeLevel: env.lakeLevel ?? 0.3, ...options })
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

  // an inner page: the same scene, drawn mirrored and quiet
  out['desktop-inner'] = hash(run({ ...desktop, options: { faceX: 0.14, ...withPictures('desktop') }, env: { mirror: true, quiet: true } }).cv)

  const trial = run({
    ...desktop,
    options: { faceX: 0.14, ...withPictures('desktop') },
    env: { lakeLevel: 1, spill: 1, trial: 1, moonPhase: 0.5 },
    before: (scene, i) => i === 10 && scene.erupt(2.1, 0.4),
  })
  out['desktop-trial'] = hash(trial.cv)
  // (not a case: a number to read. The brightest the drawing gets, in its heaviest frame, and in a calm one.)
  const notes = { 'brightest in a trial': brightest(trial.cv), 'brightest at rest': brightest(home.cv) }
  document.getElementById('golden').dataset.notes = JSON.stringify(notes)

  out['phone-home'] = hash(run({ w: 390, h: 844, dpr: 2, options: { textBottom: 352, ...withPictures('phone') } }).cv)

  // no pictures: the mountain and the moon painted here
  out['desktop-painted'] = hash(run({ ...desktop, options: { faceX: 0.14, painter }, frames: 1 }).cv)

  // the pictures the bake tool makes
  const scenes = bakeScenes(createScene, mountainNumbers(TUNE), { painter })
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
