import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  MAX_ART_BYTES,
  PAGE_SIZE,
  STATUSES,
  parseArtFields,
  parseReason,
  parseHideNote,
  sniffImage,
  parseBefore,
  isItemId,
} from './galleryValidate'

const TITLE_MSG = 'Give the piece a title (1 to 120 characters).'
const NOTE_MSG = 'The note is 500 characters at most.'
const REASON_MSG = 'Say why (1 to 500 characters).'
const MALFORMED = 'Malformed request.'

const ascii = (s) => [...s].map((c) => c.charCodeAt(0))
const pad = new Array(16).fill(0)
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_HEADER = new Uint8Array([...PNG_SIG, ...pad])
const RIFF_WEBP = new Uint8Array([...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8 '), ...pad])
const GIF89A = new Uint8Array([...ascii('GIF89a'), ...pad])
const GIF87A = new Uint8Array([...ascii('GIF87a'), ...pad])
const MP4_FTYP = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypmp42'), ...pad])

describe('constants', () => {
  it('carry the spec values', () => {
    expect(MAX_ART_BYTES).toBe(10_485_760)
    expect(PAGE_SIZE).toBe(24)
    expect(STATUSES).toEqual(['pending', 'approved', 'rejected', 'hidden', 'removed'])
  })
})

describe('parseArtFields', () => {
  it('accepts a trimmed title of 1..120 and a note of 0..500', () =>
    expect(parseArtFields({ title: '  Vulkan  ', note: '' })).toEqual({ title: 'Vulkan', note: '' }))

  it('treats a missing note as empty and trims a given one', () => {
    expect(parseArtFields({ title: 'a' })).toEqual({ title: 'a', note: '' })
    expect(parseArtFields({ title: 'a', note: null })).toEqual({ title: 'a', note: '' })
    expect(parseArtFields({ title: 'a', note: '  pencils, 2h \n' })).toEqual({ title: 'a', note: 'pencils, 2h' })
  })

  it('accepts a title of exactly 120 and a note of exactly 500', () => {
    const title = 'x'.repeat(120)
    const note = 'y'.repeat(500)
    expect(parseArtFields({ title, note })).toEqual({ title, note })
  })

  it('refuses an empty, missing or 121-char title with a plain message', () => {
    expect(parseArtFields({ title: '   ' })).toBe(TITLE_MSG)
    expect(parseArtFields({})).toBe(TITLE_MSG)
    expect(parseArtFields({ title: 'x'.repeat(121) })).toBe(TITLE_MSG)
    expect(parseArtFields({ title: 42 })).toBe(TITLE_MSG)
  })

  it('counts the length after trimming', () => {
    expect(parseArtFields({ title: ` ${'x'.repeat(120)} ` })).toEqual({ title: 'x'.repeat(120), note: '' })
    expect(parseArtFields({ title: 'a', note: ` ${'y'.repeat(500)} ` })).toEqual({ title: 'a', note: 'y'.repeat(500) })
  })

  it('refuses a 501-char note', () =>
    expect(parseArtFields({ title: 'a', note: 'x'.repeat(501) })).toBe(NOTE_MSG))

  it('refuses a note that is not text', () => {
    expect(parseArtFields({ title: 'a', note: 5 })).toBe(MALFORMED)
    expect(parseArtFields({ title: 'a', note: {} })).toBe(MALFORMED)
  })

  it('refuses a body that is not an object', () => {
    for (const b of [null, undefined, 'title', 7, ['title']]) expect(parseArtFields(b)).toBe(MALFORMED)
  })

  it('returns only the parsed keys, never an echo of extra fields', () => {
    const out = parseArtFields({ title: 'a', note: 'b', status: 'approved', authorDiscordId: '1', kind: 'clip' })
    expect(out).toEqual({ title: 'a', note: 'b' })
    expect(Object.keys(out)).toEqual(['title', 'note'])
  })

  it('accepts any string whose trimmed length is 1..120 and returns it trimmed (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 160 }), (s) => {
        const t = s.trim()
        fc.pre(t.length >= 1 && t.length <= 120)
        expect(parseArtFields({ title: s })).toEqual({ title: t, note: '' })
      }),
    )
  })

  it('refuses any title that trims to nothing or to more than 120 (property)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const t = s.trim()
        fc.pre(t.length === 0 || t.length > 120)
        expect(parseArtFields({ title: s })).toBe(TITLE_MSG)
      }),
    )
  })
})

