// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { forgetReloads } from '../../lib/gallery/reloadOnce'
import { galleryItem, artItem, embedItem } from '../../test-utils/galleryItem'
import GalleryCard from './GalleryCard.vue'

const card = (item, props = {}) => mount(GalleryCard, { props: { item, ...props } })
const day = (item) => new Date(item.postedAt).toLocaleDateString()

beforeEach(forgetReloads)

describe('GalleryCard: a stored video', () => {
  it('is a video that loads only its first frame, plays inline and has controls', () => {
    const item = galleryItem('1')
    const video = card(item).find('video')
    expect(video.attributes('src')).toBe(item.url)
    expect(video.attributes('controls')).toBeDefined()
    expect(video.attributes('preload')).toBe('metadata')
    expect(video.attributes('playsinline')).toBeDefined()
  })

  it('says who posted it and when, as plain text under the video', () => {
    const item = galleryItem('2', { title: 'A <b>bold</b> clip', author: { id: '100000000000000002', name: '<i>Brother</i>' } })
    const w = card(item)
    expect(w.text()).toContain('A <b>bold</b> clip')
    expect(w.text()).toContain('<i>Brother</i>')
    expect(w.text()).toContain(day(item))
    expect(w.find('b').exists()).toBe(false)
    expect(w.find('i').exists()).toBe(false)
  })

  it('has no title line for a clip without a title', () => {
    expect(card(galleryItem('3', { title: '' })).find('.rq-title').exists()).toBe(false)
  })
})

describe('GalleryCard: an image', () => {
  it('lazy-loads the picture, with the title as its text for a screen reader', () => {
    const item = artItem('10', { title: 'Dreadnought at dusk' })
    const img = card(item).find('img')
    expect(img.attributes('src')).toBe(item.url)
    expect(img.attributes('loading')).toBe('lazy')
    expect(img.attributes('alt')).toBe('Dreadnought at dusk')
  })

  it('calls an untitled picture "Artwork"', () => {
    expect(card(artItem('11', { title: '' })).find('img').attributes('alt')).toBe('Artwork')
  })

  it('asks to open the picture when it is tapped', async () => {
    const item = artItem('12')
    const w = card(item)
    await w.find('img').trigger('click')
    expect(w.emitted('open')).toEqual([[item]])
  })

  it('does not ask to open a video', async () => {
    const w = card(galleryItem('13'))
    await w.find('video').trigger('click')
    expect(w.emitted('open')).toBeUndefined()
  })
})

describe('GalleryCard: a link to a player site', () => {
  it('shows a static card with the provider and a Play button, and no player yet', () => {
    const w = card(embedItem('20'))
    expect(w.text()).toContain('YouTube')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.find('video').exists()).toBe(false)
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Play'])
  })

  it('mounts the player when Play is tapped, with the attributes that contain it', async () => {
    const w = card(embedItem('21'))
    await w.find('button').trigger('click')
    const frame = w.find('iframe')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('src')).toBe('https://www.youtube.com/embed/abcDEF_-123?rel=0')
    expect(frame.attributes('allow')).toBe('autoplay; fullscreen')
    expect(frame.attributes('allowfullscreen')).toBeDefined()
    expect(frame.attributes('loading')).toBe('lazy')
    expect(frame.attributes('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    expect(frame.attributes('sandbox')).toBe('allow-scripts allow-same-origin allow-popups allow-presentation')
    expect(frame.attributes('title')).toBeTruthy()
    expect(w.findAll('button')).toHaveLength(0)
  })

  it('tells Twitch which page is showing it', async () => {
    const w = card(embedItem('22', 'https://clips.twitch.tv/TidySlug-42_x'))
    expect(w.text()).toContain('Twitch')
    await w.find('button').trigger('click')
    expect(w.find('iframe').attributes('src')).toBe(
      `https://clips.twitch.tv/embed?clip=TidySlug-42_x&parent=${window.location.hostname}`,
    )
  })

  it('names Medal too', () => {
    expect(card(embedItem('23', 'https://medal.tv/clips/cAbC123xyz')).text()).toContain('Medal')
  })

  it('offers an "Open link" in place of a player when the link is not one it can embed', () => {
    const url = 'https://example.test/some/clip'
    const w = card(embedItem('24', url))
    const link = w.find('a')
    expect(link.text()).toBe('Open link')
    expect(link.attributes('href')).toBe(url)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false)
  })

  it('links to nothing that is not a web address', () => {
    const w = card(embedItem('25', 'javascript:alert(1)'))
    expect(w.find('a').exists()).toBe(false)
    expect(w.find('iframe').exists()).toBe(false)
  })
})

