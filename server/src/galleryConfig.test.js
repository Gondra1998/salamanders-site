import { describe, it, expect } from 'vitest'
import { galleryConfigReport, pollIntervalMs, CHANNEL_ID, POLL_DEFAULT_MS, POLL_MIN_MS } from './galleryConfig'
import { createR2 } from './r2'

// Invented values only. Each is a distinctive string, so a test can prove none of them is ever printed.
const FULL = Object.freeze({
  GALLERY_CHANNEL_ID: '200000000000000100',
  R2_ACCOUNT_ID: 'acct-sentinel-1',
  R2_BUCKET: 'bucket-sentinel-2',
  R2_ACCESS_KEY_ID: 'key-sentinel-3',
  R2_SECRET_ACCESS_KEY: 'secret-sentinel-4',
})
const without = (...names) => Object.fromEntries(Object.entries(FULL).filter(([k]) => !names.includes(k)))
const HEAD = 'Reliquarium is not configured, so every /gallery route answers 503 and the clips poll is off: '

describe('galleryConfigReport', () => {
  it('is null when no gallery variable is set (the image ships before the gallery), or only empty ones', () => {
    expect(galleryConfigReport({})).toBeNull()
    expect(galleryConfigReport({ PATH: '/bin', GALLERY_POLL_MS: '1000', GALLERY_CURATOR_ROLE_ID: '1' })).toBeNull()
    expect(galleryConfigReport({ ...Object.fromEntries(Object.keys(FULL).map((k) => [k, ''])), R2_ENDPOINT: '' })).toBeNull()
  })

  it('is null when the gallery is configured, with or without a usable R2_ENDPOINT', () => {
    expect(galleryConfigReport(FULL)).toBeNull()
    expect(galleryConfigReport({ ...FULL, R2_ENDPOINT: 'http://discord-mock:4400' })).toBeNull()
    expect(galleryConfigReport({ ...FULL, R2_ENDPOINT: 'https://r2.example.test/' })).toBeNull()
  })

  it.each([
    ['GALLERY_CHANNEL_ID'],
    ['R2_ACCOUNT_ID'],
    ['R2_BUCKET'],
    ['R2_ACCESS_KEY_ID'],
    ['R2_SECRET_ACCESS_KEY'],
  ])('names a missing %s', (name) => {
    expect(galleryConfigReport(without(name))).toBe(`${HEAD}missing ${name}.`)
    expect(galleryConfigReport({ ...FULL, [name]: '' })).toBe(`${HEAD}missing ${name}.`)
  })

  it('names every missing one, in a fixed order, when only one is set', () => {
    expect(galleryConfigReport({ R2_ENDPOINT: 'http://discord-mock:4400' })).toBe(
      `${HEAD}missing GALLERY_CHANNEL_ID, R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.`,
    )
    expect(galleryConfigReport({ R2_BUCKET: 'b' })).toBe(
      `${HEAD}missing GALLERY_CHANNEL_ID, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.`,
    )
  })

  it.each(['12345', '2000000000000001000000', 'clips', ' 200000000000000100', '200000000000000100 '])(
    'refuses a GALLERY_CHANNEL_ID of %j',
    (channel) => {
      expect(galleryConfigReport({ ...FULL, GALLERY_CHANNEL_ID: channel })).toBe(
        `${HEAD}refused GALLERY_CHANNEL_ID (not a Discord channel id).`,
      )
    },
  )

  it.each([
    ['a path', 'http://discord-mock:4400/e2e-bucket'],
    ['a query', 'http://discord-mock:4400/?x=1'],
    ['a fragment', 'http://discord-mock:4400/#x'],
    ['credentials', 'http://user:pass@discord-mock:4400'],
    ['another scheme', 'ftp://discord-mock:4400'],
    ['no scheme', 'discord-mock:4400'],
    ['not a url', 'not a url'],
  ])('refuses an R2_ENDPOINT with %s', (_, endpoint) => {
    expect(galleryConfigReport({ ...FULL, R2_ENDPOINT: endpoint })).toBe(
      `${HEAD}refused R2_ENDPOINT (scheme and host[:port] only: no path, query or credentials).`,
    )
  })

  it.each(['acct/with/slash', 'acct with space', 'acct?q'])(
    'refuses an R2_ACCOUNT_ID of %j when it makes the default endpoint, and not when R2_ENDPOINT replaces it',
    (accountId) => {
      expect(galleryConfigReport({ ...FULL, R2_ACCOUNT_ID: accountId })).toBe(
        `${HEAD}refused R2_ACCOUNT_ID (does not make a valid R2 hostname).`,
      )
      expect(galleryConfigReport({ ...FULL, R2_ACCOUNT_ID: accountId, R2_ENDPOINT: 'http://discord-mock:4400' })).toBeNull()
    },
  )

  it('names what is missing and what is refused together', () => {
    expect(galleryConfigReport({ ...without('R2_BUCKET'), GALLERY_CHANNEL_ID: 'x', R2_ENDPOINT: 'http://h/p' })).toBe(
      `${HEAD}missing R2_BUCKET; refused GALLERY_CHANNEL_ID (not a Discord channel id), R2_ENDPOINT (scheme and host[:port] only: no path, query or credentials).`,
    )
  })

  it('never prints a value', () => {
    const odd = { ...without('R2_BUCKET'), GALLERY_CHANNEL_ID: 'chan-sentinel-0', R2_ENDPOINT: 'http://endpoint-sentinel-5/p' }
    const report = galleryConfigReport(odd)
    expect(report).toContain('missing R2_BUCKET')
    expect(report).not.toMatch(/sentinel/)
  })

  // The warning must agree with what index.js does: gallery on = r2.configured && the channel id test.
  it.each([
    ['all set', FULL],
    ['the mock endpoint', { ...FULL, R2_ENDPOINT: 'http://discord-mock:4400' }],
    ['an endpoint with a path', { ...FULL, R2_ENDPOINT: 'http://discord-mock:4400/x' }],
    ['a bad channel', { ...FULL, GALLERY_CHANNEL_ID: '1' }],
    ['no secret', without('R2_SECRET_ACCESS_KEY')],
    ['no account', without('R2_ACCOUNT_ID')],
    ['no account but an endpoint', { ...without('R2_ACCOUNT_ID'), R2_ENDPOINT: 'http://discord-mock:4400' }],
    ['an account with a slash', { ...FULL, R2_ACCOUNT_ID: 'a/b' }],
    ['an empty endpoint', { ...FULL, R2_ENDPOINT: '' }],
  ])('agrees with createR2 and the channel test on %s', (_, env) => {
    const r2 = createR2({
      accountId: env.R2_ACCOUNT_ID,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      endpoint: env.R2_ENDPOINT || undefined,
    })
    const on = r2.configured && CHANNEL_ID.test(env.GALLERY_CHANNEL_ID || '')
    expect(galleryConfigReport(env) === null).toBe(on)
  })
})

describe('pollIntervalMs', () => {
  it.each([
    ['unset', undefined, POLL_DEFAULT_MS],
    ['empty', '', POLL_DEFAULT_MS],
    ['zero', '0', POLL_DEFAULT_MS],
    ['negative', '-5000', POLL_DEFAULT_MS],
    ['not a number', 'often', POLL_DEFAULT_MS],
    ['a typo of 1', '1', POLL_MIN_MS],
    ['just under the floor', '999', POLL_MIN_MS],
    ['a fraction above 0', '0.5', POLL_MIN_MS],
    ['the floor, the e2e value', '1000', 1000],
    ['just over the floor', '1001', 1001],
    ['five minutes', '300000', 300_000],
    ["setInterval's ceiling", '2147483647', 2_147_483_647],
    ['past the ceiling', '2147483648', 2_147_483_647],
    ['Infinity', 'Infinity', 2_147_483_647],
  ])('%s → its interval', (_, value, want) => {
    expect(pollIntervalMs({ GALLERY_POLL_MS: value })).toBe(want)
  })

  it('reads nothing but GALLERY_POLL_MS', () => {
    expect(pollIntervalMs({})).toBe(120_000)
    expect(POLL_MIN_MS).toBe(1000)
  })
})
