import { shallowRef } from 'vue'

/**
 * Which roster branches are open, by branch key. The set is replaced on every
 * change (a shallowRef), so a watcher sees it and nothing is tracked deeply.
 * It knows nothing about the data: callers pass the keys that currently exist,
 * so a key that vanished in a later snapshot is simply never asked about.
 */
export function useOpenBranches() {
  const open = shallowRef(new Set())

  const isOpen = (key) => open.value.has(key)
  const change = (edit) => {
    const next = new Set(open.value)
    edit(next)
    open.value = next
  }

  const toggle = (key) => change((s) => (s.has(key) ? s.delete(key) : s.add(key)))
  const openKey = (key) => {
    if (!open.value.has(key)) change((s) => s.add(key))
  }
  const setAll = (keys, value) => change((s) => keys.forEach((k) => (value ? s.add(k) : s.delete(k))))
  const allOpen = (keys) => keys.length > 0 && keys.every((k) => open.value.has(k))

  return { open, isOpen, toggle, openKey, setAll, allOpen }
}
