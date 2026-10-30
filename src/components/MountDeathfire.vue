<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { motionAllowed } from '../lib/doomfire'
import { fireTuning, randomize, profileFor, NEUTRAL_PROFILE } from '../lib/fireTuning'
import { deathfireHeat } from '../lib/deathfireHeat'

/**
 * Mount Deathfire — the great volcano of Nocturne, sitting behind every page.
 *
 * Built procedurally rather than drawn, so it costs nothing to ship and adapts
 * to any viewport: a basalt cone with a lit caldera, lava running down the
 * flanks, a plume of sparks off the summit, and ash falling through it all.
 *
 * The peak is deliberately set off-centre so it never sits directly behind the
 * centred hero wordmark, and the whole thing is anchored low — this is the
 * horizon of the world the site lives on, not the subject of the page.
 *
 * The landing page is the baked reference: fireTuning's DEFAULTS describe it
 * exactly. Every other route is a departure from it, declared as a profile of
 * bearing (where you stand), variance (how far the seeded detail strays) and
 * density (how loud the plume, ash and sky are). The hero's profile is
 * 0 / 1 / 1, which is neutral in every expression below — so `/` consumes the
 * identical sequence of seeded random numbers it did before profiles existed
 * and renders unchanged. Keep it that way when editing here.
 */

const tune = fireTuning.bed

const host = ref(null)
const canvas = ref(null)
// Pages flagged meta.ashOver (the archive) get the near ash on a second
// canvas above their content, so it drifts across the page, not behind it.
const veil = ref(null)
const mode = ref('off')

const FPS = 30

let raf = 0
let stopped = false
let last = 0
let t = 0
let hidden = false

let mountain = null // { peak, left, right, profile, crater }
let ridges = [] // distant silhouettes, for depth
let flows = [] // lava running down the flanks
let silhouette = null // cached rock, redrawn only on resize
let drift = [] // continuous sparks/embers off the summit
let burst = [] // sparks thrown by an eruption pulse
let ashBack = [] // ash falling behind the rock
let ashFront = [] // ash falling between the rock and the viewer
let spriteGlow = null
let nextPulse = 0
let relayoutPending = 0
let resizeObserver = null
let lastW = 0
let lastH = 0

// Runtime randomness — particles, which should never repeat.
const rand = (a, b) => a + Math.random() * (b - a)

/**
 * The viewport the tuning panel's numbers were dialled in against.
 *
 * bed.height was being used as raw pixels, so the cone kept one absolute height
 * while its base width stayed a fraction of the viewport. On anything shorter
 * than the tuning window the summit walked off the top — a 640px-tall viewport
 * put the peak at y = -50, which is why the crater, the caldera light and every
 * eruption were invisible and the mountain read as bare lava streaks. Heights
 * are now measured against this reference and scaled, so the cone keeps its
 * proportions at every size and `/` renders exactly as tuned at 1600x1000.
 */
const REF = { w: 1600, h: 1000 }
const REF_AREA = REF.w * REF.h

/** Fraction of the viewport kept clear above the summit, for the plume. */
const HEADROOM = 0.3

/**
 * The cone's height in this viewport: tuned height, scaled, then clamped.
 *
 * Non-finite input collapses to the floor rather than propagating — an emptied
 * number field in the tuning panel hands over NaN, and NaN here reaches the
 * canvas as a thrown gradient rather than as a visibly wrong mountain.
 */
function peakHeight(h) {
  const wanted = tune.height * prof.scale * (h / REF.h)
  return Math.max(40, Math.min(Number.isFinite(wanted) ? wanted : 0, h * (1 - HEADROOM)))
}

/**
 * Terrain randomness is *seeded*, so each route gets its own face of the
 * mountain and keeps it. Walk away from the Armoury and come back and you're
 * standing on the same side of Deathfire you left.
 */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const hashString = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const route = useRoute()
const ashOver = computed(() => !!route.meta?.ashOver)
let rng = mulberry32(1)
/** Seeded generation randomness. */
const grand = (a, b) => a + rng() * (b - a)

/**
 * This route's departure from the hero. Held as a plain binding rather than
 * read through the reactive store inside the build functions, so a whole
 * mountain is always generated against one consistent profile.
 */
let prof = NEUTRAL_PROFILE

/**
 * Pull a seeded value back toward the neutral (hero-symmetric) one.
 *
 * `grand` is still called either way, so the number of draws from the seeded
 * stream never changes — only how far the result is allowed to travel. That's
 * what lets variance vary per page without reshuffling any other page.
 */
const stray = (neutral, seeded) => neutral + (seeded - neutral) * prof.variance

