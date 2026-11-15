// The painters: the code that paints the mountain's rock and the moon's lit sphere.
//
// Visitors never download this file. They get the mountain and the moon as baked pictures (src/lib/deathfire/baked/),
// made with this very code by the bake tool (scripts/deathfire). It is loaded only by the bake tool, by the golden
// check, and by the site if a picture fails to load, when the mountain is painted in the browser instead.
//
// The scene (scene.js) never imports it: it is handed in as `o.painter`. What the mountain's painter needs to know of
// a scene comes in as `geo`, a plain object the scene fills in: the flanks and the face map, the crown, the shoulder
// peaks, the river's line, the sizes, the seeded stream it draws its chance from, and the build's options.
import { clamp01, hash2, mulberry32, sm, vnoise } from './noise.js'
import { TAU, WARM, css, lerp, makeCanvas, ramp } from './tools.js'

/** Paint the mountain (relief, rock skin, crown and shoulder peaks) onto `g`, for the scene described by `geo`. */
export function paintMountain(g, geo) {
  const { H, L, P, PLATE, R, ROWS, breach, ch, crownPts, crustAt, dpr, fall, flip, groundH, h, halfBase, left, lines, mark, mx, o, peakX, phone, right, rimY, river, riverXAt, rr, rw, shoreY, shoulders, tipY, tn, w } = geo

  const lightAt = (x, y, n, f) => {
    const d = x - riverXAt(y)
    const toward = d > 0 ? -1 : 1 // the way a plane must lean to see the river
    const lit = Math.pow(clamp01(0.5 + 0.5 * n * toward), 1.6)
    const below = y > shoreY - 10
    // above the breach (the crown) the river's light is the breach's light, and it thins with height
    const up = y < breach.y ? (breach.y - y) / (ch * 0.9) : 0
    let warm = below ? 0 : (0.9 - 0.25 * f) * Math.exp(-Math.abs(d) / fall) * (0.05 + 0.95 * lit) * Math.exp(-up)
    // the breach lights the chute below it; the spear and the stub shade the rock to either side
    const dc = Math.hypot(x - breach.x, (y - breach.y) * 0.7)
    const sdx = (x - breach.x) * mx
    const side = sdx > rw * 0.45 ? (sdx - rw * 0.45) / (rw * 0.5) : sdx < -rw * 0.4 ? (-rw * 0.4 - sdx) / (rw * 0.5) : 0
    warm += 0.8 * Math.exp(-dc / (ch * 1.5)) * (0.2 + 0.8 * lit) * Math.exp(-side)
    const dl = Math.hypot((x - river.mouth.x) * 0.6, y - river.mouth.y)
    warm += 0.42 * Math.exp(-dl / (groundH * 0.9)) * (0.3 + 0.7 * lit)
    // the moon's side: planes leaning right, more on the right of the mountain and higher up
    const cool = Math.pow(clamp01(0.5 + 0.5 * n), 1.4) * (0.3 + 0.7 * (1 - f)) * (0.25 + 0.75 * clamp01((x - (peakX - ch)) / halfBase))
    return { warm: Math.min(1, warm), cool }
  }

  const rockColour = (x, y, n, f, tint) => {
    const { warm, cool } = lightAt(x, y, n, f)
    const amb = 1 - f
    const wc = ramp(WARM, warm)
    const foot = 1 - 0.55 * sm((f - 0.72) / 0.25)
    return [
      (5 + 3 * amb + 20 * cool + wc[0]) * tint * foot + 2,
      (9 + 5 * amb + 32 * cool + wc[1]) * tint * foot + 3,
      (8 + 4 * amb + 28 * cool + wc[2]) * tint * foot + 3,
    ]
  }

  /** How sharply a plane leans at this height: crests come and go down the face, and the sheer top is nearly smooth. */
  const lean = (j, f) => sm((vnoise(f * 2.3 + j * 1.7, 5.5) - 0.22) / 0.4) * (0.3 + 0.7 * sm(f / 0.3))

  const cpt = (x, y) => ({ x: peakX + x * rw * mx, y: rimY + y * ch })

  /** The shoulder peaks, laid over the mountain: each on a canvas of its own, so its inner side can melt into the flank. */
  const paintShoulders = (g, detail) => {
    const probeCv = document.createElement('canvas')
    probeCv.width = 3
    probeCv.height = 3
    const probe = probeCv.getContext('2d', { willReadFrequently: true })
    for (const s of shoulders) {
      const d = s.d
      const all = [...s.ridge, ...s.outer, s.inner]
      const x0 = Math.floor(Math.min(...all.map((p) => p.x)) - 4)
      const x1 = Math.ceil(Math.max(...all.map((p) => p.x)) + 4)
      const y0 = Math.floor(s.so.y - 4)
      const y1 = Math.ceil(Math.min(h, s.bottom))
      const bw = x1 - x0
      const bh = y1 - y0
      if (bw < 2 || bh < 2) continue
      const { cv, g: sg } = makeCanvas(bw, bh, dpr)
      sg.translate(-x0, -y0)
      const path = (pts) => {
        sg.beginPath()
        pts.forEach((p, i) => (i ? sg.lineTo(p.x, p.y) : sg.moveTo(p.x, p.y)))
      }
      const bodyPts = [...s.ridge, ...s.outer.slice(1), s.inner]
      path(bodyPts)
      sg.closePath()
      // The flank beside it, as painted: two samples just inside the flank's line (at the col, and lower down) give the
      // shoulder its colour, so it is as dark as the rock it stands on and no paler.
      const sample = (p, fallback) => {
        // (read through a 3 px canvas of its own, so the big layer is never read back and stays on the GPU)
        probe.clearRect(0, 0, 3, 3)
        probe.drawImage(g.canvas, Math.round((p.x - s.nx * 0.05 * H) * dpr) - 1, Math.round((p.y - s.ny * 0.05 * H) * dpr) - 1, 3, 3, 0, 0, 3, 3)
        const im = probe.getImageData(0, 0, 3, 3)
        if (!im || !im.data) return fallback
        const o = [0, 0, 0]
        for (let k = 0; k < 9; k++) for (let c = 0; c < 3; c++) o[c] += im.data[k * 4 + c] / 9
        return o
      }
      const low = s.base[Math.min(s.base.length - 1, s.ci + 12)]
      const c0 = sample(s.col, [14, 23, 20])
      const c1 = sample(low, [8, 14, 12])
      const lowAt = clamp01((low.y - s.so.y) / (h - s.so.y))
      const grd = sg.createLinearGradient(0, s.so.y, 0, h)
      grd.addColorStop(0, css(c0))
      grd.addColorStop(lowAt, css(c1))
      grd.addColorStop(1, css(c1.map((v) => v * 0.7)))
      sg.fillStyle = grd
      sg.fill()
      if (detail) {
        // the planes stay inside the body: only the rim below lies on its edge
        sg.save()
        path(bodyPts)
        sg.closePath()
        sg.clip()
        // the face away from the volcano, from the spine to the far side: a few points paler and cooler than the near
        // face, no more, and gone by half way down
        const lastP = s.outer[s.outer.length - 1]
        path([...s.outer, { x: s.spine[s.spine.length - 1].x, y: lastP.y }, ...s.spine.slice().reverse()])
        sg.closePath()
        const og = sg.createLinearGradient(0, s.so.y, 0, s.so.y + 0.55 * (h - s.so.y))
        const pale = [c0[0] * 1.1 + 0.5, c0[1] * 1.16 + 1.5, c0[2] * 1.16 + 1.5]
        og.addColorStop(0, css(pale, 1))
        og.addColorStop(1, css(pale, 0))
        sg.fillStyle = og
        sg.fill()
        // a little warm light on the near face where the lava is close enough to reach it
        const wm = lightAt(s.col.x, s.col.y, -d * 0.5, clamp01((s.col.y - rimY) / H)).warm
        if (wm > 0.03) {
          path(bodyPts)
          sg.closePath()
          const wg = sg.createLinearGradient(s.col.x, 0, s.so.x, 0)
          wg.addColorStop(0, `rgba(190,80,30,${(wm * 0.4).toFixed(3)})`)
          wg.addColorStop(0.7, 'rgba(190,80,30,0)')
          sg.fillStyle = wg
          sg.fill()
        }
        // a few broken gullies down the near face
        sg.strokeStyle = 'rgba(0,0,0,0.28)'
        sg.lineWidth = 1.2
        for (const [a, b] of s.gullies) {
          sg.beginPath()
          sg.moveTo(a.x, a.y)
          sg.lineTo(b.x, b.y)
          sg.stroke()
        }
        sg.restore()
        // a hairline of cool light down the far side and along the ridge
        sg.lineJoin = 'round'
        for (const [pts, colour] of [
          [s.outer.slice(0, 6), d > 0 ? 'rgba(150,190,176,0.16)' : 'rgba(150,190,176,0.07)'],
          [s.ridge.slice(-4), d > 0 ? 'rgba(150,190,176,0.08)' : 'rgba(150,190,176,0.14)'],
        ]) {
          path(pts)
          sg.strokeStyle = colour
          sg.lineWidth = 1
          sg.stroke()
        }
      }
      // melt into the flank: opaque out in the open, clear a little way inside the flank's own line
      sg.globalCompositeOperation = 'destination-in'
      const inset = 0.1 * H
      const ramp = 0.22 * H
      const mask = sg.createLinearGradient(s.col.x - s.nx * inset, s.col.y - s.ny * inset, s.col.x + s.nx * (ramp - inset), s.col.y + s.ny * (ramp - inset))
      mask.addColorStop(0, 'rgba(0,0,0,0)')
      mask.addColorStop(1, 'rgba(0,0,0,1)')
      sg.fillStyle = mask
      sg.fillRect(x0, y0, bw, bh)
      g.drawImage(cv, x0, y0, bw, bh)
    }
  }

  const paint = (g) => {
    const rockK = Math.max(0, Math.min(2, tn.rock ?? 1))
    const colK = Math.max(0, Math.min(2, tn.columns ?? 1))
    // tuner `planes`: how strongly the big planes stand off from one another (their lean to the light, their tints,
    // the lit lines on their crests). At 1 they read as long strips from crown to foot; lower, the rock's own breaks
    // carry the face and the planes are only its large form.
    const planeK = Math.max(0, Math.min(1.5, tn.planes ?? 0.55))
    // silhouette
    const trace = () => {
      g.beginPath()
      g.moveTo(left[ROWS].x, h + 20)
      for (let i = left.outline.length - 1; i >= 0; i--) g.lineTo(left.outline[i].x, left.outline[i].y)
      for (const p of flip ? [...crownPts].reverse() : crownPts) g.lineTo(p.x, p.y)
      for (const p of right.outline) g.lineTo(p.x, p.y)
      g.lineTo(right[ROWS].x, h + 20)
      g.closePath()
    }
    trace()
    const body = g.createLinearGradient(0, rimY - ch * 2, 0, h)
    body.addColorStop(0, 'rgb(11,19,16)')
    body.addColorStop(1, 'rgb(4,8,7)')
    g.fillStyle = body
    g.fill()
    if (!L.relief) {
      paintShoulders(g, false)
      return
    }

    g.save()
    g.clip()
    // The relief does not stop at the rim: above it the planes carry on as strips (rows e < 0, up to CRH) and the
    // silhouette clips them, so the towers are cut from the same rock as the flanks and there is no line where they meet.
    const CR = 14
    const CRH = ch * 2.4
    const ue = (ln, e) => (e >= 0 ? ln.u[e] : ln.u[0] + (vnoise(ln.u[0] * 3.7 + (-e / CR) * 1.9, 6.3) - 0.5) * 0.05 * (-e / CR))
    const PE = (u, e) => {
      if (e >= 0) return P(u, e / ROWS)
      const s = -e / CR
      return { x: peakX + u * rw * (1 + 0.07 * s), y: rimY - s * CRH }
    }
    // planes between each crest and gully, lit by the river, the crater, the lake and the moon
    for (let j = 0; j < lines.length - 1; j++) {
      const A = lines[j]
      const B = lines[j + 1]
      const facing = A.crest ? 1 : -1
      const tint = 1 + (R() * 0.24 - 0.12) * planeK
      g.beginPath()
      for (let e = -CR; e <= ROWS; e++) {
        const p = PE(ue(A, e), e)
        if (e === -CR) g.moveTo(p.x, p.y)
        else g.lineTo(p.x, p.y)
      }
      for (let e = ROWS; e >= -CR; e--) {
        const p = PE(ue(B, e), e)
        g.lineTo(p.x, p.y)
      }
      g.closePath()
      const top = rimY - CRH
      const bot = P((A.u[ROWS] + B.u[ROWS]) / 2, 1).y
      const grd = g.createLinearGradient(0, top, 0, bot)
      const jj = (j + 1) >> 1
      const l0 = lean(jj, 0)
      for (let e = -CR; e <= ROWS; e += 2) {
        const f = Math.max(0, e) / ROWS
        const c = PE((ue(A, e) + ue(B, e)) / 2, e)
        // up the crown the lean eases from the flank's value to one that still reads in the dark
        const lc = e >= 0 ? lean(jj, f) : l0 + (0.2 + 0.5 * vnoise((-e / CR) * 2.1 + jj * 2.9, 3.1) - l0) * sm(-e / 4)
        grd.addColorStop(clamp01((c.y - top) / (bot - top)), css(rockColour(c.x, c.y, facing * lc * planeK, f, tint)))
      }
      g.fillStyle = grd
      g.fill()
      // rills: two broken lines down each plane, one dark and one faintly light. Kept faint: long lines down smooth
      // planes are what made the rock read as wood grain; the surface below carries the detail now.
      for (const [k, style] of [[0.36, 'rgba(0,0,0,0.12)'], [0.7, 'rgba(255,214,170,0.018)']]) {
        g.beginPath()
        for (let i = 3; i <= ROWS; i++) {
          const p = P(lerp(A.u[i], B.u[i], k + (vnoise(i * 0.4, j * 5.1) - 0.5) * 0.3), i / ROWS)
          if (i === 3) g.moveTo(p.x, p.y)
          else g.lineTo(p.x, p.y)
        }
        g.setLineDash([rr(10, 34), rr(6, 22), rr(4, 16), rr(8, 26)])
        g.strokeStyle = style
        g.lineWidth = 1
        g.stroke()
      }
      g.setLineDash([])
    }
    // cliff bands: where the face breaks in a step, a line of shadow under the lip and a little caught light on it
    // (only when the rock has no skin: the skin carries its own ledges, tier on tier, and these two would cut across them)
    for (const fb of rockK > 0.01 ? [] : [0.34, 0.56]) {
      const shadow = []
      for (let k = 0; k <= 60; k++) {
        const u = -0.97 + (k / 60) * 1.94
        const f = fb + (vnoise(u * 3.4 + fb * 20, 3.3) - 0.5) * 0.09 + (vnoise(u * 11 + fb * 9, 7.1) - 0.5) * 0.025
        shadow.push({ ...P(u, f), gap: vnoise(u * 2.6 + fb * 31, 1.9) < 0.36 })
      }
      for (const [dy, style, lw] of [[2.5, 'rgba(0,0,0,0.34)', 3.2], [0, 'rgba(255,196,150,0.06)', 1]]) {
        g.beginPath()
        let pen = false
        for (const p of shadow) {
          if (p.gap || Math.abs(p.x - riverXAt(p.y)) < fall * 0.5) {
            pen = false
            continue
          }
          if (pen) g.lineTo(p.x, p.y + dy)
          else g.moveTo(p.x, p.y + dy)
          pen = true
        }
        g.strokeStyle = style
        g.lineWidth = lw
        g.stroke()
      }
    }
    // crest edges catch the light: a thin warm line where a crest faces the lava
    for (let j = 2; j < lines.length - 2; j += 2) {
      const C = lines[j]
      const top = rimY - CRH
      const bot = P(C.u[ROWS], 1).y
      const grd = g.createLinearGradient(0, top, 0, bot)
      for (let e = -CR; e <= ROWS; e += 2) {
        const f = Math.max(0, e) / ROWS
        const c = PE(ue(C, e), e)
        const d = c.x - riverXAt(c.y)
        const { warm } = lightAt(c.x, c.y, d > 0 ? -1 : 1, f)
        const edge = warm * 0.5 * (1 - 0.6 * sm((f - 0.72) / 0.25)) * (0.2 + 0.8 * lean(j >> 1, f)) * (0.35 + 0.65 * planeK)
        grd.addColorStop(clamp01((c.y - top) / (bot - top)), `rgba(255,170,96,${edge.toFixed(3)})`)
      }
      g.beginPath()
      for (let e = -CR; e <= ROWS; e++) {
        const p = PE(ue(C, e), e)
        if (e === -CR) g.moveTo(p.x, p.y)
        else g.lineTo(p.x, p.y)
      }
      g.strokeStyle = grd
      g.lineWidth = 1.1
      g.stroke()
    }
    // Mass reads from darkness: out on the broad flanks, away from the crater and the river, the rock goes toward black
    // and only the edge (the moon's rim, below) and a few planes keep a hint of light.
    for (const [dir, alpha] of [[1, 0.36], [-1, 0.3]]) {
      const dk = g.createLinearGradient(peakX + dir * rw * 2.4, 0, peakX + dir * halfBase * 0.95, 0)
      dk.addColorStop(0, 'rgba(3,6,6,0)')
      dk.addColorStop(1, `rgba(3,6,6,${alpha})`)
      g.fillStyle = dk
      g.fillRect(0, rimY - ch * 3, w, h)
    }
    g.restore()

    // the crown: the faces the breach lights and the faces the moon finds, laid over the relief. Each fades out below
    // the rim (clipped to the mountain, so the fade runs on down the flank) instead of ending in a flat edge there.
    g.save()
    trace()
    g.clip()
    const face = (pts, stops) => {
      g.beginPath()
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      g.closePath()
      const y0 = stops[0][0]
      const y1 = stops[stops.length - 1][0]
      const grd = g.createLinearGradient(0, y0, 0, y1)
      for (const [at, c] of stops) grd.addColorStop(clamp01((at - y0) / (y1 - y0)), c)
      g.fillStyle = grd
      g.fill()
    }
    const cp = crownPts
    const spine = [cp[18], cpt(0.3, -1.7), cpt(0.38, -1.2), cpt(0.3, -0.6), cpt(0.34, 0.2)]
    // the tower's inner face, toward the breach: lit from below, dark by the top
    face([...cp.slice(11, 19), ...spine.slice(1), cpt(0.2, 0.42), cpt(-0.02, 0.36)], [
      [rimY - ch * 1.9, 'rgba(30,12,8,0.1)'],
      [rimY + ch * 0.1, 'rgba(200,88,32,0.78)'],
      [rimY + ch * 0.45, 'rgba(200,88,32,0)'],
    ])
    // its outer face, under the moon
    face([...cp.slice(18, 29), cpt(1.04, 0.4), cpt(0.34, 0.4), ...spine.slice(1).reverse()], [
      [rimY - ch * 2.2, flip ? 'rgba(20,31,27,0.5)' : 'rgba(34,52,45,0.6)'],
      [rimY, 'rgba(12,20,17,0.14)'],
      [rimY + ch * 0.4, 'rgba(12,20,17,0)'],
    ])
    // the stub's inner face, toward the breach
    face([cp[5], cp[6], cp[7], cp[8], cp[9], cpt(-0.5, 0.3), cpt(-0.74, -0.55)], [
      [rimY - ch, 'rgba(50,20,11,0.2)'],
      [rimY, 'rgba(186,80,30,0.8)'],
      [rimY + ch * 0.3, 'rgba(186,80,30,0)'],
    ])
    g.restore()
    mark('mountainRelief')
    // The rock's surface. The planes above are smooth, and long smooth planes read as carved wood; smooth lumps lit
    // from one side (the first try at a skin) read as a bump map from an old render. Rock at this size reads from how
    // it breaks, so the skin is built from breaks, worked out per pixel, once:
    //   - The face is stacked in tiers, as a volcano is built: flow on flow. Each tier ends in a ledge (its edge catches
    //     a little light, the rock under it is in shadow).
    //   - Under a ledge the rock stands in columns, as thick basalt does when it cools: long shafts side by side, each
    //     one face to the light and one away, each ending at its own height. Not all the way along: a tier has columns
    //     here and none there. The spire and the crown are columns from the tip down.
    //   - Everything else is broken rock: angular blocks, each a flat face turned its own way (so it is lit or not as a
    //     whole, with a hard edge), dark cracks between some of them, smaller breaks on the blocks, and smooth patches
    //     of scree and ash where the breaks fade out.
    //   - It all follows the mountain: the columns and blocks fan out and grow from the summit down, as the flanks do.
    // The skin is laid on with 'overlay', which on dark rock is a multiply: it adds no light of its own, it only breaks
    // up the light already there. Rock too dark to show it is skipped (most of the mountain). Tuner \`rock\` is how
    // strong it is, \`columns\` how much of each tier the columns take (0 none).
    if (rockK > 0.01) {
      const xs = [...left.outline, ...right.outline, ...crownPts].map((p) => p.x)
      const bx0 = Math.max(0, Math.floor(Math.min(...xs)) - 1)
      const bx1 = Math.min(w, Math.ceil(Math.max(...xs)) + 1)
      const by0 = Math.max(0, Math.floor(tipY) - 2)
      const bw = Math.max(2, bx1 - bx0)
      const bh = Math.max(2, Math.ceil(h) - by0)
      // texels per px: 1 as a rule; a bake asks for as many as the picture's own pixels, so the skin is as sharp as the
      // lines drawn over it. Every distance below is still in px.
      const rs = Math.max(1, Math.min(3, o.rockRes ?? 1))
      const tw = Math.ceil(bw * rs)
      const th = Math.ceil(bh * rs)
      // what is painted there already, coarsely: where it is all but black there is nothing for a skin to break up
      const Q = 4
      const qw = Math.ceil(bw / Q)
      const qh = Math.ceil(bh / Q)
      const probe = makeCanvas(qw, qh)
      probe.g.drawImage(g.canvas, bx0 * dpr, by0 * dpr, bw * dpr, bh * dpr, 0, 0, qw, qh)
      const lit = probe.g.getImageData(0, 0, qw, qh).data
      // smooth fields, on a grid half as fine: tone in big patches, where the scree lies, the rust
      const LW = (bw >> 1) + 3
      const LH = (bh >> 1) + 3
      const low = new Float32Array(LW * LH)
      const scree = new Float32Array(LW * LH)
      const rust = new Float32Array(LW * LH)
      for (let j = 0; j < LH; j++) {
        const y = by0 + j * 2
        for (let i = 0; i < LW; i++) {
          const x = bx0 + i * 2
          low[j * LW + i] = 0.6 * vnoise(x / 61 + 3, y / 47 + 8) + 0.4 * vnoise(x / 23 + 9, y / 19 + 4)
          scree[j * LW + i] = vnoise(x / 90 + 21, y / 130 + 6)
          rust[j * LW + i] = sm((vnoise(x / 70 + 13, y / 95 + 2) - 0.48) / 0.22)
        }
      }
      // each row: where the mountain is (a little wide: the silhouette clips it), its middle, how far the face has
      // fanned out there (1 at the summit), and how far down the face the row is when blocks grow with the fan
      const XL = new Float32Array(th)
      const XR = new Float32Array(th)
      const MG = new Float32Array(th) // how much wider than the mountain the row is taken
      const CX = new Float32Array(th)
      const GF = new Float32Array(th)
      const SY = new Float32Array(th)
      const crownXs = crownPts.map((p) => p.x)
      const cx0 = Math.min(...crownXs) - 2
      const cx1 = Math.max(...crownXs) + 2
      let down = 0
      for (let j = 0; j < th; j++) {
        const y = by0 + (j + 0.5) / rs
        let xl = cx0
        let xr = cx1
        if (y >= rimY) {
          const x = clamp01((y - rimY) / H) * ROWS
          const i = Math.min(ROWS - 1, Math.floor(x))
          xl = lerp(left[i].x, left[i + 1].x, x - i)
          xr = lerp(right[i].x, right[i + 1].x, x - i)
        }
        CX[j] = (xl + xr) / 2
        GF[j] = Math.max(1, Math.min(2.4, Math.sqrt((xr - xl) / (2 * rw))))
        MG[j] = y >= rimY ? 0.06 * halfBase : 0
        XL[j] = xl - MG[j]
        XR[j] = xr + MG[j]
        down += 1 / (GF[j] * rs)
        SY[j] = down
      }
      // the tiers: where each ledge stands across the face, and how much of the tier under it is columns there
      const TN = 192
      const tiers = []
      for (let k = 0, fk = 0.15; fk < 0.93; k++) {
        const lip = new Float32Array(TN + 1)
        const col = new Float32Array(TN + 1)
        const edge = new Float32Array(TN + 1) // how much of a ledge there is here: it comes and goes along the face
        for (let q = 0; q <= TN; q++) {
          const u = -1.15 + (q / TN) * 2.3
          lip[q] = fk + 0.04 * (vnoise(u * 3.1 + k * 7.7, 2.3) - 0.5) + 0.014 * (vnoise(u * 9 + k * 3.3, 5.1) - 0.5)
          const open = sm((vnoise(u * 2.3 + k * 11.1, 4.2) - (0.76 - 0.12 * colK)) / 0.08)
          col[q] = colK > 0 ? open * clamp01(0.1 + 0.6 * vnoise(u * 1.9 + k * 5.3, 8.8)) : 0
          edge[q] = sm((vnoise(u * 2.9 + k * 3.7, 6.6) - 0.32) / 0.2)
        }
        tiers.push({ lip, col, edge })
        fk += 0.085 + 0.09 * hash2(k * 5 + 1, 91)
      }
      const NT = tiers.length
      // the spire and the crown, above the first ledge: columns hang from the top of the rock in places, and reach a
      // different way down in each; between them and below them it is broken rock like the rest
      const spire = new Float32Array(TN + 1)
      for (let q = 0; q <= TN; q++) {
        const u = -1.15 + (q / TN) * 2.3
        spire[q] = colK > 0 ? sm((vnoise(u * 2.9 + 3.3, 9.4) - (0.62 - 0.14 * colK)) / 0.1) * clamp01(0.3 + 0.75 * vnoise(u * 2.1 + 7.9, 1.6)) : 0
      }
      const topF = (tipY - rimY) / H
      const colW = phone ? 6 : 8 // a column's width at the summit, px
      const CB = phone ? 11 : 15 // a block's size at the summit, px
      const { cv: tex, g: tg } = makeCanvas(tw, th)
      const timg = tg.createImageData(tw, th)
      const td = timg.data
      for (let j = 1; j < th - 1; j++) {
        const y = by0 + (j + 0.5) / rs
        const f = (y - rimY) / H
        const i0 = Math.max(1, Math.floor((XL[j] - bx0) * rs))
        const i1 = Math.min(tw - 2, Math.ceil((XR[j] - bx0) * rs))
        if (i1 < i0) continue
        const gf = GF[j]
        const span = XR[j] - XL[j] - 2 * MG[j] || 1
        const rvx = riverXAt(y)
        const lj = j / rs / 2
        const j0 = lj | 0
        const fj = lj - j0
        const qrow = Math.min(qh - 1, (j / rs / Q) | 0) * qw
        const vy = SY[j] / CB
        for (let i = i0; i <= i1; i++) {
          const q4 = (qrow + Math.min(qw - 1, (i / rs / Q) | 0)) * 4
          if (lit[q4] < 7 && lit[q4 + 1] < 7 && lit[q4 + 2] < 7) continue
          const x = bx0 + (i + 0.5) / rs
          // light: from the river where it is near, from the moon's side where it is not, and a little from above
          const d = x - rvx
          const wr = Math.exp(-Math.abs(d) / (fall * 2.5))
          const lx = (d > 0 ? -1 : 1) * wr + (1 - wr)
          const grain = hash2(i * 7 + 3, j * 13 + 11) - 0.5
          // the smooth fields here
          const li = i / rs / 2
          const l0 = li | 0
          const fi = li - l0
          const a = j0 * LW + l0
          const lo = lerp(lerp(low[a], low[a + 1], fi), lerp(low[a + LW], low[a + LW + 1], fi), fj)
          const sc = lerp(lerp(scree[a], scree[a + 1], fi), lerp(scree[a + LW], scree[a + LW + 1], fi), fj)
          // across the fan, in px as they are at the summit
          const fx = (x - CX[j]) / gf
          // which tier, and how far down it
          const u = ((x - XL[j] - MG[j]) / span) * 2 - 1
          const q = Math.min(TN, Math.max(0, Math.round(((u + 1.15) / 2.3) * TN)))
          // (a ledge runs level round the mountain, so across the face it sags in the middle as the relief's own rows do)
          const ft = f / (1 + 0.03 * (1 - Math.min(1, u * u)))
          let k = -1
          while (k + 1 < NT && tiers[k + 1].lip[q] <= ft) k++
          const top = k < 0 ? -9 : tiers[k].lip[q]
          const bot = k + 1 < NT ? tiers[k + 1].lip[q] : 1.08
          // columns: slim on the spire, stouter below, no two the same width; each tier has its own set
          const cwide = k < 0 ? colW : colW * 1.3
          const fxk = fx + (k + 2) * 977.3
          const ci0 = Math.floor(fxk / cwide)
          const bnd0 = (ci0 + 0.7 * hash2(ci0, 77)) * cwide
          const c = fxk < bnd0 ? ci0 - 1 : ci0
          const b0 = (c + 0.7 * hash2(c, 77)) * cwide
          const b1 = (c + 1 + 0.7 * hash2(c + 1, 77)) * cwide
          let M = 0
          if (colK > 0) {
            if (k < 0) M = sm(((topF + (bot - topF) * spire[q] * (0.7 + 0.6 * hash2(c * 3 + 1, 19)) - ft) * H) / 3)
            else M = sm(((top + (bot - top) * tiers[k].col[q] * (0.75 + 0.5 * hash2(c * 3 + 1, 19 + k)) - ft) * H) / 3)
          }
          let t = 0.5
          if (M < 1) {
            // broken rock: blocks, each one flat face
            const uu = fx / CB + 0.9 * (lo - 0.5)
            const vv = vy + 0.9 * (sc - 0.5)
            const pw = 1 / (CB * gf * CB * gf)
            crustAt(uu, vv, pw, pw)
            const ep = PLATE[0]
            const tone = PLATE[1]
            let lam = Math.sin(tone * 37.7) * lx - 0.5 * Math.cos(tone * 91.3)
            lam = lam < -1 ? -1 : lam > 1 ? 1 : lam
            let tr = 0.5 + (lam > 0 ? 0.15 : 0.2) * lam + 0.1 * (tone - 0.5)
            // cracks: a few wide and black, some hairlines, the rest closed
            const rk = PLATE[2]
            if (rk < 0.55) {
              const wide = rk < 0.2 ? 2.4 : 1.1
              if (ep < wide) tr -= (rk < 0.2 ? 0.26 : 0.18) * (1 - ep / wide)
            }
            // smaller breaks on the blocks
            crustAt(uu * 2.7 + 31.7, vv * 2.7 + 11.3, pw / 7.29, pw / 7.29)
            const lam2 = Math.sin(PLATE[1] * 53.1) * lx - 0.5 * Math.cos(PLATE[1] * 71.9)
            tr += (lam2 > 0 ? 0.06 : 0.1) * lam2
            if (PLATE[2] < 0.3 && PLATE[0] < 1) tr -= 0.1 * (1 - PLATE[0])
            // and big slabs: the face is broken across in large pieces too, each its own tone and turned a little
            // its own way, and they do not keep to the planes
            crustAt(uu * 0.34 + 5.1, vv * 0.34 + 8.7, pw * 8.65, pw * 8.65)
            let lam3 = Math.sin(PLATE[1] * 43.3) * lx - 0.5 * Math.cos(PLATE[1] * 67.1)
            lam3 = lam3 < -1 ? -1 : lam3 > 1 ? 1 : lam3
            tr += 0.15 * (PLATE[1] - 0.5) + (lam3 > 0 ? 0.07 : 0.1) * lam3
            if (PLATE[2] < 0.3 && PLATE[0] < 2.6) tr -= 0.2 * (1 - PLATE[0] / 2.6)
            // scree and ash: the breaks fade out
            const smooth = 0.75 * sm((sc - 0.56) / 0.14)
            tr += (0.5 + 0.05 * grain - tr) * smooth
            t = tr
          }
          if (M > 0.01) {
            const cw = (b1 - b0) * gf
            const p = (fxk - b0) / (b1 - b0)
            // a prism seen from the side: the face toward the light, the face square on, the face turned away
            const turn = p < 0.3 ? 1 - sm((p - 0.22) / 0.08) : p > 0.7 ? -sm((p - 0.7) / 0.08) : 0
            let tc = 0.5 + 0.24 * turn * lx + 0.14 * (hash2(c * 7 + 1, 5 + k) - 0.5)
            // the joint between two columns
            const edge = Math.min(p, 1 - p) * cw
            if (edge < 1) tc -= 0.14 * (1 - edge)
            // a column is broken across only here and there (long shafts, not courses of brick)
            const seg = 46 + 120 * hash2(c * 3 + 2, 41)
            const yy = (y + 157 * hash2(c * 11 + 3, 23)) / seg
            const blk = Math.floor(yy)
            if ((yy - blk) * seg < 1.1) tc -= 0.08
            tc += 0.06 * (hash2(c * 5 + 1, blk * 9 + 2) - 0.5)
            t += (tc - t) * M
          }
          // the ledge over this tier: its edge catches the light, and the rock under it is in its shadow
          if (k >= 0) {
            const under = (ft - top) * H
            const lk = tiers[k].edge[q]
            if (under < 1.5) t += 0.12 * lk
            else if (under < 12) t -= 0.22 * lk * (1 - (under - 1.5) / 10.5)
          }
          t += 0.3 * (lo - 0.5) + 0.03 * grain
          t = 0.5 + (t - 0.5) * rockK
          // rust in patches, and the rest a touch toward violet, as old lava is
          const ox = lerp(lerp(rust[a], rust[a + 1], fi), lerp(rust[a + LW], rust[a + LW + 1], fi), fj) * rockK
          const o4 = (j * tw + i) * 4
          td[o4] = 255 * (t + 0.05 * ox)
          td[o4 + 1] = 255 * (t - 0.012 * ox)
          td[o4 + 2] = 255 * (t - 0.01 * ox + 0.014 * (1 - ox))
          td[o4 + 3] = 255
        }
      }
      tg.putImageData(timg, 0, 0)
      g.save()
      trace()
      g.clip()
      g.globalCompositeOperation = 'overlay'
      g.drawImage(tex, bx0, by0, bw, bh)
      g.restore()
    }
    mark('mountainRockSkin')
    // the facets where the walls break: a thin line of caught light on each
    g.lineWidth = 1
    for (const [a, b, colour] of [[12, 13, 'rgba(255,170,96,0.5)'], [14, 15, 'rgba(255,170,96,0.28)'], [21, 22, 'rgba(120,160,144,0.3)'], [23, 24, 'rgba(120,160,144,0.24)'], [25, 26, 'rgba(120,160,144,0.18)']]) {
      g.beginPath()
      g.moveTo(cp[a].x, cp[a].y)
      g.lineTo(cp[b].x, cp[b].y)
      g.strokeStyle = colour
      g.stroke()
    }
    // the moon's rim: a thin cool line down each outline, where the flank turns to face the sky. Brighter on the right
    // (the moon's side) and near the top, gone by the foot.
    for (const [side, a] of [[right, 0.34], [left, 0.12]]) {
      const rg = g.createLinearGradient(0, rimY - ch, 0, h)
      rg.addColorStop(0, `rgba(150,190,176,${a})`)
      rg.addColorStop(0.5, `rgba(150,190,176,${a * 0.4})`)
      rg.addColorStop(1, 'rgba(150,190,176,0.02)')
      g.beginPath()
      side.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      g.strokeStyle = rg
      g.lineWidth = 1.3
      g.stroke()
    }
    paintShoulders(g, true)
  }

  paint(g)
}

