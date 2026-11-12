/**
 * The centrepiece: the skull of a Nocturne fire drake, a volcanic apex
 * predator, kept as a Chapter trophy: bare dark-ivory bone stained with soot
 * and engraved like scrimshaw, set on a riveted bronze mount on the plaque's
 * top edge. The drake itself carries no fittings — it should read as bone and
 * horn, grown, not made. Embers still glow faintly deep in its cracks and
 * sockets, breathing with Mount Deathfire.
 *
 * Front three-quarter view, facing slightly left, jaw down; centred so it
 * works as the plaque's crest. Drawn freehand, point by point, in the same
 * hand as the border (see wrought.js): a long crocodilian-draconic snout, an
 * antorbital opening, a thick armoured brow over deep sockets, two swept-back
 * horns and three broken crest spines, irregular interlocking conical teeth
 * with two oversized lower fangs, a broad reinforced jaw hinge, heat cracks,
 * and scale-plate remnants on the cheek and neck. Shading lines follow the
 * forms, as in burin engraving.
 *
 * 200 × 200. The plaque's top edge is y 150; the mount sits on the rim.
 * Returns an ordered list of drawing ops ({ d, fill?, stroke?, sw?, opacity?,
 * cls? }) — paint in order — using the gradients the plaque defines:
 * #skull-bone, #skull-bronze, #skull-soot, #skull-glow.
 */
import { f, hand, sample, cut, shake } from './wrought.js'

const closed = (pts, per = 6) => `M${sample(pts, per).map((q) => `${f(q[0])} ${f(q[1])}`).join('L')}Z`
const line = (pts) => `M${pts.map((q) => `${f(q[0])} ${f(q[1])}`).join('L')}`
const dot = (x, y, r) => `M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${f(r * 2)} 0a${r} ${r} 0 1 0 ${f(-r * 2)} 0`

const BONE = 'url(#skull-bone)'
const BRONZE = 'url(#skull-bronze)'
const TOOTH = 'url(#skull-tooth)' // enamel: paler and cleaner than the bone it sits in
const INK = '#241a12' // scrimshaw cuts in the bone
const HOLE = '#0a0705'
const EDGE = '#120c07'
const BONE_EDGE = '#3b2d20' // bone has a soft, warm edge, not a hard outline
const BRIGHT = '#f3c45c' // bright cuts in the bronze

