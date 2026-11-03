import { describe, it, expect } from 'vitest'
import { embedSrc } from './embed'

// Invented ids only: 11 characters for YouTube, any word-and-dash run for the others.
const YT = 'abcDEF_-123'
const SLUG = 'TidySlug-42_x'
const MEDAL = 'cAbC123xyz'
const PARENT = 'sm2salamanders.site'

const youtube = { src: `https://www.youtube.com/embed/${YT}?rel=0`, provider: 'youtube' }
const twitch = { src: `https://clips.twitch.tv/embed?clip=${SLUG}&parent=${PARENT}`, provider: 'twitch' }
const medal = { src: `https://medal.tv/clip/${MEDAL}?autoplay=0&loop=0&muted=0&cta=0`, provider: 'medal' }

describe('embedSrc', () => {
  describe('the canonical links the server stores', () => {
    it.each([
      ['YouTube', `https://www.youtube.com/watch?v=${YT}`, youtube],
      ['Twitch', `https://clips.twitch.tv/${SLUG}`, twitch],
      ['Medal', `https://medal.tv/clips/${MEDAL}`, medal],
    ])('turns a %s link into its player', (_name, url, want) => {
      expect(embedSrc(url, PARENT)).toEqual(want)
    })
  })

  describe('the looser spellings the server also accepts', () => {
    it.each([
      ['youtu.be/ID', `https://youtu.be/${YT}`, youtube],
      ['youtu.be/ID with a start time', `https://youtu.be/${YT}?t=42`, youtube],
      ['youtube.com without www', `https://youtube.com/watch?v=${YT}`, youtube],
      ['m.youtube.com', `https://m.youtube.com/watch?v=${YT}&t=3`, youtube],
      ['youtube.com/shorts/ID', `https://youtube.com/shorts/${YT}`, youtube],
      ['http rather than https', `http://www.youtube.com/watch?v=${YT}`, youtube],
      ['an upper-case host', `https://WWW.YouTube.COM/watch?v=${YT}`, youtube],
      ['twitch.tv/chan/clip/SLUG', `https://www.twitch.tv/some_chan/clip/${SLUG}`, twitch],
      ['m.twitch.tv/chan/clip/SLUG', `https://m.twitch.tv/some_chan/clip/${SLUG}`, twitch],
      ['clips.twitch.tv with a query', `https://clips.twitch.tv/${SLUG}?filter=clips`, twitch],
      ['medal.tv/clip/ID', `https://medal.tv/clip/${MEDAL}`, medal],
      ['medal.tv/games/x/clips/ID', `https://medal.tv/games/halo/clips/${MEDAL}/d1337abc`, medal],
      ['www.medal.tv', `https://www.medal.tv/clips/${MEDAL}`, medal],
    ])('%s', (_name, url, want) => {
      expect(embedSrc(url, PARENT)).toEqual(want)
    })
  })

  describe('a link that is not a clip on one of the three sites', () => {
    it.each([
      ['not a string at all', undefined],
      ['null', null],
      ['a number', 42],
      ['an object', {}],
      ['an empty string', ''],
      ['plain text', 'a nice clip'],
      ['a relative path', '/watch?v=abcDEF_-123'],
      ['a scheme that is not http', `ftp://www.youtube.com/watch?v=${YT}`],
      ['a javascript: link', `javascript:alert('${YT}')`],
      ['another host', `https://example.com/watch?v=${YT}`],
      ['a host that only ends like one', `https://notyoutube.com/watch?v=${YT}`],
      ['a host that only starts like one', `https://youtube.com.example.com/watch?v=${YT}`],
      ['a second subdomain', `https://www.m.youtube.com/watch?v=${YT}`],
      ['a YouTube channel page', 'https://www.youtube.com/@somebody'],
      ['a YouTube watch page with no v', 'https://www.youtube.com/watch'],
      ['a YouTube id one character short', `https://www.youtube.com/watch?v=${YT.slice(1)}`],
      ['a YouTube id one character long', `https://www.youtube.com/watch?v=${YT}X`],
      ['a YouTube id with a bad character', 'https://www.youtube.com/watch?v=abcDEF_-12!'],
      ['a YouTube path that is not a watch', `https://www.youtube.com/playlist?v=${YT}`],
      ['a YouTube path that only starts like one', `https://www.youtube.com/watch/more?v=${YT}`],
      ['a YouTube embed path, which the server does not take', `https://www.youtube.com/embed/${YT}`],
      ['a YouTube live path, which the server does not take', `https://www.youtube.com/live/${YT}`],
      ['youtu.be with no id', 'https://youtu.be/'],
      ['youtube shorts with no id', 'https://youtube.com/shorts/'],
      ['youtube shorts with a bad id', 'https://youtube.com/shorts/abc'],
      ['a Twitch channel', 'https://www.twitch.tv/some_chan'],
      ['a Twitch video, not a clip', 'https://www.twitch.tv/videos/123456'],
      ['a Twitch path with a slug in the clip place but not the word clip', `https://www.twitch.tv/some_chan/video/${SLUG}`],
      ['a Twitch clip path with no slug', 'https://www.twitch.tv/some_chan/clip/'],
      ['a Twitch slug with a bad character', 'https://clips.twitch.tv/bad%20slug'],
      ['clips.twitch.tv with no slug', 'https://clips.twitch.tv/'],
      ['a Medal profile page', 'https://medal.tv/users/12345'],
      ['a Medal clips path with no id', 'https://medal.tv/clips/'],
      ['a Medal id with a bad character', 'https://medal.tv/clips/bad.id'],
    ])('answers null for %s', (_name, url) => {
      expect(embedSrc(url, PARENT)).toBeNull()
    })

    it('never throws, whatever it is given', () => {
      for (const url of ['https://', 'http://[', '::::', 'https://%zz', new Date(NaN), Symbol.iterator.description, [], () => 1]) {
        expect(() => embedSrc(url, PARENT), String(url)).not.toThrow()
        expect(embedSrc(url, PARENT)).toBeNull()
      }
    })
  })

  describe('the Twitch parent', () => {
    it('is the page host, URL-encoded', () => {
      const url = `https://clips.twitch.tv/${SLUG}`
      expect(embedSrc(url, 'localhost')?.src).toBe(`https://clips.twitch.tv/embed?clip=${SLUG}&parent=localhost`)
      expect(embedSrc(url, 'a b&c=d')?.src).toBe(`https://clips.twitch.tv/embed?clip=${SLUG}&parent=a%20b%26c%3Dd`)
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
      ['a number', 5],
      ['an object', {}],
    ])('is required: %s gives no Twitch player', (_name, parent) => {
      expect(embedSrc(`https://clips.twitch.tv/${SLUG}`, parent)).toBeNull()
      expect(embedSrc(`https://www.twitch.tv/chan/clip/${SLUG}`)).toBeNull()
    })

    it('is not needed by YouTube or Medal', () => {
      expect(embedSrc(`https://www.youtube.com/watch?v=${YT}`)).toEqual(youtube)
      expect(embedSrc(`https://medal.tv/clips/${MEDAL}`)).toEqual(medal)
      expect(embedSrc(`https://medal.tv/clips/${MEDAL}`, null)).toEqual(medal)
    })
  })

  it('puts nothing from the link into the player address except the validated id', () => {
    const got = embedSrc(`https://www.youtube.com/watch?v=${YT}&autoplay=1&list=evil#frag`, PARENT)
    expect(got.src).toBe(`https://www.youtube.com/embed/${YT}?rel=0`)
  })
})