describe('GalleryCard: Hide', () => {
  it('is for approvers only', () => {
    expect(card(galleryItem('30')).find('.rq-hide').exists()).toBe(false)
    expect(card(galleryItem('30'), { canHide: true }).find('.rq-hide').exists()).toBe(true)
  })

  // Hiding takes the item away from everyone and cannot be undone from the page, so it asks first, in the card.
  const answer = (w, text) => w.findAll('button').find((b) => b.text() === text)

  it('asks "Hide for everyone?" first, and hides nothing yet', async () => {
    const w = card(galleryItem('31'), { canHide: true })
    const hide = w.find('.rq-hide')
    expect(hide.text()).toBe('Hide')
    await hide.trigger('click')
    expect(w.text()).toContain('Hide for everyone?')
    expect(answer(w, 'Yes')).toBeTruthy()
    expect(answer(w, 'No')).toBeTruthy()
    expect(w.find('.rq-hide').exists()).toBe(false)
    expect(w.emitted('hide')).toBeUndefined()
  })

  it('goes back to the Hide button on No, with nothing emitted', async () => {
    const w = card(galleryItem('32'), { canHide: true })
    await w.find('.rq-hide').trigger('click')
    await answer(w, 'No').trigger('click')
    expect(w.text()).not.toContain('Hide for everyone?')
    expect(w.find('.rq-hide').exists()).toBe(true)
    expect(w.emitted('hide')).toBeUndefined()
  })

  it('asks to hide the item by its id, once, on Yes, and closes the question', async () => {
    const w = card(galleryItem('33'), { canHide: true })
    await w.find('.rq-hide').trigger('click')
    await answer(w, 'Yes').trigger('click')
    expect(w.emitted('hide')).toEqual([['33']])
    expect(w.text()).not.toContain('Hide for everyone?')
    expect(w.find('.rq-hide').exists()).toBe(true)
  })

  it('asks again each time, not once for good', async () => {
    const w = card(galleryItem('34'), { canHide: true })
    await w.find('.rq-hide').trigger('click')
    await answer(w, 'No').trigger('click')
    await w.find('.rq-hide').trigger('click')
    await answer(w, 'Yes').trigger('click')
    expect(w.emitted('hide')).toHaveLength(1)
  })
})

describe('GalleryCard: a link that stopped working', () => {
  // A signed link lasts 15 minutes. The first failure asks the page for the list again, which carries fresh links;
  // a second failure is not the link's age, so the card says so instead of asking again.
  it('asks for fresh links once when a video fails, then says it could not load', async () => {
    const w = card(galleryItem('40'))
    await w.find('video').trigger('error')
    expect(w.emitted('reload')).toEqual([['clips']])
    expect(w.text()).not.toContain("couldn't load")
    expect(w.find('video').exists()).toBe(true)

    await w.find('video').trigger('error')
    expect(w.text()).toContain("This clip couldn't load.")
    expect(w.find('video').exists()).toBe(false)
    expect(w.emitted('reload')).toHaveLength(1)
  })

  it('asks for the art list when a picture fails', async () => {
    const w = card(artItem('41'))
    await w.find('img').trigger('error')
    expect(w.emitted('reload')).toEqual([['art']])
    await w.find('img').trigger('error')
    expect(w.text()).toContain("This image couldn't load.")
    expect(w.emitted('reload')).toHaveLength(1)
  })

  it('does not ask again from a new card for the same item: the list is rebuilt when it is fetched again', async () => {
    const first = card(galleryItem('42'))
    await first.find('video').trigger('error')
    first.unmount()

    const second = card(galleryItem('42', { url: 'https://files.example.test/42.mp4?sig=fresh' }))
    await second.find('video').trigger('error')
    expect(second.emitted('reload')).toBeUndefined()
    expect(second.text()).toContain("This clip couldn't load.")
  })

  it('asks again for a link that expires later, once the fresh one has loaded', async () => {
    const first = card(galleryItem('43'))
    await first.find('video').trigger('error')
    first.unmount()

    const second = card(galleryItem('43', { url: 'https://files.example.test/43.mp4?sig=fresh' }))
    await second.find('video').trigger('loadedmetadata')
    await second.find('video').trigger('error')
    expect(second.emitted('reload')).toEqual([['clips']])
  })

  it('asks again after a picture has loaded', async () => {
    const first = card(artItem('44'))
    await first.find('img').trigger('error')
    await first.find('img').trigger('load')
    await first.find('img').trigger('error')
    expect(first.emitted('reload')).toHaveLength(2)
  })

  it('keeps one item\'s failure from counting against another', async () => {
    await card(galleryItem('45')).find('video').trigger('error')
    const other = card(galleryItem('46'))
    await other.find('video').trigger('error')
    expect(other.emitted('reload')).toHaveLength(1)
  })
})
