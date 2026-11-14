// THROWAWAY MOCK VIEWER. Loads the real page in a same-origin frame and swaps only the volcano canvas for the mock
// drawing, so the nav, the fire title, the buttons and the muster list are all the real ones.
//
// URL switches: ?mode=live|mock  ?comp=a|b  ?pal=forge|molten|doom  ?size=full|1200|768|390|WxH (360x740)  ?moon=0..1  ?freeze=1
//               ?t=seconds  ?bare=1 (no rail)  ?off=plume,ash  ?path=/companies
//               ?phone=roof|stack (default stack; only acts when the frame is at or under the cut-off)
//               ?cut=px (the phone and tablet cut-off, default 768; 600 was the first guess)
//               ?gap=px (stack: how far the spire tip stands under the lowest button, default 14)  ?debug=1 (numbers)
//               ?px=0..1 (peak position across the screen, phones only)
//               ?inner=left|right (where the mountain stands on pages other than home, desktop only; default right)
//               ?tn=key:value,key:value (tuner values that differ from their defaults; the rail writes this for you)
//               ?dw=1 (draw the mountain on Deathwatch pages too; without it they show no mountain: Deathwatch is off planet)
//               ?lvl=0..1 (hold the lake at this level; without it the lake starts at the tuner's "Lake start" and grows)
//               ?grow=0|1 (force the growth off or on)  ?fast=1 (the lake fills 30 times as fast, to watch it)
//               ?spill=0..1 (hold the spill at this much; use with ?lvl=1)
//               ?mtn=live (paint the mountain here instead of using the baked picture)
//               ?moon=0..1 also stops the sky's clock (0.5 is the closest pass and brings a Time of Trial, as on the live
//               site)  ?skyfast=1 (the moon crosses in 30 seconds; a trial still runs at its own length and carries the moon)
//               ?trial=1|2|3 (start a Time of Trial of that tier)
import { createScene, excitement, trialLength, trialLevel } from './mock.js'

