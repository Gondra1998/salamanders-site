import { it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../buildsApi', async (real) => ({ ...(await real()), request: vi.fn() }))
import { request } from '../buildsApi'
import { useDeployment } from './deployment'

// A file of its own: useDeployment asks only once per module, and this module has not been asked yet. Invented values.
it('asks again after a failure that is no refusal, further apart each time, until it has the list', async () => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  vi.stubEnv('VITE_DEATHWATCH_FIXTURE', '')
  const members = [{ id: '300000000000000001', name: 'Brother Invented', avatar: null }]
  request
    .mockRejectedValueOnce(Object.assign(new Error('not ready'), { status: 503 }))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ members })
  const list = useDeployment()
  await vi.advanceTimersByTimeAsync(0)
  expect(request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(2999)
  expect(request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(request).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(9999)
  expect(request).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(request).toHaveBeenCalledTimes(3)
  expect(list.value).toEqual(members)
  // Had, it is not asked for again.
  await vi.advanceTimersByTimeAsync(60000)
  expect(request).toHaveBeenCalledTimes(3)
  vi.useRealTimers()
  vi.unstubAllEnvs()
})
