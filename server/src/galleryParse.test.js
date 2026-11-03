import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { MAX_CLIP_BYTES, embedOf, parseMessage } from './galleryParse'

const YT = 'dQw4w9WgXcQ'
const YT_CANON = `https://www.youtube.com/watch?v=${YT}`
const SLUG = 'AwkwardHelplessSalamander-x1Y2z3'
const TW_CANON = `https://clips.twitch.tv/${SLUG}`
const MEDAL = 'cAbC123xyz'
const MEDAL_CANON = `https://medal.tv/clips/${MEDAL}`
const FFFD = String.fromCharCode(0xfffd) // the replacement character

const message = (over = {}) => ({
  id: '200000000000000101',
  channel_id: '200000000000000001',
  author: { id: '200000000000000201', username: 'brother_test' },
  content: '',
  timestamp: '2026-11-02T18:30:00.123000+00:00',
  attachments: [],
  ...over,
})

const attachment = (id, content_type, over = {}) => ({
  id,
  filename: 'file',
  size: 1024,
  content_type,
  url: `https://cdn.example.test/attachments/${id}/file`,
  ...over,
})

describe('constants', () => {
  it('carry the spec value', () => expect(MAX_CLIP_BYTES).toBe(104_857_600))
})

describe('parseMessage attachments', () => {
  it('yields one video row per video attachment and one image row per image attachment, in attachment order', () => {
    const msg = message({
      attachments: [
        attachment('200000000000000301', 'video/mp4'),
        attachment('200000000000000302', 'image/png'),
        attachment('200000000000000303', 'video/webm'),
      ],
    })
    const { rows, skipped } = parseMessage(msg)
    expect(skipped).toEqual([])
    expect(rows.map((r) => [r.attachmentId, r.media])).toEqual([
      ['200000000000000301', 'video'],
      ['200000000000000302', 'image'],
      ['200000000000000303', 'video'],
    ])
    expect(rows[0]).toEqual({
      messageId: '200000000000000101',
      authorId: '200000000000000201',
      authorUsername: 'brother_test',
      title: '',
      postedAt: '2026-11-02T18:30:00.123000+00:00',
      attachmentId: '200000000000000301',
      media: 'video',
      download: {
        url: 'https://cdn.example.test/attachments/200000000000000301/file',
        size: 1024,
        contentType: 'video/mp4',
        ext: 'mp4',
      },
    })
    expect(rows[0]).not.toHaveProperty('embedUrl')
  })

  it.each([
    ['video/mp4', 'mp4'],
    ['video/quicktime', 'mov'],
    ['video/webm', 'webm'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
  ])('derives ext from content_type %s -> %s', (type, ext) => {
    const { rows } = parseMessage(message({ attachments: [attachment('200000000000000301', type)] }))
    expect(rows[0].download.ext).toBe(ext)
    expect(rows[0].download.contentType).toBe(type)
    expect(rows[0].media).toBe(type.startsWith('video/') ? 'video' : 'image')
  })

  it('skips attachments over MAX_CLIP_BYTES with reason too-large and still yields the others', () => {
    const msg = message({
      attachments: [
        attachment('200000000000000301', 'video/mp4', { size: MAX_CLIP_BYTES + 1 }),
        attachment('200000000000000302', 'video/mp4', { size: MAX_CLIP_BYTES }),
        attachment('200000000000000303', 'image/png'),
      ],
    })
    const { rows, skipped } = parseMessage(msg)
    expect(skipped).toEqual([{ attachmentId: '200000000000000301', reason: 'too-large' }])
    expect(rows.map((r) => r.attachmentId)).toEqual(['200000000000000302', '200000000000000303'])
  })

  it('skips a text/plain attachment with reason not-media', () => {
    const { rows, skipped } = parseMessage(
      message({ attachments: [attachment('200000000000000301', 'text/plain')] }),
    )
    expect(rows).toEqual([])
    expect(skipped).toEqual([{ attachmentId: '200000000000000301', reason: 'not-media' }])
  })

  it.each([
    ['an unmapped video type', 'video/x-matroska'],
    ['an unmapped image type', 'image/svg+xml'],
    ['no content type', undefined],
    ['an empty content type', ''],
    ['an object-prototype name', 'constructor'],
    ['a type with parameters', 'video/mp4; codecs=avc1'],
  ])('skips %s as not-media', (_, type) => {
    const { rows, skipped } = parseMessage(
      message({ attachments: [attachment('200000000000000301', type)] }),
    )
    expect(rows).toEqual([])
    expect(skipped).toEqual([{ attachmentId: '200000000000000301', reason: 'not-media' }])
  })

  it.each([
    ['a missing size', undefined],
    ['a null size', null],
    ['a size sent as text', '1024'],
    ['a negative size', -1],
    ['a NaN size', NaN],
    ['an infinite size', Infinity],
  ])('skips a media attachment with %s as not-media, since it cannot be held against the cap', (_, size) => {
    const { rows, skipped } = parseMessage(
      message({
        attachments: [
          attachment('200000000000000301', 'video/mp4', { size }),
          attachment('200000000000000302', 'image/png'),
        ],
      }),
    )
    expect(skipped).toEqual([{ attachmentId: '200000000000000301', reason: 'not-media' }])
    expect(rows.map((r) => r.attachmentId)).toEqual(['200000000000000302'])
  })

  it('skips an attachment whose size key is absent altogether', () => {
    const a = attachment('200000000000000301', 'image/png')
    delete a.size
    expect(parseMessage(message({ attachments: [a] }))).toEqual({
      rows: [],
      skipped: [{ attachmentId: '200000000000000301', reason: 'not-media' }],
    })
  })

  it('keeps a zero-byte attachment: zero is a size', () => {
    const { rows, skipped } = parseMessage(
      message({ attachments: [attachment('200000000000000301', 'image/png', { size: 0 })] }),
    )
    expect(skipped).toEqual([])
    expect(rows[0].download.size).toBe(0)
  })

  it('calls an oversized non-media file not-media, not too-large', () => {
    const { skipped } = parseMessage(
      message({
        attachments: [attachment('200000000000000301', 'application/zip', { size: MAX_CLIP_BYTES * 2 })],
      }),
    )
    expect(skipped).toEqual([{ attachmentId: '200000000000000301', reason: 'not-media' }])
  })

  it('treats a message with no attachments field as having none', () => {
    const msg = message()
    delete msg.attachments
    expect(parseMessage(msg)).toEqual({ rows: [], skipped: [] })
  })
})

describe('parseMessage embed links', () => {
  const embedRows = (content) => parseMessage(message({ content })).rows

  it.each([
    ['youtu.be/ID', `https://youtu.be/${YT}`, YT_CANON],
    ['youtu.be/ID with a start time', `https://youtu.be/${YT}?t=42`, YT_CANON],
    ['youtube.com/watch?v=ID&t=3', `https://youtube.com/watch?v=${YT}&t=3`, YT_CANON],
    ['www.youtube.com/watch', `https://www.youtube.com/watch?v=${YT}`, YT_CANON],
    ['youtube.com/shorts/ID', `https://youtube.com/shorts/${YT}`, YT_CANON],
    ['m.youtube.com/watch?v=ID', `https://m.youtube.com/watch?v=${YT}`, YT_CANON],
    ['clips.twitch.tv/SLUG', `https://clips.twitch.tv/${SLUG}`, TW_CANON],
    ['twitch.tv/chan/clip/SLUG', `https://www.twitch.tv/some_chan/clip/${SLUG}`, TW_CANON],
    ['medal.tv/games/g/clips/ID/x', `https://medal.tv/games/halo/clips/${MEDAL}/d1337abc`, MEDAL_CANON],
    ['medal.tv/clips/ID', `https://medal.tv/clips/${MEDAL}`, MEDAL_CANON],
    ['medal.tv/clip/ID', `https://medal.tv/clip/${MEDAL}`, MEDAL_CANON],
  ])('yields an embed row for %s, canonical url as attachmentId and embedUrl', (_, link, canonical) => {
    const rows = embedRows(`look at this ${link} lads`)
    expect(rows).toEqual([
      {
        messageId: '200000000000000101',
        authorId: '200000000000000201',
        authorUsername: 'brother_test',
        title: `look at this ${link} lads`,
        postedAt: '2026-11-02T18:30:00.123000+00:00',
        attachmentId: canonical,
        media: 'embed',
        embedUrl: canonical,
      },
    ])
    expect(rows[0]).not.toHaveProperty('download')
  })

  it('ignores other links and keeps them in the title text', () => {
    const content = 'see https://example.test/watch?v=dQw4w9WgXcQ and https://github.com/x/y'
    const { rows, skipped } = parseMessage(message({ content }))
    expect(rows).toEqual([])
    expect(skipped).toEqual([])
  })

  it('keeps an embed link in the title text', () => {
    const content = `ace https://youtu.be/${YT}`
    expect(embedRows(content)[0].title).toBe(content)
  })

  it('dedupes the same link pasted twice in one message', () => {
    expect(embedRows(`https://youtu.be/${YT} again https://youtu.be/${YT}`)).toHaveLength(1)
  })

  it('dedupes two spellings of the same clip by canonical url', () => {
    const rows = embedRows(`https://youtu.be/${YT} https://www.youtube.com/watch?v=${YT}&t=9`)
    expect(rows.map((r) => r.attachmentId)).toEqual([YT_CANON])
  })

  it('yields one row per distinct link, in the order they appear', () => {
    const rows = embedRows(
      `https://medal.tv/clips/${MEDAL} then https://clips.twitch.tv/${SLUG} then https://youtu.be/${YT}`,
    )
    expect(rows.map((r) => r.attachmentId)).toEqual([MEDAL_CANON, TW_CANON, YT_CANON])
  })

  it.each([
    ['a full stop', `watch https://youtu.be/${YT}.`],
    ['an exclamation mark', `https://youtu.be/${YT}!`],
    ['a comma', `https://youtu.be/${YT}, sick`],
    ['bold markers', `**https://youtu.be/${YT}**`],
    ['spoiler bars', `||https://youtu.be/${YT}||`],
    ['markdown link syntax', `[the clip](https://youtu.be/${YT})`],
    ['angle brackets', `<https://youtu.be/${YT}>`],
    ['a following line', `https://youtu.be/${YT}\nnext line`],
  ])('finds a link wrapped in %s', (_, content) => {
    expect(embedRows(content).map((r) => r.attachmentId)).toEqual([YT_CANON])
  })

  it('keeps an id that ends in - or _', () => {
    const id = 'abcdefghi-_'
    expect(embedRows(`https://youtu.be/${id}`)[0].attachmentId).toBe(`https://www.youtube.com/watch?v=${id}`)
  })

  it('does not read a malformed link as a clip', () => {
    expect(embedRows('https://youtu.be/ https://')).toEqual([])
  })
})

describe('parseMessage mixed and empty messages', () => {
  it('yields attachment rows first, then embed rows, with the shared title and author', () => {
    const content = `a clip and a link https://youtu.be/${YT}`
    const msg = message({
      content,
      attachments: [attachment('200000000000000301', 'video/mp4'), attachment('200000000000000302', 'text/plain')],
    })
    const { rows, skipped } = parseMessage(msg)
    expect(rows.map((r) => [r.media, r.attachmentId])).toEqual([
      ['video', '200000000000000301'],
      ['embed', YT_CANON],
    ])
    expect(rows.map((r) => r.title)).toEqual([content, content])
    expect(skipped).toEqual([{ attachmentId: '200000000000000302', reason: 'not-media' }])
  })

  it('yields nothing for a text-only message and nothing for an empty content with no attachments', () => {
    expect(parseMessage(message({ content: 'gg lads, same time Thursday' }))).toEqual({ rows: [], skipped: [] })
    expect(parseMessage(message({ content: '' }))).toEqual({ rows: [], skipped: [] })
  })

  it('treats missing content as empty', () => {
    const msg = message({ attachments: [attachment('200000000000000301', 'image/png')] })
    delete msg.content
    const { rows } = parseMessage(msg)
    expect(rows[0].title).toBe('')
  })
})

describe('parseMessage fields', () => {
  const withContent = (content) =>
    parseMessage(message({ content, attachments: [attachment('200000000000000301', 'image/png')] })).rows[0]

  it('uses content as the title, trimmed, cut to 120 characters', () => {
    expect(withContent('  Vulkan holds  ').title).toBe('Vulkan holds')
    expect(withContent('x'.repeat(120)).title).toBe('x'.repeat(120))
    expect(withContent('x'.repeat(121)).title).toBe('x'.repeat(120))
    expect(withContent('y'.repeat(300)).title).toHaveLength(120)
  })

  it('does not leave half an emoji at the cut', () => {
    const title = withContent('x'.repeat(119) + '\u{1F525}').title
    expect(title).toBe('x'.repeat(119))
    expect(title.isWellFormed()).toBe(true)
    expect(withContent('x'.repeat(118) + '\u{1F525}').title).toBe('x'.repeat(118) + '\u{1F525}')
  })

  it('drops U+0000 from the title', () => {
    expect(withContent('ab\u0000cd').title).toBe('abcd')
    expect(withContent('\u0000\u0000').title).toBe('')
  })

  it('turns a lone surrogate into U+FFFD, wherever it sits', () => {
    expect(withContent('a\uD800b').title).toBe(`a${FFFD}b`)
    expect(withContent('a\uDC00b').title).toBe(`a${FFFD}b`)
    expect(withContent('end\uD800').title).toBe(`end${FFFD}`)
    expect(withContent('a\u{1F525}b').title).toBe('a\u{1F525}b')
  })

  it('cuts first and sanitises after, so a title is never over 120 units and always storable', () => {
    const noisy = withContent('\u0000x\uD800'.repeat(100)).title
    expect(noisy.length).toBeLessThanOrEqual(120)
    expect(noisy).not.toContain('\u0000')
    expect(noisy.isWellFormed()).toBe(true)
    // the cut lands on a lone high surrogate and drops it (119 units); the NULs go, the other lone surrogates become U+FFFD
    expect(noisy).toBe(`x${FFFD}`.repeat(39) + 'x')
    // a cut that lands on the high half of a real pair still drops the pair, not a U+FFFD
    expect(withContent('x'.repeat(119) + '\u{1F525}\u0000').title).toBe('x'.repeat(119))
  })

  it('always yields a title Postgres can store, whatever the message says', () => {
    const piece = fc.constantFrom('a', ' ', '\u0000', '\uD800', '\uDC00', '\u{1F525}')
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 300 }), (parts) => {
        const { title } = withContent(parts.join(''))
        expect(title.length).toBeLessThanOrEqual(120)
        expect(title).not.toContain('\u0000')
        expect(title.isWellFormed()).toBe(true)
      }),
    )
  })

  it('takes posted_at from the timestamp as sent, and the author id and username', () => {
    const row = withContent('hi')
    expect(row.postedAt).toBe('2026-11-02T18:30:00.123000+00:00')
    expect(row.authorId).toBe('200000000000000201')
    expect(row.authorUsername).toBe('brother_test')
    expect(row.messageId).toBe('200000000000000101')
  })

  it('falls back to the author id when there is no username', () => {
    const msg = message({
      author: { id: '200000000000000202' },
      attachments: [attachment('200000000000000301', 'image/png')],
    })
    expect(parseMessage(msg).rows[0].authorUsername).toBe('200000000000000202')
  })
})