const q = new URLSearchParams(location.search)
const LAYERS = ['sky', 'moon', 'plume', 'ridges', 'relief', 'river', 'lake', 'monolith', 'fog', 'embers', 'ash']
const off = new Set((q.get('off') || '').split(',').filter(Boolean))
const state = {
  // the mountain: 'baked' draws the ready-made picture (./baked/, written by bake.mjs) where there is one for the
  // drawing asked for; 'live' paints it here, as the sliders say
  mtn: q.get('mtn') === 'live' ? 'live' : 'baked',
  mode: q.get('mode') || 'mock',
  size: q.get('size') || 'full',
  moon: q.has('moon') ? parseFloat(q.get('moon')) : 0.42,
  frozen: q.get('freeze') === '1',
  layers: Object.fromEntries(LAYERS.map((l) => [l, !off.has(l)])),
  // where the peak stands: 'a' is where the live hero has it; 'b' moves it left and turns the breach to face right,
  // so the spire and the river both stand clear of the title
  comp: q.get('comp') || 'b',
  // the lava's colours: 'molten' is the title's Doom ramp graded toward deep orange; 'doom' is that ramp untouched;
  // 'forge' blends the two (tuner: Doom tint, Red depth)
  pal: q.get('pal') || 'forge',
  // phone layouts: 'roof' keeps the hero text mid-screen and roofs the river over wherever text sits on it; 'stack'
  // lifts the hero text to the top of the screen and stands the whole mountain below it
  phone: q.get('phone') === 'roof' ? 'roof' : 'stack',
  // pages other than home: 'left' keeps the home composition, 'right' mirrors the mountain to the right edge, clear of
  // the page header
  inner: q.get('inner') === 'left' ? 'left' : 'right',
}
const COMPS = { a: { faceX: 0.29, flip: false }, b: { faceX: 0.14, flip: true } }
// The baked mountain: one picture for desktop and one for phones, each with where its peak and rim are. The sliders
// that shape the mountain are baked in, so moving any of them off its default paints the mountain live again.
const baked = { desktop: null, phone: null }
const MOUNTAIN_KEYS = ['baseW', 'crown', 'rock', 'columns', 'planes']
let mtnNow = 'live' // what the scene on screen was built with
async function loadBaked() {
  try {
    const meta = await (await fetch('./baked/mountain.json', { cache: 'no-store' })).json()
    for (const kind of ['desktop', 'phone']) {
      if (!meta[kind]) continue
      const blob = await (await fetch(`./baked/mountain-${kind}.webp`, { cache: 'no-store' })).blob()
      baked[kind] = { image: await createImageBitmap(blob), meta: meta[kind], kb: Math.round(blob.size / 1024) }
    }
  } catch {
    // none baked yet: everything is painted live
  }
  showMtn()
  rebuild()
}
// At or under this width the page gets the phone drawing and the stack layout. 768 is the live site's own breakpoint.
const CUT = parseInt(q.get('cut'), 10) || 768
// The tuner: named numbers handed to the scene as `tune`. To add a knob: add a row here, read `o.tune.<key>` in mock.js.
const TUNE = [
  { key: 'peakH', label: 'Peak height', min: 0.5, max: 1.05, step: 0.01, def: 0.72 },
  { key: 'baseW', label: 'Base width', min: 0.4, max: 1.6, step: 0.01, def: 1.35 },
  { key: 'crown', label: 'Crown size', min: 0.6, max: 1.8, step: 0.02, def: 1.25 },
  { key: 'rock', label: 'Rock texture', min: 0, max: 2, step: 0.05, def: 1 },
  { key: 'columns', label: 'Basalt columns', min: 0, max: 2, step: 0.05, def: 1 },
  { key: 'planes', label: 'Big planes', min: 0, max: 1.5, step: 0.05, def: 0.55 },
  { key: 'ranges', label: 'Far peaks', min: 0, max: 3, step: 0.05, def: 1 },
  { key: 'rangeH', label: 'Far peak height', min: 0.4, max: 2, step: 0.02, def: 1 },
  { key: 'haze', label: 'Haze', min: 0, max: 1, step: 0.02, def: 0.5 },
  { key: 'lavaTint', label: 'Doom tint', min: 0, max: 1, step: 0.02, def: 0.5 },
  { key: 'lavaRed', label: 'Red depth', min: 0, max: 1, step: 0.02, def: 0.5 },
  { key: 'lavaHeat', label: 'Lava heat', min: 0.5, max: 1.5, step: 0.02, def: 1.12 },
  { key: 'plume', label: 'Plume', min: 0, max: 2, step: 0.05, def: 1.3 },
  { key: 'embers', label: 'Embers', min: 0, max: 3, step: 0.05, def: 2.3 },
  { key: 'lake', label: 'Lake size', min: 0.6, max: 1.8, step: 0.02, def: 1 },
  { key: 'lakeCrust', label: 'Lake crust', min: 0, max: 1, step: 0.02, def: 0.3 },
  { key: 'lakeHeat', label: 'Lake heat', min: 0.6, max: 1.4, step: 0.02, def: 1 },
  { key: 'lakeStart', label: 'Lake start', min: 0, max: 1, step: 0.01, def: 0.3 },
  { key: 'lakeFill', label: 'Fill time (min)', min: 0.5, max: 20, step: 0.5, def: 5 },
  { key: 'fog', label: 'Fog', min: 0, max: 2, step: 0.05, def: 1 },
]
const tuneState = Object.fromEntries(TUNE.map((d) => [d.key, d.def]))
for (const pair of (q.get('tn') || '').split(',')) {
  const [k, v] = pair.split(':')
  if (k in tuneState && Number.isFinite(parseFloat(v))) tuneState[k] = parseFloat(v)
}
// The lake's level: how much lava the basin holds, 0 (only the pool at the inlet) to 1 (to the brim). The viewer owns
// it, so it outlives every rebuild (a tuner drag, a resize, a change of page). It rises with time, as the river pours
// in: "Fill time" is the minutes from empty to the brim, and "Lake start" is where it stands when the page opens.
const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const lakeState = {
  level: q.has('lvl') ? unit(parseFloat(q.get('lvl')) || 0) : tuneState.lakeStart,
  grow: q.has('grow') ? q.get('grow') === '1' : !q.has('lvl'),
  fast: q.get('fast') === '1',
  // once the lake is full it spills, and this rises from 0 to 1: the stream runs out to the edge over the first
  // tenth, then the light under it grows as the lava gathers below (about a minute and a half in all)
  spill: q.has('spill') ? unit(parseFloat(q.get('spill')) || 0) : 0,
}
const FAST = 30
const SPILL_SECS = 90
// The sky. Prometheus crosses once every 15 minutes on the wall clock, as on the live site, so every visitor sees the
// same moon. At its closest pass (mid-crossing) it brings the Time of Trial, its size drawn by chance. The viewer owns
// the clock and the trial (the live component does); the scene is told the moon's place and how hard the trial rages.
//
// While a Time of Trial is on, the trial is the moon's clock, and that is all: the moon is where the trial found it,
// carried on by the trial's own seconds at the sky's true pace. Nothing else moves it, whichever clock was running
// before. When the trial ends the moon goes on from where the trial left it.
const CYCLE_MS = 15 * 60 * 1000
const sky = {
  clock: !q.has('moon'), // follow the wall clock; dragging the moon, or ?moon=, takes it by hand
  fast: q.get('skyfast') === '1',
  at: Date.now() / CYCLE_MS, // where the moon is, in crossings: the whole part is which crossing, the rest how far across
  lastCycle: -1, // the crossing whose closest pass has been seen
  trialAt: -1, // seconds into the Time of Trial in progress; -1 when none
  trialTier: 1,
  trialClock: 0, // seconds until the blast throws again
  trial: 0, // how hard it rages now, 0 to 1
  trialFrom: null, // where the moon was (in crossings) when the trial in progress began
}
function startTrial(tier) {
  const roll = Math.random()
  sky.trialTier = tier || (roll < 0.05 ? 3 : roll < 0.3 ? 2 : 1)
  sky.trialAt = 0
  sky.trialClock = 0
  sky.trialFrom = null
}
/** Move the sky on by `secs`: the moon's place, and the Time of Trial. Returns the moon's phase. */
function skyStep(secs) {
  if (sky.trialAt >= 0) {
    // a trial is on: it is the moon's clock
    if (sky.trialFrom === null) sky.trialFrom = sky.at
    sky.at = sky.trialFrom + (sky.trialAt * 1000) / CYCLE_MS
  } else if (sky.clock && !sky.fast) {
    sky.at = Date.now() / CYCLE_MS // the wall clock every visitor shares
  } else if (sky.clock) {
    sky.at += (secs * 1000 * FAST) / CYCLE_MS // speeded up, to skip the waiting between passes
  } else {
    // by hand: the moon is where the handle is. Each time the handle comes back below half-way is a new crossing.
    let turn = Math.floor(sky.at)
    if (state.moon < 0.5 && sky.at - turn >= 0.5) turn++
    sky.at = turn + state.moon
  }
  const cycle = Math.floor(sky.at)
  const phase = sky.at - cycle
  state.moon = phase
  if (document.activeElement !== moonEl) moonEl.value = phase
  if (phase >= 0.5 && sky.lastCycle !== cycle) {
    sky.lastCycle = cycle
    // only if the pass is seen: a page opened long after it has nothing to catch
    if (phase < 0.56 && sky.trialAt < 0 && state.mode === 'mock') startTrial()
  }
  sky.trial = 0
  if (sky.trialAt >= 0) {
    sky.trialAt += secs
    sky.trial = trialLevel(sky.trialAt, sky.trialTier)
    if (sky.trialAt > trialLength(sky.trialTier)) {
      sky.trialAt = -1
      sky.trial = 0
      sky.trialFrom = null
    } else if (sky.trial > 0.2 && scene) {
      // the blast keeps throwing
      sky.trialClock -= secs
      if (sky.trialClock <= 0) {
        scene.erupt(0.9 + 1.2 * sky.trial, 0.4) // every one an eruption proper, cut short so they stand apart
        sky.trialClock = 2.8 - sky.trial * 1.5
      }
    }
  }
  return phase
}
let tuneTimer = 0
// What the stack layout asks of the real page: the hero starts under the nav instead of centring in the screen.
// .landing > section.hero is (0,2,1) against the scoped .hero[data-v] (0,2,0), so it wins whatever the style order.
// Stack layout: the text block starts under the nav and closes up a little, so the mountain keeps its height.
const STACK_CSS = [
  '.landing > section.hero { align-items: flex-start; padding-top: 1.5rem; }',
  '.landing > section.hero .hero-mark { margin-top: 0.9rem; }',
  '.landing > section.hero .tagline { margin-top: 0.6rem; }',
  '.landing > section.hero .cta-row { margin-top: 1.4rem; gap: 0.6rem; }',
].join('\n')
if (q.get('bare') === '1') document.body.classList.add('bare')

