import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import list from './baked/baked.json'

// A browser's fetch and picture decoder, stood in for. Each picture decodes to an object naming the file it came from.
let fetched
let failFetch
let notOk
let failDecode
beforeEach(() => {
  vi.resetModules() // the module remembers what it has fetched: every test starts with a fresh one
  fetched = []
  failFetch = notOk = failDecode = () => false
  vi.stubGlobal('fetch', async (url) => {
    const name = String(url).split('/').pop()
    fetched.push(name)
    if (failFetch(name)) throw new TypeError('network')
    return { ok: !notOk(name), blob: async () => ({ of: name }) }
  })
  vi.stubGlobal('createImageBitmap', async (blob) => {
    if (failDecode(blob.of)) throw new Error('not a picture')
    return { bitmapOf: blob.of }
  })
})
afterEach(() => vi.unstubAllGlobals())
const fresh = async () => (await import('./baked.js')).loadBaked

describe('the baked pictures', () => {
  it('fetches the moon and the mountain for this kind of device, and no other', async () => {
    const loadBaked = await fresh()
    const got = await loadBaked('desktop')
    expect(fetched.sort()).toEqual(['moon.webp', 'mountain-desktop.webp'])
    expect(got.moon).toEqual({ bitmapOf: 'moon.webp' })
    expect(got.mountain.image).toEqual({ bitmapOf: 'mountain-desktop.webp' })
    // where the peak and the rim are in the picture, and which gully the river runs in: as the bake tool noted them
    expect(got.mountain.meta).toEqual(list.desktop.mountain)
    expect(got.mountain.meta.riverU).toBeTypeOf('number')
  })

  it('fetches each picture once', async () => {
    const loadBaked = await fresh()
    const first = await loadBaked('phone')
    expect(await loadBaked('phone')).toBe(first)
    expect(fetched.sort()).toEqual(['moon.webp', 'mountain-phone.webp'])
    // the other kind (a window dragged wider) needs its own mountain, and the same moon
    const other = await loadBaked('desktop')
    expect(fetched.sort()).toEqual(['moon.webp', 'mountain-desktop.webp', 'mountain-phone.webp'])
    expect(other.moon).toBe(first.moon)
  })

  it('names the files the bake tool writes', () => {
    expect(list.moon.file).toBe('moon.webp')
    expect(list.desktop.mountain.file).toBe('mountain-desktop.webp')
    expect(list.phone.mountain.file).toBe('mountain-phone.webp')
  })

  it.each([
    ['the network fails', () => (failFetch = (name) => name.startsWith('mountain'))],
    ['the server says no', () => (notOk = (name) => name.startsWith('mountain'))],
    ['the file is not a picture', () => (failDecode = (name) => name.startsWith('mountain'))],
    ['the moon cannot be had', () => (failFetch = (name) => name === 'moon.webp')],
  ])('gives nothing, and does not try again, when %s', async (_, arrange) => {
    arrange()
    const loadBaked = await fresh()
    expect(await loadBaked('desktop')).toBeNull()
    const tries = fetched.length
    expect(await loadBaked('desktop')).toBeNull()
    expect(fetched).toHaveLength(tries)
  })

  it('gives nothing for a kind of device there is no picture for', async () => {
    const loadBaked = await fresh()
    expect(await loadBaked('watch')).toBeNull()
  })
})
