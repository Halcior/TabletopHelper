import { create } from 'zustand'
import pl from './pl.json'

export type Locale = 'pl' | 'en'
export const LANGUAGE_KEY = 'tabletophelper:language:v1'
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (saved === 'pl' || saved === 'en') return saved
  } catch { /* Language preferences work without storage. */ }
  return typeof navigator !== 'undefined' && navigator.language.startsWith('pl') ? 'pl' : 'en'
}
export const useLocale = create<{ locale: Locale; setLocale: (locale: Locale) => void }>((set) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    if (locale !== 'pl' && locale !== 'en') return
    try { localStorage.setItem(LANGUAGE_KEY, locale) } catch { /* Optional local preference. */ }
    set({ locale })
  },
}))
const catalog: Record<string, string> = pl
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = Object.entries(catalog).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const indexes: number[] = []
  const parts = key.split(/(\{\d+\})/).map(part => {
    if (!/^\{\d+\}$/.test(part)) return escape(part)
    indexes.push(Number(part.slice(1, -1)))
    return '([\\s\\S]*?)'
  })
  return { key, value, indexes, regex: new RegExp(`^${parts.join('')}$`) }
}).sort((a, b) => b.key.replace(/\{\d+\}/g, '').length - a.key.replace(/\{\d+\}/g, '').length)

/** Presentation only. Source templates opt dynamic UI copy into interpolation;
 * names/IDs/units and stored events are never translated at their source. */
export function t<T>(source: T, template?: string): T {
  if (typeof source !== 'string' || useLocale.getState().locale === 'en') return source
  const clean = source.trim()
  if (catalog[clean]) return source.replace(clean, () => catalog[clean]) as T
  for (const pattern of patterns) {
    if (template ? pattern.key !== template.trim() : pattern.key.indexOf('{') < 4) continue
    const match = pattern.regex.exec(clean)
    if (!match) continue
    const values = new Map(pattern.indexes.map((index, i) => [index, match[i + 1]]))
    const translated = pattern.value.replace(/\{(\d+)\}/g, (_, index: string) => values.get(Number(index)) ?? '')
    return source.replace(clean, () => translated) as T
  }
  return source
}