const D = {
  // The bronze bracket the trophy rests on, laid across the rim, with scrolled volute ends.
  mount: [[40, 152], [52, 147], [76, 146.4], [100, 148], [124, 146.4], [148, 147], [160, 152], [163.4, 160], [158.6, 166.4], [152, 165], [150.6, 170.6], [142, 180.6], [126, 187.6], [100, 190.4], [74, 187.6], [58, 180.6], [49.4, 170.6], [48, 165], [41.4, 166.4], [36.6, 160], [40, 152]],
  mountInner: [[54, 153], [76, 151], [100, 152.6], [124, 151], [146, 153], [146.4, 168], [138, 177.4], [124, 183], [100, 185.6], [76, 183], [62, 177.4], [53.6, 168], [54, 153]],
  volute: [[160, 152], [163.4, 157.6], [161.6, 162.8], [157, 163.6], [155, 160], [157.6, 157.8]],
  mountRivets: [[62, 157.6], [138, 157.6], [100, 181.4]],
  mountFlame: [[100, 157], [103.4, 161.6], [106, 166.6], [106, 171.6], [103.2, 175.4], [100, 176.4], [96.8, 175.4], [94, 171.6], [94.4, 167.6], [96.4, 165], [96.6, 168.4], [98.6, 169.6], [99, 164.4], [100, 157]],

  // The far horn roots on the far side of the head, behind the cranium, and only rises into view above it.
  farHorn: [[139, 62], [141.4, 48], [146.6, 34], [153.4, 21.6], [159.6, 10.6], [163, 2.6]],
  nearHorn: [[148, 54], [162, 46], [175, 37.6], [185.6, 27.4], [192.6, 16.4], [195.4, 6.4]],
  spines: [[[164, 62], [176, 60], [184.4, 57.4]], [[167, 76], [178, 77.6], [186.4, 78.2]], [[166, 89], [175, 92], [181.4, 94.6]]],

  // Upper skull, from the nose round the top to the hinge and back along the upper jaw.
  skull: [[26, 117], [29, 110], [36, 105.5], [46, 101], [58, 96], [68, 90], [73, 82], [79, 75], [87, 72], [94, 74], [99, 69], [108, 62.5], [119, 58], [131, 51], [143, 46.5], [155, 46.5], [164, 51.5], [169.5, 60], [170, 71], [167, 83], [166, 94], [170.5, 104], [172, 114], [168, 122.5], [158, 124], [144, 122], [128, 122], [112, 123.5], [96, 125], [80, 126.5], [64, 128], [48, 128.6], [36, 128], [28, 125], [24.5, 121], [26, 117]],
  jaw: [[156, 121], [165, 125], [166, 133], [158, 141], [142, 146], [120, 149.5], [96, 151.5], [74, 152], [54, 151], [42, 148], [35.5, 142], [36, 136], [44, 132.6], [62, 131.4], [82, 130.2], [104, 128.6], [126, 127], [146, 125], [156, 121]],
  hinge: [[150, 106], [160, 101], [170, 104.6], [173, 114], [168, 123], [158, 125], [150, 120], [148, 112], [150, 106]],

  nearBrow: [[97, 72.5], [106, 64.8], [118, 62], [129, 64.6], [136.6, 70.6]],
  farBrow: [[73, 82], [78, 75.4], [86, 72.6], [93.6, 74.6]],
  nearOrbit: [[102.5, 77], [110, 70.6], [120, 69.4], [128.4, 74], [129, 82], [122.4, 88], [112, 88.4], [104.6, 84.2], [102.5, 77]],
  farOrbit: [[78.8, 81], [84.4, 77], [89.6, 78.6], [90.4, 84.6], [86, 88.4], [80.6, 87], [78.8, 81]],
  antorbital: [[60, 106], [72, 100.2], [86, 96], [97, 95.2], [99.4, 99], [88, 104], [74, 109], [63, 111], [60, 106]],
  temporal: [[134, 60], [146, 55.4], [156, 56.6], [160, 63], [152, 67.4], [140, 68], [134, 64.4], [134, 60]],
  mandibular: [[104, 138], [124, 135], [142, 133.6], [146, 137.6], [132, 141.6], [112, 143.4], [103, 141.6], [104, 138]],
  nearNostril: [[36.6, 110.8], [42.4, 108.2], [47, 110.6], [44, 114.4], [38.4, 114.8], [36.6, 110.8]],
  farNostril: [[27.8, 112.4], [30.6, 110.6], [32.2, 113], [29.6, 115.4], [27.8, 112.4]],

  // Teeth: [root x, root y, length, lean]. Upper teeth hang, lower teeth rise between them —
  // uneven gaps, uneven sizes, leaning every way, one snapped to a stump.
  upperTeeth: [[33, 127.4, 5, -0.6], [40.4, 128.2, 9.5, 0.25], [51.6, 128.6, 5.2, -0.35], [57.4, 128.4, 7.4, 0.1], [69, 127.6, 11, 0.3], [77.6, 126.8, 5.4, -0.4], [88, 126, 9.4, 0.15], [101.4, 124.8, 6, -0.1], [108.6, 124.2, 8.6, 0.35], [121.8, 123, 4.6, -0.3], [130, 122.6, 7.6, 0.2], [143.6, 122.8, 5.6, 0.05]],
  lowerTeeth: [[36.4, 135.2, 4.4, 0.4], [46, 133.4, 7.4, -0.25], [73, 131, 8.6, -0.15], [83, 130.4, 5, 0.35], [95, 129.6, 8, -0.2], [104.6, 128.8, 4.8, 0.25], [115, 128.2, 7.6, -0.3], [126, 127.4, 5.6, 0.15], [137.4, 126.4, 6.6, -0.1]],
  stump: [80.4, 126.4],
  // The two great lower fangs, rising outside the snout.
  fangs: [{ root: [46.4, 137], tip: [48.8, 110.4], w: 7.8 }, { root: [61.6, 137.4], tip: [64.8, 103], w: 10.4 }],

  // Heat cracks, jagged; embers glow in them.
  cracks: [
    [[123, 69.6], [126, 63], [124, 58.6], [128.4, 54], [127, 49.6]],
    [[140, 52], [145, 57.4], [150, 59], [152.6, 55.2]],
    [[50, 100.4], [54.4, 105.6], [51, 110.4], [55.6, 116], [53.6, 121]],
    [[88, 131.4], [92.4, 137.6], [89, 143], [94, 149.4]],
    [[112, 92], [118, 97.4], [115, 102], [121, 108]],
  ],
  // Scale-plate remnants: arcs on the cheek below the near orbit, scutes down the neck behind the hinge.
  cheekScales: [[118, 98], [126, 96.6], [134, 97.4], [142, 99], [122, 104], [130, 103.2], [138, 104.2], [146, 106]],
  // The hide remnant behind the hinge, its lower edge torn.
  hide: [[162, 88], [171, 89.4], [179.4, 95.6], [185, 106], [186.6, 118], [184, 129], [179.6, 137.6], [176, 133], [172.6, 139.4], [168.4, 133.4], [164.4, 137], [161.2, 128], [160.6, 112], [162, 88]],
}

