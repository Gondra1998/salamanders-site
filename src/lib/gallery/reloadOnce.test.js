import { describe, it, expect, beforeEach } from 'vitest'
import { shouldReload, loaded, forgetReloads } from './reloadOnce'

beforeEach(forgetReloads)

describe('reloadOnce', () => {
  it('says to reload the first time an item fails, and not the second', () => {
    expect(shouldReload('1')).toBe(true)
    expect(shouldReload('1')).toBe(false)
    expect(shouldReload('1')).toBe(false)
  })

  it('counts each item on its own', () => {
    expect(shouldReload('1')).toBe(true)
    expect(shouldReload('2')).toBe(true)
  })

  it('starts again for an item once it has loaded', () => {
    shouldReload('1')
    loaded('1')
    expect(shouldReload('1')).toBe(true)
  })

  it('does not mind a load for an item that never failed', () => {
    loaded('9')
    expect(shouldReload('9')).toBe(true)
  })

  it('forgets everything on request', () => {
    shouldReload('1')
    shouldReload('2')
    forgetReloads()
    expect(shouldReload('1')).toBe(true)
    expect(shouldReload('2')).toBe(true)
  })
})
