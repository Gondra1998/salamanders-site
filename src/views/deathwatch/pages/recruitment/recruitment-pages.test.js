// @vitest-environment jsdom
// The Recruitment pages rendered: the Terms of Service with their numbering, and the Requirements with their notes.
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getData } from '../../../../lib/deathwatch/api'
import { useDeathwatchData } from '../../../../stores/deathwatchData'
import TermsOfService from './terms-of-service.vue'
import Requirements from './requirements.vue'

vi.mock('../../../../lib/deathwatch/api', () => ({ getData: vi.fn(async () => null), writeDoc: vi.fn() }))

function mountPage(page, tx, status = 'ready') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useDeathwatchData().$patch({ status, cfg: { tx } })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { render: () => null } }] })
  return mount(page, { global: { plugins: [pinia, router] } })
}
const texts = (w, sel) => w.findAll(sel).map((e) => e.text())

describe('Terms of Service', () => {
  it('numbers the sections, sub-sections and clauses: the fourth section is Failure Progression', () => {
    const w = mountPage(TermsOfService)
    const sections = texts(w, '.rc-s h3')
    expect(sections).toHaveLength(6)
    expect(sections[3]).toBe('Section 4 — Failure Progression')
    expect(w.findAll('.rc-s')[3].get('.rc-n').text()).toBe('4.1.1')
    expect(w.findAll('.rc-s')[3].get('h4').text()).toBe('4.1 — Formal Discipline')
  })

  // Section 3 refers to "Section 4" by number: that must stay true when an earlier section is blanked.
  it('keeps each section its number when an earlier one is blanked', () => {
    const w = mountPage(TermsOfService, { ts2: '' })
    const sections = texts(w, '.rc-s h3')
    expect(sections).toHaveLength(5)
    expect(sections[2]).toBe('Section 4 — Failure Progression')
    expect(w.findAll('.rc-s')[2].get('.rc-n').text()).toBe('4.1.1')
  })

  it('shows "Section 1" alone, with no dash, for a section without a title', () => {
    const w = mountPage(TermsOfService, { ts1: '\nfirst clause' })
    expect(w.findAll('.rc-s h3')[0].text()).toBe('Section 1')
  })

  it('shows a sub-section title with its marks, and no empty list for a sub-section without clauses', () => {
    const w = mountPage(TermsOfService, { ts1: 'First\n## **Bold** title\n## Empty one' })
    const first = w.findAll('.rc-s')[0]
    expect(first.findAll('h4').map((h) => h.text())).toEqual(['1.1 — Bold title', '1.2 — Empty one'])
    expect(first.get('h4 b').text()).toBe('Bold')
    expect(first.findAll('ol')).toHaveLength(0)
    expect(first.text()).not.toMatch(/\*/)
  })

  it('links the Requirements in place and Discord in a new tab', () => {
    const w = mountPage(TermsOfService)
    const links = w.findAll('.rc-body a')
    const page = links.find((a) => a.text() === 'Requirements')
    expect(page.attributes('href')).toBe('/deathwatch/recruitment/requirements')
    expect(page.attributes('target')).toBeUndefined()
    expect(links.find((a) => a.text() === 'dw-tour-signups').attributes('target')).toBe('_blank')
  })
})

