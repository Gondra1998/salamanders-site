import { describe, it, expect } from 'vitest'
import { deathwatchRedirect } from './redirect'

// An area page as the router hands it to a guard: name, path, params, query and hash.
const to = (path, params, query = {}, hash = '') => ({ name: 'deathwatch-area', path, params, query, hash })

describe('deathwatchRedirect', () => {
  it('leaves every other route alone', () => {
    for (const name of ['home', 'deathwatch', 'not-found', 'companies', undefined]) {
      expect(deathwatchRedirect({ name, path: '/deathwatch/nope', params: { area: 'nope' }, query: {}, hash: '' }), String(name)).toBeUndefined()
    }
  })

  it('lets a canonical path through', () => {
    expect(deathwatchRedirect(to('/deathwatch/eventtracker/standings', { area: 'eventtracker', tab: 'standings' }))).toBeUndefined()
    expect(
      deathwatchRedirect(to('/deathwatch/armouringhall/standard/companyheraldry', { area: 'armouringhall', tab: 'standard', sub: 'companyheraldry' })),
    ).toBeUndefined()
  })

  it('replaces a path with its canonical one, keeping the query and the hash', () => {
    const query = { scene: 'denied' }
    expect(deathwatchRedirect(to('/deathwatch/eventtracker', { area: 'eventtracker' }, query, '#top'))).toEqual({
      path: '/deathwatch/eventtracker/standings',
      query,
      hash: '#top',
      replace: true,
    })
  })

  it('takes the old Manage addresses to the Administratum, keeping the query', () => {
    const query = { scene: 'commander' }
    expect(deathwatchRedirect(to('/deathwatch/manage/checks', { area: 'manage', tab: 'checks' }, query))).toEqual({
      path: '/deathwatch/administratum/checks',
      query,
      hash: '',
      replace: true,
    })
    expect(deathwatchRedirect(to('/deathwatch/manage/manage', { area: 'manage', tab: 'manage' }))).toMatchObject({
      path: '/deathwatch/administratum/manage',
    })
    expect(deathwatchRedirect(to('/deathwatch/administratum/checks', { area: 'administratum', tab: 'checks' }))).toBeUndefined()
  })

  it('replaces an unknown tab with the first, and drops a trailing slash', () => {
    expect(deathwatchRedirect(to('/deathwatch/eventtracker/bogus', { area: 'eventtracker', tab: 'bogus' }))).toMatchObject({
      path: '/deathwatch/eventtracker/standings',
      replace: true,
    })
    expect(deathwatchRedirect(to('/deathwatch/chronicles/in-memoriam/', { area: 'chronicles', tab: 'in-memoriam' }))).toMatchObject({
      path: '/deathwatch/chronicles/in-memoriam',
    })
  })

  it('drops a hostile sub-slug', () => {
    const r = deathwatchRedirect(to('/deathwatch/armouringhall/standard/A%20B', { area: 'armouringhall', tab: 'standard', sub: 'A B' }))
    expect(r).toMatchObject({ path: '/deathwatch/armouringhall/standard/watchbrother', replace: true })
  })

  it('sends an unknown area to the not-found page, keeping the address the visitor typed', () => {
    const query = { x: '1' }
    expect(deathwatchRedirect(to('/deathwatch/nope/x', { area: 'nope', tab: 'x' }, query, '#h'))).toEqual({
      name: 'not-found',
      params: { pathMatch: ['deathwatch', 'nope', 'x'] },
      query,
      hash: '#h',
    })
  })

  it('hands the not-found page decoded segments, so the router does not encode them a second time', () => {
    const r = deathwatchRedirect(to('/deathwatch/nope/A%20B', { area: 'nope', tab: 'A B' }))
    expect(r.params.pathMatch).toEqual(['deathwatch', 'nope', 'A B'])
  })

  it('does not choke on a malformed escape in an address it does not know', () => {
    let r
    expect(() => (r = deathwatchRedirect(to('/deathwatch/nope/%E0%A4%A', { area: 'nope', tab: '%E0%A4%A' })))).not.toThrow()
    expect(r.params.pathMatch).toEqual(['deathwatch', 'nope', '%E0%A4%A'])
  })

  it('treats an area that only exists on the prototype, or in another case, as unknown', () => {
    for (const area of ['__proto__', 'constructor', 'EventTracker']) {
      const r = deathwatchRedirect(to(`/deathwatch/${area}`, { area }))
      expect(r, area).toMatchObject({ name: 'not-found' })
    }
  })
})
