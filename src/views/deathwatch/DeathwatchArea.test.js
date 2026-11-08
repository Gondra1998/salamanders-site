// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest'
import { h } from 'vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { deathwatchRedirect } from '../../lib/deathwatch/redirect'
import { useDeathwatch } from '../../stores/deathwatch'
import { useDeathwatchData } from '../../stores/deathwatchData'
import DeathwatchArea from './DeathwatchArea.vue'
// The rebuilt views pull in the auth store, and with it the Legion Archive's modules. Load them here rather than
// inside a test, where the lazy views would first import them: the mutation gate would then count the archive's
// module-level code as covered by that test, and no longer as static.
import '../../lib/deathwatch/useTracker'

// A view is loaded lazily by the registry (lib/deathwatch/pages.js). A test can make the registry fail, or find
// nothing, for the address it opens; otherwise this is the real registry.
const override = vi.hoisted(() => ({ loader: undefined }))
vi.mock('../../lib/deathwatch/pages', async (importOriginal) => {
  const real = await importOriginal()
  return { pageLoader: (area, tab) => (override.loader === undefined ? real.pageLoader(area, tab) : override.loader) }
})

// Lets the lazily imported view arrive and render.
async function settle() {
  await flushPromises()
  await vi.dynamicImportSettled()
  await flushPromises()
}

// The area route as production declares it (router.js): the view as the component, and the same global guard.
async function mountAt(path, { commander = false, command = commander } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useDeathwatch().$patch({ status: 'allowed', commander, command })
  // The ported views read the area's data: an empty event, already loaded, so none of them asks a server.
  useDeathwatchData().$patch({ status: 'ready', local: true })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/deathwatch/:area/:tab?/:sub?', name: 'deathwatch-area', component: DeathwatchArea },
      { path: '/:rest(.*)*', component: { template: '<div />' } },
    ],
  })
  router.beforeEach(deathwatchRedirect)
  router.push(path)
  await router.isReady()
  const w = mount({ render: () => h(RouterView) }, { global: { plugins: [pinia, router] } })
  await settle()
  return { w, router }
}

