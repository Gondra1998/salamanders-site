// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import fixture from '../../data/roster.fixture.json'
import { buildRosterView } from '../../lib/rosterView'
import RosterBranch from './RosterBranch.vue'

// The bar as it sits under a company's own header: the page already shows the
// sigil and title there, so the bar is just "Ranks", the head, the count.
const view = buildRosterView(fixture.roster)
const branch = (key) => view.branches.find((b) => b.key === key)
const render = (key, props = {}, slots) => mount(RosterBranch, { props: { branch: branch(key), open: false, variant: 'embedded', ...props }, slots })

describe('RosterBranch variant="embedded"', () => {
  it('drops the sigil and the title but keeps the head, the count and every hook', () => {
    const w = render('company-3')
    expect(w.find('.rs-sigil').exists()).toBe(false)
    expect(w.find('h2').exists()).toBe(false)
    expect(w.find('.rs-title').text()).toBe('Ranks')
    expect(w.find('.rs-title').element.tagName).toBe('H3') // under the company's own h2
    expect(w.find('.rs-head h3').text()).toBe('Captain')
    expect(w.findAll('.rs-head li.rs-member').length).toBeGreaterThan(0)
    expect(w.find('.rs-tail').text()).toContain(String(branch('company-3').count))
    const root = w.find('article')
    expect(root.classes()).toEqual(expect.arrayContaining(['rs-panel', 'surface', 'rs-branch', 'rs-embedded']))
    expect(root.classes()).not.toContain('rs-unassigned')
    expect(root.attributes()).toMatchObject({ 'data-branch': 'company-3', 'data-kind': 'company', 'data-jump': 'company-3' })
  })

  it('says which company the button is for to a screen reader, and just "Ranks" to the eye', () => {
    const button = render('company-3').find('button')
    expect(button.text()).toBe('Ranks')
    expect(button.attributes('aria-label')).toBe('3rd Battle Company ranks')
  })

  it('opens and closes like a branch: aria-expanded, toggle, inert while shut, data-open', async () => {
    const w = render('company-3')
    const button = w.find('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe(w.find('.rs-body').attributes('id'))
    expect(w.find('.rs-body').attributes('inert')).toBeDefined()
    expect(w.find('article').attributes('data-open')).toBeUndefined()
    await button.trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
    await w.setProps({ open: true })
    expect(w.find('button').attributes('aria-expanded')).toBe('true')
    expect(w.find('.rs-body').attributes('inert')).toBeUndefined()
    expect(w.find('article').attributes('data-open')).toBeDefined()
  })

  it('shows a plain Ranks label, no button, chevron or body, when there is nothing to open', () => {
    const w = render('venerable-dreadnoughts')
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('.rs-chev').exists()).toBe(false)
    expect(w.find('.rs-body').exists()).toBe(false)
    expect(w.find('.rs-title').text()).toBe('Ranks')
    expect(w.find('.rs-title').element.tagName).toBe('H3')
    expect(w.find('article').classes()).toContain('rs-static')
  })

  it('shows the ladder in the body by default, with its spine and tier hooks', () => {
    const w = render('company-3')
    expect(w.find('.rs-body .rs-ladder').exists()).toBe(true)
    expect(w.find('.rs-ladder').classes()).not.toContain('rs-no-spine')
    expect(w.find('.rs-body .rs-row').attributes('data-tier')).toMatch(/^\d+$/)
  })

  it('lets the parent replace the body through the body slot', () => {
    const w = render('company-3', {}, { body: '<p class="custom">counts only</p>' })
    expect(w.find('.rs-body .custom').text()).toBe('counts only')
    expect(w.find('.rs-ladder').exists()).toBe(false)
  })
})

describe('RosterBranch: the other variants are unchanged', () => {
  it('the default variant still has its sigil, h2 title and ladder', () => {
    const w = mount(RosterBranch, { props: { branch: branch('company-3'), open: false } })
    expect(w.find('.rs-sigil').text()).toBe('III')
    expect(w.find('h2.rs-title').text()).toBe('3rd Battle Company')
    expect(w.find('article').classes()).toContain('rs-branch')
    expect(w.find('article').classes()).not.toContain('rs-embedded')
    expect(w.find('.rs-ladder').exists()).toBe(true)
  })

  it('the default variant names a branch with nothing to open as plain text in its h2', () => {
    const w = mount(RosterBranch, { props: { branch: branch('venerable-dreadnoughts'), open: false } })
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('h2.rs-title').text()).toBe(branch('venerable-dreadnoughts').label)
  })

  it('unassigned is still not a branch, and has no data-branch', () => {
    const w = mount(RosterBranch, { props: { branch: view.unassigned, open: false, variant: 'unassigned' } })
    expect(w.find('article').classes()).toContain('rs-unassigned')
    expect(w.find('article').classes()).not.toContain('rs-branch')
    expect(w.find('article').attributes('data-branch')).toBeUndefined()
    expect(w.find('.rs-ladder').classes()).toContain('rs-no-spine')
  })
})