const frame = document.getElementById('frame')
const stage = document.getElementById('stage')
const note = document.getElementById('note')
let cv = null
let ctx = null
let scene = null
let host = null
let t = q.has('t') ? parseFloat(q.get('t')) : 0
let last = 0
let nextPulse = 3
let calmRects = []
let navBottom = 0
let calmAt = -1
let costAvg = 0
let costMax = 0 // the worst recent frame (it decays): the lake repaints a few times a second, so the mean hides its cost
let stacked = false // the stack layout is on in the frame right now
let built = null // the hero measurement the scene was built from (stack only)
let relayouts = 0
let debugLines = null

const PHONE_H = 844
function sizeFrame() {
  const sw = stage.clientWidth
  const sh = stage.clientHeight
  let w = sw
  let h = sh
  if (state.size !== 'full') {
    const [ws, hs] = state.size.split('x')
    w = parseInt(ws, 10)
    h = parseInt(hs, 10) || (w <= 500 ? PHONE_H : w <= 800 ? 1024 : 760)
  }
  const k = Math.min(1, sw / w, sh / h)
  frame.style.width = `${w}px`
  frame.style.height = `${h}px`
  frame.style.transform = k < 1 ? `scale(${k})` : ''
}

function measureCalm() {
  const win = frame.contentWindow
  const doc = frame.contentDocument
  const w = win.innerWidth
  const h = win.innerHeight
  const out = []
  const range = doc.createRange()
  for (const el of doc.querySelectorAll('h1, h2, h3, p, li, label, button, a, dt, dd, input, textarea, select, td')) {
    if (el.closest('.deathfire')) continue
    // stacked, the hero text is wholly above the river, so it casts no roof (its 48 px margin would otherwise
    // reach the first stretch of the river, which stands 18 px clear of it)
    if (stacked && el.closest('.hero')) continue
    let boxes
    if (/^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) boxes = [el.getBoundingClientRect()]
    else {
      range.selectNodeContents(el)
      boxes = range.getClientRects()
    }
    for (const r of boxes) {
      if (out.length >= 80) break
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue
      if (r.width * r.height > w * h * 0.2) continue
      out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom })
    }
  }
  calmRects = out
  // where the nav bar ends: what lies under it is hidden by it
  navBottom = doc.querySelector('header.nav')?.getBoundingClientRect().bottom ?? 0
}
const sstep = (x) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x
  return c * c * (3 - 2 * c)
}
function calm(x, y) {
  let k = 1
  for (const r of calmRects) {
    const d = Math.hypot(Math.max(r.l - x, 0, x - r.r), Math.max(r.t - y, 0, y - r.b))
    if (d < 48) k = Math.min(k, 0.1 + 0.9 * sstep(d / 48))
  }
  return k
}