// Where this page's peak sits, derived from the route seed around tune.offsetX.
// Reactive so the painted sky glow follows it.
const face = ref(0.5)
let faceOffset = 0.5

/**
 * Reseed for the current route.
 *
 * Position is two parts: the profile's bearing, which is a designed choice
 * about where this page stands, and a seeded wander of up to faceSpread on top
 * of it, which is the random part. The hero's bearing is 0 and its variance 1,
 * so it lands exactly where tune.offsetX plus its own seed put it.
 */
function seedForRoute() {
  prof = profileFor(route.path)
  rng = mulberry32(hashString(route.path || '/') ^ 0x5a1a)
  const spread = randomize.offsetX ? tune.faceSpread : 0
  const wander = grand(-spread, spread) * prof.variance
  faceOffset = Math.max(0.1, Math.min(0.9, tune.offsetX + prof.bearing + wander))
  face.value = faceOffset
}

// Read through profileFor rather than the `prof` binding so the painted sky
// tracks a profile edit in the tuning panel without waiting for a rebuild.
const glowStyle = computed(() => {
  const g = tune.glow * profileFor(route.path).density
  return {
    background: `radial-gradient(90% 55% at ${(face.value * 100).toFixed(0)}% 100%,
    rgba(224, 67, 29, ${g.toFixed(3)}),
    rgba(150, 35, 15, ${(g * 0.35).toFixed(3)}) 40%,
    transparent 72%)`,
  }
})

function makeGlow() {
  const s = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.2, 'rgba(255,214,150,0.9)')
  grd.addColorStop(0.5, 'rgba(255,106,43,0.4)')
  grd.addColorStop(1, 'rgba(224,67,29,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, s, s)
  return cv
}

/**
 * A cone with a broken crater at the top. Slopes are walked in steps with
 * jitter so the flanks read as fractured basalt rather than a clean triangle,
 * and the jitter shrinks near the summit where the rock is younger.
 */
function buildMountain(w, h) {
  // How tall this page stands the peak. Everything derived from height scales
  // with it, or the crater and the jitter stay hero-sized on a distant cone.
  const height = peakHeight(h)
  const peakX = w * faceOffset
  const peakY = h - height
  // Base width is a fraction of the viewport *width* while height follows its
  // *height*, so on a narrow window the cone sharpened into a lit chimney. The
  // floor holds it to the slope it was tuned at (halfBase ~= 0.7 * height at
  // 1600x1000), and only bites below about 4:3 — every desktop width keeps the
  // fraction it had before, so the hero is untouched.
  const halfBase = Math.max((w * tune.width) / 2, height * 0.6)
  const craterHalf = Math.max(18, height * 0.13)

  // The cone's own profile. Reshaping it per route is what stops the site
  // feeling like one flat backdrop, but pushed too far it stops being Deathfire
  // seen from another side and becomes a different mountain — so the profile's
  // variance pulls each draw back toward the neutral cone. The hero runs at
  // full stray; the reading-heavy pages sit much closer to symmetric.
  const vary = randomize.asymmetry
  const leftSpread = vary ? stray(1, grand(0.78, 1.24)) : 1
  const rightSpread = vary ? stray(1, grand(0.78, 1.24)) : 1
  const leftCurve = vary ? stray(1.45, grand(1.3, 1.7)) : 1.45
  const rightCurve = vary ? stray(1.45, grand(1.3, 1.7)) : 1.45

  // The crater rim. This is the brightest line in the scene, so it has to read
  // level. It used to drop by two independent draws — 0..6px on the left and
  // 4..12px on the right — which both tilted the lit mouth (3.3px over a 179px
  // span on the hero seed) and, because the flanks were jittered separately at
  // the same x, stepped the rock outline 3-4px at each corner. One seeded dip,
  // mirrored, keeps the "blown out on one side" character without the tilt.
  const rimDip = vary ? stray(0, grand(-1.5, 1.5)) : 0
  const rimL = { x: peakX - craterHalf, y: peakY - rimDip }
  const rimR = { x: peakX + craterHalf, y: peakY + rimDip }

  const flank = (dir) => {
    const pts = []
    const steps = 26
    const spread = dir < 0 ? leftSpread : rightSpread
    const curve = dir < 0 ? leftCurve : rightCurve
    for (let i = 0; i <= steps; i++) {
      const f = i / steps // 0 at crater rim, 1 at base
      // Concave profile: volcanoes flare out as they descend.
      const eased = Math.pow(f, curve)
      const x = peakX + dir * (craterHalf + eased * (halfBase * spread - craterHalf))
      const y = peakY + f * height
      // Less jitter high up, more on the old broken skirts below. The taper runs
      // all the way to zero at the rim (it used to floor at 0.25) so the flank
      // meets the crater mouth exactly instead of stepping off it.
      const jitter = (vary ? grand(-1, 1) : 0) * prof.variance * height * 0.03 * f
      pts.push({ x, y: y + jitter })
    }
    // Share the rim's own point, so silhouette and lit mouth cannot disagree.
    pts[0] = dir < 0 ? { ...rimL } : { ...rimR }
    return pts
  }

  const left = flank(-1)
  const right = flank(1)

  return { peakX, peakY, craterHalf, left, right, rimL, rimR }
}

