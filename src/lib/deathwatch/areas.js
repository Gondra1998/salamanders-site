// The Deathwatch area's route table: the six areas, their tabs, and how a URL resolves to them.
// Slugs and labels are the old Watch Fortress site's, verbatim, so its URLs keep their shape beneath
// /deathwatch. Pure, so the router, the hub and the navigation share one source and it can be tested hard.

const tab = (slug, label) => ({ slug, label })

// Who may open each part: any one of the standings listed (the server's names, server/src/deathwatchAccess.js).
// The Watch Commander opens everything, and a part that lists none is the Watch Commander's alone. A tab's own
// list replaces its area's. The hub itself opens to everyone the gate lets in; its cards carry these locks.
// Only what is shown: the server keeps the Event Tracker's data to its readers itself.
const LEGION = ['legion', 'emissary']
// The awards that open the Chronicles, each a Discord role of its own. The server also names Deathwatch Kill-Marine
// (`killmarine`), which opens no part: it is there to be checked for one thing of its own.
const ACCOLADES = ['xenosbane', 'vigilia']

/** The lock's words on an area's card and page where they are its own; any other says the lock's "Access restricted." */
export const LOCK_TEXT = {
  eventtracker: 'Access restricted to Enlisted Brothers Only.',
  armouringhall: 'Access restricted to Enlisted Brothers Only.',
}

export const AREAS = {
  eventtracker: {
    label: 'Event Tracker',
    blurb: 'Track events, standings, and your kill team’s progress.',
    roles: ['deployment'],
    tabs: [
      tab('standings', 'Standings'),
      tab('kill-teams', 'Kill Teams'),
      tab('players', 'Operatives'),
      tab('honour-roll', 'Honour Roll'),
      tab('game-stats', 'Game Stats'),
      tab('scoring', 'Scoring'),
      tab('archive', 'Archive'),
    ],
  },
  armouringhall: {
    label: 'Armouring Hall',
    blurb: 'Explore armour sets, chapter colours, and heraldry.',
    roles: ['command', 'deployment'],
    // `items`: a tab's uniforms, in the picker's order (armour.test.js keeps them in step with armour.js), so the
    // address always names the one shown.
    tabs: [
      { slug: 'standard', label: 'Standard', items: ['watchbrother', 'companyheraldry'] },
      { slug: 'specialist', label: 'Specialist', items: ['reclusiarc', 'librarium', 'apothecarion', 'mechanicus'] },
      // Only Deathwatch Command (and the Watch Commander) see this tab (DeathwatchNav) or open it.
      { slug: 'watch-command', label: 'Watch Command', command: true, roles: ['command'], lock: 'Reserved for the Deathwatch Command.', items: ['watchsergeant', 'watchchaplain', 'watchlibrarian', 'watchapothecary', 'watchtechmarine'] },
      tab('restricted-wargear', 'Restricted Wargear'),
    ],
  },
  chronicles: {
    label: 'Chronicles of Valor',
    blurb: 'Discover the deeds, victories, and honours of the Watch.',
    roles: ['command', 'deployment', ...ACCOLADES],
    tabs: [
      tab('hall-of-champions', 'Hall of Champions'),
      tab('chamber-of-honor', 'Chamber of Honor'),
      tab('player-profiles', 'Player Profiles'),
      tab('in-memoriam', 'In Memoriam'),
      tab('operational-records', 'Operational Records'),
    ],
  },
  // The old site's Hall of Relics, at its old address. The Relics are still to come.
  hallofrelics: {
    label: 'Hall of Relics',
    blurb: 'Honour the warriors who shaped the history of Ebonhold.',
    roles: LEGION,
    tabs: [tab('notable-members', 'Notable Members'), tab('fortress-lore', 'Fortress Lore')],
  },
  // The old site's Recruitment, at its old address: the hub's Enlist button goes here.
  recruitment: {
    label: 'Recruitment',
    blurb: 'Terms of Service and requirements for the Watch',
    roles: LEGION,
    tabs: [tab('terms-of-service', 'Terms of Service'), tab('requirements', 'Requirements')],
  },
  // The Watch Commander's, the desk's (given by hand in Access: runs it) and the guild admins' (see it, change nothing).
  // The server refuses every write but the Watch Commander's and the desk's, whatever is shown.
  administratum: {
    label: 'Administratum',
    blurb: "The Watch Commander's dashboard",
    roles: ['desk', 'admin'],
    tabs: [
      { ...tab('enter-mission', 'Enter mission'), roles: ['desk'], lock: 'Reserved for the Watch Commander and the desk.' },
      tab('manage', 'Manage'),
      tab('checks', 'Checks'),
      tab('records', 'Records'),
      tab('page-texts', 'Page Texts'),
      tab('access', 'Access'),
    ],
  },
}

/**
 * Resolves router params ({ area, tab, sub }) to the page they name, or null for an unknown area.
 * An unknown or missing tab falls back to the area's first. A sub-slug survives only if it is one of the tab's
 * items (an Armouring Hall uniform); anything else becomes the tab's first item, or nothing on a tab with none.
 * `canonical` is the one path for that page. Params come from the URL, so nothing here trusts their type or
 * indexes an object with them.
 */
export function resolveArea(params) {
  const { area, tab: wanted, sub } = params ?? {}
  if (typeof area !== 'string' || !Object.hasOwn(AREAS, area)) return null
  const { tabs } = AREAS[area]
  const { slug, items = [] } = tabs.find((t) => t.slug === wanted) ?? tabs[0]
  const item = items.includes(sub) ? sub : (items[0] ?? '')
  return { area, tab: slug, sub: item, canonical: `/deathwatch/${area}/${slug}${item ? `/${item}` : ''}` }
}

/** Whether someone may open a part that lists `roles`: the Watch Commander, or a holder of any one of them. */
export const mayOpen = (roles, { commander, held }) => commander === true || roles.some((r) => held.includes(r))

/** Whether someone may change things in the Administratum: the Watch Commander, or the desk. Never an admin. */
export const canEdit = (who) => mayOpen(['desk'], who)

/** An area's tabs that someone may open: those with no `roles` of their own, and those they hold one of. */
export const tabsFor = (area, who) => AREAS[area].tabs.filter((t) => !t.roles || mayOpen(t.roles, who))

/**
 * What a `/deathwatch/me` with no `roles` stands for: a server from before the standings, as just after the site
 * deploys and before the API is rebuilt. Its old rule holds: every part open but the Administratum, so never the
 * desk or admin.
 */
export const LEGACY_ROLES = ['legion', 'emissary', 'deployment', 'command', 'xenosbane', 'vigilia']

/** What the Watch Commander can give one person in Access (server/src/deathwatchValidate.js KINDS), in page order. */
export const ACCESS_KINDS = [
  ['desk', 'Desk'],
  ['watchcommand', 'Watch Command'],
  ['deathwatch', 'Deathwatch'],
]
