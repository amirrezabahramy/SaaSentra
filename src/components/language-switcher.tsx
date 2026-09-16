import { useI18nContext } from '#/i18n/i18n-react'
import type { Locales } from '#/i18n/i18n-types'
import { LOCALE_STORAGE_KEY } from '#/lib/i18n'

export function LanguageSwitcher() {
  const { locale, setLocale, LL } = useI18nContext()
  const languages: Array<{ locale: Locales; label: string }> = [
    { locale: 'en', label: 'EN' },
    { locale: 'fa', label: 'فا' },
  ]

  return (
    <div
      aria-label={LL.language.switchTo()}
      className="flex items-center gap-1 rounded-lg border border-(--line) p-1 text-xs"
    >
      {languages.map((language) => (
        <button
          key={language.locale}
          type="button"
          onClick={() => {
            setLocale(language.locale)
            window.localStorage.setItem(LOCALE_STORAGE_KEY, language.locale)
          }}
          className={`rounded px-2 py-1 font-semibold transition-colors ${
            locale === language.locale
              ? 'bg-(--sea-ink) text-white'
              : 'text-(--sea-ink-soft) hover:bg-white/70'
          }`}
        >
          {language.label}
        </button>
      ))}
    </div>
  )
}