/** Lower, dimmer cones behind the main peak so the horizon has depth. */
function buildRidges(w, h) {
  const count = Math.max(0, Math.round(tune.ridges))
  return Array.from({ length: count }, () => {
    const height = peakHeight(h) * grand(0.22, 0.42)
    // Bias away from the main peak so the far range isn't swallowed by it.
    const side = rng() < 0.5 ? -1 : 1
    const parallax = randomize.ridges ? grand(-0.18, 0.18) * prof.variance : 0
    const peakX = (faceOffset + side * grand(0.32, 0.72) + parallax) * w
    const halfBase = grand(w * 0.16, w * 0.4)
    const pts = []
    const steps = 14
    for (let i = steps; i >= 0; i--) {
      const f = i / steps
      pts.push({
        x: peakX - (Math.pow(f, 1.4) * halfBase),
        y: h - height + f * height + grand(-1, 1) * height * 0.05,
      })
    }
    for (let i = 0; i <= steps; i++) {
      const f = i / steps
      pts.push({
        x: peakX + Math.pow(f, 1.4) * halfBase,
        y: h - height + f * height + grand(-1, 1) * height * 0.05,
      })
    }
    return { pts, depth: grand(0.45, 0.85) }
  })
}

/** A small irregular rock silhouette, in unit space — scaled and rotated at draw time. */
function buildRockShape() {
  const n = 5 + ((rng() * 2) | 0)
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 0.7 + rng() * 0.4
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }
  return pts
}

/**
 * Riders on a flow: glowing magma packets and dark rock chunks, both moving
 * along the channel's own point list over time rather than drawn as part of
 * the static line. `u` is 0 at the crater end, 1 at the base, and wraps back
 * to 0 — an endless procession rather than a one-shot particle.
 */
function buildRiders() {
  return {
    packets: Array.from({ length: 1 + ((rng() * 2) | 0) }, () => ({
      u: rng(),
      speed: grand(0.0015, 0.0032),
      size: grand(0.9, 1.6),
    })),
    // Not every channel carries visible debris — a chunk on every flow reads
    // as a mechanical pattern rather than scattered rockfall.
    chunks:
      rng() < 0.55
        ? [
            {
              u: rng(),
              speed: grand(0.0007, 0.0014), // rock is heavier than the glow riding past it
              size: grand(2.2, 4.5),
              angle: grand(0, Math.PI * 2),
              spin: grand(-1.4, 1.4),
              shape: buildRockShape(),
            },
          ]
        : [],
  }
}

/**
 * Lava spilling from the crater and running down the face of the cone.
 *
 * Positions are expressed as a fraction across the mountain's width at each
 * height, not as an offset from a flank. Offsetting from the flank line pushed
 * the channels off the silhouette entirely and left the front face bare — which
 * is where lava is actually visible.
 *
 * `prev` is the outgoing flow list, if any. The channel geometry doesn't
 * actually need it — the seed is fixed per route, so re-running this after a
 * resize already retraces the same channels against the new mountain, not
 * new random ones. But the riders on those channels (buildRiders, below) use
 * *unseeded* progress so packets and rockfall never repeat in lockstep, and
 * without carrying that progress across, every rider would snap back to a
 * fresh random position the moment the window resizes — a real pop, just one
 * frame later than the geometry itself.
 */
