// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DeathwatchLock from './DeathwatchLock.vue'

describe('DeathwatchLock', () => {
  it('says the part is restricted, by default', () => {
    expect(mount(DeathwatchLock).find('.dw-lock-msg').text()).toBe('Access restricted.')
    expect(mount(DeathwatchLock, { props: { message: 'Restricted to the Watch Commander.' } }).find('.dw-lock-msg').text()).toBe(
      'Restricted to the Watch Commander.',
    )
  })

  it('gives the lock its reason as a description, so it is heard without opening anything', () => {
    const w = mount(DeathwatchLock)
    const btn = w.find('button.dw-lock-btn')
    expect(btn.text()).toBe('Locked')
    expect(btn.attributes('type')).toBe('button')
    expect(w.find(`#${btn.attributes('aria-describedby')}`).classes()).toContain('dw-lock-msg')
  })

  it('shows the reason on a tap, hides it on the next, and on the pointer leaving', async () => {
    const w = mount(DeathwatchLock)
    const btn = w.find('button')
    expect([btn.attributes('aria-expanded'), w.classes('is-open')]).toEqual(['false', false])
    await btn.trigger('click')
    expect([btn.attributes('aria-expanded'), w.classes('is-open')]).toEqual(['true', true])
    await btn.trigger('click')
    expect(w.classes('is-open')).toBe(false)
    await btn.trigger('click')
    await w.trigger('mouseleave')
    expect([btn.attributes('aria-expanded'), w.classes('is-open')]).toEqual(['false', false])
  })

  it('blurs an empty page, not a real one, and hides it from assistive tech', () => {
    const ghost = mount(DeathwatchLock).find('.dw-lock-ghost')
    expect(ghost.attributes('aria-hidden')).toBe('true')
    expect(ghost.text()).toBe('')
  })

  it('gives two locks on a page their own descriptions', () => {
    const w = mount({ components: { DeathwatchLock }, template: '<div><DeathwatchLock /><DeathwatchLock /></div>' })
    const [a, b] = w.findAll('button').map((x) => x.attributes('aria-describedby'))
    expect(a).not.toBe(b)
  })
})

describe('DeathwatchLock, as an overlay', () => {
  it('draws no empty page of its own, and still gives its reason', () => {
    const w = mount(DeathwatchLock, { props: { overlay: true } })
    expect(w.classes()).toContain('is-overlay')
    expect(w.find('.dw-lock-ghost').exists()).toBe(false)
    expect(w.find('.dw-lock-msg').text()).toBe('Access restricted.')
    expect(mount(DeathwatchLock).classes()).not.toContain('is-overlay')
  })
})