// jsdom has no modal <dialog> or matchMedia, which the bottom sheet uses (see DeathwatchNavSheet.test.js).
let reduced
beforeEach(() => {
  reduced = false
  override.loader = undefined
  HTMLDialogElement.prototype.showModal = vi.fn(function () {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
  window.matchMedia = vi.fn(() => ({ matches: reduced }))
})

describe('DeathwatchArea', () => {
  it('shows the area, the current view and the list of views', async () => {
    const { w } = await mountAt('/deathwatch/eventtracker/players')
    expect(w.find('h1').text()).toBe('Event Tracker')
    expect(w.find('h2').text()).toBe('Players')
    expect(w.find('.dw-area-sheet .dw-page').exists()).toBe(true)
    const current = w.find('nav [aria-current="page"]')
    expect(current.text()).toBe('Players')
  })

  it('draws the view inside the framed panel, and the rail beside it', async () => {
    const { w } = await mountAt('/deathwatch/eventtracker/standings')
    expect(w.find('.dw-area-sheet.dw-panel h2.dw-plaque').text()).toBe('Standings')
    const rail = w.find('aside.dw-area-side')
    expect(rail.find('img.dw-area-crest').attributes('alt')).toBe('')
    expect(rail.text()).toContain('Watch Fortress Ebonhold')
    expect(rail.find('h1').text()).toBe('Event Tracker')
    expect(rail.find('nav [aria-current="page"]').text()).toBe('Standings')
  })

  it('keeps the view mounted when only the query changes, so a view keeps what it holds', async () => {
    const { w, router } = await mountAt('/deathwatch/eventtracker/standings')
    const before = w.find('.dw-page').element
    await router.push('/deathwatch/eventtracker/standings?scene=allowed')
    await settle()
    expect(w.find('.dw-page').element).toBe(before)
  })

  it('keeps the view mounted when only the Armouring Hall item changes', async () => {
    const { w, router } = await mountAt('/deathwatch/armouringhall/standard/helm')
    const before = w.find('.dw-page').element
    await router.push('/deathwatch/armouringhall/standard/pauldrons')
    await settle()
    expect(w.find('.dw-page').element).toBe(before)
  })

  it('mounts a new view when the tab changes', async () => {
    const { w, router } = await mountAt('/deathwatch/eventtracker/standings')
    const before = w.find('.dw-page').element
    await router.push('/deathwatch/eventtracker/players')
    await settle()
    expect(w.find('.dw-page').element).not.toBe(before)
    expect(w.find('.dw-page h2').text()).toBe('Players')
  })

  it('caps the sticky rail to the screen and lets it scroll, so its last links are reachable on a short window', () => {
    const src = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.js$/, '.vue'), 'utf8')
    const rail = src.match(/@media \(min-width: 900px\)\s*\{[\s\S]*?\.dw-area-side\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rail).toContain('position: sticky')
    expect(rail).toMatch(/max-height:\s*calc\(100dvh/)
    expect(rail).toContain('overflow-y: auto')
  })

  it('leaves the fan-site disclaimer to the site footer', async () => {
    const { w } = await mountAt('/deathwatch/eventtracker/standings')
    expect(w.find('.dw-legal').exists()).toBe(false)
  })

  it('shows a status line, and keeps the list of views, when the view cannot be loaded', async () => {
    override.loader = () => Promise.reject(new Error('chunk failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {}) // Vue logs a failed lazy view; that is expected here
    const { w } = await mountAt('/deathwatch/eventtracker/players')
    expect(w.find('.dw-area-sheet [role="alert"]').text()).toBe('This view could not be loaded. Try again.')
    expect(w.find('aside nav [aria-current="page"]').text()).toBe('Players')
  })

  // From 900px the hall has no rail, so where no view heads it the area does (review of #53: no dead end).
  describe('the Armouring Hall heads itself where no view does', () => {
    const head = (w) => w.find('.dw-area-sheet .hh')

    it('over the lock on Watch Command, with the way back and the open tabs', async () => {
      const { w } = await mountAt('/deathwatch/armouringhall/watch-command', { commander: false })
      expect(head(w).find('a.hh-back').attributes('href')).toBe('/deathwatch')
      expect(head(w).findAll('a.hh-tab').map((a) => a.text())).toEqual(['Standard', 'Specialist', 'Restricted Wargear'])
      expect(w.find('.dw-area-sheet .dw-area-restricted').text()).toBe('Reserved for the Deathwatch Command.')
    })

    it('over the error when its view cannot be loaded, and nowhere else', async () => {
      override.loader = () => Promise.reject(new Error('chunk failed'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const hall = (await mountAt('/deathwatch/armouringhall/specialist')).w
      expect(head(hall).find('[aria-current="page"]').text()).toBe('Specialist')
      expect(hall.find('.dw-area-sheet [role="alert"]').exists()).toBe(true)
      const tracker = (await mountAt('/deathwatch/chronicles/player-profiles')).w
      expect(tracker.find('.dw-area-sheet [role="alert"]').exists()).toBe(true)
      expect(head(tracker).exists()).toBe(false)
    })

    it('over "Loading…" while its view is on its way, and nowhere else', async () => {
      override.loader = () => new Promise(() => {})
      vi.useFakeTimers()
      try {
        const hall = (await mountAt('/deathwatch/armouringhall/standard')).w
        const tracker = (await mountAt('/deathwatch/chronicles/player-profiles')).w
        await vi.advanceTimersByTimeAsync(250) // past the loading view's delay
        expect(hall.find('.dw-area-sheet [role="status"]').text()).toBe('Loading…')
        expect(head(hall).exists()).toBe(true)
        expect(tracker.find('.dw-area-sheet [role="status"]').text()).toBe('Loading…')
        expect(head(tracker).exists()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('leaves it to the view when the view is there', async () => {
      const { w } = await mountAt('/deathwatch/armouringhall/standard')
      expect(w.findAll('.dw-area-sheet .hh')).toHaveLength(1)
    })
  })

  it('says the view is being rebuilt when the registry has none for the address', async () => {
    override.loader = null
    const { w } = await mountAt('/deathwatch/eventtracker/players')
    expect(w.find('.dw-area-sheet [role="status"]').text()).toBe('This view is being rebuilt.')
  })

  it('works for every area', async () => {
    for (const [path, area, tab] of [
      ['/deathwatch/armouringhall/specialist', 'Armouring Hall', 'Specialist'],
      ['/deathwatch/chronicles/in-memoriam', 'Chronicles of Valor', 'In Memoriam'],
    ]) {
      const { w } = await mountAt(path)
      expect(w.find('h1').text(), path).toBe(area)
      expect(w.find('h2').text(), path).toBe(tab)
    }
  })

  it('keeps the address canonical when only the tab changes', async () => {
    const { w, router } = await mountAt('/deathwatch/eventtracker/players')
    await router.push('/deathwatch/eventtracker/bogus')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/deathwatch/eventtracker/standings')
    expect(w.find('h2').text()).toBe('Standings')
  })

  it('keeps the query when it canonicalizes', async () => {
    const { router } = await mountAt('/deathwatch/eventtracker/players')
    await router.push('/deathwatch/eventtracker/bogus?scene=denied')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/deathwatch/eventtracker/standings?scene=denied')
  })

  it('shows Manage to the Watch Commander as any other area', async () => {
    const { w } = await mountAt('/deathwatch/manage', { commander: true })
    expect(w.find('h1').text()).toBe('Manage')
    expect(w.find('h2').text()).toBe('Enter mission')
    expect(w.find('nav').exists()).toBe(true)
  })

  it('offers the Watch Commander "Edit page" on a page with texts, with that page’s texts', async () => {
    const { w, router } = await mountAt('/deathwatch/recruitment/requirements', { commander: true })
    expect(w.get('.pe-open').text()).toBe('Edit page')
    expect(w.findAll('.pe textarea').map((t) => t.attributes('name'))).toEqual(['rq_q', 'rq1', 'rq2', 'rq3'])
    await router.push('/deathwatch/hallofrelics/fortress-lore')
    await settle()
    expect(w.findAll('.pe textarea').map((t) => t.attributes('name'))[0]).toBe('lo_s')
    await router.push('/deathwatch/eventtracker/standings')
    await settle()
    expect(w.find('.pe-open').exists()).toBe(false)
  })

  it('offers an Armouring Hall uniform’s own texts, and Company Heraldry its own', async () => {
    const { w, router } = await mountAt('/deathwatch/armouringhall/specialist/librarium', { commander: true })
    expect(w.get('.pe textarea').attributes('name')).toBe('ah_librarium_lead')
    await router.push('/deathwatch/armouringhall/specialist/mechanicus')
    await settle()
    expect(w.get('.pe textarea').attributes('name')).toBe('ah_mechanicus_lead')
    await router.push('/deathwatch/armouringhall/standard/companyheraldry')
    await settle()
    expect(w.get('.pe textarea').attributes('name')).toBe('ah_companyheraldry_companies')
  })

  it('offers "Edit page" to nobody but the Watch Commander', async () => {
    const { w } = await mountAt('/deathwatch/recruitment/requirements', { command: true })
    expect(w.find('h2').exists()).toBe(true)
    expect(w.find('.pe-open').exists()).toBe(false)
  })

  it('puts the views behind a bar on a phone, with the same list in a sheet', async () => {
    const { w } = await mountAt('/deathwatch/eventtracker/players')
    const bar = w.find('button.dw-areabar')
    expect(bar.text()).toContain('Event Tracker')
    expect(bar.text()).toContain('Players')
    expect(w.findAll('aside nav, dialog nav')).toHaveLength(2) // the sidebar and the sheet's copy (the view's HallHead has its own)
    expect(w.find('dialog nav [aria-current="page"]').text()).toBe('Players')
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled()
    expect(bar.attributes('aria-expanded')).toBe('false')

    await bar.trigger('click')
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1)
    expect(bar.attributes('aria-expanded')).toBe('true')
  })

  it('closes the sheet when a view is chosen in it', async () => {
    reduced = true // so the close is immediate
    const { w } = await mountAt('/deathwatch/eventtracker/players')
    await w.find('button.dw-areabar').trigger('click')
    await w.find('dialog nav a').trigger('click')
    await settle()
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1)
    expect(w.find('button.dw-areabar').attributes('aria-expanded')).toBe('false')
  })

  it('shows the Watch Command tab to Deathwatch Command only, and anyone else a notice in its place', async () => {
    const other = (await mountAt('/deathwatch/armouringhall/watch-command', { commander: false })).w
    expect(other.find('.dw-area-sheet .dw-area-restricted').text()).toBe('Reserved for the Deathwatch Command.')
    expect(other.find('nav').text()).not.toContain('Watch Command')
    expect(other.find('nav').text()).toContain('Specialist')
    const command = (await mountAt('/deathwatch/armouringhall/watch-command', { command: true })).w
    expect(command.find('.dw-area-sheet').text()).not.toContain('Reserved for the Deathwatch Command.')
    expect(command.find('nav').text()).toContain('Watch Command')
  })

  it('keeps Manage restricted for Deathwatch Command, who is not the Watch Commander', async () => {
    const { w } = await mountAt('/deathwatch/manage/checks', { commander: false, command: true })
    expect(w.text()).toContain('Restricted to the Watch Commander.')
    expect(w.find('nav').exists()).toBe(false)
  })

  it('shows anyone else a notice in place of the Manage area, with no way into its views', async () => {
    const { w } = await mountAt('/deathwatch/manage/checks', { commander: false })
    expect(w.text()).toContain('Restricted to the Watch Commander.')
    expect(w.find('nav').exists()).toBe(false)
    expect(w.text()).not.toContain('This view is being rebuilt.')
    expect(w.text()).not.toContain('Checks')
    expect(w.find('button.dw-areabar').exists()).toBe(false)
    expect(w.find('dialog').exists()).toBe(false)
  })

  it('shows the gold crest in the Hall of Relics, as the old site did, the Armouring Hall its own emblem, and the plain one elsewhere', async () => {
    expect((await mountAt('/deathwatch/hallofrelics/notable-members')).w.get('img.dw-area-crest').attributes('src')).toContain('crest-gold')
    expect((await mountAt('/deathwatch/eventtracker/players')).w.get('img.dw-area-crest').attributes('src')).not.toContain('crest-gold')
    expect((await mountAt('/deathwatch/armouringhall/standard')).w.get('img.dw-area-crest').attributes('src')).toContain('crest-armouringhall')
  })

  // Following a link inside a view rebuilds the sheet; the keyboard's focus must not fall back to the top.
  // jsdom only focuses an element in the document: the area is attached, and taken out again after each test.
  const attached = async (path) => {
    const at = await mountAt(path)
    document.body.appendChild(at.w.element)
    onTestFinished(() => {
      at.w.unmount()
      document.body.replaceChildren()
    })
    return at
  }
  const until = async (ok) => {
    for (let i = 0; i < 60 && !ok(); i++) await new Promise((r) => setTimeout(r, 20))
  }

  it("moves the keyboard's focus to the new view's heading when the tab changes", async () => {
    const { w, router } = await attached('/deathwatch/eventtracker/standings')
    await router.push('/deathwatch/eventtracker/scoring')
    await settle()
    await until(() => document.activeElement?.tagName === 'H2')
    const heading = document.activeElement
    expect(heading.tagName).toBe('H2')
    expect(heading.getAttribute('tabindex')).toBe('-1')
    expect(w.get('.dw-area-sheet').element.contains(heading)).toBe(true)
  })

  it('gives the focus to the sheet when the new view has no heading', async () => {
    const { w, router } = await attached('/deathwatch/eventtracker/standings')
    override.loader = async () => ({ default: { render: () => h('p', 'nothing to head') } })
    await router.push('/deathwatch/eventtracker/scoring')
    await settle()
    await until(() => document.activeElement?.classList.contains('dw-area-sheet'))
    expect(document.activeElement).toBe(w.get('.dw-area-sheet').element)
    expect(document.activeElement.getAttribute('tabindex')).toBe('-1')
  })

  it('moves the focus without requestAnimationFrame too', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    onTestFinished(() => vi.unstubAllGlobals())
    const { router } = await attached('/deathwatch/eventtracker/standings')
    override.loader = async () => ({ default: { render: () => h('p', 'nothing to head') } })
    await router.push('/deathwatch/eventtracker/scoring')
    await settle()
    await until(() => document.activeElement?.classList.contains('dw-area-sheet'))
    expect(document.activeElement.classList).toContain('dw-area-sheet')
  })
})
