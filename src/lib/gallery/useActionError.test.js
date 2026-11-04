// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGallery } from '../../stores/gallery'
import { useActionError, SAVED_BUT_STALE } from './useActionError'

let gallery
beforeEach(() => {
  setActivePinia(createPinia())
  gallery = useGallery()
})

// What a store action does when it fails: keeps the message in `error`, then throws.
const failing = (message) => async () => {
  gallery.error = message
  throw new Error(message)
}

describe('useActionError', () => {
  it('runs the action, → true and leaves the line empty', async () => {
    const { error, run } = useActionError()
    expect(await run(async () => {})).toBe(true)
    expect(error.value).toBe('')
  })

  it('→ false and shows the store\'s message when the action fails', async () => {
    const { error, run } = useActionError()
    expect(await run(failing('That item has already been decided.'))).toBe(false)
    expect(error.value).toBe('That item has already been decided.')
  })

  it('falls back to a plain sentence when the store kept no message', async () => {
    const { error, run } = useActionError()
    await run(async () => {
      throw new TypeError('bad')
    })
    expect(error.value).toBe('Something went wrong.')
  })

  it('clears the line when the next action starts', async () => {
    const { error, run } = useActionError()
    await run(failing('Try again.'))
    let during
    await run(async () => {
      during = error.value
    })
    expect(during).toBe('')
    expect(error.value).toBe('')
  })

  it('says the change was saved when the item has left the list and only the refresh failed', async () => {
    const { error, run } = useActionError()
    await run(failing('The Reliquarium could not be reached.'), { stillListed: () => false })
    expect(error.value).toBe(SAVED_BUT_STALE)
    expect(SAVED_BUT_STALE).toBe("The change was saved, but the list couldn't be refreshed.")
  })

  it('shows the message as it was when the item is still listed', async () => {
    const { error, run } = useActionError()
    await run(failing('Nope.'), { stillListed: () => true })
    expect(error.value).toBe('Nope.')
  })
})