function buildFlows(prev) {
  const out = []
  const count = Math.max(0, Math.round(tune.flows))
  const rows = mountain.left.length

  for (let i = 0; i < count; i++) {
    // Where it leaves the crater, as a fraction of the rim (-1 left, 1 right).
    // Neutral is an even fan across the rim; the seed scatters them, and the
    // profile's variance decides how much of that scatter this page gets.
    const even = -0.85 + (i / Math.max(1, count - 1)) * 1.7
    let u = randomize.flows ? stray(even, grand(-0.85, 0.85)) : even
    const endAt = grand(0.45, 1)
    const pts = []

    for (let s = 0; s < rows; s++) {
      const f = s / (rows - 1)
      if (f > endAt) break
      const l = mountain.left[s]
      const r = mountain.right[s]
      const cx = (l.x + r.x) / 2
      const halfW = (r.x - l.x) / 2

      // Gentle meander, and lava tends to run away from the centreline as the
      // slope broadens rather than tracking straight down.
      u += grand(-0.05, 0.05) * prof.variance + Math.sign(u) * 0.012
      u = Math.max(-0.94, Math.min(0.94, u))

      pts.push({ x: cx + u * halfW, y: (l.y + r.y) / 2 })
    }

    if (pts.length < 2) continue
    const riders = prev?.[i] ? { packets: prev[i].packets, chunks: prev[i].chunks } : buildRiders()
    out.push({
      pts,
      width: grand(1.6, 4.2),
      phase: grand(0, Math.PI * 2),
      rate: grand(0.12, 0.4),
      heat: grand(0.55, 1),
      ...riders,
    })
  }
  return out
}

/** A point at fraction `u` (0 = crater end, 1 = base) along a flow's path. */
function pointOnFlow(f, u) {
  const n = f.pts.length - 1
  const idx = Math.min(n - 0.001, Math.max(0, u * n))
  const i0 = Math.floor(idx)
  const frac = idx - i0
  const a = f.pts[i0]
  const b = f.pts[i0 + 1] || a
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac }
}

/** Sparks and embers leave from the crater, or off a lava channel. */
function driftSource(w, h) {
  if (!mountain) return { x: rand(0, w), y: h }
  if (flows.length && Math.random() < 0.3) {
    const f = flows[(Math.random() * flows.length) | 0]
    const p = f.pts[(Math.random() * f.pts.length) | 0]
    return { x: p.x + rand(-6, 6), y: p.y - rand(0, 6) }
  }
  return {
    x: mountain.peakX + rand(-mountain.craterHalf, mountain.craterHalf),
    y: mountain.peakY + rand(-4, 10),
  }
}

function spawnDrift(w, h, atSource) {
  const src = atSource ? driftSource(w, h) : { x: rand(0, w), y: rand(0, h) }

  if (Math.random() < tune.sparkMix) {
    const speed = rand(1.4, 4.2)
    const angle = -Math.PI / 2 + rand(-0.7, 0.7)
    return {
      kind: 'spark',
      x: src.x,
      y: src.y,
      px: src.x,
      py: src.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(0.9, 2),
      age: 0,
      life: rand(0.45, 1.7),
      alpha: rand(0.7, 1),
      green: Math.random() < 0.07,
    }
  }

  const big = Math.random() < 0.12
  return {
    kind: 'ember',
    x: src.x,
    y: src.y,
    vy: big ? rand(0.14, 0.36) : rand(0.28, 0.95),
    vx: rand(-0.13, 0.13),
    size: big ? rand(7, 16) : rand(1.5, 5),
    age: 0,
    life: big ? rand(1.4, 4.5) : rand(3.5, 11),
    phase: rand(0, Math.PI * 2),
    sway: rand(0.3, 1.3),
    alpha: big ? rand(0.25, 0.5) : rand(0.45, 0.9),
    green: !big && Math.random() < 0.09,
  }
}

function lifeFade(e) {
  const p = e.age / e.life
  if (p >= 1) return 0
  if (p < 0.1) return p / 0.1
  if (p > 0.68) return 1 - (p - 0.68) / 0.32
  return 1
}

/**
 * A falling flake.
 *
 * `front` flakes are drawn after the rock instead of behind it. Ash only ever
 * fell behind the silhouette, and the cone covers most of the lower screen, so
 * a large share of every flake spawned was painted over and lost — the fall
 * read as a thin band of sky rather than weather across the whole window.
 * Nearer flakes are bigger and faster, which is what makes the two layers read
 * as depth rather than as one layer at two brightnesses.
 */
function spawnAsh(w, h, atTop, front) {
  return {
    front,
    x: rand(-30, w + 30),
    y: atTop ? rand(-60, -10) : rand(0, h),
    vy: front ? rand(0.34, 0.86) : rand(0.12, 0.42),
    drift: rand(-0.22, 0.22) * (front ? 1.5 : 1),
    size: front ? rand(1.6, 3.8) : rand(1, 2.6),
    phase: rand(0, Math.PI * 2),
    sway: rand(0.4, 1.5),
    alpha: front ? rand(0.14, 0.4) : rand(0.1, 0.32),
  }
}

