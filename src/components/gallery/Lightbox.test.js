// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DOMWrapper, mount } from '@vue/test-utils'
import { artItem } from '../../test-utils/galleryItem'
import Lightbox from './Lightbox.vue'

// The dialog is teleported to <body> (so it sits above the sticky navigation, whatever stacking context the page
// root is in), which a wrapper's own queries cannot see: everything here is looked up on the document.
const mounted = []
const open = (item = artItem('1', { title: 'Dreadnought at dusk', note: 'Ink and a <b>lot</b> of patience' })) => {
  const w = mount(Lightbox, { props: { item }, attachTo: document.body })
  mounted.push(w)
  return w
}
const dialog = () => document.body.querySelector('[role="dialog"]')
const part = (selector) => new DOMWrapper(dialog().querySelector(selector))
const press = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.restoreAllMocks()
})

describe('Lightbox', () => {
  it('is a modal dialog showing the picture full size with its title, author and note as plain text', () => {
    const item = artItem('2', { title: 'Dreadnought at dusk', note: 'Ink and a <b>lot</b> of patience' })
    open(item)
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(dialog().getAttribute('aria-label')).toBe('Dreadnought at dusk')
    expect(part('img').attributes('src')).toBe(item.url)
    expect(part('img').attributes('alt')).toBe('Dreadnought at dusk')
    expect(dialog().textContent).toContain('Dreadnought at dusk')
    expect(dialog().textContent).toContain('Invented Marine')
    expect(dialog().textContent).toContain('Ink and a <b>lot</b> of patience')
    expect(dialog().querySelector('b')).toBeNull()
  })

  it('names an untitled picture "Artwork" and shows no note line when there is none', () => {
    open(artItem('3', { title: '', note: '' }))
    expect(dialog().getAttribute('aria-label')).toBe('Artwork')
    expect(dialog().querySelector('.rq-note')).toBeNull()
  })

  it('is teleported to <body>, outside the page that opened it, and gone from it once closed', () => {
    const w = open()
    expect(dialog().parentElement).toBe(document.body)
    expect(w.find('[role="dialog"]').exists()).toBe(false)
    w.unmount()
    mounted.pop()
    expect(dialog()).toBeNull()
  })

  it('puts the keyboard on the Close button when it opens', () => {
    open()
    const close = part('button')
    expect(close.text()).toBe('Close')
    expect(document.activeElement).toBe(close.element)
  })

  it('closes from the Close button', async () => {
    const w = open()
    await part('button').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('closes on Escape, wherever the keyboard is', () => {
    const w = open()
    part('img').element.focus?.()
    press('Escape')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('closes when the dark area around the picture is tapped, but not when the picture is', async () => {
    const w = open()
    await part('img').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    await new DOMWrapper(dialog()).trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('keeps Tab on the Close button: nothing else in the dialog can take it, and the page behind must not', () => {
    open()
    const close = part('button').element
    document.body.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)
  })

  it('listens for keys only while it is open, and gives the keyboard back to where it was', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const w = open()
    expect(document.activeElement).not.toBe(opener)
    w.unmount()
    mounted.pop()
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(document.activeElement).toBe(opener)
    press('Escape')
    expect(w.emitted('close')).toBeUndefined()
    opener.remove()
  })
})

describe('Lightbox: a picture that will not load', () => {
  it('says so in place of the broken picture, and still shows who made it and can be closed', async () => {
    const w = open(artItem('4', { title: 'Dusk', note: 'Ink' }))
    await part('img').trigger('error')
    expect(dialog().querySelector('img')).toBeNull()
    expect(dialog().querySelector('.rq-failed').textContent).toBe("This image couldn't load.")
    expect(dialog().textContent).toContain('Dusk')
    expect(dialog().textContent).toContain('Invented Marine')
    expect(dialog().textContent).toContain('Ink')
    await part('button').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('shows the picture when it loads', () => {
    open(artItem('5'))
    expect(dialog().querySelector('img')).not.toBeNull()
    expect(dialog().querySelector('.rq-failed')).toBeNull()
  })
})
