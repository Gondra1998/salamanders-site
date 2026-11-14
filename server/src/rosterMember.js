/**
 * Pure helpers that turn one raw Discord guild-member object into what the
 * roster reads from it. Nothing here touches the network or a clock.
 */
import { nameOf } from './displayNames.js'

export const UNNAMED = 'Unnamed Member'

const SNOWFLAKE = /^\d{17,20}$/
const AVATAR_HASH = /^(?:a_)?[0-9a-f]{32}$/
const CDN = 'https://cdn.discordapp.com'
// Whole words only: "Servitorial" and "Observo-Skulls" must not match.
const SERVITOR_NAME = /(?<![\p{L}\p{N}])(?:servitors?|servo[\s-]?skulls?)(?![\p{L}\p{N}])/iu
// "3rd", "7th": an ordinal 1-7 standing alone, so "11th" and "3rdly" do not count.
const COMPANY_TAG = /(?<![\p{L}\p{N}])([1-7])(?:st|nd|rd|th)(?![\p{L}\p{N}])/giu

const isHash = (v) => typeof v === 'string' && AVATAR_HASH.test(v)

/** The member's server avatar, else their account avatar, as a CDN url; null if neither is well formed. */
export function avatarUrl(member, guildId) {
  const uid = member?.user?.id
  if (typeof uid !== 'string' || !SNOWFLAKE.test(uid)) return null
  if (isHash(member.avatar) && typeof guildId === 'string' && SNOWFLAKE.test(guildId)) {
    return `${CDN}/guilds/${guildId}/users/${uid}/avatars/${member.avatar}.png?size=64`
  }
  if (isHash(member.user.avatar)) return `${CDN}/avatars/${uid}/${member.user.avatar}.png?size=64`
  return null
}

/** Company numbers a display name claims ("… 3rd Co."), distinct and ascending. */
export function companiesInName(name) {
  const found = new Set()
  for (const m of String(name).matchAll(COMPANY_TAG)) found.add(Number(m[1]))
  return [...found].sort((a, b) => a - b)
}

export const isServitorName = (name) => SERVITOR_NAME.test(name)

/** → { id, name, avatar, bot, roles: Set } for a well-formed member object, else null. */
export function memberFacts(raw, guildId) {
  const id = raw?.user?.id
  if (typeof id !== 'string' || !SNOWFLAKE.test(id)) return null
  return {
    id,
    name: nameOf(raw) ?? UNNAMED,
    avatar: avatarUrl(raw, guildId),
    bot: raw.user.bot === true,
    roles: new Set(Array.isArray(raw.roles) ? raw.roles.filter((r) => typeof r === 'string') : []),
    // When their present membership began (Discord's joined_at): a delegation given before it was lost by leaving.
    joinedAt: typeof raw.joined_at === 'string' ? raw.joined_at : null,
  }
}
