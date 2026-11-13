import { describe, it, expect } from 'vitest'
import { mediaType, reply, readJson, send } from './httpReply'

const request = (headers = {}, body = '') => new Request('http://api.test/x', { method: 'POST', headers, body })
const json = (body, extra = {}) => request({ 'Content-Type': 'application/json', ...extra }, body)
const LIMITS = { maxBytes: 64, tooLarge: 'Too big (64 bytes at most).' }

describe('send', () => {
  it('answers with the status and the text', async () => {
    const res = send(200, '{"a":1}')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"a":1}')
  })

  it('names JSON and forbids caching', () => {
    const res = send(200, '{}')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('adds the headers it is given', () => {
    const res = send(200, '{}', { ETag: '"abc"', 'X-Thing': 'yes' })
    expect(res.headers.get('ETag')).toBe('"abc"')
    expect(res.headers.get('X-Thing')).toBe('yes')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('lets a given header replace a default one', () => {
    const res = send(200, 'plain', { 'Content-Type': 'text/plain', 'Cache-Control': 'max-age=5' })
    expect(res.headers.get('Content-Type')).toBe('text/plain')
    expect(res.headers.get('Cache-Control')).toBe('max-age=5')
  })

  it('sends no body and no content type for null text, but still forbids caching', async () => {
    const res = send(204, null)
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
    expect(res.headers.has('Content-Type')).toBe(false)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('keeps a content type the caller gives even for null text', () => {
    const res = send(304, null, { 'Content-Type': 'application/json', ETag: '"abc"' })
    expect(res.status).toBe(304)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('ETag')).toBe('"abc"')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('treats empty text as a body (it still names JSON)', async () => {
    const res = send(200, '')
    expect(await res.text()).toBe('')
    expect(res.headers.get('Content-Type')).toBe('application/json')
  })
})

describe('reply', () => {
  it('sends the body as JSON with the status', async () => {
    const res = reply(201, { item: { id: '1' }, list: [1, 2] })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ item: { id: '1' }, list: [1, 2] })
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('passes its headers on', () => {
    expect(reply(200, {}, { ETag: '"abc"' }).headers.get('ETag')).toBe('"abc"')
  })

  it('sends only the defaults when given no headers', () => {
    expect([...reply(200, {}).headers.keys()].sort()).toEqual(['cache-control', 'content-type'])
  })
})

describe('mediaType', () => {
  it.each([
    ['application/json', 'application/json'],
    ['Application/JSON ; charset=utf-8', 'application/json'],
    ['  multipart/form-data; boundary=x', 'multipart/form-data'],
    ['text/plain;charset=utf-8;x=y', 'text/plain'],
  ])('reads %j as %j', (header, expected) => {
    expect(mediaType(request({ 'Content-Type': header }))).toBe(expected)
  })

  it('is the empty string when there is no Content-Type', () => {
    const none = request()
    none.headers.delete('Content-Type')
    expect(mediaType(none)).toBe('')
  })
})

describe('readJson', () => {
  it('parses a JSON body', async () => {
    const read = await readJson(json('{"reason":"why"}'), LIMITS)
    expect(read.body).toEqual({ reason: 'why' })
    expect(read.blank).toBe(false)
    expect(read.status).toBeUndefined()
    expect(read.error).toBeUndefined()
  })

  it('accepts the type in any case, with parameters and spaces', async () => {
    const read = await readJson(json('{"a":1}', { 'Content-Type': 'Application/JSON ; charset=utf-8' }), LIMITS)
    expect(read.body).toEqual({ a: 1 })
  })

  it.each([
    ['no Content-Type', {}],
    ['text', { 'Content-Type': 'text/plain' }],
    ['a form', { 'Content-Type': 'application/x-www-form-urlencoded' }],
    ['a type that only starts like JSON', { 'Content-Type': 'application/jsonx' }],
    ['a type that only ends like JSON', { 'Content-Type': 'xapplication/json' }],
  ])('refuses %s with 415', async (_what, headers) => {
    const req = request(headers, '{"a":1}')
    if (!headers['Content-Type']) req.headers.delete('Content-Type')
    expect(await readJson(req, LIMITS)).toEqual({ status: 415, error: 'Send JSON (Content-Type: application/json).' })
  })

  it('does not read the body of a request it refuses for its type', async () => {
    const req = request({ 'Content-Type': 'text/plain' }, 'hello')
    await readJson(req, LIMITS)
    expect(req.bodyUsed).toBe(false)
  })

  it('refuses a body over the limit with 413 and the given message', async () => {
    const text = JSON.stringify('x'.repeat(63)) // 65 bytes with its quotes
    expect(await readJson(json(text), LIMITS)).toEqual({ status: 413, error: 'Too big (64 bytes at most).' })
  })

  it('accepts a body of exactly the limit', async () => {
    const text = '{"a":"xxx"}'
    expect(new TextEncoder().encode(text).length).toBe(11)
    expect((await readJson(json(text), { ...LIMITS, maxBytes: 11 })).body).toEqual({ a: 'xxx' })
    expect((await readJson(json(text), { ...LIMITS, maxBytes: 10 })).status).toBe(413)
  })

  it('counts bytes, not characters', async () => {
    const text = '"éééé"' // 6 characters, 10 bytes
    expect(text.length).toBe(6)
    expect((await readJson(json(text), { ...LIMITS, maxBytes: 10 })).body).toBe('éééé')
    expect((await readJson(json(text), { ...LIMITS, maxBytes: 9 })).status).toBe(413)
  })

  it('leaves body undefined for text that is not JSON', async () => {
    const read = await readJson(json('nope'), LIMITS)
    expect(read.body).toBeUndefined()
    expect(read.blank).toBe(false)
    expect(read.error).toBeUndefined()
  })

  it('keeps a JSON null as null, distinct from text that is not JSON', async () => {
    expect((await readJson(json('null'), LIMITS)).body).toBeNull()
  })

  it.each([[''], ['   '], ['\n\t ']])('says %j is blank, with no body', async (text) => {
    const read = await readJson(json(text), LIMITS)
    expect(read.blank).toBe(true)
    expect(read.body).toBeUndefined()
  })

  it('does not call JSON that is only padded with spaces blank', async () => {
    const read = await readJson(json(' {"a":1} '), LIMITS)
    expect(read.blank).toBe(false)
    expect(read.body).toEqual({ a: 1 })
  })
})
