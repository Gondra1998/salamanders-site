// A stand-in for the 2D canvas in tests. jsdom has no canvas, and the hero drawing builds and draws on dozens of them.
//
// Every context made after installFakeCanvas() remembers what was asked of it and draws nothing. Enough is real for
// the drawing's code to run: pixel data comes back as arrays of the right size (all zero), gradients take colour
// stops, and plain properties (fillStyle, globalAlpha and the rest) keep what they are given.

/** What each kind of call hands back, where "nothing" would break the caller. */
const pixels = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, Math.floor(w)) * Math.max(0, Math.floor(h)) * 4) })
const RETURNS = {
  createImageData: (w, h) => pixels(w, h),
  getImageData: (x, y, w, h) => pixels(w, h),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createConicGradient: () => ({ addColorStop() {} }),
  createPattern: () => ({}),
  measureText: () => ({ width: 0 }),
  isPointInPath: () => false,
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
}

/**
 * Replace every canvas's 2D context with a recording stand-in.
 * Returns:
 *   calls(name, ctx?)  the arguments of every call of that method so far, in order (on one context, if given)
 *   clear()            forget the calls so far
 *   restore()          put the real getContext back
 */
export function installFakeCanvas() {
  const log = [] // { ctx, name, args }
  const contexts = new WeakMap()
  const real = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function () {
    let ctx = contexts.get(this)
    if (!ctx) {
      const canvas = this
      const kept = {} // plain properties, and the methods made so far
      ctx = new Proxy(kept, {
        get(target, name) {
          if (name === 'canvas') return canvas
          if (name in target) return target[name]
          if (typeof name !== 'string') return undefined
          const method = (...args) => {
            log.push({ ctx, name, args })
            return RETURNS[name] ? RETURNS[name](...args) : undefined
          }
          target[name] = method
          return method
        },
        set(target, name, value) {
          target[name] = value
          return true
        },
      })
      contexts.set(this, ctx)
    }
    return ctx
  }
  // jsdom has no Path2D either: a path that takes any call and keeps nothing
  const realPath = globalThis.Path2D
  globalThis.Path2D = class {
    constructor() {
      return new Proxy(this, { get: (target, name) => (name in target ? target[name] : () => {}) })
    }
  }
  return {
    calls: (name, ctx) => log.filter((c) => c.name === name && (!ctx || c.ctx === ctx)).map((c) => c.args),
    clear: () => (log.length = 0),
    restore: () => {
      HTMLCanvasElement.prototype.getContext = real
      if (realPath) globalThis.Path2D = realPath
      else delete globalThis.Path2D
    },
  }
}
