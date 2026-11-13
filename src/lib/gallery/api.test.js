import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { API_BASE, BuildsApiError } from '../buildsApi'
import {
  getMe,
  listClips,
  listArt,
  listMine,
  listReview,
  listEvents,
  listTakedowns,
  submitArt,
  removeItem,
  approve,
  reject,
  hide,
  eraseFile,
} from './api'

const TOKEN = 'tok-invented-1'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

/** The one request the last call made: [url, init]. */
const sent = () => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  return fetchMock.mock.calls[0]
}
const headersOf = (init) => init.headers ?? {}

describe('the reads', () => {
  it.each([
    ['getMe', () => getMe(TOKEN), '/gallery/me'],
    ['listClips', () => listClips(TOKEN), '/gallery/clips'],
    ['listArt', () => listArt(TOKEN), '/gallery/art'],
    ['listMine', () => listMine(TOKEN), '/gallery/mine'],
    ['listReview', () => listReview(TOKEN), '/gallery/review'],
    ['listEvents', () => listEvents(TOKEN), '/gallery/events'],
    ['listTakedowns', () => listTakedowns(TOKEN), '/gallery/takedowns'],
  ])('%s: GETs its route with the token in a header, never in the address, and never from the HTTP cache', async (_name, call, path) => {
    fetchMock.mockResolvedValue(json({ ok: 1 }))
    expect(await call()).toEqual({ ok: 1 })
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}${path}`)
    expect(url).not.toContain(TOKEN)
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store' })
    expect(headersOf(init)).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it.each([
    ['listClips', listClips, '/gallery/clips'],
    ['listArt', listArt, '/gallery/art'],
    ['listEvents', listEvents, '/gallery/events'],
  ])('%s: asks for the page before a cursor, URL-encoded, only when there is one', async (_name, call, path) => {
    fetchMock.mockImplementation(async () => json({}))
    await call(TOKEN, '1234')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}${path}?before=1234`)
    await call(TOKEN, 'a b&c=d/e')
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}${path}?before=a%20b%26c%3Dd%2Fe`)
    await call(TOKEN, 0)
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_BASE}${path}?before=0`)
    await call(TOKEN, null)
    expect(fetchMock.mock.calls[3][0]).toBe(`${API_BASE}${path}`)
    await call(TOKEN)
    expect(fetchMock.mock.calls[4][0]).toBe(`${API_BASE}${path}`)
  })

  it("throws the server's message with the status", async () => {
    fetchMock.mockResolvedValue(json({ error: 'Restricted to the chapter.' }, 403))
    const err = await listClips(TOKEN).catch((e) => e)
    expect(err).toBeInstanceOf(BuildsApiError)
    expect(err).toMatchObject({ message: 'Restricted to the chapter.', status: 403 })
  })

  it('names the status when the server sent no message', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(listMine(TOKEN)).rejects.toMatchObject({ message: 'Request failed (502)', status: 502 })
  })

  it('lets a network failure reach the caller as it is', async () => {
    const down = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(down)
    await expect(getMe(TOKEN)).rejects.toBe(down)
  })
})

