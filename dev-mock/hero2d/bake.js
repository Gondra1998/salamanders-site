// THROWAWAY MOCK TOOL. Bakes the parts of the scene that are the same picture for every visitor, so no browser has to
// work them out: it paints them with the scene's own code, at the size the look was judged at, and leaves the pictures
// (WebP) and their measurements in the page for bake.mjs to write out.
//
// What is baked, and why:
//   - the mountain: most of what the scene costs to build (its rock skin above all), and the same shape at every window
//     size, so one picture scaled to the window's height serves them all. Two pictures: desktop, and phone (fewer
//     crests, a narrower base). The pages other than home draw the desktop one mirrored.
//   - the moon: one picture, big enough for its closest approach in a cataclysm on a large screen.
// A browser fetches only what its own window needs: the moon, and the mountain for its kind of device.
//
// What is not, though it was tried (2026-11-14): the ground's plates. As a picture they weighed 71 KB for phones and
// 159 KB for desktop and saved about 20 ms of a build: no bargain. The ground is worked out in the browser.
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
    moonR: 220, // the moon's radius: big enough for a window 1570 px tall (in Bret's it is 103 px at an ordinary closest pass)
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
const pictures = document.getElementById('pictures')
/** Put one picture in the page, under the file name it will be written to, and note its size. */
function picture(file, cv) {
  const url = cv.toDataURL('image/webp', QUALITY)
  const img = document.createElement('img')
  img.dataset.file = file
  img.alt = file
  img.src = url
  const cap = document.createElement('p')
  const kb = Math.round(((url.length - url.indexOf(',') - 1) * 0.75) / 1024)
  cap.textContent = `${file}: ${cv.width} x ${cv.height} px, about ${kb} KB`
  pictures.append(cap, img)
  return { file, px: [cv.width, cv.height] }
}
for (const [kind, make] of [['desktop', desktop], ['phone', phone]]) {
  const t0 = performance.now()
  const bake = make().info.bake
  out[kind] = { mountain: { ...bake.mountain.meta, ...picture(`mountain-${kind}.webp`, bake.mountain.cv) } }
  if (kind === 'desktop') out.moon = picture('moon.webp', bake.moon)
  const t = bake.mountain.meta.touches
  lines.push(`${kind} painted in ${Math.round(performance.now() - t0)} ms${t.left || t.right ? '  !! the mountain runs off the canvas: widen it' : ''}`)
}
document.getElementById('meta').textContent = JSON.stringify(out)
document.getElementById('log').textContent = lines.join('\n')
document.title = 'baked'
