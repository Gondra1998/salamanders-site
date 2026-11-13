// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount, RouterLinkStub } from '@vue/test-utils'

// Invented values only: the deployment list as the server would give it.
vi.mock('../../../lib/deathwatch/deployment', () => ({
  useDeployment: () =>
    ref([
      { id: '300000000000000001', name: 'Brother Avit', avatar: 'https://cdn.discordapp.com/avatars/300000000000000001/abc.png' },
      { id: '300000000000000002', name: 'Brother Evil', avatar: 'https://example.com/a.png' },
    ]),
}))
import PlayerName from './PlayerName.vue'

const R = { kia: new Map([['Brother Fallen', 2]]) }
const mountName = (props) => mount(PlayerName, { props: { R, ...props }, global: { stubs: { RouterLink: RouterLinkStub } } })

describe('PlayerName', () => {
  it('leads with the Discord avatar of the deployed brother of that name', () => {
    const w = mountName({ name: 'Brother Avit' })
    expect(w.get('.dw-av img').attributes('src')).toBe('https://cdn.discordapp.com/avatars/300000000000000001/abc.png')
    expect(w.get('.dw-av').attributes('aria-hidden')).toBe('true')
  })

  it('shows initials, and no picture, for a name not on the list or a picture from anywhere but Discord', () => {
    for (const [name, i] of [['Brother Unknown', 'BU'], ['Brother Evil', 'BE']]) {
      const w = mountName({ name })
      expect(w.find('.dw-av img').exists(), name).toBe(false)
      expect(w.get('.dw-av').attributes('data-i'), name).toBe(i)
    }
  })

  it('links the name to its profile when given where to, and is plain text otherwise', () => {
    expect(mountName({ name: 'Brother Avit', to: { path: '/x' } }).getComponent(RouterLinkStub).props('to')).toEqual({ path: '/x' })
    const plain = mountName({ name: 'Brother Avit' })
    expect(plain.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(plain.text()).toBe('Brother Avit')
  })

  it('tags a guest and a brother killed in action', () => {
    expect(mountName({ name: 'Brother Avit', guest: true }).get('.dw-tag.guest').text()).toBe('Guest')
    expect(mountName({ name: 'Brother Fallen' }).get('.dw-tag.kia').text()).toBe('KIA W2')
    expect(mountName({ name: 'Brother Avit' }).find('.dw-tag').exists()).toBe(false)
  })
})
