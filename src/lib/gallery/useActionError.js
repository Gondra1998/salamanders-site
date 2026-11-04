import { shallowRef } from 'vue'
import { useGallery } from '../../stores/gallery'

export const SAVED_BUT_STALE = "The change was saved, but the list couldn't be refreshed."

/**
 * The one inline error line of a gallery panel, and the way to run its actions into it. `run(action)` clears the
 * line, awaits the store action and → whether it worked; a failure leaves the store's message in `error`.
 * Hide and remove drop the item from the local lists first and fetch the list again after, so a failure may come
 * from that last step: `stillListed()` says whether the item is still where the person saw it. If it is gone,
 * the action worked and only the refresh failed, and the line says that instead.
 */
export function useActionError() {
  const gallery = useGallery()
  const error = shallowRef('')

  async function run(action, { stillListed = () => true } = {}) {
    error.value = ''
    try {
      await action()
      return true
    } catch {
      error.value = stillListed() ? gallery.error || 'Something went wrong.' : SAVED_BUT_STALE
      return false
    }
  }

  return { error, run }
}
