<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motionAllowed } from '../lib/doomfire'
import { deathfireHeat } from '../lib/deathfireHeat'
import { loadBaked } from '../lib/deathfire/baked.js'
import { createAsh } from '../lib/deathfire/ash.js'
import { calmFactor, measureCalm } from '../lib/deathfire/calm.js'
import { PHONE_MAX, compose } from '../lib/deathfire/compose.js'
import { createSky } from '../lib/deathfire/crossing.js'
import { createLakeLevel } from '../lib/deathfire/lakeLevel.js'
import { LOOK } from '../lib/deathfire/look.js'
import { excitement } from '../lib/deathfire/trial.js'

/**
 * Mount Deathfire, the great volcano of Nocturne, standing behind every page.
 *
 * The drawing itself is not here. It is a scene (src/lib/deathfire/scene.js): given the window's size it works out
 * the mountain, its river and lake, and hands back how to draw one frame. This component is its host. It owns what
 * is about the page and the clock, and tells the scene:
 *   - what to build, and when to build again (only when the window changes: compose.js)
 *   - where the moon is and whether a Time of Trial is on (the visitor's own crossing: crossing.js)
 *   - how full the lake is (lakeLevel.js)
 *   - where the page's reading text lies, so the lava steps aside under it (calm.js)
 *   - when to erupt
 * On a phone the mountain stands under the home page's hero text, so the host measures where that text ends and
 * builds again if it moves (a font arriving).
 * It also draws the ash that falls through it all (ash.js): behind the mountain and in front of it, or, on pages
 * marked `ashOver`, over the page itself.
 * And it publishes the mountain's heat for the Archive plaque, which breathes with it (deathfireHeat.js).
 *
 * The mountain and the moon come as baked pictures, fetched for this kind of device only (baked.js). If they cannot
 * be had, the painting code is fetched instead and the mountain is painted here. The scene's own code is fetched
 * when the component mounts, so the page's first paint does not wait on it.
 */

const host = ref(null)
const canvas = ref(null)
// Pages flagged meta.ashOver (the archive) get the near ash on a second canvas above their content, so it drifts
// across the page, not behind it.
const veil = ref(null)
const mode = ref('off')

const route = useRoute()
const router = useRouter()
const ashOver = computed(() => !!route.meta?.ashOver)
// A page can say no mountain is drawn behind it at all (meta.deathfire: false). Deathwatch does: it is off planet.
const shows = computed(() => route.meta?.deathfire !== false)

const FPS = 30

let raf = 0
let stopped = false
let last = 0
let t = 0
let hidden = false
let known = false // the router has settled which page was opened (see onMounted)

let scene = null // the drawing, built for this window
let sceneKey = '' // what it was built for (compose's key)
let wanted = '' // the key of a scene being fetched for or built
let ctx = null
let dpr = 1
let ash = null // the falling ash, for this window: { back, front, fall }
let view = { mirror: false, quiet: false } // how a frame is drawn on this page
// A phone stands the mountain under the home page's hero text, the tip of its spire a little below the lower button.
let heroText = null // where that text ends, px down the page, once it has been measured (kept for the other pages)
let stacked = false // this is a phone on the home page: the hero's text is above the mountain, not over its lava
let retries = 0 // how many times the mountain has been stood again because the text moved, at this window size
const RETRIES = 12 // then it stays put: a page whose text never settles must not rebuild for ever
let sky = null // the visitor's crossing: the moon's place, the Time of Trial
let lake = null // how full the lake is: it outlives a rebuild
let water = { level: LOOK.lakeStart, spill: 0 }
let calm = { rects: [], scrollY: 0, navBottom: 0 } // where reading text sits over the canvas, as last measured
let calmAt = -1 // when it was last measured, in seconds
let nextPulse = 3 // when the mountain next erupts by itself, in seconds
let relayoutPending = 0
let resizeObserver = null
let lastW = 0
let lastH = 0
let builtW = 0 // the window size the scene on screen was built for
let builtH = 0