/** Cache the rock, which only changes on resize. */
function buildSilhouette(w, h) {
  const cv = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.width = Math.ceil(w * dpr)
  cv.height = Math.ceil(h * dpr)
  const g = cv.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Distant ridges first, dimmer the further back they sit.
  for (const r of ridges) {
    g.beginPath()
    g.moveTo(r.pts[0].x, h + 20)
    for (const p of r.pts) g.lineTo(p.x, p.y)
    g.lineTo(r.pts[r.pts.length - 1].x, h + 20)
    g.closePath()
    g.fillStyle = `rgba(9, 18, 15, ${r.depth})`
    g.fill()
  }

  // The mountain itself.
  const m = mountain
  g.beginPath()
  g.moveTo(m.left[m.left.length - 1].x, h + 20)
  for (let i = m.left.length - 1; i >= 0; i--) g.lineTo(m.left[i].x, m.left[i].y)
  g.lineTo(m.rimL.x, m.rimL.y)
  g.lineTo(m.rimR.x, m.rimR.y)
  for (const p of m.right) g.lineTo(p.x, p.y)
  g.lineTo(m.right[m.right.length - 1].x, h + 20)
  g.closePath()

  const grd = g.createLinearGradient(0, m.peakY, 0, h)
  grd.addColorStop(0, '#0d1a15')
  grd.addColorStop(1, '#030806')
  g.fillStyle = grd
  g.fill()
  return cv
}

// The box's height, not innerHeight: the box is 100lvh, so a phone's URL bar sliding away does not rebuild the
// mountain (it jumped on every scroll turn).
const viewH = () => host.value?.clientHeight || window.innerHeight

function layout() {
  const cv = canvas.value
  if (!cv) return false
  const w = window.innerWidth
  const h = viewH()
  // Finite check first: `NaN < 2` is false, so a non-finite viewport used to
  // walk straight past this guard and NaN-poison the whole build, throwing on
  // createLinearGradient once it reached the silhouette.
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) return false
  lastW = w
  lastH = h

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.width = Math.ceil(w * dpr)
  cv.height = Math.ceil(h * dpr)
  cv.style.width = `${w}px`
  cv.style.height = `${h}px`
  if (veil.value) {
    veil.value.width = cv.width
    veil.value.height = cv.height
  }

  if (!spriteGlow) spriteGlow = makeGlow()
  seedForRoute()
  mountain = buildMountain(w, h)
  ridges = buildRidges(w, h)
  flows = buildFlows(flows)
  silhouette = buildSilhouette(w, h)

  const mobile = window.matchMedia?.('(max-width: 768px)').matches
  burst = []
  // Honour the slider. This used to be min(w/16, count), which silently capped
  // a requested 112 to 94 on a 1500px screen and made the plume look thin.
  // Profile density thins the plume and ash on pages that are mostly reading.
  const n = Math.round(tune.count * prof.density * (mobile ? 0.45 : 1))
  drift = Array.from({ length: n }, () => spawnDrift(w, h, false))

  // Ash is weather: it has to hold the same density per screen area at every
  // size. A flat count spread the same handful of flakes over a 2M-pixel
  // desktop as over a phone, which is what made it look muted on a wide window.
  const areaScale = (w * h) / REF_AREA
  const total = Math.round(tune.ash * prof.density * areaScale * (mobile ? 0.5 : 1))
  const frontCount = Math.round(total * 0.4)
  ashBack = Array.from({ length: total - frontCount }, () => spawnAsh(w, h, false, false))
  ashFront = Array.from({ length: frontCount }, () => spawnAsh(w, h, false, true))
  return true
}

/**
 * Rebuild for a new viewport, at most once a frame.
 *
 * layout() throws away the cached silhouette and every particle, so running it
 * raw on a resize stream meant a full rebuild per event for the length of a
 * drag. Coalescing to the next frame and skipping same-size events keeps a
 * resize cheap; mobile chrome in particular fires resize constantly as the URL
 * bar slides without the viewport really changing.
 */
function relayout() {
  if (relayoutPending) return
  relayoutPending = requestAnimationFrame(() => {
    relayoutPending = 0
    if (window.innerWidth === lastW && viewH() === lastH) return
    if (layout()) draw(1)
  })
}

/** A pulse from the vent: a burst of sparks straight up out of the crater. */
function erupt() {
  if (!mountain) return
  const n = Math.round(rand(6, 22) * tune.sparks)
  for (let i = 0; i < n; i++) {
    if (burst.length > 500) break
    const speed = rand(2.2, 6.5)
    const angle = -Math.PI / 2 + rand(-0.5, 0.5)
    burst.push({
      x: mountain.peakX + rand(-mountain.craterHalf * 0.8, mountain.craterHalf * 0.8),
      y: mountain.peakY + rand(-2, 8),
      px: 0,
      py: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(0.9, 2.2),
      age: 0,
      life: rand(0.7, 2.4),
      alpha: rand(0.75, 1),
      green: Math.random() < 0.05,
    })
  }
  mountain.flare = 1
}

