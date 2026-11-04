import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// The Reliquarium API against the e2e stack (api + postgres + discord-mock), with no page in the way. discord-mock
// stands in for the clips channel the api polls (every second here), Discord's CDN and R2. Tokens and ids are the
// invented ones in e2e/discord-mock/server.js. gallery.spec.js may run at the same time in another worker, so
// nothing here counts a whole list: every item is found by its own title or id.
const API = process.env.API_URL || 'http://api:8787'
const MOCK = process.env.DISCORD_MOCK_URL || 'http://discord-mock:4400'
// Where the api puts an object (R2_ENDPOINT + R2_BUCKET in docker-compose.yml).
const R2 = `${MOCK}/e2e-bucket/`

const MEMBER = 'test-member-token'
const RECLUSIARCH = 'test-reclusiarch-token'
const CAPTAIN = 'test-captain-token'
const CURATOR = 'test-curator-token'

// Already in the mock's channel when the api started: the poll's first pass took it as its starting point.
const PRE_LAUNCH_TITLE = 'E2E posted before launch'
const RUN = Date.now().toString(36)
const fixture = (name) => readFileSync(new URL(`../discord-mock/fixtures/${name}`, import.meta.url))
const PNG = fixture('art.png')
const MP4 = fixture('clip.mp4')

const as = (token) => ({ Authorization: `Bearer ${token}` })
const get = (request, path, token) => request.get(`${API}${path}`, { headers: as(token) })
const post = (request, path, token, data) => request.post(`${API}${path}`, { headers: as(token), ...(data === undefined ? {} : { data }) })
const del = (request, path, token) => request.delete(`${API}${path}`, { headers: as(token) })
const upload = (request, token, { name = 'art.png', mimeType = 'image/png', buffer = PNG, title, note = '' }) =>
  request.post(`${API}/gallery/art`, { headers: as(token), multipart: { file: { name, mimeType, buffer }, title, note } })

/** Posts as the member in the clips channel, through the mock's test hook. → the new message's id. */
async function postInChannel(request, content, attachments = []) {
  const res = await request.post(`${MOCK}/__test/channel/post`, { data: { token: MEMBER, content, attachments } })
  expect(res.status()).toBe(200)
  return (await res.json()).id
}

const titled = async (request, path, title) => (await (await get(request, path, MEMBER)).json()).items.filter((i) => i.title === title)
const eventsFor = async (request, itemId) =>
  (await (await get(request, '/gallery/events', RECLUSIARCH)).json()).events.filter((e) => e.itemId === itemId)

/** A fresh upload by the member, pending review. → the item. */
async function submitted(request, title) {
  const res = await upload(request, MEMBER, { title })
  expect(res.status()).toBe(201)
  return (await res.json()).item
}

