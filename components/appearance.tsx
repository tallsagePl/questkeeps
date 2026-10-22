'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  translate,
  localizeMessage,
  Language,
  type Translator,
} from '@/lib/i18n/translate';

type Theme = 'system' | 'light' | 'dark';

type Preferences = {
  language: Language;
  t: Translator;
  m: (message: unknown) => string;
  setLanguage: (language: Language) => void;
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
};

const Context = createContext<Preferences | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ru');
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const setLanguage = useCallback((value: Language) => {
    setLanguageState(value);
    document.documentElement.lang = value;
    try {
      localStorage.setItem('ta-language', value);
    } catch {}
  }, []);
  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    const resolved =
      value === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value;
    setResolvedTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    try {
      localStorage.setItem('ta-theme', value);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const lang = localStorage.getItem('ta-language');
      const mode = localStorage.getItem('ta-theme');
      setLanguage(lang === 'en' ? 'en' : 'ru');
      setTheme(mode === 'dark' || mode === 'light' ? mode : 'system');
    } catch {
      setTheme('system');
    }
  }, [setLanguage, setTheme]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {
      if (theme === 'system') {
        const resolved = media.matches ? 'dark' : 'light';
        setResolvedTheme(resolved);
        document.documentElement.dataset.theme = resolved;
        document.documentElement.style.colorScheme = resolved;
      }
    };
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, [theme]);
  useEffect(() => {
    document.title = translate('app.title', language);
  }, [language]);
  const t = useCallback<Translator>(
    (key, params) => translate(key, language, params),
    [language],
  );
  const m = useCallback(
    (message: unknown) => localizeMessage(message, language),
    [language],
  );
  return (
    <Context.Provider
      value={{ language, t, m, setLanguage, theme, resolvedTheme, setTheme }}
    >
      {children}
    </Context.Provider>
  );
}

export function useLocale() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing AppearanceProvider');
  return context;
}

export function AppearanceControls() {
  const { language, setLanguage, t, resolvedTheme, setTheme } = useLocale();
  return (
    <div
      className="appearance-controls"
      role="group"
      aria-label={t('appearance.languageAndAppearance')}
    >
      <button
        type="button"
        className="appearance-button"
        aria-label={t(
          language === 'ru'
            ? 'appearance.switchToEnglish'
            : 'appearance.switchToRussian',
        )}
        title={t('appearance.interfaceLanguage')}
        onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
      >
        <svg
          aria-hidden="true"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M3 5h12M9 2v3m-4 2c1 4 4 7 8 9M13 5c-1 6-5 10-10 12m11 3 4-10 4 10m-7-3h6" />
        </svg>
        <span>{language === 'ru' ? 'EN' : 'RU'}</span>
      </button>
      <button
        type="button"
        className="appearance-button theme-button"
        aria-label={t(
          resolvedTheme === 'light'
            ? 'appearance.switchToDarkTheme'
            : 'appearance.switchToLightTheme',
        )}
        onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          {resolvedTheme === 'light' ? (
            <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
