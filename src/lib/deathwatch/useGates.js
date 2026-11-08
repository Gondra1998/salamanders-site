// Who may open each part of the area: the Watch Commander's choice in Manage → Access (the cfg document `g`), else
// the defaults in areas.js. The choice comes with the area's data, so this asks for it once if no view has yet.
// Only what is shown: the server keeps the Event Tracker's data to its readers itself.
import { computed } from 'vue'
import { useAuth } from '../../stores/auth'
import { useDeathwatchData } from '../../stores/deathwatchData'
import { gatesOf } from './areas'

export function useGates() {
  const data = useDeathwatchData()
  if (data.status === 'idle') data.load(useAuth().token)
  return computed(() => gatesOf(data.cfg.g))
}