describe('parseReason', () => {
  it('requires a reason of 1..500', () => {
    expect(parseReason({ reason: '  too dark  ' })).toEqual({ reason: 'too dark' })
    expect(parseReason({})).toBe(REASON_MSG)
    expect(parseReason({ reason: '' })).toBe(REASON_MSG)
  })

  it('refuses a blank, non-text or 501-char reason and accepts exactly 500', () => {
    expect(parseReason({ reason: '   ' })).toBe(REASON_MSG)
    expect(parseReason({ reason: 9 })).toBe(REASON_MSG)
    expect(parseReason({ reason: 'x'.repeat(501) })).toBe(REASON_MSG)
    expect(parseReason({ reason: 'x'.repeat(500) })).toEqual({ reason: 'x'.repeat(500) })
  })

  it('refuses a body that is not an object, and echoes nothing extra', () => {
    for (const b of [null, undefined, 'why', ['why']]) expect(parseReason(b)).toBe(MALFORMED)
    expect(Object.keys(parseReason({ reason: 'r', status: 'approved' }))).toEqual(['reason'])
  })
})

describe('parseHideNote', () => {
  it('takes an optional note of 0..500, trimmed', () => {
    expect(parseHideNote({ note: '  spoilers  ' })).toEqual({ note: 'spoilers' })
    expect(parseHideNote({ note: '' })).toEqual({ note: '' })
    expect(parseHideNote({})).toEqual({ note: '' })
    expect(parseHideNote({ note: null })).toEqual({ note: '' })
    expect(parseHideNote({ note: 'x'.repeat(500) })).toEqual({ note: 'x'.repeat(500) })
  })

  it('treats a request with no body as no note', () => {
    expect(parseHideNote(undefined)).toEqual({ note: '' })
    expect(parseHideNote(null)).toEqual({ note: '' })
  })

  it('refuses a 501-char note, a note that is not text, and a body that is not an object', () => {
    expect(parseHideNote({ note: 'x'.repeat(501) })).toBe(NOTE_MSG)
    expect(parseHideNote({ note: 3 })).toBe(MALFORMED)
    for (const b of ['note', 4, ['note']]) expect(parseHideNote(b)).toBe(MALFORMED)
  })

  it('echoes nothing extra', () =>
    expect(Object.keys(parseHideNote({ note: 'n', status: 'approved' }))).toEqual(['note']))
})

describe('sniffImage', () => {
  it('sniffs JPEG, PNG, WebP and GIF by magic bytes and nothing else', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...pad]))).toEqual({ ext: 'jpg', contentType: 'image/jpeg' })
    expect(sniffImage(PNG_HEADER)).toEqual({ ext: 'png', contentType: 'image/png' })
    expect(sniffImage(RIFF_WEBP)).toEqual({ ext: 'webp', contentType: 'image/webp' })
    expect(sniffImage(GIF89A)).toEqual({ ext: 'gif', contentType: 'image/gif' })
    expect(sniffImage(MP4_FTYP)).toBeNull()
    expect(sniffImage(new Uint8Array(0))).toBeNull()
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull() // RIFF but WAVE
  })

  it('accepts both GIF versions and refuses a near miss', () => {
    expect(sniffImage(GIF87A)).toEqual({ ext: 'gif', contentType: 'image/gif' })
    expect(sniffImage(new Uint8Array([...ascii('GIF88a'), ...pad]))).toBeNull()
    expect(sniffImage(new Uint8Array([...ascii('GIF89b'), ...pad]))).toBeNull()
  })

  it('accepts a file that is exactly the signature long', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff]))).toEqual({ ext: 'jpg', contentType: 'image/jpeg' })
    expect(sniffImage(new Uint8Array(PNG_SIG))).toEqual({ ext: 'png', contentType: 'image/png' })
    expect(sniffImage(new Uint8Array(ascii('GIF89a')))).toEqual({ ext: 'gif', contentType: 'image/gif' })
    expect(sniffImage(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]))).toEqual({
      ext: 'webp',
      contentType: 'image/webp',
    })
  })

  it('returns null for anything shorter than the signature it is checking', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(sniffImage(new Uint8Array(PNG_SIG.slice(0, 7)))).toBeNull()
    expect(sniffImage(new Uint8Array(ascii('GIF89')))).toBeNull()
    expect(sniffImage(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEB')]))).toBeNull()
    expect(sniffImage(new Uint8Array(ascii('RIFF')))).toBeNull()
  })

  it('refuses a signature that is wrong in its last byte', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xfe, ...pad]))).toBeNull()
    expect(sniffImage(new Uint8Array([...PNG_SIG.slice(0, 7), 0x0b, ...pad]))).toBeNull()
    expect(sniffImage(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBQ'), ...pad]))).toBeNull()
    expect(sniffImage(new Uint8Array([...ascii('RIFX'), 0, 0, 0, 0, ...ascii('WEBP'), ...pad]))).toBeNull()
  })

  it('does not match a signature that sits anywhere but the start', () => {
    expect(sniffImage(new Uint8Array([0, ...PNG_SIG, ...pad]))).toBeNull()
    expect(sniffImage(new Uint8Array([0, 0xff, 0xd8, 0xff, ...pad]))).toBeNull()
  })

  it('returns a fresh object each time', () => {
    const a = sniffImage(PNG_HEADER)
    a.ext = 'exe'
    expect(sniffImage(PNG_HEADER)).toEqual({ ext: 'png', contentType: 'image/png' })
  })

  it('never throws and only ever answers a known type or null (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), (bytes) => {
        const out = sniffImage(bytes)
        if (out !== null) expect(['jpg', 'png', 'webp', 'gif']).toContain(out.ext)
      }),
    )
  })
})

