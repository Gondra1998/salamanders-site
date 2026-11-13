import { it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../buildsApi', async (real) => ({ ...(await real()), request: vi.fn() }))
import { request } from '../buildsApi'
import { useDeployment } from './deployment'

// A file of its own: useDeployment asks only once per module, and this module has not been asked yet.
it('stops after three more tries (3, 10 and 30 s apart) when the server stays out of reach', async () => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '')
  request.mockRejectedValue(Object.assign(new Error('down'), { status: 502 }))
  const list = useDeployment()
  await vi.advanceTimersByTimeAsync(3000 + 10000 + 29999)
  expect(request).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(1)
  expect(request).toHaveBeenCalledTimes(4)
  await vi.advanceTimersByTimeAsync(600000)
  expect(request).toHaveBeenCalledTimes(4)
  expect(list.value).toEqual([])
  vi.useRealTimers()
  vi.unstubAllEnvs()
})
