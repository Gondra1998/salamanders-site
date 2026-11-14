<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { motionAllowed } from '../lib/doomfire'
import { deathfireHeat } from '../lib/deathfireHeat'
import { loadBaked } from '../lib/deathfire/baked.js'
import { calmFactor, measureCalm } from '../lib/deathfire/calm.js'
import { compose } from '../lib/deathfire/compose.js'
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
 * and it publishes the mountain's heat for the Archive plaque, which breathes with it (deathfireHeat.js).
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
const ashOver = computed(() => !!route.meta?.ashOver)

const FPS = 30

let raf = 0
let stopped = false
let last = 0
let t = 0
let hidden = false

let scene = null // the drawing, built for this window
let sceneKey = '' // what it was built for (compose's key)
let wanted = '' // the key of a scene being fetched for or built
let ctx = null
let view = { mirror: false, quiet: false } // how a frame is drawn on this page
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

/**
 * Make sure the scene on screen is the one this window and page call for.
 *
 * One scene serves every page, so most calls find nothing to do. It is built again only when the window changes.
 * The canvas is sized in the same breath as the new scene is built, so the old scene goes on drawing at its own size
 * until then.
 */
async function layout() {
  const cv = canvas.value
  if (!cv) return
  const w = window.innerWidth
  const h = window.innerHeight
  lastW = w
  lastH = h
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const plan = compose({ w, h, dpr, path: route.path })
  if (!plan) return
  view = { mirror: plan.mirror, quiet: plan.quiet }
  if (plan.key === sceneKey || plan.key === wanted) return
  wanted = plan.key
  const kit = await kitFor(plan.kind)
  // (the component may have gone, or the window changed again, while the pictures were on their way)
  if (stopped || wanted !== plan.key) return
  wanted = ''

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
  calmAt = -1
  if (mode.value === 'still') still()
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
  if (!scene || !ctx) return
  const { phase, trial } = sky.step(secs, live)
  const stirred = excitement(phase, trial)
  // the mountain's own pulse: the more stirred, the oftener. Most are spits; about one in five is an eruption
  // proper, and a stirred mountain throws more of those.
  if (live && t >= nextPulse) {
    scene.erupt(Math.random() < 0.2 + 0.25 * stirred ? 1.5 + Math.random() : 0.55 + 0.5 * Math.random())
    nextPulse = t + (2.5 + 6.5 * Math.random()) / (1 + 1.6 * stirred)
  }
  water = lake.step(secs, stirred, { fillMinutes: LOOK.lakeFill, start: LOOK.lakeStart })
  // the page's text is measured a few times a second, and followed between whiles as the page scrolls
  if (calmAt < 0 || t - calmAt > 0.4) {
    calm = measureCalm(document, window, {})
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
  })
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
  () => layout(),
)

onMounted(() => {
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

  if (!motionAllowed()) {
    mode.value = 'still'
    layout()
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
  scene = null
  ctx = null
})
</script>

<template>
  <div ref="host" class="deathfire" :data-mode="mode" aria-hidden="true">
    <canvas ref="canvas" class="deathfire-canvas" />
  </div>
  <canvas v-show="ashOver" ref="veil" class="deathfire-veil" aria-hidden="true" />
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