/** Is the stack layout wanted in the frame as it is now? Only on a phone width, and only when picked. */
function wantStack() {
  return state.phone === 'stack' && frame.contentWindow.innerWidth <= CUT
}
/** Put the stack layout's one style element into the frame, or take it out. */
function syncStackStyle(on) {
  const doc = frame.contentDocument
  const have = doc.getElementById('mock-phone-stack')
  if (on && !have) {
    const el = doc.createElement('style')
    el.id = 'mock-phone-stack'
    el.textContent = STACK_CSS
    doc.head.appendChild(el)
  } else if (!on && have) have.remove()
}
/** Where the hero text ends, in page px (the same as viewport px at scroll 0): the lowest button, and the big title. */
function measureHero() {
  const doc = frame.contentDocument
  const sy = frame.contentWindow.scrollY
  let text = 0
  for (const el of doc.querySelectorAll('.hero .cta-row > *')) text = Math.max(text, el.getBoundingClientRect().bottom)
  if (!text) return null
  const title = doc.querySelector('.hero .wordmark')
  return { text: text + sy, title: title ? title.getBoundingClientRect().bottom + sy : 0 }
}
/** The numbers ?debug=1 prints on the canvas, taken once per rebuild. */
function debugFor(w, h) {
  const doc = frame.contentDocument
  const info = scene.info
  const nav = doc.querySelector('header.nav')
  const eyebrow = doc.querySelector('.hero .eyebrow')
  const sy = frame.contentWindow.scrollY
  const f = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-')
  return [
    `${w}x${h} ${info.stack ? 'stack' : state.phone === 'roof' && w <= CUT ? 'roof' : 'plain'}`,
    `nav bottom ${f(nav && nav.getBoundingClientRect().bottom + sy)}  eyebrow top ${f(eyebrow && eyebrow.getBoundingClientRect().top + sy)}`,
    `title bottom ${f(built?.title)}  text bottom ${f(built?.text)}`,
    `breach y ${f(info.breach.y)}  tip y ${f(info.tipY)}  rim y ${f(info.rimY)}`,
    `H ${f(info.H)}  ch ${f(info.ch)}  peak x ${f(info.peakX)}  shore y ${f(info.shoreY)}`,
  ]
}

