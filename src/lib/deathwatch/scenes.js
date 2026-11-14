/**
 * Named states of the Deathwatch gate for design work, with no server. Dev only; see fixture.js.
 *   allowed      signed in, as a member of the Watch: Legion and Deathwatch Deployment (the default)
 *   commander    signed in, and the Watch Commander: everything open, Manage included
 * One scene per standing, as members hold them: Legion is the base every member has, so each other scene holds
 * Legion as well; an Emissary is a guest and holds only that. Each line of the access list (areas.js) can be seen. The
 * hub opens to every one of them, with the cards of the areas it does not open locked. Chronicles, the Hall of Relics
 * and Recruitment (Enlist Now) are the Watch Commander's alone, so they are locked in every scene but his:
 *   legion       an everyday member: the hub, every card locked
 *   emissary     a guest: the same as legion
 *   deployment   and the Event Tracker and the Armouring Hall (not its Watch Command tab)
 *   command      as deployment, and, as Deathwatch Command (not the Watch Commander), the Watch Command tab too
 *   accolade     and an award role (here Xenosbane Sigil), which opens nothing while the Chronicles are his
 *   desk         as deployment, and given the Administratum desk by hand: runs it as the Watch Commander does
 *   admin        a guild admin: deployment, and the Administratum to look at, changing nothing
 * The gate's other states:
 *   denied       signed in, but holding none of them
 *   signin       signed out
 *   checking     the server has not answered yet (it never does)
 *   unavailable  the server could not be reached
 * Two more pick the area's data (fixtureData.js), seen as the Watch Commander so Manage is open too:
 *   empty         no Kill Teams and no archive, as on the first day
 *   active-event  a running event and one archived tour (every other scene shows this data as well)
 * The status names are the store's (the spec's "signed-out" state is `signin`, as the roster calls it).
 */
export const SCENES = [
  'allowed',
  'commander',
  'legion',
  'emissary',
  'deployment',
  'command',
  'accolade',
  'desk',
  'admin',
  'denied',
  'signin',
  'checking',
  'unavailable',
  'empty',
  'active-event',
]

const NONE = { commander: false, command: false, roles: [] }
const COMMANDER = { status: 'allowed', commander: true, command: true, roles: [] }
// Legion is the base every member holds; an Emissary (a guest) holds only their own.
const holding = (...roles) => ({ status: 'allowed', ...NONE, command: roles.includes('command'), roles })
const SHAPES = {
  allowed: { status: 'allowed', ...NONE, roles: ['legion', 'deployment'] },
  commander: COMMANDER,
  legion: holding('legion'),
  emissary: holding('emissary'),
  deployment: holding('legion', 'deployment'),
  // The server counts Deathwatch Command as deployed too (deathwatchAccess.js).
  command: holding('legion', 'deployment', 'command'),
  accolade: holding('legion', 'xenosbane'),
  desk: holding('legion', 'deployment', 'desk'),
  // The server gives admins deployment as well (deathwatchAccess.js).
  admin: holding('deployment', 'admin'),
  denied: { status: 'denied', ...NONE },
  signin: { status: 'signin', ...NONE },
  checking: { status: 'checking', ...NONE },
  unavailable: { status: 'unavailable', ...NONE },
  empty: COMMANDER,
  'active-event': COMMANDER,
}

/** The named scene in the shape the store reads. An unknown name gives 'allowed'. */
export function sceneOf(name) {
  const scene = SCENES.includes(name) ? name : 'allowed'
  return { _fixture: true, scene, ...SHAPES[scene] }
}