// Dev switches in the URL, on the dev server only: ?moon=0..1 holds the moon there, ?trial=1|2|3 starts a Time of
// Trial, ?visit=new forgets this browser's crossing, ?calm=0 measures no text, ?off=plume,fog leaves layers out.
const dev = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const devNumber = (name) => {
  const n = dev?.has(name) ? parseFloat(dev.get(name)) : NaN
  return Number.isFinite(n) ? n : null
}
const layersOff = (dev?.get('off') || '').split(',').filter(Boolean)

/** The browser's storage, where it lets us have it (a private window may not). */
function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// What a scene for one kind of device needs before it can be built: the scene's code and its two pictures, or,
// failing the pictures, the painter. Fetched once for each kind.
const kits = {}
function kitFor(kind) {
  return (kits[kind] ??= (async () => {
    const [code, pictures] = await Promise.all([import('../lib/deathfire/scene.js'), loadBaked(kind)])
    const painter = pictures ? null : await import('../lib/deathfire/painters.js')
    return { createScene: code.createScene, pictures, painter }
  })())
}

/** Where the home page's hero text ends: the bottom of its lowest button, in px down the page. Null if it is not there. */
function measureHero() {
  let bottom = 0
  for (const el of document.querySelectorAll('.hero .cta-row > *')) bottom = Math.max(bottom, el.getBoundingClientRect().bottom)
  return bottom ? bottom + window.scrollY : null
}

/**
 * The hero's text can move after the mountain was stood under it (a font arrives and the lines reflow). If it has
 * moved by more than a couple of px, stand the mountain again. Only on a phone's home page, and only so many times.
 */
function followHero() {
  // (not while a scene is already on its way: one thing at a time)
  if (!stacked || retries >= RETRIES || wanted) return
  const now = measureHero()
  if (now === null || Math.abs(now - heroText) <= 2) return
  layout()
}

/**
 * Make sure the scene on screen is the one this window and page call for.
 *
 * One scene serves every page, so most calls find nothing to do. It is built again only when the window changes.
 * Behind a page with no mountain (Deathwatch) nothing is fetched or built at all.
 * The canvas is sized in the same breath as the new scene is built, so the old scene goes on drawing at its own size
 * until then.
 * Resolves to true when it built a scene.
 */
