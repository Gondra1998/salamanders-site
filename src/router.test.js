// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { router } from './router'

// jsdom has no scrolling; the router's scrollBehavior asks for it after every navigation.
beforeAll(() => {
  window.scrollTo = vi.fn()
})

// /roster was a page of its own; it now lives on /companies, and old links still land.
describe('the retired /roster route', () => {
  it.each([
    ['/roster#company-3', '/companies#third'],
    ['/roster#forge', '/companies#armoury'],
    ['/roster#venerable-dreadnoughts', '/companies#dreadnoughts'],
    ['/roster#unassigned', '/companies#muster'],
    ['/roster#nope', '/companies'],
    ['/roster?scene=denied', '/companies?scene=denied'],
    ['/roster', '/companies'],
  ])('sends %s to %s', async (from, to) => {
    await router.push(from)
    expect(router.currentRoute.value.fullPath).toBe(to)
  })

  it('is a redirect and no longer a named page', () => {
    const route = router.getRoutes().find((r) => r.path === '/roster')
    expect(route.redirect).toBeTypeOf('function')
    expect(route.name).toBeUndefined()
    expect(router.getRoutes().some((r) => r.name === 'roster')).toBe(false)
  })
})

describe('scroll behaviour', () => {
  const scroll = (to, from) => router.options.scrollBehavior(to, from)

  it('leaves a /companies#… landing to the page, which scrolls once its story is there', () => {
    // a jump to the top here, after the page's own scroll to #third, would undo it
    expect(scroll({ path: '/companies', hash: '#third' }, { path: '/' })).toBe(false)
    expect(scroll({ path: '/companies', hash: '#muster' }, { path: '/builds' })).toBe(false)
  })

  it('still goes to the top of /companies without a fragment, and of every other page', () => {
    expect(scroll({ path: '/companies', hash: '' }, { path: '/' })).toEqual({ top: 0 })
    expect(scroll({ path: '/builds', hash: '' }, { path: '/' })).toEqual({ top: 0 })
  })

  it('keeps the archive threads as they were: another page with a hash goes to the top, a same-page hash change is left alone', () => {
    expect(scroll({ path: '/accolades/200000000000000001', hash: '#m-5' }, { path: '/' })).toEqual({ top: 0 })
    expect(scroll({ path: '/accolades/200000000000000001', hash: '#m-6' }, { path: '/accolades/200000000000000001' })).toBe(false)
  })
})

describe('the Legacy Accolades route', () => {
  it('is its own page, and the thread route still takes thread ids', () => {
    expect(router.resolve('/accolades/legacy').name).toBe('legacy-accolades')
    expect(router.resolve('/accolades/legacy').meta).toMatchObject({ title: 'Legacy Accolades', ashOver: true })
    expect(router.resolve('/accolades').name).toBe('accolades')
    expect(router.resolve('/accolades/200000000000000001').name).toBe('accolades')
  })
})

describe('the Deathwatch routes', () => {
  it('has a hub and an area page under one parent, which carries the title and the ash over the plaque', () => {
    expect(router.resolve('/deathwatch').name).toBe('deathwatch')
    expect(router.resolve('/deathwatch').meta).toMatchObject({ title: 'Watch Fortress Ebonhold', ashOver: true })
    expect(router.resolve('/deathwatch/eventtracker/players').name).toBe('deathwatch-area')
    expect(router.resolve('/deathwatch/eventtracker/players').meta).toMatchObject({ title: 'Watch Fortress Ebonhold', ashOver: true })
  })

  it.each([
    ['/deathwatch', '/deathwatch'],
    ['/deathwatch/eventtracker/players', '/deathwatch/eventtracker/players'],
    ['/deathwatch/eventtracker', '/deathwatch/eventtracker/standings'],
    ['/deathwatch/eventtracker/', '/deathwatch/eventtracker/standings'],
    ['/deathwatch/eventtracker/nonsense', '/deathwatch/eventtracker/standings'],
    ['/deathwatch/armouringhall', '/deathwatch/armouringhall/standard/watchbrother'],
    ['/deathwatch/armouringhall/standard/companyheraldry', '/deathwatch/armouringhall/standard/companyheraldry'],
    ['/deathwatch/armouringhall/standard/battlebrother', '/deathwatch/armouringhall/standard/watchbrother'],
    ['/deathwatch/armouringhall/standard/A%20B', '/deathwatch/armouringhall/standard/watchbrother'],
    ['/deathwatch/armouringhall/specialist/nope', '/deathwatch/armouringhall/specialist/reclusiarc'],
    ['/deathwatch/armouringhall/specialist/A%20B', '/deathwatch/armouringhall/specialist/reclusiarc'],
    ['/deathwatch/armouringhall/watch-command/watchbrother', '/deathwatch/armouringhall/watch-command/watchsergeant'],
    ['/deathwatch/armouringhall/restricted-wargear/anything', '/deathwatch/armouringhall/restricted-wargear'],
    ['/deathwatch/chronicles', '/deathwatch/chronicles/hall-of-champions'],
    ['/deathwatch/manage', '/deathwatch/manage/enter-mission'],
  ])('takes %s to %s', async (from, to) => {
    await router.push(from)
    expect(router.currentRoute.value.fullPath).toBe(to)
  })

  it('keeps the query and the hash when it canonicalizes, so a ?scene= fixture survives', async () => {
    await router.push('/deathwatch/eventtracker?scene=denied#top')
    expect(router.currentRoute.value.fullPath).toBe('/deathwatch/eventtracker/standings?scene=denied#top')
  })

  it('answers an unknown area, or one in another case, with the not-found page at the address typed', async () => {
    for (const path of ['/deathwatch/nope', '/deathwatch/EventTracker/players', '/deathwatch/__proto__', '/deathwatch/constructor/x', '/deathwatch/nope/A%20B']) {
      await router.push(path)
      expect(router.currentRoute.value.name, path).toBe('not-found')
      expect(router.currentRoute.value.fullPath, path).toBe(path)
    }
  })
})

describe('the Reliquarium route', () => {
  it.each([
    ['/reliquarium', undefined],
    ['/reliquarium/clips', 'clips'],
    ['/reliquarium/art', 'art'],
    ['/reliquarium/submit', 'submit'],
    ['/reliquarium/mine', 'mine'],
    ['/reliquarium/review', 'review'],
  ])('takes %s, with the tab %s', (path, tab) => {
    const route = router.resolve(path)
    expect(route.name).toBe('reliquarium')
    expect(route.params.tab).toBe(tab)
    expect(route.meta.title).toBe('Reliquarium')
  })

  it('sends any other tab to the not-found page', () => {
    expect(router.resolve('/reliquarium/gallery').name).toBe('not-found')
    expect(router.resolve('/reliquarium/clips/extra').name).toBe('not-found')
  })

  it('loads the page on demand, so it is a chunk of its own and not part of the first load', () => {
    const route = router.getRoutes().find((r) => r.name === 'reliquarium')
    expect(route.components.default).toBeTypeOf('function')
    expect(route.components.default.length).toBe(0)
  })
})
