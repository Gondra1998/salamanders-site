import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// The Reliquarium pages against the e2e stack. A clip reaches the site the real way: posted in the mock's clips
// channel and copied by the api's poll (every second here). Same fragment-callback sign-in as reports.spec.js.
// gallery-api.spec.js may run at the same time, so every item here is found by its own title.
const API = process.env.API_URL || 'http://api:8787'
const MOCK = process.env.DISCORD_MOCK_URL || 'http://discord-mock:4400'
const ART = fileURLToPath(new URL('../discord-mock/fixtures/art.png', import.meta.url))
// Where the api puts a clip (R2_ENDPOINT + R2_BUCKET in docker-compose.yml), as a pattern for the <video> src.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CLIP_LINK = new RegExp(`^${escapeRegExp(`${MOCK}/e2e-bucket/clips/`)}`)

const MEMBER = 'test-member-token'
const RECLUSIARCH = 'test-reclusiarch-token'

const RUN = Date.now().toString(36)
const CLIP_TITLE = `E2E browser clip ${RUN}`
const ART_TITLE = `E2E browser art ${RUN}`
const REASON = `Too dark to make out ${RUN}`

async function signIn(page, token) {
  await page.goto(`/#access_token=${token}&expires_in=3600`)
  await expect(page.locator('.auth-name')).toBeVisible()
}

test.describe('Reliquarium', () => {
  test.describe.configure({ mode: 'serial' })

  test('a member sees a clip posted in the channel, and it loads in place', async ({ page, request }) => {
    // WebM: Playwright's open-source Chromium may not decode the H.264 in clip.mp4.
    const posted = await request.post(`${MOCK}/__test/channel/post`, { data: { token: MEMBER, content: `#gameplay ${CLIP_TITLE}`, attachments: ['clip.webm'] } })
    expect(posted.status()).toBe(200)
    await expect
      .poll(
        async () => {
          const res = await request.get(`${API}/gallery/clips`, { headers: { Authorization: `Bearer ${MEMBER}` } })
          return (await res.json()).items.some((i) => i.title === CLIP_TITLE)
        },
        { timeout: 10_000 },
      )
      .toBe(true)

    await signIn(page, MEMBER)
    await page.goto('/reliquarium')
    const card = page.locator('.rq-card', { hasText: CLIP_TITLE })
    await expect(card).toBeVisible()
    // A stored video plays inline, no tap first: its source is the presigned R2 link, which the browser loads.
    const video = card.locator('video.rq-video')
    await expect(video).toHaveAttribute('src', CLIP_LINK)
    await expect.poll(() => video.evaluate((v) => v.readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
    await expect(card.getByText("This clip couldn't load.")).toHaveCount(0)
  })

  test('a member submits a piece of art', async ({ page }) => {
    await signIn(page, MEMBER)
    await page.goto('/reliquarium/submit')
    const send = page.getByRole('button', { name: 'Submit', exact: true })
    await expect(send).toBeDisabled()
    await page.getByLabel(/^Image \(/).setInputFiles(ART)
    await page.getByLabel('Title', { exact: true }).fill(ART_TITLE)
    await send.click()
    await expect(page.getByText('Submitted. An approver will look at it.')).toBeVisible()
  })

  test('a Reclusiarch rejects it with a reason, and the member reads the reason', async ({ browser }) => {
    const recl = await (await browser.newContext()).newPage()
    await signIn(recl, RECLUSIARCH)
    await recl.goto('/reliquarium/review')
    const queued = recl.locator('.rq-review-item', { hasText: ART_TITLE })
    await expect(queued).toBeVisible()
    await queued.getByRole('button', { name: 'Reject', exact: true }).click()

    // Confirm stays disabled until there is a reason, and blank space is not one.
    const confirm = queued.getByRole('button', { name: 'Confirm', exact: true })
    await expect(confirm).toBeDisabled()
    const why = queued.getByLabel('Why?')
    await why.fill('   ')
    await expect(confirm).toBeDisabled()
    await why.fill(REASON)
    await expect(confirm).toBeEnabled()
    await confirm.click()
    // Rejected, it leaves the queue.
    await expect(queued).toHaveCount(0)

    const member = await (await browser.newContext()).newPage()
    await signIn(member, MEMBER)
    await member.goto('/reliquarium/mine')
    await expect(member.locator('.rq-mine-row', { hasText: ART_TITLE }).locator('.rq-chip')).toHaveText(`Rejected: ${REASON}`)
  })

  test('an account without the Legion role is turned away', async ({ page }) => {
    await signIn(page, 'test-norole-token')
    await page.goto('/reliquarium')
    await expect(page.getByText('Restricted to the XVIIIth Legion.')).toBeVisible()
    await expect(page.locator('.rq-tabs')).toHaveCount(0)
  })
})