test.describe('Reliquarium API', () => {
  test.describe.configure({ mode: 'serial' })

  // The video the poll stores, and the id of the channel message it came from: the deletion test removes that message.
  let clip
  let clipMessageId

  test('/me says who may look and who may approve', async ({ request }) => {
    expect((await request.get(`${API}/gallery/me`)).status()).toBe(401)
    expect((await get(request, '/gallery/me', 'not-a-real-token')).status()).toBe(401)
    const me = async (token) => {
      const res = await get(request, '/gallery/me', token)
      expect(res.status(), token).toBe(200)
      return res.json()
    }
    expect(await me(MEMBER)).toEqual({ access: true, approver: false })
    // Reclusiarch, Captain and the curator role each make a member an approver.
    for (const who of [RECLUSIARCH, CAPTAIN, CURATOR]) expect(await me(who), who).toEqual({ access: true, approver: true })
    // An Administrator holds no Legion role and is let in, as an approver, all the same.
    expect(await me('test-admin-token')).toEqual({ access: true, approver: true })
    // In the guild without the Legion role, and not in the guild at all: /me answers, and says no.
    for (const who of ['test-norole-token', 'test-nonmember-token']) expect(await me(who), who).toEqual({ access: false, approver: false })

    // The galleries themselves are closed to them, and the review queue to a plain member.
    expect((await get(request, '/gallery/clips', 'test-norole-token')).status()).toBe(403)
    expect((await get(request, '/gallery/art', 'test-nonmember-token')).status()).toBe(403)
    expect((await get(request, '/gallery/review', MEMBER)).status()).toBe(403)
    expect((await get(request, '/gallery/review', CURATOR)).status()).toBe(200)
  })

  test('the poll started from the newest message, then copies a new clip into R2', async ({ request }) => {
    const title = `E2E clip ${RUN}`
    clipMessageId = await postInChannel(request, title, ['clip.mp4'])
    await expect.poll(async () => (await titled(request, '/gallery/clips', title)).length, { timeout: 10_000 }).toBe(1)
    ;[clip] = await titled(request, '/gallery/clips', title)
    expect(clip).toMatchObject({ kind: 'clip', source: 'discord', media: 'video', status: 'approved', contentType: 'video/mp4', bytes: MP4.length })
    expect(clip.url.startsWith(`${R2}clips/`)).toBe(true)

    // The pass that stored this clip came after the first one, which stored nothing: the message that was
    // already in the channel at launch is in neither the gallery nor its author's own list.
    expect(await titled(request, '/gallery/clips', PRE_LAUNCH_TITLE)).toEqual([])
    expect(await titled(request, '/gallery/mine', PRE_LAUNCH_TITLE)).toEqual([])

    // The presigned link serves the very bytes the CDN gave, and a range of them for a <video> to seek.
    const file = await request.get(clip.url)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('video/mp4')
    expect(Buffer.compare(await file.body(), MP4)).toBe(0)
    const part = await request.get(clip.url, { headers: { Range: 'bytes=0-99' } })
    expect(part.status()).toBe(206)
    expect(part.headers()['content-range']).toBe(`bytes 0-99/${MP4.length}`)
    expect((await part.body()).length).toBe(100)
  })

  test('a Medal link in a message becomes an embed under its canonical address', async ({ request }) => {
    const slug = `e2eMedal${RUN}`
    const title = `E2E medal ${RUN} https://medal.tv/games/space-marine-2/clips/${slug}?invite=e2e`
    await postInChannel(request, title)
    await expect.poll(async () => (await titled(request, '/gallery/clips', title)).length, { timeout: 10_000 }).toBe(1)
    const [embed] = await titled(request, '/gallery/clips', title)
    expect(embed).toMatchObject({ media: 'embed', url: `https://medal.tv/clips/${slug}`, contentType: null, bytes: null })
  })

  test('deleting the message in Discord takes its clip off the site, on the record', async ({ request }) => {
    expect(clip, 'the clip from the poll test').toBeTruthy()
    const res = await request.post(`${MOCK}/__test/channel/delete/${clipMessageId}`)
    expect(await res.json()).toEqual({ deleted: true })

    await expect.poll(async () => (await titled(request, '/gallery/clips', clip.title)).length, { timeout: 10_000 }).toBe(0)
    const events = await eventsFor(request, clip.id)
    expect(events.map((e) => e.action)).toContain('discord_deleted')
    // Its own list still shows it, as removed.
    const [mine] = await titled(request, '/gallery/mine', clip.title)
    expect(mine.status).toBe('removed')
  })

  test('art: uploads are checked by their bytes and size', async ({ request }) => {
    const res = await upload(request, MEMBER, { title: `E2E upload ${RUN}`, note: 'Painted for the e2e run.' })
    expect(res.status()).toBe(201)
    const { item } = await res.json()
    expect(item).toMatchObject({ kind: 'art', source: 'site', media: 'image', status: 'pending', contentType: 'image/png', bytes: PNG.length })
    expect(item.url.startsWith(`${R2}art/`)).toBe(true)
    const file = await request.get(item.url)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('image/png')
    expect(Buffer.compare(await file.body(), PNG)).toBe(0)

    // A video renamed to .png, and declared as one, is still a video.
    expect((await upload(request, MEMBER, { name: 'clip.png', buffer: MP4, title: `E2E renamed ${RUN}` })).status()).toBe(400)
    // Over 10 MB (the PNG signature in front, so only the size is wrong).
    const big = Buffer.alloc(11 * 1024 * 1024)
    PNG.copy(big)
    expect((await upload(request, MEMBER, { name: 'big.png', buffer: big, title: `E2E too big ${RUN}` })).status()).toBe(413)
  })

  test('a rejection needs a reason, and the artist reads it', async ({ request }) => {
    const item = await submitted(request, `E2E to reject ${RUN}`)
    expect((await post(request, `/gallery/items/${item.id}/reject`, RECLUSIARCH, {})).status()).toBe(400)
    expect((await post(request, `/gallery/items/${item.id}/reject`, RECLUSIARCH, { reason: '   ' })).status()).toBe(400)

    const reason = `Not of the Legion ${RUN}`
    const res = await post(request, `/gallery/items/${item.id}/reject`, RECLUSIARCH, { reason })
    expect(res.status()).toBe(200)
    expect((await res.json()).item).toMatchObject({ status: 'rejected', reviewNote: reason })
    const [mine] = await titled(request, '/gallery/mine', item.title)
    expect(mine).toMatchObject({ id: item.id, status: 'rejected', reviewNote: reason })
  })

  test('the curator approves, a Captain hides', async ({ request }) => {
    const item = await submitted(request, `E2E to approve ${RUN}`)
    // Not in the gallery while it waits.
    expect(await titled(request, '/gallery/art', item.title)).toEqual([])

    const approved = await post(request, `/gallery/items/${item.id}/approve`, CURATOR)
    expect(approved.status()).toBe(200)
    expect((await approved.json()).item.status).toBe('approved')
    expect((await titled(request, '/gallery/art', item.title)).map((i) => i.id)).toEqual([item.id])

    const hidden = await post(request, `/gallery/items/${item.id}/hide`, CAPTAIN, { note: 'e2e hide' })
    expect(hidden.status()).toBe(200)
    expect((await hidden.json()).item.status).toBe('hidden')
    expect(await titled(request, '/gallery/art', item.title)).toEqual([])
    // Hidden is final: it cannot be approved back.
    expect((await post(request, `/gallery/items/${item.id}/approve`, CURATOR)).status()).toBe(409)
  })

  test('the artist removes their own piece, and only theirs', async ({ request }) => {
    const item = await submitted(request, `E2E to remove ${RUN}`)
    // Someone else's piece is not found, even by another member.
    expect((await del(request, `/gallery/items/${item.id}`, CAPTAIN)).status()).toBe(404)
    expect((await del(request, `/gallery/items/${item.id}`, MEMBER)).status()).toBe(204)
    // Gone already: the second removal finds nothing left to remove.
    expect((await del(request, `/gallery/items/${item.id}`, MEMBER)).status()).toBe(409)
    expect((await del(request, '/gallery/items/999999999', MEMBER)).status()).toBe(404)
    const [mine] = await titled(request, '/gallery/mine', item.title)
    expect(mine.status).toBe('removed')
  })

  test('a member cannot approve, and two approvers at once make one approval', async ({ request }) => {
    const item = await submitted(request, `E2E raced ${RUN}`)
    expect((await post(request, `/gallery/items/${item.id}/approve`, MEMBER)).status()).toBe(403)
    expect((await get(request, '/gallery/events', MEMBER)).status()).toBe(403)

    const answers = await Promise.all([
      post(request, `/gallery/items/${item.id}/approve`, CURATOR),
      post(request, `/gallery/items/${item.id}/approve`, RECLUSIARCH),
    ])
    expect(answers.map((r) => r.status()).sort()).toEqual([200, 409])
    const actions = (await eventsFor(request, item.id)).map((e) => e.action)
    expect(actions.filter((a) => a === 'approved')).toHaveLength(1)
    expect(actions).toContain('submitted')
  })
})