describe('submitArt', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'banner.png', { type: 'image/png' })

  it('posts a multipart form with the token in a header and no Content-Type of its own', async () => {
    fetchMock.mockResolvedValue(json({ item: { id: '7' } }, 201))
    expect(await submitArt({ file, title: 'Banner', note: 'First draft' }, TOKEN)).toEqual({ item: { id: '7' } })
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}/gallery/art`)
    expect(url).not.toContain(TOKEN)
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    // The browser adds the multipart boundary; a Content-Type set here would leave it out.
    expect(headersOf(init)).toEqual({ Authorization: `Bearer ${TOKEN}` })
    expect(init.body).toBeInstanceOf(FormData)
    expect([...init.body.keys()].sort()).toEqual(['file', 'note', 'title'])
    expect(init.body.get('title')).toBe('Banner')
    expect(init.body.get('note')).toBe('First draft')
    const sentFile = init.body.get('file')
    expect(sentFile).toBeInstanceOf(Blob)
    expect(sentFile.name).toBe('banner.png')
    expect(sentFile.size).toBe(3)
  })

  it('sends an empty note, and an empty title, rather than the word "undefined"', async () => {
    fetchMock.mockResolvedValue(json({ item: {} }, 201))
    await submitArt({ file }, TOKEN)
    const form = sent()[1].body
    expect(form.get('note')).toBe('')
    expect(form.get('title')).toBe('')
  })

  it.each([
    [400, 'That file is not a JPEG, PNG, WebP or GIF.'],
    [413, 'That file is larger than 10 MB.'],
    [415, 'Send the form as multipart/form-data.'],
    [502, 'The upload could not be stored.'],
  ])("throws the server's message for a %i", async (status, error) => {
    fetchMock.mockResolvedValue(json({ error }, status))
    const err = await submitArt({ file, title: 't', note: '' }, TOKEN).catch((e) => e)
    expect(err).toBeInstanceOf(BuildsApiError)
    expect(err).toMatchObject({ message: error, status })
  })

  it('names the status when the server sent no message', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 413 }))
    await expect(submitArt({ file, title: 't', note: '' }, TOKEN)).rejects.toMatchObject({ message: 'Request failed (413)', status: 413 })
  })

  it('lets a network failure reach the caller as it is', async () => {
    const down = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(down)
    await expect(submitArt({ file, title: 't', note: '' }, TOKEN)).rejects.toBe(down)
  })
})

describe('the actions on an item', () => {
  it('removeItem: DELETEs the item and answers null for the empty reply', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    expect(await removeItem('77', TOKEN)).toBeNull()
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}/gallery/items/77`)
    expect(init).toMatchObject({ method: 'DELETE', cache: 'no-store' })
    expect(headersOf(init)).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('approve: POSTs with no body', async () => {
    fetchMock.mockResolvedValue(json({ item: { id: '77', status: 'approved' } }))
    expect(await approve('77', TOKEN)).toEqual({ item: { id: '77', status: 'approved' } })
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}/gallery/items/77/approve`)
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(init.body).toBeUndefined()
    expect(headersOf(init)).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('reject: POSTs the reason as JSON', async () => {
    fetchMock.mockResolvedValue(json({ item: { id: '77', status: 'rejected' } }))
    expect(await reject('77', 'Too blurry', TOKEN)).toEqual({ item: { id: '77', status: 'rejected' } })
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}/gallery/items/77/reject`)
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(headersOf(init)).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` })
    expect(JSON.parse(init.body)).toEqual({ reason: 'Too blurry' })
  })

  it('hide: POSTs the note as JSON when there is one', async () => {
    fetchMock.mockResolvedValue(json({ item: { id: '77', status: 'hidden' } }))
    await hide('77', 'Off topic', TOKEN)
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}/gallery/items/77/hide`)
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(headersOf(init)).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` })
    expect(JSON.parse(init.body)).toEqual({ note: 'Off topic' })
  })

  it.each([[''], [undefined], [null]])('hide: sends no body at all for the note %j (the server takes that as no note)', async (note) => {
    fetchMock.mockResolvedValue(json({ item: {} }))
    await hide('77', note, TOKEN)
    const [, init] = sent()
    expect(init.body).toBeUndefined()
    expect(headersOf(init)).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('eraseFile: POSTs with no body and answers null for the empty reply', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    expect(await eraseFile('77', TOKEN)).toBeNull()
    const [url, init] = sent()
    expect(url).toBe(`${API_BASE}/gallery/items/77/erase`)
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' })
    expect(init.body).toBeUndefined()
    expect(headersOf(init)).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })

  it('URL-encodes the id', async () => {
    fetchMock.mockImplementation(async () => json({}))
    await approve('a/b?c', TOKEN)
    await removeItem('a/b?c', TOKEN)
    await eraseFile('a/b?c', TOKEN)
    expect(fetchMock.mock.calls[2][0]).toBe(`${API_BASE}/gallery/items/a%2Fb%3Fc/erase`)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/gallery/items/a%2Fb%3Fc/approve`)
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE}/gallery/items/a%2Fb%3Fc`)
  })

  it.each([
    ['removeItem', () => removeItem('77', TOKEN)],
    ['approve', () => approve('77', TOKEN)],
    ['reject', () => reject('77', 'why', TOKEN)],
    ['hide', () => hide('77', 'why', TOKEN)],
    ['eraseFile', () => eraseFile('77', TOKEN)],
  ])('%s: throws the server\'s message with the status on a 409', async (_name, call) => {
    fetchMock.mockResolvedValue(json({ error: 'That item has already moved on.' }, 409))
    const err = await call().catch((e) => e)
    expect(err).toBeInstanceOf(BuildsApiError)
    expect(err).toMatchObject({ message: 'That item has already moved on.', status: 409 })
  })

  it('names the status when a 404 carries no message', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))
    await expect(removeItem('77', TOKEN)).rejects.toMatchObject({ message: 'Request failed (404)', status: 404 })
  })
})
