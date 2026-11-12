import { test, expect } from '@playwright/test'

// What only a real browser can judge: what fits in a bar, and what sits on top of what. Tokens are the invented ones
// in e2e/discord-mock/server.js.
async function signIn(page, token) {
  await page.goto(`/#access_token=${token}&expires_in=3600`)
  await expect(page.locator('.auth-name')).toBeVisible()
}

const sideways = async (page) => {
  await page.evaluate(() => document.fonts.ready.then(() => true))
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

// The fullest bar there is: Version History as well as the member links, and a name at the most the bar shows of one
// (it cuts a name at 8rem, and the mock's are shorter than that). The stored name is what the bar reads.
async function signInWithFullestBar(page) {
  await signIn(page, 'test-techmarine-token')
  await expect(page.locator('.nav-links').getByRole('link', { name: 'Version History' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'salamanders-discord-member'
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), username: 'an-invented-name-longer-than-the-bar-shows' }))
  })
  await page.reload()
  await expect(page.locator('.nav-links').getByRole('link', { name: 'Version History' })).toBeVisible()
}

test.describe('the site bar', () => {
  test('signed in, the fullest bar never scrolls the page sideways and Sign out stays on screen', async ({ page }) => {
    await signInWithFullestBar(page)
    for (const width of [861, 900, 1024, 1100, 1180, 1220, 1241, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      expect(await sideways(page), `sideways scroll at ${width}px`).toBe(0)
      const burger = page.locator('.burger')
      if (await burger.isVisible()) {
        await burger.click()
        await expect(page.locator('.nav-mobile').getByRole('button', { name: 'Sign out' }), `in the menu at ${width}px`).toBeInViewport({ ratio: 1 })
        await burger.click()
        await expect(page.locator('.nav-mobile')).toHaveCount(0)
      } else {
        await expect(page.locator('.nav-bar').getByRole('button', { name: 'Sign out' }), `in the bar at ${width}px`).toBeInViewport({ ratio: 1 })
      }
    }
  })

  test('signed out, the full bar stays from 861px', async ({ page }) => {
    await page.setViewportSize({ width: 861, height: 800 })
    await page.goto('/')
    await expect(page.locator('.nav-links')).toBeVisible()
    await expect(page.locator('.burger')).toBeHidden()
    expect(await sideways(page)).toBe(0)
  })

  test('signed in, the full bar stays on a 1280px laptop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signInWithFullestBar(page)
    await expect(page.locator('.nav-links')).toBeVisible()
    await expect(page.locator('.burger')).toBeHidden()
  })
})

const tap = async (page, target) => {
  const box = await target.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// The narrowest phone and the widest window that still has the part bar (the hall's own width under 700px).
for (const width of [360, 760]) {
  test(`at ${width}px the Watch Commander can reach both the part bar and Edit page`, async ({ page }) => {
    await signIn(page, 'test-commander-token')
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/deathwatch/armouringhall/specialist/reclusiarc')
    const bar = page.locator('.av-bar')
    const edit = page.locator('.pe-open')
    await expect(bar).toBeVisible()
    await expect(edit).toBeVisible()

    // At rest, with the bar stuck to the foot of the screen. A locator's click() would scroll until its target is clear
    // and so never see the overlap; the mouse lands on whatever is on top, as a thumb does.
    await page.locator('.av-fig').evaluate((fig) => fig.scrollIntoView({ block: 'start', behavior: 'instant' }))
    await tap(page, bar.locator('.av-chev'))
    const part = page.getByRole('dialog', { name: 'Helm details' })
    await expect(part).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(part).toBeHidden()

    await tap(page, edit)
    await expect(page.getByRole('dialog', { name: 'Edit page' })).toBeVisible()
  })
}
