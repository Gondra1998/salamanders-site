// The bake tool's page. Bakes the parts of the scene that are the same picture for every visitor, so no browser has to
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
// The mountain's numbers (base width, crown, rock, columns, planes) are baked in. To change them: put the numbers in
// TUNE below, bake again (`npm run deathfire:bake`). The two scenes it paints are in bakeScenes.js.
import { createScene } from '../../src/lib/deathfire/scene.js'
import { bakeScenes } from './bakeScenes.js'

const TUNE = {} // the mountain's numbers to bake with (empty: the scene's own defaults)
const QUALITY = 0.85

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
const scenes = bakeScenes(createScene, TUNE)
for (const kind of ['desktop', 'phone']) {
  const t0 = performance.now()
  const bake = scenes[kind]().info.bake
  out[kind] = { mountain: { ...bake.mountain.meta, ...picture(`mountain-${kind}.webp`, bake.mountain.cv) } }
  if (kind === 'desktop') out.moon = picture('moon.webp', bake.moon)
  const t = bake.mountain.meta.touches
  lines.push(`${kind} painted in ${Math.round(performance.now() - t0)} ms${t.left || t.right ? '  !! the mountain runs off the canvas: widen it' : ''}`)
}
document.getElementById('meta').textContent = JSON.stringify(out)
document.getElementById('log').textContent = lines.join('\n')
document.title = 'baked'
