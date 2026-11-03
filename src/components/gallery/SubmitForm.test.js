// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { artItem } from '../../test-utils/galleryItem'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../../lib/gallery/api')
import { submitArt } from '../../lib/gallery/api'
import { useGallery } from '../../stores/gallery'
import SubmitForm from './SubmitForm.vue'

const MB = 1024 * 1024
const picture = (type = 'image/png', size = 1000, name = 'piece.png') => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

const mounted = []
const mountForm = () => {
  const w = mount(SubmitForm, { attachTo: document.body })
  mounted.push(w)
  return w
}
const choose = async (w, file) => {
  const input = w.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: file ? [file] : [], configurable: true })
  await input.trigger('change')
}
const typeTitle = (w, text) => w.find('input[type="text"]').setValue(text)
const submitButton = (w) => w.find('button[type="submit"]')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  state.auth = reactive({ token: 'tok', member: { id: '100000000000000001', isMember: true } })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('SubmitForm: what it asks for', () => {
  it('takes one image of the four kinds, with a title and an optional note, and says the rules beside the picker', () => {
    const w = mountForm()
    const file = w.find('input[type="file"]')
    const title = w.find('input[type="text"]')
    const note = w.find('textarea')
    expect(file.attributes('accept')).toBe('image/jpeg,image/png,image/webp,image/gif')
    expect(title.attributes('maxlength')).toBe('120')
    expect(note.attributes('maxlength')).toBe('500')
    // each field sits inside its label, so a screen reader and a tap on the words both reach it
    expect(file.element.closest('label').textContent).toContain('Image (JPEG, PNG, WebP or GIF, 10 MB at most)')
    expect(title.element.closest('label').textContent).toContain('Title')
    expect(note.element.closest('label').textContent).toContain('Note (optional)')
  })

  it('cannot be sent with nothing chosen, or with a picture and no title', async () => {
    const w = mountForm()
    expect(submitButton(w).attributes('disabled')).toBeDefined()
    await choose(w, picture())
    expect(submitButton(w).attributes('disabled')).toBeDefined()
    await typeTitle(w, '   ')
    expect(submitButton(w).attributes('disabled')).toBeDefined()
    await typeTitle(w, 'Dusk')
    expect(submitButton(w).attributes('disabled')).toBeUndefined()
  })

  it('cannot be sent with a title and no picture', async () => {
    const w = mountForm()
    await typeTitle(w, 'Dusk')
    expect(submitButton(w).attributes('disabled')).toBeDefined()
  })
})

describe('SubmitForm: the checks that mirror the server', () => {
  it('refuses a file that is not one of the four kinds, in plain words', async () => {
    const w = mountForm()
    await typeTitle(w, 'Dusk')
    await choose(w, picture('application/pdf', 1000, 'piece.pdf'))
    expect(w.text()).toContain('That file is not a JPEG, PNG, WebP or GIF.')
    expect(submitButton(w).attributes('disabled')).toBeDefined()
  })

  it('refuses a file over 10 MB, in plain words, and takes one of exactly 10 MB', async () => {
    const w = mountForm()
    await typeTitle(w, 'Dusk')
    await choose(w, picture('image/png', 10 * MB + 1))
    expect(w.text()).toContain('The file is too large (10 MB at most).')
    expect(submitButton(w).attributes('disabled')).toBeDefined()

    await choose(w, picture('image/png', 10 * MB))
    expect(w.text()).not.toContain('too large')
    expect(submitButton(w).attributes('disabled')).toBeUndefined()
  })

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('takes %s', async (type) => {
    const w = mountForm()
    await typeTitle(w, 'Dusk')
    await choose(w, picture(type))
    expect(submitButton(w).attributes('disabled')).toBeUndefined()
  })

  it('clears the complaint when a good file replaces the bad one, or the choice is emptied', async () => {
    const w = mountForm()
    await choose(w, picture('text/plain', 10, 'a.txt'))
    expect(w.text()).toContain('That file is not')
    await choose(w, null)
    expect(w.text()).not.toContain('That file is not')
  })

  it('does not call the server for a file it already refused', async () => {
    const w = mountForm()
    await typeTitle(w, 'Dusk')
    await choose(w, picture('application/pdf'))
    await w.find('form').trigger('submit')
    expect(submitArt).not.toHaveBeenCalled()
  })
})

describe('SubmitForm: sending', () => {
  it('sends the file with the trimmed title and note, and the token', async () => {
    submitArt.mockResolvedValue({ item: artItem('900', { status: 'pending' }) })
    const w = mountForm()
    const file = picture()
    await choose(w, file)
    await typeTitle(w, '  Dusk  ')
    await w.find('textarea').setValue('  Ink on card  ')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(submitArt).toHaveBeenCalledTimes(1)
    expect(submitArt).toHaveBeenCalledWith({ file, title: 'Dusk', note: 'Ink on card' }, 'tok')
  })

  it('says it was submitted and empties the form', async () => {
    submitArt.mockResolvedValue({ item: artItem('901', { status: 'pending' }) })
    const w = mountForm()
    await choose(w, picture())
    await typeTitle(w, 'Dusk')
    await w.find('textarea').setValue('Ink')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Submitted. An approver will look at it.')
    expect(w.find('input[type="text"]').element.value).toBe('')
    expect(w.find('textarea').element.value).toBe('')
    expect(w.find('input[type="file"]').element.value).toBe('')
    expect(submitButton(w).attributes('disabled')).toBeDefined()
    // and the piece is first among Mine
    expect(useGallery().mine[0].id).toBe('901')
  })

  it('takes the "Submitted" line away when something new is chosen', async () => {
    submitArt.mockResolvedValue({ item: artItem('902') })
    const w = mountForm()
    await choose(w, picture())
    await typeTitle(w, 'Dusk')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Submitted.')
    await choose(w, picture())
    expect(w.text()).not.toContain('Submitted.')
  })

  it('is disabled while it sends, so a second tap cannot send it twice', async () => {
    const d = deferred()
    submitArt.mockReturnValue(d.promise)
    const w = mountForm()
    await choose(w, picture())
    await typeTitle(w, 'Dusk')
    await w.find('form').trigger('submit')
    expect(submitButton(w).attributes('disabled')).toBeDefined()
    expect(submitButton(w).text()).toBe('Sending…')
    await w.find('form').trigger('submit')
    expect(submitArt).toHaveBeenCalledTimes(1)
    d.resolve({ item: artItem('903') })
    await flushPromises()
  })

  it('shows the refusal in words and keeps what was typed, so it can be sent again', async () => {
    submitArt.mockRejectedValueOnce(Object.assign(new Error('That file is not a JPEG, PNG, WebP or GIF.'), { status: 400 }))
    const w = mountForm()
    await choose(w, picture())
    await typeTitle(w, 'Dusk')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('That file is not a JPEG, PNG, WebP or GIF.')
    expect(w.text()).not.toContain('Submitted.')
    expect(w.find('input[type="text"]').element.value).toBe('Dusk')
    expect(submitButton(w).attributes('disabled')).toBeUndefined()

    submitArt.mockResolvedValueOnce({ item: artItem('904') })
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.text()).toContain('Submitted.')
  })
})