describe('parseBefore', () => {
  it('parses a before cursor', () => {
    expect(parseBefore(null)).toBeNull()
    expect(parseBefore('42')).toBe('42')
    expect(parseBefore('abc')).toBe('bad')
    expect(parseBefore('0'.repeat(16))).toBe('bad')
  })

  it('treats an absent cursor as none', () => expect(parseBefore(undefined)).toBeNull())

  it('hands the digit string back unchanged, zero and leading zeros included', () => {
    expect(parseBefore('0')).toBe('0')
    expect(parseBefore('007')).toBe('007')
    expect(parseBefore('9'.repeat(15))).toBe('9'.repeat(15))
  })

  it('refuses empty, signed, decimal, padded, non-ASCII-digit and non-text cursors', () => {
    for (const v of ['', '-1', '+1', '1.5', '1e3', ' 1', '1 ', '42\n', '٤٢', '0x10', 42, {}, ['1']]) {
      expect(parseBefore(v)).toBe('bad')
    }
  })

  it('accepts exactly the strings of 1..15 ASCII digits (property)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{1,15}$/), (s) => {
        expect(parseBefore(s)).toBe(s)
      }),
    )
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{16,40}$/), (s) => {
        expect(parseBefore(s)).toBe('bad')
      }),
    )
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (s) => {
        fc.pre(!/^[0-9]{1,15}$/.test(s))
        expect(parseBefore(s)).toBe('bad')
      }),
    )
  })

  it('every accepted cursor survives a round trip through bigint', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[1-9][0-9]{0,14}$/), (s) => {
        expect(String(BigInt(parseBefore(s)))).toBe(s)
        expect(Number.isSafeInteger(Number(s))).toBe(true)
      }),
    )
  })
})

describe('isItemId', () => {
  it('is the same rule as an accepted before cursor', () => {
    expect(isItemId('1')).toBe(true)
    expect(isItemId('42')).toBe(true)
    expect(isItemId('0')).toBe(true)
    expect(isItemId('007')).toBe(true)
    expect(isItemId('9'.repeat(15))).toBe(true)
  })

  it('refuses anything else', () => {
    for (const v of ['', 'abc', '-1', '1.5', ' 1', '42\n', '9'.repeat(16), 42, null, undefined, {}]) {
      expect(isItemId(v)).toBe(false)
    }
  })

  it('agrees with parseBefore on every string (property)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 20 }), fc.stringMatching(/^[0-9]{0,18}$/)), (s) => {
        expect(isItemId(s)).toBe(parseBefore(s) !== 'bad')
      }),
    )
  })
})
