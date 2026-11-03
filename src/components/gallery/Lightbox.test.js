// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { artItem } from '../../test-utils/galleryItem'
import Lightbox from './Lightbox.vue'

const mounted = []
const open = (item = artItem('1', { title: 'Dreadnought at dusk', note: 'Ink and a <b>lot</b> of patience' })) => {
  const w = mount(Lightbox, { props: { item }, attachTo: document.body })
  mounted.push(w)
  return w
}
const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('Lightbox', () => {
  it('is a modal dialog showing the picture full size with its title, author and note as plain text', () => {
    const item = artItem('2', { title: 'Dreadnought at dusk', note: 'Ink and a <b>lot</b> of patience' })
    const w = open(item)
    const dialog = w.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-label')).toBe('Dreadnought at dusk')
    expect(dialog.find('img').attributes('src')).toBe(item.url)
    expect(dialog.find('img').attributes('alt')).toBe('Dreadnought at dusk')
    expect(dialog.text()).toContain('Dreadnought at dusk')
    expect(dialog.text()).toContain('Invented Marine')
    expect(dialog.text()).toContain('Ink and a <b>lot</b> of patience')
    expect(dialog.find('b').exists()).toBe(false)
  })

  it('names an untitled picture "Artwork" and shows no note line when there is none', () => {
    const w = open(artItem('3', { title: '', note: '' }))
    expect(w.find('[role="dialog"]').attributes('aria-label')).toBe('Artwork')
    expect(w.find('.rq-note').exists()).toBe(false)
  })

  it('puts the keyboard on the Close button when it opens', () => {
    const w = open()
    const close = w.find('button')
    expect(close.text()).toBe('Close')
    expect(document.activeElement).toBe(close.element)
  })

  it('closes from the Close button', async () => {
    const w = open()
    await w.find('button').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('closes on Escape, wherever the keyboard is', () => {
    const w = open()
    w.find('img').element.focus?.()
    press('Escape')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('closes when the dark area around the picture is tapped, but not when the picture is', async () => {
    const w = open()
    await w.find('img').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    await w.find('[role="dialog"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('keeps Tab on the Close button: nothing else in the dialog can take it, and the page behind must not', () => {
    const w = open()
    const close = w.find('button').element
    document.body.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)
  })

  it('listens for keys only while it is open, and gives the keyboard back to where it was', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const w = open()
    expect(document.activeElement).not.toBe(opener)
    w.unmount()
    mounted.pop()
    expect(document.activeElement).toBe(opener)
    press('Escape')
    expect(w.emitted('close')).toBeUndefined()
    opener.remove()
  })
})