function rebuild() {
  if (!cv) return
  const win = frame.contentWindow
  const w = win.innerWidth
  const h = win.innerHeight
  if (w < 2 || h < 2) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.width = Math.ceil(w * dpr)
  cv.height = Math.ceil(h * dpr)
  ctx = cv.getContext('2d')
  const comp = COMPS[state.comp] || COMPS.a
  // the stack layout is a style in the page: set it first, then measure, then the calm rects (the text has moved)
  stacked = wantStack()
  syncStackStyle(stacked)
  built = stacked ? measureHero() : null
  measureCalm()
  // The pages other than home show the home scene mirrored (the mountain on the right), unless asked to keep it left.
  const home = framePath() === '/' || state.inner === 'left'
  // The mountain ready-made, when there is a picture for this drawing: the home composition, the mountain's sliders
  // where they were when it was baked, and the relief on.
  const kind = w > CUT ? 'desktop' : 'phone'
  const asBaked = MOUNTAIN_KEYS.every((k) => tuneState[k] === TUNE.find((d) => d.key === k).def)
  const ready = state.mtn === 'baked' && baked[kind] && asBaked && state.comp === 'b' && state.layers.relief ? baked[kind] : null
  mtnNow = ready ? 'baked' : 'live'
  // phones keep one composition for now: the peak a little left of centre
  scene = createScene(w, h, {
    dpr,
    layers: state.layers,
    palette: state.pal,
    phoneMax: CUT,
    quiet: framePath() !== '/', // no live far volcanoes behind the small text of the other pages
    tune: { ...tuneState },
    lakeLevel: lakeState.level,
    ...(ready ? { mountain: ready, riverU: ready.meta.riverU } : {}),
    ...(w > CUT ? { ...comp, mirror: !home } : { flip: comp.flip, ...(q.has('px') ? { faceX: Math.min(0.9, Math.max(0.1, parseFloat(q.get('px')) || 0.36)) } : {}) }),
    ...(built ? { textBottom: built.text, titleBottom: built.title, textGap: q.has('gap') ? parseFloat(q.get('gap')) : undefined } : {}),
  })
  window.__mock = { scene, w, h, lake: lakeState }
  if (q.get('debug') === '1') debugLines = debugFor(w, h)
  calmAt = -1
}