describe('embedOf', () => {
  it('names the host, the id and the canonical url', () => {
    expect(embedOf(`https://youtu.be/${YT}`)).toEqual({ host: 'youtube', id: YT, canonical: YT_CANON })
    expect(embedOf(`https://clips.twitch.tv/${SLUG}`)).toEqual({ host: 'twitch', id: SLUG, canonical: TW_CANON })
    expect(embedOf(`https://medal.tv/clips/${MEDAL}`)).toEqual({ host: 'medal', id: MEDAL, canonical: MEDAL_CANON })
  })

  it.each([
    ['youtu.be/ID', `https://youtu.be/${YT}?t=42`, 'youtube', YT],
    ['youtube.com/watch?v=ID', `https://m.youtube.com/watch?v=${YT}&t=3`, 'youtube', YT],
    ['youtube.com/shorts/ID', `https://youtube.com/shorts/${YT}`, 'youtube', YT],
    ['clips.twitch.tv/SLUG', `https://clips.twitch.tv/${SLUG}?filter=clips`, 'twitch', SLUG],
    ['twitch.tv/chan/clip/SLUG', `https://www.twitch.tv/some_chan/clip/${SLUG}`, 'twitch', SLUG],
    ['medal.tv/clips/ID', `https://medal.tv/clips/${MEDAL}`, 'medal', MEDAL],
    ['medal.tv/clip/ID', `https://medal.tv/clip/${MEDAL}`, 'medal', MEDAL],
    ['medal.tv/games/g/clips/ID/x', `https://medal.tv/games/halo/clips/${MEDAL}/d1337abc`, 'medal', MEDAL],
  ])('names the id in %s alone', (_, url, host, id) => {
    expect(embedOf(url)).toMatchObject({ host, id })
  })

  it('matches the host case-insensitively and strips www and m', () => {
    expect(embedOf(`HTTPS://WWW.YouTube.com/watch?v=${YT}`)?.canonical).toBe(YT_CANON)
    expect(embedOf(`https://www.medal.tv/clips/${MEDAL}`)?.canonical).toBe(MEDAL_CANON)
    expect(embedOf(`https://m.twitch.tv/chan/clip/${SLUG}`)?.canonical).toBe(TW_CANON)
  })

  it.each([
    ['a YouTube channel page', 'https://www.youtube.com/@somebody'],
    ['a YouTube watch with no v', 'https://www.youtube.com/watch'],
    ['a YouTube id of the wrong length', 'https://www.youtube.com/watch?v=short'],
    ['a YouTube id that is too long', `https://www.youtube.com/watch?v=${YT}X`],
    ['a YouTube id with a bad character', 'https://www.youtube.com/watch?v=dQw4w9WgXc!'],
    ['youtu.be with no id', 'https://youtu.be/'],
    ['youtu.be with a short id', 'https://youtu.be/abc'],
    ['youtu.be with a trailing junk id', `https://youtu.be/${YT}.`],
    ['youtube shorts with no id', 'https://youtube.com/shorts/'],
    ['a YouTube path that is not a watch', `https://www.youtube.com/playlist?v=${YT}`],
    ['the twitch front page', 'https://www.twitch.tv/'],
    ['a twitch channel', 'https://www.twitch.tv/some_chan'],
    ['a twitch video (not a clip)', 'https://www.twitch.tv/videos/123456'],
    ['twitch /clip/ with no slug', 'https://www.twitch.tv/some_chan/clip/'],
    ['twitch clips host with no slug', 'https://clips.twitch.tv/'],
    ['a medal profile', 'https://medal.tv/u/someone'],
    ['a medal clips path with no id', 'https://medal.tv/clips/'],
    ['medal clips with a bad id', 'https://medal.tv/clips/bad!id'],
    ['an unrelated host', `https://example.test/clips/${MEDAL}`],
    ['a look-alike host', `https://notyoutu.be/${YT}`],
    ['a look-alike subdomain', `https://youtu.be.example.test/${YT}`],
    ['a userinfo trick', `https://youtu.be@example.test/${YT}`],
    ['a non-web scheme', `ftp://youtu.be/${YT}`],
  ])('returns null for %s', (_, url) => expect(embedOf(url)).toBeNull())

  it.each([
    ['an empty string', ''],
    ['a bare word', 'not a url'],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', {}],
    ['a scheme with no host', 'https://'],
  ])('returns null, without throwing, for %s', (_, url) => expect(embedOf(url)).toBeNull())

  it('never throws on arbitrary text, and only returns a canonical url it can rebuild', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const hit = embedOf(s)
        if (hit !== null) expect(embedOf(hit.canonical)).toEqual(hit)
      }),
    )
    fc.assert(
      fc.property(fc.webUrl(), (s) => {
        const hit = embedOf(s)
        expect(hit === null || typeof hit.canonical === 'string').toBe(true)
      }),
    )
  })
})
