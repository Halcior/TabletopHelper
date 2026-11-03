import { t, useLocale, type Locale } from './locale'

export function LanguageSettings() {
  const { locale, setLocale } = useLocale()
  return <label className="language-settings"><span>{t('Language')}</span>
    <select aria-label={t('Language')} value={locale} onChange={event => setLocale(event.target.value as Locale)}>
      <option value="pl">Polski</option><option value="en">English</option>
    </select>
  </label>
}
