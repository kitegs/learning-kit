export type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

/** Match a configured shortcut exactly, including the absence of extra modifiers. */
export function matchesShortcut(event: ShortcutEvent, shortcut: string): boolean {
  if (!shortcut) return false
  const parts = shortcut.split('+').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return false
  const needsCtrl = parts.includes('Ctrl') || parts.includes('Cmd')
  const needsShift = parts.includes('Shift')
  const needsAlt = parts.includes('Alt')
  const hasCtrl = event.ctrlKey || event.metaKey
  if (hasCtrl !== needsCtrl || event.shiftKey !== needsShift || event.altKey !== needsAlt) return false
  return event.key.toUpperCase() === parts[parts.length - 1].toUpperCase()
}
