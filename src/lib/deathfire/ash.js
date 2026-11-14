// Falling ash: the weather of the page. Two layers of flakes, one that falls behind the mountain and one in front of
// it. The nearer flakes are bigger and faster, which is what makes the two read as depth rather than as one layer at
// two brightnesses. Whoever hosts the drawing decides where each layer is painted (behind the rock, in front of it,
// or over the page itself).

// Ash is weather: it has to be as thick per screen area at every size. `density` is the number of flakes over a
// window of this size.
const REF_AREA = 1600 * 1000

/**
 * The ash for a window of w x h px. `density`: flakes per 1600 x 1000 px. `phone`: half as many.
 * Returns the two layers (`back`, `front`) and `fall`, which moves a layer on and paints it.
 */
export function createAsh(w, h, { density = 460, phone = false, random = Math.random } = {}) {
  const rand = (a, b) => a + random() * (b - a)
  /** One flake: anywhere in the window, or (`atTop`) just above it, about to fall in. */
  const spawn = (atTop, front) => ({
    front,
    x: rand(-30, w + 30),
    y: atTop ? rand(-60, -10) : rand(0, h),
    vy: front ? rand(0.34, 0.86) : rand(0.12, 0.42),
    drift: rand(-0.22, 0.22) * (front ? 1.5 : 1),
    size: front ? rand(1.6, 3.8) : rand(1, 2.6),
    phase: rand(0, Math.PI * 2),
    sway: rand(0.4, 1.5),
    alpha: front ? rand(0.14, 0.4) : rand(0.1, 0.32),
  })
  const total = Math.max(0, Math.round(density * ((w * h) / REF_AREA) * (phone ? 0.5 : 1))) || 0
  const frontCount = Math.round(total * 0.4)
  const back = Array.from({ length: total - frontCount }, () => spawn(false, false))
  const front = Array.from({ length: frontCount }, () => spawn(false, true))

  /**
   * Move `flakes` on by `dt` (in sixtieths of a second) and paint them on `ctx`. `over`: they are falling over the
   * page itself, where they are drawn a shade lighter and a touch larger, or they vanish against dark panels.
   */
  function fall(ctx, flakes, dt, over = false) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = over ? '#9a928a' : '#6b6560'
    const grow = over ? 1.4 : 1
    for (const a of flakes) {
      a.y += a.vy * dt
      a.phase += 0.02 * dt
      a.x += (a.drift + Math.sin(a.phase) * 0.2 * a.sway) * dt
      if (a.y > h + 20) Object.assign(a, spawn(true, a.front))
      ctx.globalAlpha = a.alpha
      ctx.fillRect(a.x, a.y, a.size * grow, a.size * grow)
    }
    ctx.globalAlpha = 1
  }

  return { back, front, fall }
}
