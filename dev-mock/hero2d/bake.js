// THROWAWAY MOCK TOOL. Bakes the mountain: paints it alone with the scene's own code, at the size the look was judged
// at, and leaves the picture (WebP) and where its peak and rim are in the page for bake.mjs to write out.
//
// Why a picture: the mountain is most of what the scene costs to build (its rock skin above all), and it is the same
// shape at every window size, so one picture scaled to the window's height serves them all. Two are baked: desktop, and
// phone (fewer crests, a narrower base). The pages other than home draw the desktop one mirrored.
//
// The mountain sliders (base width, crown, rock, columns, planes) are baked in. To change them: move them in the mock,
// put the numbers in TUNE below, bake again.
import { createScene } from './mock.js'

const TUNE = {} // the tuner's numbers to bake with (empty: the defaults in mock.js)
const QUALITY = 0.85

// The window the look was judged in (Bret's, 2026-11-14). Everything that used to be measured against the window's
// width (where the river comes down, where the title stands, how far the lava's light reaches) is handed in as it was
// there, beside the mountain.
const REF = { w: 1596, h: 738, faceX: 0.14 }

function desktop() {
  const H = REF.h * 0.72 // the mock's default peak height
  const peak0 = REF.w * REF.faceX // where the peak stood in that window
  // a canvas wide enough for the whole mountain and its shoulders, which the window itself never shows
  const peakX = Math.round(1.7 * H)
  const w = Math.round(5.2 * H)
  const dpr = 1.5
  return createScene(w, REF.h, {
    dpr,
    rockRes: dpr,
    flip: true,
    faceX: peakX / w,
    footX: peakX + (REF.w * 0.276 - peak0),
    titleSpan: [peakX + (REF.w * 0.2 - peak0), peakX + (REF.w * 0.8 - peak0)],
    fall: REF.w * 0.034,
    tune: TUNE,
    bakeMountain: true,
  })
}

function phone() {
  // a 390 x 844 phone, the hero's lowest button ending at 352 (measured on the real page, spec section 7)
  const ref = { w: 390, h: 844, faceX: 0.36, textBottom: 352 }
  const peak0 = ref.w * ref.faceX
  const w = 1700
  const peakX = 800
  const dpr = 2
  return createScene(w, ref.h, {
    dpr,
    rockRes: dpr,
    phoneMax: 1e9, // a phone's mountain, whatever the canvas's width
    textBottom: ref.textBottom,
    flip: true,
    faceX: peakX / w,
    footX: peakX + 0.075 * ref.w,
    titleSpan: [peakX + (ref.w * 0.2 - peak0), peakX + (ref.w * 0.8 - peak0)],
    fall: ref.w * 0.034,
    tune: TUNE,
    bakeMountain: true,
    // a phone shows well under one mountain height left of the peak and a little over one right of it: the far reach
    // of the shoulders is left out of the picture
    bakeSpan: [-0.9, 1.6],
  })
}

const out = {}
const lines = []
for (const [kind, make] of [['desktop', desktop], ['phone', phone]]) {
  const t0 = performance.now()
  const { cv, meta } = make().info.bake
  const url = cv.toDataURL('image/webp', QUALITY)
  document.getElementById(kind).src = url
  out[kind] = { ...meta, px: [cv.width, cv.height] }
  const kb = Math.round((url.length - url.indexOf(',') - 1) * 0.75 / 1024)
  lines.push(`${kind}: ${cv.width} x ${cv.height} px, about ${kb} KB, ${Math.round(performance.now() - t0)} ms${meta.touches.left || meta.touches.right ? '  !! the mountain runs off the canvas: widen it' : ''}`)
}
document.getElementById('meta').textContent = JSON.stringify(out)
document.getElementById('log').textContent = lines.join('\n')
document.getElementById('log').style.whiteSpace = 'pre'
document.title = 'baked'