describe('Terms of Service TL;DR', () => {
  it('opens the short version above Section 1 in a modal dialog, and closes it', async () => {
    const showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.showModal = showModal
    const w = mountPage(TermsOfService)
    const btn = w.get('.rc-tl-open')
    expect(btn.element.compareDocumentPosition(w.get('.rc-s h3').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await btn.trigger('click')
    expect(showModal).toHaveBeenCalledTimes(1)
    const d = w.get('dialog.rc-tl')
    expect(texts(d, 'h4')).toEqual(['Essential Information', 'Failure Progression', 'Service & Rewards'])
    expect(d.findAll('.rc-req')[1].findAll('li')).toHaveLength(4)
    expect(d.get('a').attributes('target')).toBe('_blank')
    expect(d.get('form').attributes('method')).toBe('dialog')
  })

  it('has no button when the TL;DR is blanked', () => {
    expect(mountPage(TermsOfService, { ts_tl: '' }).find('.rc-tl-open').exists()).toBe(false)
  })
})

// The texts load once; if that fails the defaults stay, with a note and a button that loads them again.
describe.each([
  ['Terms of Service', TermsOfService],
  ['Requirements', Requirements],
])('%s after a failed load', (_, page) => {
  it('keeps the default texts and offers to load them again', async () => {
    getData.mockRejectedValueOnce(new Error('down'))
    const w = mountPage(page, undefined, 'error')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toMatch(/^The latest texts could not be loaded\.\s*Try again$/)
    expect(w.findAll('.rc-s').length).toBeGreaterThan(0)
    vi.clearAllMocks()
    await w.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(getData).toHaveBeenCalledTimes(1)
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows no note once the texts are in', () => {
    expect(mountPage(page).find('[role="alert"]').exists()).toBe(false)
  })
})

describe('Requirements', () => {
  it('shows the three blocks, each requirement with all its notes', () => {
    const w = mountPage(Requirements, { rq1: 'Ranks\nLead line\n- one\n  - first note\n  - second note\n- two' })
    expect(texts(w, '.rc-s h3')).toEqual(['Ranks', 'Accolade Requirements', 'Skill & Conduct Requirements'])
    const items = w.findAll('.rc-s')[0].findAll('.rc-req > li')
    expect(items).toHaveLength(2)
    expect(texts(items[0], '.rc-l')).toEqual(['first note', 'second note'])
    expect(items[1].findAll('.rc-l')).toHaveLength(0)
  })

  it('shows a block without a title, with no empty heading', () => {
    const w = mountPage(Requirements, { rq1: '\n\n- one' })
    const first = w.findAll('.rc-s')[0]
    expect(first.find('h3').exists()).toBe(false)
    expect(first.get('.rc-req li').text()).toBe('one')
  })
})

// Headed like the Armouring Hall (HallHead), with the page's sections under Contents at the top right.
describe('the Recruitment head', () => {
  it('shows the area, its line and both tabs, the open one marked', () => {
    const w = mountPage(Requirements)
    expect(w.get('.hh-title').text()).toBe('Recruitment')
    expect(w.get('.hh-line').text()).toBe('Watch Fortress Ebonhold')
    expect(texts(w, 'a.hh-tab')).toEqual(['Terms of Service', 'Requirements'])
    expect(w.get('a.hh-tab[aria-current="page"]').attributes('href')).toBe('/deathwatch/recruitment/requirements')
  })

  it('lists every section under Contents, and a click jumps to its heading and closes the list', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const w = mountPage(TermsOfService)
    document.body.append(w.element)
    const items = w.findAll('.rcc-item')
    expect(items).toHaveLength(6)
    expect(items[3].text()).toBe('Section 4 — Failure Progression')
    w.get('details.rcc').element.open = true
    await items[3].trigger('click')
    const target = document.getElementById('rc-s4')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(target)
    expect(document.activeElement).toBe(target)
    expect(w.get('details.rcc').element.open).toBe(false)
    w.element.remove()
  })

  it('leaves a block without a title out of Contents', () => {
    const w = mountPage(Requirements, { rq1: '\n\n- one' })
    expect(texts(w, '.rcc-item')).toEqual(['Accolade Requirements', 'Skill & Conduct Requirements'])
  })

  // Contents rides along: at the top it is the bare list; once a heading has passed under it, it names that section,
  // marks it in the list, and offers the way back to the top.
  it('names the section being read in Contents, and takes the reader back to the top', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => (queueMicrotask(cb), 1))
    const tops = { 'rc-s1': 400, 'rc-s2': 900 }
    const w = mountPage(TermsOfService)
    document.body.append(w.element)
    for (const el of document.querySelectorAll('h3[id]')) el.getBoundingClientRect = () => ({ top: tops[el.id] ?? 2000 })
    const bar = w.get('.rcf')
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(bar.find('.rcf-now').exists()).toBe(false)
    expect(bar.find('.rcf-top').exists()).toBe(false)
    tops['rc-s1'] = -400
    tops['rc-s2'] = 90
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(bar.get('.rcf-now').text()).toBe('Section 2 — Eligibility & Applications')
    expect(bar.get('.rcc-item[aria-current="location"]').text()).toBe('Section 2 — Eligibility & Applications')
    window.scrollTo = vi.fn()
    await bar.get('.rcf-top').trigger('click')
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: expect.any(String) })
    w.unmount()
    vi.unstubAllGlobals()
  })
})