/** A conical tooth from [x, y, len, lean]; `dir` 1 hangs down, -1 rises. */
/**
 * A recurved tooth, as reptile and dragon teeth are: the front edge (toward the snout's tip)
 * bows out, the back edge runs nearly straight, and the point hooks back toward the throat.
 * `hook` (0–1) bends the upper third back harder. Returns the outline plus a sampler along the
 * tooth: at(t, off), off > 0 toward the front.
 */
function toothShape([x, y], tip, w, hook = 0) {
  const dx = tip[0] - x, dy = tip[1] - y, len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len
  let nx = -uy, ny = ux
  if (nx > 0) { nx = -nx; ny = -ny } // n points to the front: the snout's tip is at low x
  // The axis bows back toward the point: nothing at the root, full `hook` at the tip.
  const at = (t, off) => {
    const back = w * 0.55 * hook * t ** 2.2
    return [x + dx * t + nx * (off - back), y + dy * t + ny * (off - back)]
  }
  const sink = [x - ux * 1.8, y - uy * 1.8] // the root is set down into the gum
  const outline = [
    [sink[0] - nx * w * 0.48, sink[1] - ny * w * 0.48],
    at(0.35, -w * 0.4), at(0.66, -w * 0.24), at(0.86, -w * 0.12), at(0.95, -w * 0.07),
    at(1, -w * 0.06),
    at(0.93, w * 0.08), at(0.8, w * 0.22), at(0.56, w * 0.46), at(0.28, w * 0.55),
    [sink[0] + nx * w * 0.5, sink[1] + ny * w * 0.5],
  ]
  return { outline, at, len }
}
/**
 * A row tooth from [x, y, len, lean]; `dir` 1 hangs down, -1 rises. Its point recurves toward
 * the hinge, hooking harder the further forward it sits, as a predator's front teeth do.
 */
const forward = (x) => Math.min(1, Math.max(0, (112 - x) / 80))
const rowTooth = ([x, y, len, lean], dir) => toothShape([x, y], [x + lean * len * 0.45 + len * 0.12, y + dir * len], len * 0.62, 0.35 + 0.65 * forward(x))

/** A point across a horn at fraction t: its centre, normal, direction and half-width. */
function across(pts, t, width) {
  const c = sample(pts, 8), i = Math.round(t * (c.length - 1))
  const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)]
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
  const w = (width * (1 - t) ** 0.85) / 2
  return { at: c[i], n: [-dy / len, dx / len], d: [dx / len, dy / len], w }
}

