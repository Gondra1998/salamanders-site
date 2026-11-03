// A gallery item as the API sends it, for the Reliquarium tests. Every value is invented.
export const galleryItem = (id = '501', extra = {}) => ({
  id: String(id),
  kind: 'clip',
  source: 'discord',
  author: { id: '100000000000000001', name: 'Invented Marine' },
  title: `Item ${id}`,
  note: '',
  media: 'video',
  url: `https://files.example.test/${id}.mp4?sig=abc`,
  contentType: 'video/mp4',
  bytes: 1000,
  status: 'approved',
  reviewNote: null,
  postedAt: '2026-10-31T12:00:00.000Z',
  ...extra,
})

/** A piece of art, the way the API sends it. */
export const artItem = (id = '601', extra = {}) =>
  galleryItem(id, {
    kind: 'art',
    source: 'site',
    media: 'image',
    url: `https://files.example.test/${id}.png?sig=abc`,
    contentType: 'image/png',
    ...extra,
  })

/** A clip that is a link to a player site: the link is the item's `url`. */
export const embedItem = (id = '701', url = 'https://www.youtube.com/watch?v=abcDEF_-123', extra = {}) =>
  galleryItem(id, { media: 'embed', contentType: null, bytes: null, url, ...extra })
