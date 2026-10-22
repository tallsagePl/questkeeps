'use client';
import { useLocale } from './appearance';
const screens = [
  {
    id: 'trips',
    title: 'Поездки, к которым хочется вернуться',
    alt: 'Главная QuestKeeps с коллекцией демонстрационных путешествий',
  },
  {
    id: 'map',
    title: 'Город складывается в твою историю',
    alt: 'Карта демонстрационной поездки в QuestKeeps',
  },
  {
    id: 'journal',
    title: 'Всё, что осталось между кадрами',
    alt: 'Дневник демонстрационной поездки в QuestKeeps',
  },
];
export default function AboutShowcase() {
  const { t, language, resolvedTheme } = useLocale();
  return (
    <section
      className="about-showcase"
      aria-label={t('Загляни в свою следующую историю')}
    >
      <div className="about-screens">
        {screens.map((screen) => (
          <a
            key={screen.id}
            className={'about-shot about-shot-' + screen.id}
            href={
              '/about/screenshots/' +
              language +
              '-' +
              (resolvedTheme === 'dark' ? 'dark' : 'light') +
              '-' +
              screen.id +
              '.webp'
            }
            target="_blank"
            rel="noopener"
            aria-label={t('Рассмотреть скриншот') + ': ' + t(screen.title)}
          >
            <img
              src={
                '/about/screenshots/' +
                language +
                '-' +
                (resolvedTheme === 'dark' ? 'dark' : 'light') +
                '-' +
                screen.id +
                '.webp'
              }
              alt={t(screen.alt)}
              width="1280"
              height="800"
              loading="lazy"
              decoding="async"
            />
            <span>
              {t(screen.title)}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </span>
          </a>
        ))}
      </div>
      <p className="about-demo-caption">
        {t(
          'Одна поездка. Несколько способов вернуться. Скриншоты с демонстрационными данными.',
        )}
      </p>
    </section>
  );
}