export function drakeSkull(seed = 5) {
  const jit = hand(seed)
  const S = (pts, amt = 0.2) => shake(pts, jit, amt)
  const ops = []
  const fill = (d, fillWith, extra = {}) => ops.push(
    fillWith === BONE ? { d, fill: fillWith, stroke: BONE_EDGE, sw: 0.45 }
      : fillWith === TOOTH ? { d, fill: fillWith, stroke: BONE_EDGE, sw: 0.65 }
        : { d, fill: fillWith, stroke: EDGE, sw: 0.7, ...extra },
  )
  const ink = (pts, w, profile = 'sweep', opacity = 0.8) => ops.push({ d: cut(S(pts, 0.15), w, profile, jit), fill: INK, opacity })
  const bright = (d, opacity = 0.85) => ops.push({ d, fill: BRIGHT, opacity })
  const hole = (pts) => ops.push({ d: closed(S(pts, 0.1)), fill: HOLE })
  // Embers deep in a socket: a small, soft glow well inside the hollow, never filling it.
  const ember = ([x, y], rx, ry) => ops.push({ d: `M${f(x - rx)} ${f(y)}a${rx} ${ry} 0 1 0 ${f(rx * 2)} 0a${rx} ${ry} 0 1 0 ${f(-rx * 2)} 0`, fill: 'url(#skull-glow)', cls: 'skull-ember' })

  // ---- the mount ---------------------------------------------------------------
  fill(closed(S(D.mount, 0.15)), BRONZE)
  bright(cut(S(D.mountInner, 0.15), 1, 'even', jit))
  for (const mirror of [false, true]) {
    const mx = (x) => (mirror ? 200 - x : x)
    bright(cut(S(D.volute, 0.1).map(([x, y]) => [mx(x), y]), 1.3, 'curl', jit))
    // A scroll cut either side of the flame, sweeping out from its root and curling inward —
    // line, not filled leaves, which at this size read as brows over the flame.
    bright(cut(S([[96, 175.4], [88, 176.6], [78, 175], [70.4, 170.4], [67.6, 164.2], [70.4, 159.4], [75.6, 158.6], [78.4, 162.2], [76.4, 165.4], [73.4, 164.4]], 0.15).map(([x, y]) => [mx(x), y]), 1.5, 'curl', jit))
    bright(cut(S([[82, 176.2], [77.6, 180.4], [71.4, 181.4], [66.6, 179.2]], 0.1).map(([x, y]) => [mx(x), y]), 0.9, 'sweep', jit))
  }
  bright(closed(S(D.mountFlame, 0.1)))
  for (const [x, y] of D.mountRivets) ops.push({ d: dot(x, y, 2.2), fill: BRONZE, stroke: EDGE, sw: 0.6 }, { d: dot(x - 0.5, y - 0.6, 0.8), fill: BRIGHT, opacity: 0.8 })

  // ---- behind the skull: far horn, broken crest spines, neck scutes ---------------
  const farHorn = cut(S(D.farHorn, 0.1), 11, 'point', jit)
  fill(farHorn, BONE)
  ops.push({ d: farHorn, fill: '#1a130c', opacity: 0.3 }) // further away, a shade darker
  for (const sp of D.spines) {
    fill(cut(S(sp, 0.1), 7, 'broken', jit), BONE)
    const end = sp.at(-1)
    ops.push({ d: line([[end[0] - 1, end[1] - 2.6], [end[0] + 0.8, end[1] - 1], [end[0] - 0.6, end[1] + 0.4], [end[0] + 0.6, end[1] + 2]]), stroke: INK, sw: 0.8, opacity: 0.9 })
  }
  // A ragged remnant of scaled hide still hanging from behind the jaw hinge — dried, darker than
  // the bone — with its scales cut into it in staggered rows that follow the neck's curve.
  fill(closed(S(D.hide, 0.3), 5), BONE)
  ops.push({ d: closed(S(D.hide, 0.3), 5), fill: '#2a1d12', opacity: 0.42 })
  for (let row = 0; row < 7; row++) {
    const y = 95 + row * 6
    const [x0, x1] = [163 + row * 0.6, 183 - Math.abs(row - 3) * 1.4]
    for (let x = x0 + (row % 2) * 2.8; x < x1; x += 5.6) {
      ops.push({ d: cut(S([[x - 2.6, y], [x, y + 2.4], [x + 2.6, y]], 0.2), 0.65, 'sweep', jit), fill: INK, opacity: 0.8 })
    }
  }
  ink(D.hide.slice(8, 13), 1.1) // shadow along the torn edge
  fill(cut(S(D.nearHorn, 0.1), 15, 'point', jit), BONE)

  // ---- the skull ---------------------------------------------------------------
  fill(closed(S(D.jaw, 0.2)), BONE)
  fill(closed(S(D.skull, 0.2)), BONE)
  // Soot pooled round the sockets and hollows, in uneven blotches rather than neat rings.
  for (const [pts, c, k] of [[D.nearOrbit, [115, 79], 1.6], [D.farOrbit, [84.5, 82.5], 1.7], [D.antorbital, [80, 103], 1.45], [D.temporal, [147, 62], 1.5], [D.mandibular, [124, 139], 1.35]]) {
    ops.push({ d: closed(shake(pts.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]), jit, 2.4), 5), fill: 'url(#skull-soot)' })
  }
  // A few more stains where soot and heat settled: under the brow, along the jaw, at the horn roots.
  for (const [x, y, rx, ry] of [[132, 92, 12, 6], [90, 140, 16, 5], [150, 52, 9, 5], [54, 118, 8, 5]]) {
    ops.push({ d: closed(shake(Array.from({ length: 9 }, (_, i) => [x + rx * Math.cos((i / 8) * Math.PI * 2), y + ry * Math.sin((i / 8) * Math.PI * 2)]), jit, 1.6), 5), fill: 'url(#skull-soot)', opacity: 0.6 })
  }
  fill(closed(S(D.hinge, 0.15)), BONE)
  // Openings, and the embers deep in the sockets.
  for (const o of [D.antorbital, D.temporal, D.mandibular, D.nearNostril, D.farNostril, D.nearOrbit, D.farOrbit]) hole(o)
  ember([117, 81.6], 4.2, 3.2)
  ember([85.4, 83.4], 2, 1.8)
  // Armoured brows overhanging the sockets, their undersides in shadow, knobbed with bony nodules.
  fill(cut(S(D.nearBrow, 0.35), 8, 'sweep', jit), BONE)
  fill(cut(S(D.farBrow, 0.3), 5.5, 'sweep', jit), BONE)
  ink([[99.6, 74.6], [108, 68.8], [118, 66.8], [128.4, 69], [134.6, 73.4]], 1.4)
  ink([[76, 83], [80.4, 78], [87, 76.2], [92.4, 77.6]], 1)
  for (const [x, y, r] of [[104.2, 64.8, 1.6], [111.4, 61.2, 2.1], [119.6, 59.8, 1.8], [127.4, 61.6, 1.4], [81, 74.6, 1.2]]) {
    fill(closed(S(Array.from({ length: 7 }, (_, i) => [x + r * Math.cos((i / 6) * Math.PI * 2) * 1.2, y + r * Math.sin((i / 6) * Math.PI * 2)]), r * 0.18), 4), BONE)
    ink([[x - r, y + r * 0.5], [x, y + r * 0.95], [x + r, y + r * 0.45]], 0.45, 'sweep', 0.7)
  }

  // ---- scrimshaw: shading that follows the forms ----------------------------------
  // Snout: lines running its length, closer together toward the shadowed flank.
  ink([[33, 108.6], [46, 104], [60, 99], [70, 93.4]], 0.9)
  ink([[36, 118.6], [50, 116], [64, 113.6], [78, 112.4], [92, 111.4]], 0.8)
  ink([[38, 121.4], [54, 119.6], [70, 118], [88, 116.8], [104, 115.6]], 0.75)
  ink([[40, 123.8], [58, 122.8], [76, 121.8], [96, 120.6], [116, 119.4]], 0.7)
  // Cranium contours, and the shadow behind the temporal opening.
  ink([[118, 60.6], [132, 54], [146, 50], [158, 50.6]], 0.9)
  ink([[126, 61.4], [140, 58.4], [150, 58.2]], 0.7)
  ink([[158, 66], [163, 72.6], [163.6, 82], [161.4, 92]], 0.8)
  ink([[154, 70], [158.6, 78], [158.4, 88]], 0.6)
  // Cheek below the near socket, hatched across its curve, with scale remnants.
  for (let i = 0; i < 9; i++) ink([[100 + i * 6, 94.2 + i * 0.5], [98.6 + i * 6, 98.6 + i * 0.6], [96.6 + i * 6, 102.6 + i * 0.7]], 0.55)
  for (const [x, y] of D.cheekScales) ops.push({ d: cut(S([[x - 3, y], [x, y + 2.6], [x + 3, y]], 0.25), 0.6, 'sweep', jit), fill: INK, opacity: 0.75 })
  // Jaw: its length, and hatching in the shadow beneath.
  ink([[44, 146], [70, 149], [100, 148.6], [130, 145.6], [152, 139]], 0.9)
  ink([[52, 141.4], [80, 144.4], [100, 144.6]], 0.7)
  for (let i = 0; i < 12; i++) ink([[62 + i * 8, 144.4 + Math.sin(i / 3) * 0.6], [60 + i * 8, 148.6 + Math.sin(i / 3) * 0.6]], 0.5, 'sweep', 0.65)
  // Hinge boss contours.
  ink([[152, 118], [158, 121.4], [165, 120]], 0.8)
  ink([[151.4, 110], [156, 106.6], [163.4, 106.2]], 0.6)

  // Horns: keratin growth ridges, uneven and bowed toward the tip like real horn, grooves
  // running their length, shading down the shadow side. Bare horn: no fittings on the drake.
  for (const [pts, w] of [[D.farHorn, 11], [D.nearHorn, 15]]) {
    let t = 0.08
    while (t < 0.86) {
      const { at, n, d, w: hw } = across(pts, t, w)
      const bow = hw * (0.35 + Math.abs(jit(0.25)))
      ops.push({ d: cut([[at[0] - n[0] * hw * 0.95, at[1] - n[1] * hw * 0.95], [at[0] + d[0] * bow + n[0] * jit(0.8), at[1] + d[1] * bow + n[1] * jit(0.8)], [at[0] + n[0] * hw * 0.95, at[1] + n[1] * hw * 0.95]], 0.55 + Math.abs(jit(0.3)), 'sweep', jit), fill: INK, opacity: 0.7 })
      t += 0.045 + Math.abs(jit(0.04)) + t * 0.05 // ridges crowd at the root, spread toward the tip
    }
    for (const side of [-0.45, 0.2]) {
      const groove = []
      for (let u = 0.06; u < 0.92; u += 0.07) {
        const { at, n, w: hw } = across(pts, u, w)
        groove.push([at[0] + n[0] * hw * side, at[1] + n[1] * hw * side])
      }
      ink(groove, 0.5, 'sweep', 0.55)
    }
    const shade = []
    for (let u = 0.1; u < 0.9; u += 0.06) {
      const { at, n, w: hw } = across(pts, u, w)
      shade.push([at[0] + n[0] * hw * 0.62, at[1] + n[1] * hw * 0.62])
    }
    ink(shade, 1.3)
  }
  // Seat the teeth: a tapered shadow along the gum line of the upper jaw.
  ink(D.skull.slice(24, 34).map(([x, y]) => [x, y - 1.2]), 1.3)

  // Heat cracks: winding, tapering fissures with branches, the ember still in their depths.
  for (const c of D.cracks) {
    const wind = S(c, 0.5)
    const branch = [wind[1], [wind[1][0] + (wind[2][0] - wind[1][0]) * 0.3 + jit(3), wind[1][1] + 3 + jit(1.5)], [wind[1][0] + jit(5), wind[1][1] + 5.5 + jit(2)]]
    for (const [pts, w] of [[wind, 1.7], [branch, 0.9]]) {
      ops.push({ d: cut(pts, w, 'sweep', jit), fill: HOLE, opacity: 0.9 })
      ops.push({ d: cut(pts, w * 0.35, 'sweep', jit), fill: '#ff6a2b', cls: 'skull-ember' })
    }
  }
  // ---- teeth, drawn last so no shading on the bone runs across them ---------------
  // Each is enamel: lit down its bowed front edge, shaded down its straighter back edge.
  const enamel = ({ outline, at }, w, ridge) => {
    fill(closed(S(outline, 0.05), 5), TOOTH)
    ops.push({ d: cut([0.12, 0.35, 0.6, 0.84].map((t) => at(t, -w * 0.3)), w * 0.2, 'sweep', jit), fill: INK, opacity: 0.45 })
    ops.push({ d: cut([0.14, 0.36, 0.58, 0.76].map((t) => at(t, w * 0.3)), w * 0.13, 'sweep', jit), fill: '#fff6dc', opacity: 0.5 })
    if (ridge) ops.push({ d: cut([0.2, 0.5, 0.8, 0.97].map((t) => at(t, w * 0.06)), 0.5, 'sweep', jit), fill: INK, opacity: 0.55 })
  }
  for (const t of D.lowerTeeth) enamel(rowTooth(t, -1), t[2] * 0.62, false)
  for (const t of D.upperTeeth) enamel(rowTooth(t, 1), t[2] * 0.62, false)
  const [sx, sy] = D.stump
  fill(closed(S([[sx - 2.4, sy], [sx - 1.6, sy + 3], [sx + 0.2, sy + 2.2], [sx + 1.2, sy + 3.4], [sx + 2.4, sy]], 0.1), 3), TOOTH)
  // The two great lower fangs stand outside the upper jaw, crocodile-fashion: each rooted in a
  // boss on the lower jaw's outer edge, with a cutting ridge down its front, casting a shadow
  // on the snout behind it.
  for (const { root, tip, w } of D.fangs) {
    const shape = toothShape(root, tip, w, 0.9) // the fangs sit furthest forward: the strongest hook
    ops.push({ d: closed(shape.outline.map(([x, y]) => [x + 2.4, y + 0.7]), 5), fill: '#0a0705', opacity: 0.4 })
    fill(closed(S(Array.from({ length: 9 }, (_, i) => [root[0] + w * 0.72 * Math.cos((i / 8) * Math.PI * 2), root[1] - 1.2 + w * 0.46 * Math.sin((i / 8) * Math.PI * 2)]), 0.3), 4), BONE)
    enamel(shape, w, true)
  }
  return ops
}
