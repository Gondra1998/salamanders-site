import { it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../buildsApi', async (real) => ({ ...(await real()), request: vi.fn() }))
import { request } from '../buildsApi'
import { useDeployment } from './deployment'

// A file of its own: useDeployment asks only once per module, and this module has not been asked yet.
it('stays empty when the server refuses, so names stay free text', async () => {
  setActivePinia(createPinia())
  vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '')
  request.mockRejectedValue(Object.assign(new Error('nope'), { status: 403 }))
  const list = useDeployment()
  await new Promise((r) => setTimeout(r, 0))
  expect(request).toHaveBeenCalledTimes(1)
  expect(list.value).toEqual([])
  vi.unstubAllEnvs()
})