function draw(dt) {
  const cv = canvas.value
  if (!cv || !silhouette || !mountain) return
  const ctx = cv.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = cv.width / dpr
  const h = cv.height / dpr
  const secs = (dt * 16.7) / 1000
  const m = mountain

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // Over the archive plaque the near ash is drawn a shade lighter and a touch
  // larger, or it vanishes against the blackened iron.
  const fallAsh = (flakes, c = ctx, over = false) => {
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = over ? '#9a928a' : '#6b6560'
    const grow = over ? 1.4 : 1
    for (const a of flakes) {
      a.y += a.vy * dt
      a.phase += 0.02 * dt
      a.x += (a.drift + Math.sin(a.phase) * 0.2 * a.sway) * dt
      if (a.y > h + 20) Object.assign(a, spawnAsh(w, h, true, a.front))
      c.globalAlpha = a.alpha
      c.fillRect(a.x, a.y, a.size * grow, a.size * grow)
    }
    c.globalAlpha = 1
  }
  const vctx = veil.value?.getContext('2d')
  if (vctx) {
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    vctx.clearRect(0, 0, w, h)
  }

  // 1. Ash, falling behind the mountain. The nearer layer falls in step 5b.
  fallAsh(ashBack)

  // 2. Light thrown up out of the caldera, behind the rock.
  const flare = m.flare || 0
  const breathe = 0.6 + Math.sin(t * 0.45) * 0.4
  // Lava and the caldera are the brightest things on screen, so profile density
  // has to reach them — thinning the plume alone leaves a reading page glowing.
  const calderaHeat = (tune.caldera * breathe + flare * 0.7) * 1.1 * prof.density
  ctx.globalCompositeOperation = 'lighter'
  const cs = m.craterHalf * (7 + flare * 2)
  ctx.globalAlpha = Math.max(0, calderaHeat * 0.5)
  ctx.drawImage(spriteGlow, m.peakX - cs / 2, m.peakY - cs * 0.62, cs, cs * 0.9)
  deathfireHeat.breathe = breathe
  deathfireHeat.flare = flare
  if (m.flare) m.flare = Math.max(0, m.flare - secs * 1.8)

  // 3. The rock.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.drawImage(silhouette, 0, 0, w, h)

  // 4. Lava running down the flanks, drawn over the rock as channels through it.
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const f of flows) {
    // Floored well clear of zero — this used to run 0.45 +/- 0.55, which
    // touches negative for part of every cycle. heat <= 0.01 then skipped the
    // whole channel, so each flow blinked fully out of existence on its own
    // independent cycle. Breathes between 0.44 and 1 instead of 0 and 1.
    const pulse = 0.72 + Math.sin(t * f.rate + f.phase) * 0.28
    const heat = f.heat * pulse * tune.flowHeat * prof.density
    f._heat = heat // read by the chunk pass below, after this loop's dash state is gone
    if (heat <= 0.01) continue
    ctx.beginPath()
    ctx.moveTo(f.pts[0].x, f.pts[0].y)
    for (const p of f.pts) ctx.lineTo(p.x, p.y)

    // Bloom, body, then a tight core — molten rock never reads as one stroke.
    // Fully solid: a dashed version of this was tried and read as a string of
    // separate glowing capsules, not a flow — the gap was bigger than the
    // dash. The channel itself always stays one continuous line; motion comes
    // from the travelling highlight below instead, layered on top of it.
    ctx.globalAlpha = Math.max(0, heat * 0.22)
    ctx.strokeStyle = '#e0431d'
    ctx.lineWidth = f.width * 6
    ctx.stroke()
    ctx.globalAlpha = Math.max(0, heat * 0.8)
    ctx.strokeStyle = '#ff8a3d'
    ctx.lineWidth = f.width * 1.8
    ctx.stroke()
    ctx.globalAlpha = Math.max(0, heat)
    ctx.strokeStyle = '#ffe6c0'
    ctx.lineWidth = f.width * 0.55
    ctx.stroke()

    // Magma packets: not a separate shape riding the line — a brighter
    // highlight painted over a moving stretch of the *same* polyline. Drawing
    // it as its own sprite (a circle sliding along the path) was the first
    // attempt, and it read as beads — hot tic-tacs — because nothing tied it
    // to the line it was supposed to be part of. Restroking a slice of the
    // real path can't detach from it.
    for (const p of f.packets) {
      p.u += p.speed * dt
      if (p.u > 1) p.u -= 1
      const edge = Math.min(p.u, 1 - p.u)
      const fade = Math.min(1, edge * 6)
      if (fade <= 0.02) continue
      const span = 0.05 * p.size
      const lo = Math.max(0, p.u - span)
      const hi = Math.min(1, p.u + span)
      const nSeg = f.pts.length - 1
      const i0 = Math.floor(lo * nSeg)
      const i1 = Math.ceil(hi * nSeg)
      if (i1 <= i0) continue
      ctx.beginPath()
      const start = pointOnFlow(f, lo)
      ctx.moveTo(start.x, start.y)
      for (let k = i0; k <= i1; k++) ctx.lineTo(f.pts[k].x, f.pts[k].y)
      const end = pointOnFlow(f, hi)
      ctx.lineTo(end.x, end.y)
      const hot = heat * fade
      ctx.globalAlpha = Math.max(0, hot * 0.5)
      ctx.strokeStyle = '#ffb066'
      ctx.lineWidth = f.width * 2
      ctx.stroke()
      ctx.globalAlpha = Math.max(0, hot)
      ctx.strokeStyle = '#fff6e6'
      ctx.lineWidth = f.width * 0.65
      ctx.stroke()
    }
  }

  // 4b. Rock chunks tumbling in the flow — dark against the lava, so this
  // runs source-over rather than the additive blend everything else uses.
  ctx.globalCompositeOperation = 'source-over'
  for (const f of flows) {
    for (const c of f.chunks) {
      c.u += c.speed * dt
      if (c.u > 1) {
        c.u -= 1
        c.angle = rand(0, Math.PI * 2) // runtime, not seeded — see `rand` above
      }
      c.angle += c.spin * 0.01 * dt
      const pt = pointOnFlow(f, c.u)
      const edge = Math.min(c.u, 1 - c.u)
      const fade = Math.min(1, edge * 8) * Math.max(0, f._heat)
      if (fade <= 0.02) continue
      ctx.save()
      ctx.translate(pt.x, pt.y)
      ctx.rotate(c.angle)
      ctx.globalAlpha = fade
      ctx.fillStyle = '#170b06'
      ctx.beginPath()
      ctx.moveTo(c.shape[0].x * c.size, c.shape[0].y * c.size)
      for (let k = 1; k < c.shape.length; k++) {
        ctx.lineTo(c.shape[k].x * c.size, c.shape[k].y * c.size)
      }
      ctx.closePath()
      ctx.fill()
      // Leading edge catches the heat it's floating in.
      ctx.strokeStyle = '#ff8a3d'
      ctx.globalAlpha = fade * 0.55
      ctx.lineWidth = Math.max(0.6, c.size * 0.12)
      ctx.beginPath()
      ctx.moveTo(c.shape[0].x * c.size, c.shape[0].y * c.size)
      ctx.lineTo(c.shape[1].x * c.size, c.shape[1].y * c.size)
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.globalCompositeOperation = 'lighter'

  // 5. The lit crater mouth.
  ctx.globalAlpha = Math.max(0, calderaHeat)
  ctx.strokeStyle = '#ffd9a0'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(m.rimL.x, m.rimL.y)
  ctx.lineTo(m.rimR.x, m.rimR.y)
  ctx.stroke()
  const ms = m.craterHalf * 2.6
  ctx.globalAlpha = Math.max(0, calderaHeat * 0.85)
  ctx.drawImage(spriteGlow, m.peakX - ms / 2, m.peakY - ms * 0.35, ms, ms * 0.7)

  // 5b. The near ash, in front of the rock — this is the half that makes the
  // fall read across the whole window rather than only in the open sky.
  if (ashOver.value && vctx) fallAsh(ashFront, vctx, true)
  else fallAsh(ashFront)

  // 6. The plume: continuous sparks and embers off the summit.
  ctx.lineCap = 'round'
  const stepParticle = (e, gravity) => {
    e.age += secs
    if (e.kind === 'spark') {
      e.px = e.x
      e.py = e.y
      e.vy += gravity * dt
      e.x += e.vx * tune.speed * dt
      e.y += e.vy * tune.speed * dt
    } else {
      e.y -= e.vy * tune.speed * dt
      e.phase += 0.026 * dt
      e.x += (e.vx + Math.sin(e.phase) * 0.15 * e.sway) * dt
    }
  }
  const paint = (e, fade) => {
    if (e.kind === 'spark') {
      ctx.globalAlpha = Math.max(0, e.alpha * fade)
      ctx.strokeStyle = e.green ? '#8bf09a' : '#ffd9a0'
      ctx.lineWidth = e.size * tune.scale
      ctx.beginPath()
      ctx.moveTo(e.px, e.py)
      ctx.lineTo(e.x, e.y)
      ctx.stroke()
      const hs = e.size * tune.scale * 3
      ctx.globalAlpha = Math.max(0, e.alpha * fade * 0.7)
      ctx.drawImage(spriteGlow, e.x - hs / 2, e.y - hs / 2, hs, hs)
      return
    }
    const flick = 0.74 + Math.sin(e.phase * 2.4) * 0.26
    const es = e.size * tune.scale
    ctx.globalAlpha = Math.max(0, e.alpha * fade * flick)
    ctx.drawImage(spriteGlow, e.x - es / 2, e.y - es / 2, es, es)
    if (e.green) {
      ctx.globalAlpha = Math.max(0, e.alpha * fade * flick * 0.5)
      ctx.fillStyle = '#59d66c'
      ctx.beginPath()
      ctx.arc(e.x, e.y, es * 0.32, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (const e of drift) {
    stepParticle(e, 0.055)
    if (e.age >= e.life || e.y < -40 || e.y > h + 40) {
      Object.assign(e, spawnDrift(w, h, true))
      continue
    }
    paint(e, lifeFade(e))
  }

  // 7. Eruption sparks.
  for (let i = burst.length - 1; i >= 0; i--) {
    const s = burst[i]
    s.kind = 'spark'
    stepParticle(s, 0.07)
    if (s.age >= s.life || s.y > h + 30) {
      burst.splice(i, 1)
      continue
    }
    paint(s, 1 - s.age / s.life)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function frame(now) {
  if (stopped) return
  raf = requestAnimationFrame(frame)
  if (hidden) return
  const elapsed = now - last
  if (elapsed < 1000 / FPS) return
  const dt = Math.min(elapsed / 16.7, 3)
  last = now
  t += elapsed / 1000

  if (tune.sparks > 0 && tune.eruptRate > 0 && t >= nextPulse) {
    erupt()
    nextPulse = t + rand(2.5, 9) / tune.eruptRate
  }

  draw(dt)
}

const onVisibility = () => (hidden = document.hidden)

watch(() => route.path, () => {
  if (layout()) draw(1)
})

watch(
  () => [
    tune.height,
    tune.width,
    tune.offsetX,
    tune.flows,
    tune.ridges,
    tune.ash,
    tune.count,
    tune.faceSpread,
    randomize.offsetX,
    randomize.flows,
    randomize.ridges,
    randomize.asymmetry,
    // This page's profile, so tuning it in the panel rebuilds immediately.
    profileFor(route.path).bearing,
    profileFor(route.path).scale,
    profileFor(route.path).variance,
    profileFor(route.path).density,
  ],
  () => {
    if (layout()) draw(1)
  },
)

onMounted(() => {
  if (!layout()) return

  // Resize handling is set up before the reduced-motion branch: a still frame
  // still has to be the right size. It used to be registered only on the live
  // path, so with reduced motion on, the mountain kept whatever dimensions the
  // first paint gave it for the life of the page.
  window.addEventListener('resize', relayout, { passive: true })
  // The window event misses anything that changes the box without resizing the
  // window — an embedded context, or a scrollbar coming and going.
  if ('ResizeObserver' in window && host.value) {
    resizeObserver = new ResizeObserver(relayout)
    resizeObserver.observe(host.value)
  }

  if (!motionAllowed()) {
    t = 2.5
    draw(1)
    mode.value = 'still'
    return
  }

  mode.value = 'live'
  raf = requestAnimationFrame(frame)
  document.addEventListener('visibilitychange', onVisibility)
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
  mountain = null
  ridges = []
  flows = []
  drift = []
  burst = []
  ashBack = []
  ashFront = []
  silhouette = null
})
</script>

<template>
  <div ref="host" class="deathfire" :data-mode="mode" :style="glowStyle" aria-hidden="true">
    <canvas ref="canvas" class="deathfire-canvas" />
  </div>
  <canvas v-show="ashOver" ref="veil" class="deathfire-veil" aria-hidden="true" />
</template>

<style scoped>
/* 100lvh, not inset: 0: the full height with a phone's URL bar hidden, so the box keeps its size while it slides. */
.deathfire {
  position: fixed;
  inset: 0 0 auto;
  height: 100vh;
  height: 100lvh;
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
  inset: 0 0 auto;
  z-index: 40;
  width: 100%;
  height: 100vh;
  height: 100lvh;
  pointer-events: none;
}
</style>
