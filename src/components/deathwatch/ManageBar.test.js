// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ManageBar from './ManageBar.vue'

// The Watch Commander's bar unless a test says otherwise: an admin's has no Enter mission.
async function mountBar(tab, query = '', canEdit = true) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  router.push(`/deathwatch/administratum/${tab}${query}`)
  await router.isReady()
  const w = mount(ManageBar, { props: { tab, canEdit }, global: { plugins: [router] }, attachTo: document.body })
  return w
}
const hrefs = (w, sel) => w.findAll(sel).map((a) => a.attributes('href'))

describe('ManageBar', () => {
  it('leads back to the fortress, lists the working views, sets entering a mission apart and the settings in their own menu', async () => {
    const w = await mountBar('checks')
    expect(w.get('.mb-home').attributes('href')).toBe('/deathwatch')
    expect(w.findAll('.mb-link').map((a) => a.text())).toEqual(['Manage', 'Checks', 'Records'])
    expect(w.get('.mb-enter').text()).toBe('Enter mission')
    expect(w.findAll('.mb-mi').map((a) => a.text())).toEqual(['Page Texts', 'Access'])
    w.unmount()
  })

  it('offers Enter mission only to those who can change things', async () => {
    const w = await mountBar('manage', '', false)
    expect(w.find('.mb-enter').exists()).toBe(false)
    expect(w.findAll('.mb-link').map((a) => a.text())).toEqual(['Manage', 'Checks', 'Records'])
    expect(w.findAll('.mb-mi').map((a) => a.text())).toEqual(['Page Texts', 'Access'])
    w.unmount()
  })

  it('marks the open view, and the settings when one of theirs is open', async () => {
    const checks = await mountBar('checks')
    expect(checks.findAll('[aria-current="page"]').map((a) => a.text())).toEqual(['Checks'])
    expect(checks.get('.mb-settings summary').classes()).not.toContain('on')
    checks.unmount()
    const access = await mountBar('access')
    expect(access.findAll('[aria-current="page"]').map((a) => a.text())).toEqual(['Access'])
    expect(access.get('.mb-settings summary').classes()).toContain('on')
    access.unmount()
  })

  it('keeps a dev scene on every link', async () => {
    const w = await mountBar('administratum', '?scene=commander')
    for (const href of hrefs(w, '.mb-link, .mb-enter, .mb-mi')) expect(href).toMatch(/\?scene=commander$/)
    w.unmount()
  })

  it('closes the settings menu once one of its pages is open', async () => {
    const w = await mountBar('administratum')
    w.get('.mb-settings').element.setAttribute('open', '')
    await w.setProps({ tab: 'access' })
    await flushPromises()
    expect(w.get('.mb-settings').attributes('open')).toBeUndefined()
    w.unmount()
  })
})
