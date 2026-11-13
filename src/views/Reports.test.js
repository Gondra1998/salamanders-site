// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import * as api from '../lib/reportsApi'
import Reports from './Reports.vue'

const auth = vi.hoisted(() => ({ signedIn: true, token: 'tok', member: { username: 'tester' }, signIn: vi.fn() }))
vi.mock('../stores/auth', () => ({ useAuth: () => auth }))
vi.mock('../lib/reportsApi', () => ({
  // Vue's template proxy probes a namespace import for __v_isRef; a vitest mock throws on any key it does not have.
  __v_isRef: false,
  getAccess: vi.fn(),
  listMine: vi.fn(),
  fileReport: vi.fn(),
  STATUS_LABELS: { received: 'Received', under_review: 'Under review', resolved: 'Resolved', escalated: 'Escalated to High Command' },
}))

const INTRO =
  "Report conduct that breaks the Chapter's code. A Reclusiarch reviews every report and either deals with it or escalates it to High Command. You'll see its status below. Your name goes with the report."

const show = async () => {
  const wrapper = mount(Reports, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  Object.assign(auth, { signedIn: true, token: 'tok' })
  auth.signIn.mockReset()
  vi.mocked(api.getAccess).mockReset().mockResolvedValue({ reporter: true, reviewer: false, admin: false })
  vi.mocked(api.listMine).mockReset().mockResolvedValue([])
  vi.mocked(api.fileReport).mockReset()
})

describe('Reports header', () => {
  it('is the shared page header with the intro as its lede', async () => {
    const w = await show()
    const head = w.find('header.page-head')
    expect(head.exists()).toBe(true)
    expect(head.find('.eyebrow').text()).toBe('Reclusiam')
    expect(head.find('h1.page-title').text()).toBe('File a Report')
    expect(head.find('.page-lede').text()).toBe(INTRO)
    expect(w.find('.r-title').exists()).toBe(false)
    expect(w.find('.r-intro').exists()).toBe(false)
  })
})

describe('Reports gates and states', () => {
  it('walls a signed-out visitor behind a gate panel with the sign-in button', async () => {
    Object.assign(auth, { signedIn: false, token: '' })
    const w = await show()
    const gate = w.find('.state-panel.is-gate.r-gate')
    expect(gate.exists()).toBe(true)
    expect(gate.classes()).toContain('surface')
    expect(gate.text()).toContain('Sign in with Discord to file a report.')
    const button = gate.find('button.btn-ember')
    expect(button.text()).toBe('Sign in with Discord')
    // the primary action keeps full size; it is not the small button
    expect(button.classes()).not.toContain('btn-sm')
    await button.trigger('click')
    expect(auth.signIn).toHaveBeenCalledTimes(1)
    expect(w.find('.panel-forge.r-gate').exists()).toBe(false)
    expect(w.find('form').exists()).toBe(false)
  })

  it('shows a loading panel while the roles are checked', async () => {
    vi.mocked(api.getAccess).mockReturnValue(new Promise(() => {}))
    const w = await show()
    const loading = w.find('.state-panel.is-loading')
    expect(loading.exists()).toBe(true)
    expect(loading.attributes('role')).toBe('status')
    expect(loading.text()).toBe('Checking your roles…')
  })

  it('shows a failed role check as an error panel the page announces', async () => {
    vi.mocked(api.getAccess).mockRejectedValue(new Error('The reports server said no.'))
    const w = await show()
    const error = w.find('.state-panel.is-error.r-error')
    expect(error.exists()).toBe(true)
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('The reports server said no.')
  })

  it('tells a signed-in non-member that reports are for the Legion', async () => {
    vi.mocked(api.getAccess).mockResolvedValue({ reporter: false, reviewer: false, admin: false })
    const w = await show()
    const gate = w.find('.state-panel.is-gate.r-gate')
    expect(gate.text()).toBe('Reports are open to XVIIIth Legion members.')
    expect(gate.find('button').exists()).toBe(false)
    expect(w.find('form').exists()).toBe(false)
  })
})

describe('Reports form', () => {
  it('keeps the filing form for a Legion member', async () => {
    const w = await show()
    expect(w.find('form.r-form').exists()).toBe(true)
    expect(w.find('form button[type="submit"]').text()).toBe('File report')
    expect(w.find('.r-gate').exists()).toBe(false)
  })

  it('sets the form fields in the shared field style', async () => {
    const w = await show()
    const fields = w.findAll('.r-form input:not([type="checkbox"]), .r-form select, .r-form textarea')
    expect(fields.length).toBeGreaterThanOrEqual(5)
    for (const f of fields) expect(f.classes(), f.element.outerHTML).toContain('field-forge')
  })

  it('swaps the submit button for a bordered surface card when a Reclusiarch is involved', async () => {
    const w = await show()
    expect(w.find('.r-bypass').exists()).toBe(false)
    await w.find('.r-check input').setValue(true)
    const bypass = w.find('.r-bypass')
    expect(bypass.classes()).toContain('surface')
    expect(bypass.text()).toContain("Reports involving a Reclusiarch go straight to High Command's official form.")
    expect(bypass.find('a.btn-ember').text()).toBe('Open the official form')
    expect(w.find('form button[type="submit"]').exists()).toBe(false)
  })

  it('lists the reports already filed', async () => {
    vi.mocked(api.listMine).mockResolvedValue([{ id: 7, reportedMember: 'Subject A', createdAt: '2026-01-02T00:00:00Z', status: 'resolved' }])
    const w = await show()
    expect(w.find('.r-row').text()).toContain('#7 · Subject A')
    expect(w.find('.r-status').text()).toBe('Resolved')
  })
})

describe('Reports stylesheet', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Reports.vue'), 'utf8')
  const style = source.slice(source.indexOf('<style'))

  it('names tokens, not literals', () => {
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(style).not.toMatch(/rgba?\(/)
    expect(style).not.toMatch(/font-size:\s*[\d.]+rem/)
    expect(style).not.toMatch(/border-radius:\s*\d+px/)
    expect(style).not.toMatch(/var\(--color-[a-z-]+,/)
  })

  it('has no side-stripe border', () => {
    expect(style).not.toMatch(/border-(left|right)\s*:/)
  })
})