// Deathwatch is off planet: nothing is drawn there unless its keeper switches the mountain on (?dw=1 stands in for
// that switch). In the mock that means no canvas at all and no ash veil over the page.
let lastPath = ''
const framePath = () => {
  try {
    return frame.contentWindow.location.pathname
  } catch {
    return ''
  }
}
const offPlanet = () => /^\/deathwatch(\/|$)/.test(framePath()) && q.get('dw') !== '1'
function applyMode() {
  if (!host) return
  const mock = state.mode === 'mock'
  const dark = mock && offPlanet()
  for (const el of host.querySelectorAll('.deathfire-canvas, .deathfire-glow')) el.style.visibility = mock ? 'hidden' : ''
  cv.style.display = mock && !dark ? '' : 'none'
  const veil = frame.contentDocument?.querySelector('.deathfire-veil')
  if (veil) veil.style.visibility = dark ? 'hidden' : ''
  lastPath = framePath()
  for (const b of document.querySelectorAll('#modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode))
}

function attach() {
  const doc = frame.contentDocument
  host = doc?.querySelector('.deathfire')
  if (!host) return setTimeout(attach, 150)
  cv = doc.createElement('canvas')
  cv.className = 'mock-canvas'
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
  host.appendChild(cv)
  frame.contentWindow.addEventListener('resize', () => {
    relayouts = 0 // a new size starts a new allowance for the layout to settle
    rebuild()
  })
  rebuild()
  applyMode()
  requestAnimationFrame(tick)
}

function tick(now) {
  requestAnimationFrame(tick)
  // the page inside the frame can change route by itself (a nav click): the Deathwatch rule follows it
  if (host && framePath() !== lastPath) {
    applyMode()
    rebuild() // home and the other pages can stand the mountain in different places
  }
  if (!scene || state.mode !== 'mock') return
  if (offPlanet()) return
  const elapsed = now - last
  if (elapsed < 1000 / 30) return
  last = now
  const dt = state.frozen ? 0 : Math.min(elapsed / 16.7, 3)
  const secs = state.frozen ? 0 : Math.min(elapsed, 100) / 1000
  t += secs
  // the sky's clock: where Prometheus is, whether a Time of Trial is on, and how stirred that leaves the mountain
  const phase = skyStep(secs)
  const stirred = excitement(phase, sky.trial)
  // the mountain's own pulse: the more stirred, the oftener
  if (!state.frozen && t >= nextPulse) {
    // most are spits; about one in five is an eruption proper, and a stirred mountain throws more of those
    scene.erupt(Math.random() < 0.2 + 0.25 * stirred ? 1.5 + Math.random() : 0.55 + Math.random() * 0.5)
    nextPulse = t + (2.5 + Math.random() * 6.5) / (1 + 1.6 * stirred)
  }
  if (calmAt < 0 || t - calmAt > 0.4 || state.frozen) {
    measureCalm()
    calmAt = t
    // The stack layout hangs on where the hero text ends. It can move after the scene is built (a webfont, the route
    // arriving late), and then the mountain moves with it. The cap stops a layout that never settles from looping.
    if (stacked && relayouts < 12) {
      const now = measureHero()
      if (Math.abs((now?.text ?? 0) - (built?.text ?? 0)) > 2) {
        relayouts++
        rebuild()
        return
      }
    }
  }
  // The lake fills as the river pours in: "Fill time" is the minutes from where it starts to full, with the mountain
  // at rest (a stirred mountain fills it up to twice as fast). Full, it spills, and the spill builds. It is not
  // remembered: every visit starts again at "Lake start".
  if (!state.frozen && lakeState.grow) {
    const pace = secs * (lakeState.fast ? FAST : 1) * (1 + stirred)
    if (lakeState.level < 1) lakeState.level = Math.min(1, lakeState.level + (pace * Math.max(0.05, 1 - tuneState.lakeStart)) / (tuneState.lakeFill * 60))
    else lakeState.spill = Math.min(1, lakeState.spill + pace / SPILL_SECS)
    showLake()
  }
  // (a lake pulled back from full stops spilling, quickly)
  if (lakeState.level < 1 && lakeState.spill > 0 && !q.has('spill')) lakeState.spill = Math.max(0, lakeState.spill - secs / 4)
  const t0 = performance.now()
  scene.draw(ctx, t, dt, { calm, navBottom, moonPhase: phase, trial: sky.trial, lakeLevel: lakeState.level, spill: lakeState.spill })
  if (debugLines) {
    const info = scene.info
    ctx.save()
    ctx.globalAlpha = 1
    ctx.lineWidth = 1
    // ticks on the left edge: cyan the lowest button's bottom, yellow the breach, magenta the spire tip
    for (const [y, c] of [[built ? built.text : -9, '#18e0ff'], [info.breach.y, '#ffe040'], [info.tipY, '#ff40d0']]) {
      ctx.strokeStyle = c
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(36, y + 0.5)
      ctx.stroke()
    }
    ctx.font = 'bold 11px ui-monospace, Consolas, monospace'
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = '#000'
    ctx.shadowBlur = 3
    debugLines.forEach((s, i) => ctx.fillText(s, 6, scene.info.shoreY + 16 + i * 13))
    ctx.restore()
  }
  costAvg = costAvg * 0.95 + (performance.now() - t0) * 0.05
  costMax = Math.max(costMax * 0.995, performance.now() - t0)
  note.textContent = `draw ${costAvg.toFixed(2)} ms (worst ${costMax.toFixed(1)}) · t ${t.toFixed(1)} s\nbuild ${scene.info.timing.total} ms, mountain ${mtnNow}`
  skyOut.textContent =
    `moon ${phase.toFixed(3)}${sky.clock ? (sky.fast ? ' (clock x30)' : ' (clock)') : ' (by hand)'}\nstirred ${Math.round(stirred * 100)}%` +
    (sky.trialAt >= 0 ? `\ntrial ${'I'.repeat(sky.trialTier)} ${Math.round(sky.trial * 100)}%, ${Math.round(sky.trialAt)} of ${trialLength(sky.trialTier)} s` : '')
  window.__mock.sky = { phase, stirred, trial: sky.trial, tier: sky.trialTier, at: sky.trialAt, clock: sky.clock }
}

// ---- rail
const layersEl = document.getElementById('layers')
for (const l of LAYERS) {
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = state.layers[l]
  box.addEventListener('change', () => {
    state.layers[l] = box.checked
    rebuild()
  })
  label.append(box, l)
  layersEl.append(label)
}
for (const b of document.querySelectorAll('#modes button')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode
    applyMode()
  })
}
const markSize = () => {
  for (const b of document.querySelectorAll('#sizes button')) b.setAttribute('aria-pressed', String(b.dataset.size === state.size))
}
for (const b of document.querySelectorAll('#sizes button')) {
  b.addEventListener('click', () => {
    state.size = b.dataset.size
    markSize()
    sizeFrame()
  })
}
const markComp = () => {
  for (const b of document.querySelectorAll('#comps button')) b.setAttribute('aria-pressed', String(b.dataset.comp === state.comp))
}
for (const b of document.querySelectorAll('#comps button')) {
  b.addEventListener('click', () => {
    state.comp = b.dataset.comp
    markComp()
    rebuild()
  })
}
markComp()
const markPal = () => {
  for (const b of document.querySelectorAll('#pals button')) b.setAttribute('aria-pressed', String(b.dataset.pal === state.pal))
}
for (const b of document.querySelectorAll('#pals button')) {
  b.addEventListener('click', () => {
    state.pal = b.dataset.pal
    markPal()
    rebuild()
  })
}
markPal()
const markPhone = () => {
  for (const b of document.querySelectorAll('#phones button')) b.setAttribute('aria-pressed', String(b.dataset.phone === state.phone))
}
for (const b of document.querySelectorAll('#phones button')) {
  b.addEventListener('click', () => {
    state.phone = b.dataset.phone
    markPhone()
    relayouts = 0
    rebuild()
  })
}
markPhone()
const mtnOut = document.getElementById('mtn-out')
function showMtn() {
  for (const b of document.querySelectorAll('#mtns button')) b.setAttribute('aria-pressed', String(b.dataset.mtn === state.mtn))
  const have = ['desktop', 'phone'].filter((k) => baked[k])
  mtnOut.textContent = have.length ? have.map((k) => `${k} ${baked[k].kb} KB`).join(', ') : 'no baked picture: run bake.mjs'
}
for (const b of document.querySelectorAll('#mtns button')) {
  b.addEventListener('click', () => {
    state.mtn = b.dataset.mtn
    showMtn()
    rebuild()
  })
}
showMtn()
const markInner = () => {
  for (const b of document.querySelectorAll('#inners button')) b.setAttribute('aria-pressed', String(b.dataset.inner === state.inner))
}
for (const b of document.querySelectorAll('#inners button')) {
  b.addEventListener('click', () => {
    state.inner = b.dataset.inner
    markInner()
    relayouts = 0
    rebuild()
  })
}
markInner()
const moonEl = document.getElementById('moon')
moonEl.value = state.moon
const skyOut = document.getElementById('sky-out')
const skyClockEl = document.getElementById('sky-clock')
const skyFastEl = document.getElementById('sky-fast')
const showSky = () => {
  skyClockEl.setAttribute('aria-pressed', String(sky.clock))
  skyFastEl.setAttribute('aria-pressed', String(sky.fast))
}
// dragging the moon takes it off the clock
moonEl.addEventListener('input', () => {
  sky.clock = false
  state.moon = parseFloat(moonEl.value)
  // (in the middle of a trial the hand moves the moon, and the trial carries it on from where it is put)
  if (sky.trialAt >= 0) sky.trialFrom = Math.floor(sky.at) + state.moon - (sky.trialAt * 1000) / CYCLE_MS
  showSky()
})
moonEl.addEventListener('change', () => moonEl.blur())
skyClockEl.addEventListener('click', () => {
  sky.clock = !sky.clock
  showSky()
})
skyFastEl.addEventListener('click', () => {
  sky.fast = !sky.fast
  if (sky.fast) sky.clock = true
  showSky()
})
for (const b of document.querySelectorAll('#trials button')) b.addEventListener('click', () => startTrial(parseInt(b.dataset.trial, 10)))
if (q.has('trial')) startTrial(Math.min(3, Math.max(1, parseInt(q.get('trial'), 10) || 1)))
showSky()
const freezeEl = document.getElementById('freeze')
freezeEl.setAttribute('aria-pressed', String(state.frozen))
freezeEl.addEventListener('click', () => {
  state.frozen = !state.frozen
  freezeEl.setAttribute('aria-pressed', String(state.frozen))
})
document.getElementById('erupt').addEventListener('click', () => scene?.erupt(2.2)) // a big one, to look at
// the lake: a level you can drag, the growth on or off, a fast-forward to watch it fill, and back to the start
const lakeEl = document.getElementById('lake-level')
const lakeOut = document.getElementById('lake-out')
const lakeGrowEl = document.getElementById('lake-grow')
const lakeFastEl = document.getElementById('lake-fast')
function showLake() {
  if (document.activeElement !== lakeEl) lakeEl.value = lakeState.level
  lakeOut.textContent = `${Math.round(lakeState.level * 100)}%${lakeState.level >= 1 ? `, over the edge ${Math.round(lakeState.spill * 100)}%` : ''}`
  lakeGrowEl.setAttribute('aria-pressed', String(lakeState.grow))
  lakeFastEl.setAttribute('aria-pressed', String(lakeState.fast))
}
lakeEl.addEventListener('input', () => {
  lakeState.level = unit(parseFloat(lakeEl.value))
  showLake()
})
lakeEl.addEventListener('change', () => lakeEl.blur()) // let the growth move the handle again once the drag is over
lakeGrowEl.addEventListener('click', () => {
  lakeState.grow = !lakeState.grow
  showLake()
})
lakeFastEl.addEventListener('click', () => {
  lakeState.fast = !lakeState.fast
  showLake()
})
document.getElementById('lake-refill').addEventListener('click', () => {
  lakeState.level = tuneState.lakeStart
  lakeState.spill = 0
  showLake()
})
showLake()
window.addEventListener('resize', sizeFrame)