/** Paint Prometheus, the moon: a lit sphere of radius `r` px, on a canvas of its own. */
export function paintMoon(r) {
  const size = Math.ceil(r * 2)
  const { cv, g } = makeCanvas(size, size)
  const img = g.createImageData(size, size)
  const mr = mulberry32(0x10ba)
  const pats = []
  for (let i = 0; i < 5; i++) {
    const a = mr() * TAU
    const d = Math.sqrt(mr()) * 0.78
    pats.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: i < 2 ? 0.13 + mr() * 0.06 : 0.03 + mr() * 0.06, seed: mr() * 40, hot: i < 2 })
  }
  let [lx, ly, lz] = [-0.55, 0.72, 0.4]
  const ll = Math.hypot(lx, ly, lz)
  lx /= ll
  ly /= ll
  lz /= ll
  const skyc = [14, 9, 8]
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const nx = (i + 0.5 - r) / r
      const ny = (j + 0.5 - r) / r
      const d2 = nx * nx + ny * ny
      if (d2 >= 1) continue
      const o4 = (j * size + i) * 4
      const nz = Math.sqrt(1 - d2)
      const sx = nx / (nz + 0.35)
      const sy = ny / (nz + 0.35)
      const region = vnoise(sx * 1.4 + 40, sy * 1.4 + 40)
      const band = vnoise(sx * 0.7 + 3.1 + region, sy * 2.6 + 7.7)
      const mott = vnoise(sx * 3 + 11, sy * 3 + 5) * 0.65 + vnoise(sx * 7 + 2, sy * 7 + 9) * 0.35
      const frost = vnoise(sx * 5 + 21, sy * 5 + 17)
      const tone = 0.55 + 0.45 * region
      let Rr = (140 + 80 * band - 30 * (1 - mott)) * tone + 20
      let G = (90 + 78 * band - 34 * (1 - mott)) * tone + 10
      let B = (30 + 28 * band - 14 * (1 - mott)) * tone + 6
      if (frost > 0.66) {
        const f = ((frost - 0.66) / 0.34) * 0.75 * tone
        Rr += (226 - Rr) * f
        G += (214 - G) * f
        B += (180 - B) * f
      }
      for (const p of pats) {
        const dx = nx - p.x
        const dy = ny - p.y
        const dd = Math.sqrt(dx * dx + dy * dy)
        if (dd > p.s * 2.6) continue
        const ang = Math.atan2(dy, dx)
        const edge = p.s * (0.7 + 0.5 * vnoise(Math.cos(ang) * 1.3 + p.seed, Math.sin(ang) * 1.3 + p.seed))
        if (p.hot) {
          const stain = sm((p.s * 2.6 - dd) / (p.s * 1.8)) * 0.4
          Rr += (160 - Rr) * stain
          G += (52 - G) * stain
          B += (28 - B) * stain
        }
        const k = sm((edge - dd) / (p.s * 0.45)) * 0.75
        if (k > 0) {
          Rr += (40 - Rr) * k
          G += (22 - G) * k
          B += (14 - B) * k
        }
        if (p.hot) {
          const hk = sm((p.s * 0.2 - dd) / (p.s * 0.12)) * 0.8
          Rr += (240 - Rr) * hk
          G += (110 - G) * hk
          B += (30 - B) * hk
        }
      }
      const ndl = nx * lx + ny * ly + nz * lz
      const lit = clamp01((ndl + 0.18) / 1.18)
      const lum = 0.05 + 0.95 * lit * lit
      const rim = Math.pow(1 - nz, 3) * Math.max(0, ndl) * 0.55
      img.data[o4] = skyc[0] + (Rr - skyc[0]) * lum + 255 * rim
      img.data[o4 + 1] = skyc[1] + (G - skyc[1]) * lum + 140 * rim
      img.data[o4 + 2] = skyc[2] + (B - skyc[2]) * lum + 70 * rim
      img.data[o4 + 3] = 255 * sm((1 - Math.sqrt(d2)) / 0.025)
    }
  }
  g.putImageData(img, 0, 0)
  return cv
}
