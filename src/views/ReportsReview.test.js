// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises } from '@vue/test-utils'
import * as api from '../lib/reportsApi'
import ReportsReview from './ReportsReview.vue'

const auth = vi.hoisted(() => ({ signedIn: true, token: 'tok', member: { id: '1', username: 'tester' }, signIn: vi.fn() }))
vi.mock('../stores/auth', () => ({ useAuth: () => auth }))
vi.mock('../lib/reportsApi', () => ({
  // Vue's template proxy probes a namespace import for __v_isRef; a vitest mock throws on any key it does not have.
  __v_isRef: false,
  getAccess: vi.fn(),
  listAll: vi.fn(),
  getReport: vi.fn(),
  act: vi.fn(),
  STATUS_LABELS: { received: 'Received', under_review: 'Under review', resolved: 'Resolved', escalated: 'Escalated to High Command' },
}))

const show = async () => {
  const wrapper = mount(ReportsReview)
  await flushPromises()
  return wrapper
}

const aReport = (id, status = 'received') => ({
  id,
  status,
  reportedMember: 'Subject A',
  reporter: { id: '2', username: 'reporter-1' },
  handler: null,
  createdAt: '2026-01-02T00:00:00Z',
})

beforeEach(() => {
  Object.assign(auth, { signedIn: true, token: 'tok' })
  auth.signIn.mockReset()
  vi.mocked(api.getAccess).mockReset().mockResolvedValue({ reporter: true, reviewer: true, admin: false })
  vi.mocked(api.listAll).mockReset().mockResolvedValue([aReport(1), aReport(2, 'resolved')])
  vi.mocked(api.getReport).mockReset()
  vi.mocked(api.act).mockReset()
})

describe('ReportsReview header', () => {
  it('is the shared page header, eyebrow and title only', async () => {
    const w = await show()
    const head = w.find('header.page-head')
    expect(head.find('.eyebrow').text()).toBe('Reclusiam')
    expect(head.find('h1.page-title').text()).toBe('Report Review')
    expect(head.find('.page-lede').exists()).toBe(false)
    expect(w.find('.rv-title').exists()).toBe(false)
  })
})

describe('ReportsReview gates and states', () => {
  it('walls a signed-out visitor behind a gate panel', async () => {
    Object.assign(auth, { signedIn: false, token: '' })
    const w = await show()
    const gate = w.find('.state-panel.is-gate')
    expect(gate.text()).toContain('Sign in with Discord to review reports.')
    const button = gate.find('button.btn-ember')
    expect(button.text()).toBe('Sign in with Discord')
    expect(button.classes()).not.toContain('btn-sm')
    await button.trigger('click')
    expect(auth.signIn).toHaveBeenCalledTimes(1)
    expect(w.find('.panel-forge').exists()).toBe(false)
  })

  it('shows a loading panel while the roles are checked', async () => {
    vi.mocked(api.getAccess).mockReturnValue(new Promise(() => {}))
    const w = await show()
    const loading = w.find('.state-panel.is-loading')
    expect(loading.attributes('role')).toBe('status')
    expect(loading.text()).toBe('Checking your roles…')
  })

  it('restricts everyone who is neither a Reclusiarch nor an administrator', async () => {
    vi.mocked(api.getAccess).mockResolvedValue({ reporter: true, reviewer: false, admin: false })
    const w = await show()
    expect(w.find('.state-panel.is-gate').text()).toBe('Restricted to Reclusiarchs.')
    expect(w.find('.rv-filters').exists()).toBe(false)
  })

  it('shows a failure as an error panel the page announces', async () => {
    vi.mocked(api.getAccess).mockRejectedValue(new Error('The reports server said no.'))
    const w = await show()
    const error = w.find('.state-panel.is-error')
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('The reports server said no.')
    expect(w.find('.state-panel.is-loading').exists()).toBe(false)
  })
})

describe('ReportsReview queue', () => {
  it('sets the filters on the shared tab and lights the chosen one', async () => {
    const w = await show()
    const chips = w.findAll('.rv-chip')
    expect(chips.map((c) => c.text())).toEqual(['open', 'mine', 'all'])
    for (const c of chips) {
      expect(c.classes()).toContain('tab-forge')
      expect(c.classes()).toContain('rm-fade')
    }
    expect(chips.map((c) => c.classes('on'))).toEqual([true, false, false])
    await chips[2].trigger('click')
    expect(w.findAll('.rv-chip').map((c) => c.classes('on'))).toEqual([false, false, true])
    expect(w.findAll('.rv-item')).toHaveLength(2)
  })

  it('opens a report into the detail panel, with its fields in the shared style', async () => {
    vi.mocked(api.getReport).mockResolvedValue({
      ...aReport(1, 'under_review'),
      incidentDate: '2026-01-01',
      medium: 'voice',
      witnesses: '',
      description: 'Something happened.',
      events: [],
    })
    const w = await show()
    await w.find('.rv-item').trigger('click')
    await flushPromises()
    const detail = w.find('.rv-detail')
    expect(detail.exists()).toBe(true)
    const fields = detail.findAll('textarea, select')
    expect(fields.length).toBeGreaterThan(0)
    for (const f of fields) expect(f.classes(), f.element.outerHTML).toContain('field-forge')
  })
})

describe('ReportsReview stylesheet', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ReportsReview.vue'), 'utf8')
  const style = source.slice(source.indexOf('<style'))

  it('names tokens, not literals', () => {
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(style).not.toMatch(/rgba?\(/)
    expect(style).not.toMatch(/font-size:\s*[\d.]+rem/)
    expect(style).not.toMatch(/border-radius:\s*(\d+px|999px)/)
  })

  it('leaves the chip look to the shared tab', () => {
    expect(style).not.toMatch(/\.rv-chip\s*[{:.]/)
  })
})