async function layout() {
  const cv = canvas.value
  if (!cv || !known) return false
  const w = window.innerWidth
  const h = window.innerHeight
  if (w !== lastW || h !== lastH) {
    // a new size of window: what was measured in the old one no longer holds
    heroText = null
    retries = 0
  }
  lastW = w
  lastH = h
  const home = route.path === '/'
  const phone = w <= PHONE_MAX
  if (phone && home) {
    const now = measureHero()
    if (now !== null && (heroText === null || Math.abs(now - heroText) > 2)) heroText = now
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  // (pages with no hero text keep the home page's mountain: where its text was measured, or where it usually ends)
  const plan = compose({ w, h, dpr: ratio, path: route.path, shows: shows.value, hero: heroText === null ? null : { text: heroText } })
  if (!plan) return false
  view = { mirror: plan.mirror, quiet: plan.quiet }
  stacked = phone && home
  if (plan.key === sceneKey || plan.key === wanted) return false
  wanted = plan.key
  const kit = await kitFor(plan.kind)
  // (the component may have gone, or the window changed again, while the pictures were on their way)
  if (stopped || wanted !== plan.key) return false
  wanted = ''

  dpr = ratio
  cv.width = Math.ceil(w * dpr)
  cv.height = Math.ceil(h * dpr)
  cv.style.width = `${w}px`
  cv.style.height = `${h}px`
  if (veil.value) {
    veil.value.width = cv.width
    veil.value.height = cv.height
  }
  ctx = cv.getContext('2d')
  scene?.dispose()
  scene = kit.createScene(w, h, {
    ...plan.options,
    lakeLevel: water.level,
    ...(kit.pictures ? { mountain: kit.pictures.mountain, riverU: kit.pictures.mountain.meta.riverU, moonImage: kit.pictures.moon } : { painter: kit.painter }),
    ...(layersOff.length ? { layers: Object.fromEntries(layersOff.map((name) => [name, false])) } : {}),
  })
  sceneKey = plan.key
  // (a second scene for the same size of window is one stood again under hero text that moved: count it)
  if (w === builtW && h === builtH) retries++
  builtW = w
  builtH = h
  // Ash is weather: as thick per screen area at every size, half as thick on a phone.
  ash = createAsh(w, h, { density: LOOK.ash, phone: plan.kind === 'phone' })
  calmAt = -1
  if (mode.value === 'still') still()
  return true
}

/**
 * Rebuild for a new viewport, at most once a frame.
 *
 * A resize stream fires many events for the length of a drag, and mobile chrome fires them constantly as the URL bar
 * slides without the viewport really changing. Coalescing to the next frame and skipping same-size events keeps a
 * resize cheap.
 */
function relayout() {
  if (relayoutPending) return
  relayoutPending = requestAnimationFrame(() => {
    relayoutPending = 0
    if (window.innerWidth === lastW && window.innerHeight === lastH) return
    layout()
  })
}

/**
 * Draw one frame. `dt` is the time since the last one in sixtieths of a second (what the scene's moving things are
 * tuned in), `secs` the same in seconds; `live` is false for a still frame, in which nothing erupts and no trial
 * begins.
 */
function draw(dt, secs, live) {
  if (!scene || !ctx || !shows.value) return
  const { phase, trial, blast } = sky.step(secs, live)
  const stirred = excitement(phase, trial)
  // the mountain's own pulse: the more stirred, the oftener. Most are spits; about one in five is an eruption
  // proper, and a stirred mountain throws more of those.
  if (live && t >= nextPulse) {
    scene.erupt(Math.random() < 0.2 + 0.25 * stirred ? 1.5 + Math.random() : 0.55 + 0.5 * Math.random())
    nextPulse = t + (2.5 + 6.5 * Math.random()) / (1 + 1.6 * stirred)
  }
  // in a Time of Trial the blast keeps throwing: every one an eruption proper, cut short so they stand apart
  if (blast) scene.erupt(0.9 + 1.2 * trial, 0.4)
  water = lake.step(secs, stirred, { fillMinutes: LOOK.lakeFill, start: LOOK.lakeStart })
  // the page's text is measured a few times a second, and followed between whiles as the page scrolls
  if (calmAt < 0 || t - calmAt > 0.4) {
    if (live) followHero()
    // (on a phone's home page the hero's own text is above the mountain: it is not text the lava must step aside for)
    calm = measureCalm(document, window, { stacked })
    if (dev?.get('calm') === '0') calm = { ...calm, rects: [] }
    calmAt = t
  }
  const { rects, navBottom } = calm
  const scrolled = window.scrollY - calm.scrollY
  scene.draw(ctx, t, dt, {
    calm: (x, y) => calmFactor(rects, x, y + scrolled),
    navBottom,
    moonPhase: phase,
    trial,
    lakeLevel: water.level,
    spill: water.spill,
    mirror: view.mirror,
    quiet: view.quiet,
    // the far ash falls behind the mountain: the scene calls this when it has drawn the sky and is about to draw the rock
    behindRock: (c) => ash.fall(c, ash.back, dt),
  })
  // The near ash falls in front of everything. On a page marked ashOver it falls over the page itself, on the veil
  // canvas, a shade lighter and a touch larger, or it would vanish against the dark panels there.
  const over = ashOver.value && veil.value ? veil.value.getContext('2d') : null
  if (over) {
    over.setTransform(dpr, 0, 0, dpr, 0, 0)
    over.clearRect(0, 0, lastW, lastH)
    ash.fall(over, ash.front, dt, true)
  } else {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // (the scene may have been drawing mirrored)
    ash.fall(ctx, ash.front, dt)
  }
  // the Archive plaque breathes and flares with the mountain
  const heat = scene.heatNow()
  deathfireHeat.breathe = heat.breathe
  deathfireHeat.flare = heat.flare
}

/** The one frame a visitor who asked for reduced motion sees: the mountain a little way into its day, and no loop. */
function still() {
  t = 2.5
  calmAt = -1
  draw(1, 0, false)
}

function frame(now) {
  if (stopped) return
  raf = requestAnimationFrame(frame)
  if (hidden) return
  const elapsed = now - last
  if (elapsed < 1000 / FPS) return
  last = now
  // (time is counted in steps of a tenth of a second at the most, so a tab that was away does not leap ahead)
  const secs = Math.min(elapsed, 100) / 1000
  t += secs
  draw(Math.min(elapsed / 16.7, 3), secs, true)
}

const onVisibility = () => (hidden = document.hidden)

watch(
  () => route.path,
  async () => {
    // (a Time of Trial does not go on raging unseen behind a page with no mountain: it ends there)
    if (!shows.value) sky?.endTrial()
    calmAt = -1 // the new page's text lies elsewhere: measure it on the next frame
    const built = await layout()
    // (a still frame is not on a loop: it is drawn again for the new page, whose text lies elsewhere)
    if (!built && mode.value === 'still') still()
  },
)

onMounted(async () => {
  hidden = document.hidden
  sky = createSky({ storage: storage(), hold: devNumber('moon'), fresh: dev?.get('visit') === 'new' })
  const tier = devNumber('trial')
  if (tier) sky.startTrial(Math.min(3, Math.max(1, Math.round(tier))))
  lake = createLakeLevel(LOOK.lakeStart)

  // Resize handling is set up before the reduced-motion branch: a still frame still has to be the right size.
  window.addEventListener('resize', relayout, { passive: true })
  // The window event misses anything that changes the box without resizing the window: an embedded context, or a
  // scrollbar coming and going.
  if ('ResizeObserver' in window && host.value) {
    resizeObserver = new ResizeObserver(relayout)
    resizeObserver.observe(host.value)
  }

  // The app mounts before the router has settled which page was opened, and until it has, the route is a
  // placeholder that looks like the home page. Nothing is built for that (layout() waits for `known`, whoever calls
  // it: the resize observer calls once as soon as it starts watching): a page opened directly must get its own view
  // from the first frame, and a Deathwatch page must fetch nothing.
  await router.isReady().catch(() => {})
  if (stopped) return
  known = true

  if (!motionAllowed()) {
    mode.value = 'still'
    layout()
    // (no loop is watching the hero's text here: look once more when the page's fonts have come)
    document.fonts?.ready?.then(() => !stopped && followHero())
    return
  }

  mode.value = 'live'
  raf = requestAnimationFrame(frame)
  document.addEventListener('visibilitychange', onVisibility)
  layout()
})

onBeforeUnmount(() => {
  stopped = true
  cancelAnimationFrame(raf)
  cancelAnimationFrame(relayoutPending)
  relayoutPending = 0
  window.removeEventListener('resize', relayout)
  resizeObserver?.disconnect()
  resizeObserver = null
  document.removeEventListener('visibilitychange', onVisibility)
  sky?.endTrial()
  scene?.dispose()
  scene = null
  ctx = null
  ash = null
})
</script>

<template>
  <div v-show="shows" ref="host" class="deathfire" :data-mode="mode" aria-hidden="true">
    <canvas ref="canvas" class="deathfire-canvas" />
  </div>
  <canvas v-show="shows && ashOver" ref="veil" class="deathfire-veil" aria-hidden="true" />
</template>

<style scoped>
.deathfire {
  position: fixed;
  inset: 0;
  /* Behind all content, above the ambient gradient on body::before (-2). */
  z-index: -1;
  pointer-events: none;
}
.deathfire-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* Above page content, below the nav (z 50). */
.deathfire-veil {
  position: fixed;
  inset: 0;
  z-index: 40;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
