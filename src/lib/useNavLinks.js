import { computed } from 'vue'
import { useAuth } from '../stores/auth'
import { usePerkCorrections } from '../stores/perkCorrections'

const BASE_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/planner', label: 'Perk Builder' },
  { to: '/armoury', label: 'Armoury' },
  { to: '/builds', label: 'Builds' },
  { to: '/companies', label: 'Companies' },
]

/**
 * The site's navigation links, one list for the header and the footer so the
 * two cannot drift. A UX hint only: the real gate is the server's role check
 * (see src/lib/archive/client.js). Non-members never see the member entries.
 */
export function useNavLinks() {
  const auth = useAuth()
  const corrections = usePerkCorrections()
  return computed(() => {
    const out = auth.member?.isMember
      ? [
          ...BASE_LINKS,
          { to: '/accolades', label: 'Accolades', section: true },
          { to: '/ranks', label: 'Ranks', section: true },
          { to: '/reliquarium', label: 'Reliquarium', section: true },
          { to: '/reports', label: 'Reports', section: true },
        ]
      : [...BASE_LINKS]
    if (corrections.privileges?.historyViewer) out.push({ to: '/history', label: 'Version History', section: true })
    return out
  })
}
