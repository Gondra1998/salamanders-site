import { describe, expect, it, vi } from 'vitest'
import { createAsh } from './ash.js'
import { mulberry32 } from './noise.js'

/** A context that notes what it is asked to paint. */
function context() {
  const painted = []
  return {
    painted,
    globalAlpha: 1,
    globalCompositeOperation: 'lighter',
    fillStyle: '',
    fillRect(x, y, w, h) {
      painted.push({ x, y, w, h, colour: this.fillStyle, alpha: this.globalAlpha })
    },
  }
}

describe('falling ash', () => {
  it('is as thick over a big window as over a small one: 460 flakes to 1600 x 1000, two fifths of them in front', () => {
    const ash = createAsh(1600, 1000, { random: mulberry32(1) })
    expect(ash.back).toHaveLength(276)
    expect(ash.front).toHaveLength(184)
    const small = createAsh(800, 500, { random: mulberry32(1) })
    expect(small.back.length + small.front.length).toBe(115)
    expect(small.front).toHaveLength(46)
  })

  it('is half as thick on a phone', () => {
    const ash = createAsh(1600, 1000, { phone: true, random: mulberry32(1) })
    expect(ash.back).toHaveLength(138)
    expect(ash.front).toHaveLength(92)
  })

  it('takes the density it is given, and none means none', () => {
    expect(createAsh(1600, 1000, { density: 100, random: mulberry32(1) }).back).toHaveLength(60)
    const none = createAsh(1600, 1000, { density: 0 })
    expect(none.back).toHaveLength(0)
    expect(none.front).toHaveLength(0)
  })

  it('starts spread over the whole window, the near flakes bigger and faster', () => {
    const ash = createAsh(1600, 1000, { random: mulberry32(1) })
    const mean = (list, key) => list.reduce((s, a) => s + a[key], 0) / list.length
    expect(Math.min(...ash.back.map((a) => a.y))).toBeLessThan(100)
    expect(Math.max(...ash.back.map((a) => a.y))).toBeGreaterThan(900)
    expect(mean(ash.front, 'size')).toBeGreaterThan(mean(ash.back, 'size'))
    expect(mean(ash.front, 'vy')).toBeGreaterThan(mean(ash.back, 'vy'))
    expect(ash.front.every((a) => a.front)).toBe(true)
    expect(ash.back.every((a) => !a.front)).toBe(true)
  })

  it('falls, and paints each flake as a small grey square', () => {
    const ash = createAsh(1600, 1000, { random: mulberry32(1) })
    const flake = ash.back[0]
    const y = flake.y
    const ctx = context()
    ash.fall(ctx, [flake], 2)
    expect(flake.y).toBeCloseTo(y + flake.vy * 2, 9)
    expect(ctx.painted).toEqual([{ x: flake.x, y: flake.y, w: flake.size, h: flake.size, colour: '#6b6560', alpha: flake.alpha }])
    expect(ctx.globalAlpha).toBe(1)
    expect(ctx.globalCompositeOperation).toBe('source-over')
  })

  it('brings a flake that has fallen out of the bottom back in above the top, in the layer it was in', () => {
    const ash = createAsh(1600, 1000, { random: mulberry32(1) })
    const flake = ash.front[0]
    flake.y = 1021
    ash.fall(context(), [flake], 1)
    expect(flake.y).toBeLessThan(0)
    expect(flake.front).toBe(true)
  })

  it('over the page, is a shade lighter and a touch larger', () => {
    const ash = createAsh(1600, 1000, { random: mulberry32(1) })
    const flake = ash.front[0]
    const ctx = context()
    ash.fall(ctx, [flake], 1, true)
    expect(ctx.painted[0].colour).toBe('#9a928a')
    expect(ctx.painted[0].w).toBeCloseTo(flake.size * 1.4, 9)
  })

  it('does not move on a still frame', () => {
    const ash = createAsh(1600, 1000, { random: mulberry32(1) })
    const flake = ash.back[0]
    const { x, y } = flake
    const fillRect = vi.fn()
    ash.fall({ fillRect }, [flake], 0)
    expect([flake.x, flake.y]).toEqual([x, y])
    expect(fillRect).toHaveBeenCalledTimes(1)
  })
})