markSize()
sizeFrame()
frame.addEventListener('load', attach, { once: true })
frame.src = q.get('path') || '/'
loadBaked()

// ---- tuner
function tuneChanged() {
  const diff = TUNE.filter((d) => tuneState[d.key] !== d.def).map((d) => `${d.key}:${tuneState[d.key]}`)
  const u = new URL(location.href)
  if (diff.length) u.searchParams.set('tn', diff.join(','))
  else u.searchParams.delete('tn')
  history.replaceState(null, '', u)
  document.getElementById('tune-out').textContent = diff.join('\n') || 'all defaults'
  clearTimeout(tuneTimer)
  tuneTimer = setTimeout(rebuild, 120)
}
for (const d of TUNE) {
  const row = document.createElement('label')
  row.className = 'tune'
  const name = document.createElement('span')
  name.textContent = d.label
  d.val = document.createElement('output')
  d.val.textContent = String(tuneState[d.key])
  d.input = document.createElement('input')
  d.input.type = 'range'
  d.input.min = d.min
  d.input.max = d.max
  d.input.step = d.step
  d.input.value = tuneState[d.key]
  d.input.addEventListener('input', () => {
    tuneState[d.key] = parseFloat(d.input.value)
    d.val.textContent = d.input.value
    // dragging "Lake start" shows that level at once
    if (d.key === 'lakeStart') {
      lakeState.level = tuneState.lakeStart
      showLake()
    }
    tuneChanged()
  })
  row.append(name, d.val, d.input)
  document.getElementById('tuner').append(row)
}
document.getElementById('tune-reset').addEventListener('click', () => {
  for (const d of TUNE) {
    tuneState[d.key] = d.def
    d.input.value = d.def
    d.val.textContent = String(d.def)
  }
  tuneChanged()
})
document.getElementById('tune-out').textContent =
  TUNE.filter((d) => tuneState[d.key] !== d.def).map((d) => `${d.key}:${tuneState[d.key]}`).join('\n') || 'all defaults'
